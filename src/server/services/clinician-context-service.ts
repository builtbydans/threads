import "server-only";

import {
  demoPatient,
  seedAppointmentBrief,
  seedEvidenceReferences,
  seedThreadObservation,
} from "@/data/seed";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { appointmentBriefRepository } from "@/server/repositories/appointment-brief-repository";
import { importedEncounterRepository } from "@/server/repositories/imported-encounter-repository";
import { patientRepository } from "@/server/repositories/patient-repository";
import {
  getRepositoryFallbackVersion,
  RepositoryError,
} from "@/server/repositories/repository-support";
import { timelineRepository } from "@/server/repositories/timeline-repository";
import type {
  ClinicianContext,
  ObservationCategory,
  ThreadObservation,
  TimelineEvent,
} from "@/server/types/domain";

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

const categoryFor = (text: string): ObservationCategory => {
  const lower = text.toLowerCase();
  if (lower.includes("sleep")) return "sleep";
  if (lower.includes("medication") || lower.includes("nausea")) {
    return "medication";
  }
  if (lower.includes("work")) return "functional_impact";
  if (lower.includes("pain") || lower.includes("severity")) {
    return "symptom_trend";
  }
  return "continuity";
};

const observationFromTimeline = (
  events: TimelineEvent[],
): ThreadObservation | null => {
  const event = events.find((candidate) => candidate.type === "ai_observation");
  if (!event) return null;

  const structured = event.structuredData ?? {};
  const rawStatements = Array.isArray(structured.observations)
    ? structured.observations
    : [];
  if (!rawStatements.length) return null;
  const sourceEventIds = stringArray(structured.supportingEventIds);
  const statements = rawStatements.map((value, index) => {
    const statement = objectValue(value);
    const text = String(statement.text ?? "Recorded context");
    const evidenceIds = stringArray(
      statement.evidenceReferenceIds ?? statement.evidenceIds,
    );
    return {
      id: `${event.id}-statement-${index + 1}`,
      category: categoryFor(text),
      text,
      evidenceIds,
      evidenceCount: evidenceIds.length,
      sourceEventIds,
      uncertainty:
        "Thread organised this from the linked records. It has not been clinically verified.",
    };
  });

  return {
    id: event.id,
    patientId: event.patientId,
    recordedAt: event.recordedAt,
    title: event.title,
    summary: event.summary,
    evidenceSummary: String(
      structured.supportingSummary ?? `${event.evidenceRefs?.length ?? 0} linked sources`,
    ),
    badge: "AI-organised",
    clinicalVerificationStatus: "not_clinically_verified",
    statements,
    evidenceIds: [...new Set(statements.flatMap((statement) => statement.evidenceIds))],
    sourceEventIds,
    ...(event.evidenceRefs ? { evidenceRefs: event.evidenceRefs } : {}),
  };
};

export class ClinicianContextService {
  async getContext(patientId: string): Promise<ClinicianContext> {
    const fallbackVersion = getRepositoryFallbackVersion();
    const liveConfigured = Boolean(getSupabaseAdmin() ?? getSupabase());

    try {
      const patient = await patientRepository.findById(patientId);
      // Only use the hardcoded demo patient when Supabase is not configured.
      const resolvedPatient = patient ??
        (!liveConfigured && patientId === demoPatient.id
          ? structuredClone(demoPatient)
          : null);
      if (!resolvedPatient) {
        throw new RepositoryError(
          "ClinicianContextService.getContext",
          `Patient ${patientId} was not found.`,
        );
      }

      const [timelineEvents, appointmentBrief, importedEncounters] =
        await Promise.all([
          timelineRepository.listByPatient(patientId),
          appointmentBriefRepository.findLatestByPatient(patientId),
          importedEncounterRepository.listByPatient(patientId),
        ]);
      // Appointment briefs are not stored in the live schema; seed is an
      // explicit demo overlay and must not be confused with a silent DB fallback.
      const resolvedBrief =
        appointmentBrief ?? structuredClone(seedAppointmentBrief);
      const patientWithAppointment = {
        ...resolvedPatient,
        nextAppointment: resolvedBrief.appointment,
      };
      const observation =
        observationFromTimeline(timelineEvents) ??
        structuredClone(seedThreadObservation);
      const timelineEvidence = timelineEvents.flatMap((event) => {
        if (event.evidenceRefs?.length) return event.evidenceRefs;
        if (event.type === "ai_observation") return [];
        return [
          {
            id: event.id,
            eventId: event.id,
            sourceKind: event.sourceKind,
            label: event.title,
            excerpt: event.translatedText ?? event.summary,
            ...(event.originalText
              ? { originalExcerpt: event.originalText }
              : {}),
            ...(event.translatedText
              ? { translatedExcerpt: event.translatedText }
              : {}),
            recordedAt: event.recordedAt,
            ...(event.language ? { language: event.language } : {}),
            ...(event.organisation
              ? { organisation: event.organisation }
              : {}),
          },
        ];
      });
      const evidence = Array.from(
        new Map(
          [
            ...timelineEvidence,
            ...seedEvidenceReferences.filter((reference) =>
              resolvedBrief.evidenceIds.includes(reference.id),
            ),
          ].map((reference) => [reference.id, reference]),
        ).values(),
      );
      const usedDemoFallback =
        getRepositoryFallbackVersion() !== fallbackVersion;
      const dataSource =
        liveConfigured && !usedDemoFallback && patient
          ? "supabase"
          : "fallback";

      console.info("[Thread clinician data]", {
        patientId,
        patientFound: Boolean(patient),
        timelineCount: timelineEvents.length,
        briefFound: Boolean(appointmentBrief),
        encounterCount: importedEncounters.length,
        evidenceCount: evidence.length,
        source: dataSource,
      });

      return {
        patient: patientWithAppointment,
        timelineEvents,
        evidence,
        appointmentBrief: resolvedBrief,
        importedEncounters,
        observation,
        dataSource,
      };
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      console.error("[Thread clinician data] Unexpected error", error);
      throw new RepositoryError(
        "ClinicianContextService.getContext",
        error instanceof Error ? error.message : "Unexpected clinician data error.",
      );
    }
  }
}

export const clinicianContextService = new ClinicianContextService();
