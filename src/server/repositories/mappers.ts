import "server-only";

import { z } from "zod";

import type {
  AppointmentBrief,
  AppointmentBriefSection,
  EncounterDetails,
  EvidenceRecord,
  EvidenceReference,
  ImportedEncounter,
  Patient,
  PatientUpdate,
  TimelineEvent,
} from "@/server/types/domain";
import { RepositoryError } from "@/server/repositories/repository-support";
import type { Database, Json } from "@/types/database.types";

export type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
export type PatientUpdateRow =
  Database["public"]["Tables"]["patient_updates"]["Row"];
export type PatientUpdateInsert =
  Database["public"]["Tables"]["patient_updates"]["Insert"];
export type EvidenceRecordRow =
  Database["public"]["Tables"]["evidence_records"]["Row"];
export type ClinicalEncounterRow =
  Database["public"]["Tables"]["clinical_encounters"]["Row"];
export type ClinicalEncounterInsert =
  Database["public"]["Tables"]["clinical_encounters"]["Insert"];

type JsonObject = Record<string, Json | undefined>;

const objectValue = (value: Json): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

const requiredText = (
  scope: string,
  field: string,
  value: string | null,
): string => {
  if (value?.trim()) return value;
  throw new RepositoryError(scope, `Required column ${field} was null or empty.`);
};

const ageOn = (dateOfBirth: string, today = new Date()): number => {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.valueOf())) {
    throw new RepositoryError(
      "PatientRepository",
      "Required column date_of_birth was not a valid date.",
    );
  }
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

export function mapPatient(row: PatientRow): Patient {
  const dateOfBirth = requiredText(
    "PatientRepository",
    "date_of_birth",
    row.date_of_birth,
  );
  return {
    id: row.id,
    name: requiredText("PatientRepository", "full_name", row.full_name),
    dateOfBirth,
    age: ageOn(dateOfBirth),
    condition: requiredText(
      "PatientRepository",
      "primary_condition",
      row.primary_condition,
    ),
    preferredLanguage: requiredText(
      "PatientRepository",
      "preferred_language",
      row.preferred_language,
    ),
  };
}

export function mapPatientUpdate(row: PatientUpdateRow): PatientUpdate {
  const inputType = z
    .enum(["voice", "text", "symptom", "medication"])
    .parse(row.input_type);
  const processingStatus = z
    .enum(["pending", "processing", "completed", "failed"])
    .parse(row.processing_status);
  return {
    id: row.id,
    patientId: row.patient_id,
    inputType,
    originalText: requiredText(
      "PatientUpdateRepository",
      "original_text",
      row.original_text,
    ),
    originalLanguage: requiredText(
      "PatientUpdateRepository",
      "original_language",
      row.original_language,
    ),
    englishTranslation: row.english_translation,
    processingStatus,
    processingError: row.processing_error,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEvidenceRecord(row: EvidenceRecordRow): EvidenceRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    originalContent: row.original_content,
    translatedContent: row.translated_content,
    occurredAt: row.occurred_at,
    metadata: objectValue(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export function mapEvidenceReference(row: EvidenceRecordRow): EvidenceReference {
  const metadata = objectValue(row.metadata);
  const translatedExcerpt = row.translated_content ?? undefined;
  const language = metadata.detectedLanguage ?? metadata.language;
  return {
    id: row.id,
    eventId: row.source_id ?? row.id,
    sourceKind: "patient_reported",
    label: row.title,
    excerpt: translatedExcerpt ?? row.original_content,
    originalExcerpt: row.original_content,
    ...(translatedExcerpt ? { translatedExcerpt } : {}),
    recordedAt: row.occurred_at,
    ...(typeof language === "string" ? { language } : {}),
    metadata,
  };
}

const reviewedStructuredFromEvidence = (
  evidenceRefs: EvidenceReference[],
): Record<string, unknown> | undefined => {
  for (const reference of evidenceRefs) {
    const reviewed = reference.metadata?.reviewedStructuredUpdate;
    if (reviewed && typeof reviewed === "object" && !Array.isArray(reviewed)) {
      return reviewed as Record<string, unknown>;
    }
  }
  return undefined;
};

const stringArrayField = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return items.length ? items : undefined;
};

export function mapPatientUpdateTimelineEvent(
  row: PatientUpdateRow,
  evidenceRefs: EvidenceReference[] = [],
): TimelineEvent {
  const update = mapPatientUpdate(row);
  const reviewed = reviewedStructuredFromEvidence(evidenceRefs);
  const severity =
    typeof reviewed?.severity === "number" ? reviewed.severity : undefined;
  const symptoms = stringArrayField(reviewed?.symptoms);
  const bodyLocations = stringArrayField(reviewed?.bodyLocations);
  const functionalImpacts = stringArrayField(reviewed?.functionalImpacts);
  const medicationDetails =
    reviewed?.medicationDetails &&
    typeof reviewed.medicationDetails === "object" &&
    !Array.isArray(reviewed.medicationDetails)
      ? (reviewed.medicationDetails as TimelineEvent["medicationDetails"])
      : undefined;
  const transcriptionMode = evidenceRefs
    .map((reference) => reference.metadata?.transcriptionMode)
    .find((mode) => typeof mode === "string");

  return {
    id: update.id,
    patientId: update.patientId,
    type:
      update.inputType === "voice"
        ? "patient_voice"
        : update.inputType === "medication"
          ? "medication_update"
          : "patient_text",
    title:
      update.inputType === "voice"
        ? "Patient voice update"
        : update.inputType === "medication"
          ? "Medication update"
          : "Patient update",
    summary: update.englishTranslation ?? update.originalText,
    recordedAt: update.occurredAt,
    sourceKind: "patient_reported",
    language: update.originalLanguage,
    originalText: update.originalText,
    ...(update.englishTranslation
      ? { translatedText: update.englishTranslation }
      : {}),
    ...(severity === undefined ? {} : { severity }),
    ...(symptoms ? { symptoms } : {}),
    ...(bodyLocations ? { bodyLocations } : {}),
    ...(functionalImpacts ? { functionalImpacts } : {}),
    ...(medicationDetails ? { medicationDetails } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {}),
    metadata: {
      ...(typeof transcriptionMode === "string"
        ? { transcriptionMode }
        : {}),
      ...(reviewed ? { structuredUpdate: reviewed } : {}),
      clinicalVerificationStatus: "not_clinically_verified",
    },
    structuredData: {
      patientUpdateId: update.id,
      processingStatus: update.processingStatus,
      ...(reviewed ? { reviewedStructuredUpdate: reviewed } : {}),
    },
  };
}

const encounterType = (value: string): TimelineEvent["type"] => {
  const normalised = value.toLowerCase();
  if (normalised.includes("a-and-e") || normalised.includes("emergency")) {
    return "ae_encounter";
  }
  if (normalised.includes("gp")) return "gp_review";
  return "specialist_review";
};

const encounterDetails = (row: ClinicalEncounterRow): EncounterDetails => {
  const rawRecord = objectValue(row.raw_record);
  const followUp = rawRecord.followUp;
  const sourceReference = rawRecord.sourceReference;
  return {
    reason: row.title,
    summaryPoints: [row.summary],
    observations:
      rawRecord.observationsStable === true
        ? [{ name: "Observations", value: "Stable" }]
        : [],
    bloodResults: [],
    clinicianNote: row.summary,
    sourceRecord: {
      label: "Imported clinical encounter",
      provider: row.organisation ?? "Imported provider",
      sourceReference:
        typeof sourceReference === "string" ? sourceReference : row.id,
      synthetic: true,
      imported: true,
      manuallyEnteredByPatient: false,
    },
    disposition: row.summary,
    ...(typeof followUp === "string" ? { followUpAdvice: followUp } : {}),
  };
};

export function mapClinicalEncounterTimelineEvent(
  row: ClinicalEncounterRow,
): TimelineEvent {
  const reference: EvidenceReference = {
    id: row.id,
    eventId: row.id,
    sourceKind: "imported_clinical_record",
    label: row.title,
    excerpt: row.summary,
    recordedAt: row.occurred_at,
    ...(row.organisation ? { organisation: row.organisation } : {}),
  };
  return {
    id: row.id,
    patientId: row.patient_id,
    type: encounterType(row.encounter_type),
    title: row.title,
    summary: row.summary,
    recordedAt: row.occurred_at,
    sourceKind: "imported_clinical_record",
    ...(row.organisation ? { organisation: row.organisation } : {}),
    encounterDetails: encounterDetails(row),
    evidenceRefs: [reference],
    structuredData: objectValue(row.raw_record) as Record<string, unknown>,
  };
}

export function mapImportedEncounter(row: ClinicalEncounterRow): ImportedEncounter {
  const details = encounterDetails(row);
  return {
    id: row.id,
    patientId: row.patient_id,
    timelineEventId: row.id,
    provider: row.organisation ?? details.sourceRecord.provider,
    encounterType: row.encounter_type,
    encounterDate: row.occurred_at,
    sourceReference: details.sourceRecord.sourceReference,
    sourceLabel: details.sourceRecord.label,
    status: "imported",
    synthetic: true,
    rawPayload: objectValue(row.raw_record) as Record<string, unknown>,
    structuredData: details,
  };
}

export function patientUpdateInsertFromTimelineEvent(
  event: TimelineEvent,
): PatientUpdateInsert {
  return {
    id: event.id,
    patient_id: event.patientId,
    input_type:
      event.type === "patient_voice"
        ? "voice"
        : event.type === "medication_update"
          ? "medication"
          : "text",
    original_text: event.originalText ?? event.summary,
    original_language: event.language ?? "English",
    english_translation: event.translatedText ?? null,
    processing_status: "completed",
    processing_error: null,
    occurred_at: event.recordedAt,
  };
}

export function clinicalEncounterInsertFromImportedEncounter(
  encounter: ImportedEncounter,
): ClinicalEncounterInsert {
  return {
    id: encounter.id,
    patient_id: encounter.patientId,
    encounter_type: encounter.encounterType,
    occurred_at: encounter.encounterDate,
    organisation: encounter.provider,
    title: encounter.structuredData.reason,
    summary: encounter.structuredData.summaryPoints.join(" "),
    raw_record: {
      ...encounter.rawPayload,
      sourceReference: encounter.sourceReference,
      followUp: encounter.structuredData.followUpAdvice ?? null,
    } as Json,
  };
}

const briefItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  evidenceIds: z.array(z.string()),
  evidenceCount: z.number().int().nonnegative(),
});
const briefSectionSchema = z.object({
  id: z.string(),
  key: z.enum([
    "main_concern",
    "changes_since_last_review",
    "medication",
    "relevant_encounter",
    "patient_priorities",
    "patient_questions",
  ]),
  title: z.string().min(1),
  items: z.array(briefItemSchema),
});

/** Validates the exact appointment-brief view model before it reaches the UI. */
export const appointmentBriefSchema: z.ZodType<AppointmentBrief> = z.object({
  id: z.string(),
  patientId: z.string().uuid(),
  appointment: z.object({
    title: z.string().min(1),
    organisation: z.string().min(1),
    date: z.string().min(1),
    appointmentType: z.string().optional(),
    location: z.string().optional(),
    clinician: z.string().optional(),
  }),
  status: z.enum(["draft", "ready", "shared"]),
  generatedAt: z.string().min(1),
  patientPriorities: z.array(z.string().min(1)),
  additionalContext: z.string().optional(),
  sections: z.array(briefSectionSchema) as z.ZodType<AppointmentBriefSection[]>,
  reviewNotice: z.string().min(1),
  evidenceIds: z.array(z.string()),
  evidenceRefs: z.array(z.any()).optional(),
});

export function validateAppointmentBrief(value: unknown): AppointmentBrief {
  const parsed = appointmentBriefSchema.safeParse(value);
  if (!parsed.success) {
    throw new RepositoryError(
      "AppointmentBriefRepository",
      "Appointment brief JSON did not match the established view model.",
    );
  }
  return parsed.data;
}
