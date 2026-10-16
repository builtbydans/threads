import "server-only";

import { seedAppointmentBrief } from "@/data/seed";
import { AMINA_PATIENT_ID } from "@/lib/constants";
import {
  getGeminiClient,
  getGeminiModel,
  getGeminiThinkingConfig,
} from "@/server/gemini/client";
import { appointmentBriefRepository } from "@/server/repositories/appointment-brief-repository";
import {
  appointmentSummaryJsonSchema,
  appointmentSummarySchema,
  type AppointmentSummaryOutput,
} from "@/server/schemas/gemini";
import { clinicalContextService } from "@/server/services/clinical-context-service";
import { DomainServiceError } from "@/server/services/service-error";
import type {
  AppointmentBrief,
  AppointmentBriefSectionKey,
  AppointmentSummary,
  ClinicalContext,
  GeneratedAppointmentSummary,
} from "@/server/types/domain";

const SUMMARY_SYSTEM_INSTRUCTION = `You are the evidence-organisation layer inside Thread.

Thread helps clinicians understand a patient's recorded longitudinal health context before an appointment. You are not a doctor.

You must not diagnose or suggest a diagnosis, recommend treatment or medication changes, assess clinical urgency, predict outcomes, infer causation, invent facts or identifiers, or use knowledge outside the supplied patient context.

Use only the supplied evidence. Clearly attribute patient-reported information and distinguish it from clinical records. Mention uncertainty and missing information. Cite one or more supplied evidence IDs for every substantive bullet. Focus on recorded changes, functional impact, medication experience, explicit patient concerns and recent encounters. Keep the briefing concise enough to read in about two minutes. Patient priorities must be explicitly supported by patient evidence. Do not convert patient questions into medical advice. The opening brief is concise prose; the structured groups must not repeat it word-for-word. Return only the required structured response.`;

const unsafeClinicalLanguage =
  /\b(?:i recommend|thread recommends|should (?:start|stop|take|change|increase|decrease)|diagnosis is|likely diagnosis|requires surgery|needs surgery|treatment plan)\b/i;

const safeFailureReason = (error: unknown) => {
  if (error instanceof SyntaxError) return "malformed_json";
  if (error instanceof Error) {
    if (error.name === "ZodError") return "schema_validation_failed";
    if (error.message.includes("no statements with valid evidence")) {
      return "evidence_validation_failed";
    }
    if (error.message.includes("safety boundary")) return "safety_validation_failed";
    if (error.message.includes("no summary text")) return "empty_response";
    if (error.message.startsWith("malformed_response_")) {
      return error.message;
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "timeout";
    }
    return `provider_${error.name.toLowerCase()}`;
  }
  return "provider_error";
};

const itemsFor = (brief: AppointmentBrief, key: AppointmentBriefSectionKey) =>
  brief.sections.find((section) => section.key === key)?.items ?? [];

export const fallbackAppointmentSummary = (
  brief: AppointmentBrief,
): AppointmentSummary => {
  const openingItems = [
    ...itemsFor(brief, "main_concern"),
    ...itemsFor(brief, "medication"),
    ...itemsFor(brief, "relevant_encounter"),
  ];

  return {
    openingBrief: openingItems.map((item) => item.text).join(" "),
    changesSinceLastEncounter: itemsFor(
      brief,
      "changes_since_last_review",
    ).map((item) => ({
      statement: item.text,
      evidenceIds: [...item.evidenceIds],
    })),
    discussionPoints: itemsFor(brief, "patient_questions").map((item) => ({
      statement: item.text,
      evidenceIds: [...item.evidenceIds],
    })),
    patientPriorities: itemsFor(brief, "patient_priorities").map((item) => ({
      statement: item.text,
      evidenceIds: [...item.evidenceIds],
    })),
    suggestedQuestions: [
      "When is the pain worst?",
      "Has naproxen helped?",
      "How is this affecting her daily life?",
      "What happened at A&E?",
    ],
  };
};

const validatedEvidenceStatements = (
  statements: AppointmentSummaryOutput["changesSinceLastEncounter"],
  allowedIds: Set<string>,
) =>
  statements.flatMap((item) => {
    const evidenceIds = [...new Set(item.evidenceIds)].filter((id) =>
      allowedIds.has(id),
    );
    return evidenceIds.length
      ? [{ statement: item.statement, evidenceIds }]
      : [];
  });

const validateGeneratedSummary = (
  raw: unknown,
  context: ClinicalContext,
): AppointmentSummary => {
  const parsed = appointmentSummarySchema.parse(raw);
  const allText = [
    parsed.openingBrief,
    ...parsed.changesSinceLastEncounter.map((item) => item.statement),
    ...parsed.discussionPoints.map((item) => item.statement),
    ...parsed.patientPriorities.map((item) => item.statement),
  ].join(" ");
  if (unsafeClinicalLanguage.test(allText)) {
    throw new Error("Gemini returned wording outside Thread's safety boundary.");
  }

  const allowedIds = new Set(context.evidence.map((item) => item.id));
  const summary: AppointmentSummary = {
    openingBrief: parsed.openingBrief,
    changesSinceLastEncounter: validatedEvidenceStatements(
      parsed.changesSinceLastEncounter,
      allowedIds,
    ),
    discussionPoints: validatedEvidenceStatements(
      parsed.discussionPoints,
      allowedIds,
    ),
    patientPriorities: validatedEvidenceStatements(
      parsed.patientPriorities,
      allowedIds,
    ),
    suggestedQuestions: parsed.suggestedQuestions,
  };

  const supportedStatementCount =
    summary.changesSinceLastEncounter.length +
    summary.discussionPoints.length +
    summary.patientPriorities.length;
  if (!supportedStatementCount) {
    throw new Error("Gemini returned no statements with valid evidence.");
  }
  return summary;
};

const contextForPrompt = (context: ClinicalContext) => ({
  task: "Generate a pre-appointment briefing",
  patient: {
    condition: context.patient.condition,
    preferredLanguage: context.patient.preferredLanguage,
    lastGpEncounterAt: context.lastGpEncounterAt,
    upcomingAppointment: context.upcomingAppointment,
  },
  evidence: context.evidence,
});

const parseStructuredResponse = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const objectStart = withoutFence.indexOf("{");
    const objectEnd = withoutFence.lastIndexOf("}");
    if (objectStart < 0 || objectEnd <= objectStart) {
      throw new SyntaxError("Gemini returned malformed structured output.");
    }
    return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1)) as unknown;
  }
};

export class GeminiAppointmentSummaryService {
  async generate(patientId: string): Promise<GeneratedAppointmentSummary> {
    if (patientId !== AMINA_PATIENT_ID) {
      throw new DomainServiceError(
        403,
        "PATIENT_NOT_ALLOWED",
        "This demo supports only the canonical patient.",
      );
    }

    const fallbackBrief =
      (await appointmentBriefRepository.findLatestByPatient(patientId)) ??
      structuredClone(seedAppointmentBrief);
    const fallback = (notice: string): GeneratedAppointmentSummary => ({
      summary: fallbackAppointmentSummary(fallbackBrief),
      mode: "fallback",
      generatedAt: fallbackBrief.generatedAt,
      notice,
    });

    let context: ClinicalContext;
    try {
      context = await clinicalContextService.load(patientId);
    } catch (error) {
      console.warn("[Thread Gemini summary] Falling back", {
        reason: error instanceof Error ? error.name : "context_unavailable",
        patientId,
      });
      return fallback("Live context was unavailable; showing the prepared summary.");
    }

    const client = getGeminiClient();
    if (!client) {
      console.warn("[Thread Gemini summary] Falling back", {
        reason: "gemini_not_configured",
        patientId,
      });
      return fallback("Gemini is unavailable; showing the prepared summary.");
    }

    const model = getGeminiModel();
    try {
      const response = await client.models.generateContent({
        model,
        contents: JSON.stringify(contextForPrompt(context)),
        config: {
          systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
          temperature: 0.1,
          maxOutputTokens: 4_096,
          responseMimeType: "application/json",
          responseJsonSchema: appointmentSummaryJsonSchema,
          thinkingConfig: getGeminiThinkingConfig(),
          abortSignal: AbortSignal.timeout(25_000),
        },
      });
      if (!response.text) throw new Error("Gemini returned no summary text.");
      let structuredResponse: unknown;
      try {
        structuredResponse = parseStructuredResponse(response.text);
      } catch {
        const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
        throw new Error(`malformed_response_${finishReason.toLowerCase()}`);
      }
      const summary = validateGeneratedSummary(structuredResponse, context);
      const generatedAt = new Date().toISOString();
      console.info("[Thread Gemini summary]", {
        patientId,
        evidenceCount: context.evidence.length,
        model,
        mode: "gemini",
      });
      return { summary, mode: "gemini", generatedAt, model };
    } catch (error) {
      const reason = safeFailureReason(error);
      console.warn(`[Thread Gemini summary] Falling back: ${reason}`, {
        reason,
        patientId,
      });
      return fallback("Gemini is unavailable; showing the prepared summary.");
    }
  }
}

export const geminiAppointmentSummaryService =
  new GeminiAppointmentSummaryService();
