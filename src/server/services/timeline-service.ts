import "server-only";

import { revalidatePath } from "next/cache";

import type { PatientUpdateInput, ReviewedPatientEventInput } from "@/server/schemas";
import type {
  EvidenceReference,
  StructuredPatientUpdate,
  TimelineEvent,
} from "@/server/types/domain";

import { evidenceRepository } from "@/server/repositories/evidence-repository";
import { patientRepository } from "@/server/repositories/patient-repository";
import { timelineRepository } from "@/server/repositories/timeline-repository";
import { createHealthExtractionService } from "@/server/services/ai-extraction-service";
import {
  rejectionForTranscriptionMode,
  type TranscriptionMode,
} from "@/server/services/confirmed-patient-update";
import { DomainServiceError } from "@/server/services/service-error";
import { RepositoryError } from "@/server/repositories/repository-support";

const summaryFrom = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 220 ? clean : `${clean.slice(0, 217)}…`;
};

const transcriptionModeFrom = (
  value: unknown,
): TranscriptionMode | undefined => {
  if (value === "runware" || value === "fallback" || value === "typed") {
    return value;
  }
  return undefined;
};

export type OrganisedPatientUpdate = {
  structuredUpdate: StructuredPatientUpdate;
  event: TimelineEvent;
  saved: boolean;
};

export class TimelineService {
  async getTimeline(patientId: string): Promise<TimelineEvent[]> {
    const patient = await patientRepository.findById(patientId);
    if (!patient) {
      throw new DomainServiceError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    }
    return timelineRepository.listByPatient(patientId);
  }

  async getEvidence(observationId: string): Promise<EvidenceReference[]> {
    return evidenceRepository.listForObservation(observationId);
  }

  async organisePatientUpdate(
    input: PatientUpdateInput,
  ): Promise<OrganisedPatientUpdate> {
    const patient = await patientRepository.findById(input.patientId);
    if (!patient) {
      throw new DomainServiceError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    }

    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const transcriptionMode: TranscriptionMode =
      input.transcriptionMode ??
      (input.sourceType === "voice" ? "fallback" : "typed");

    const structuredUpdate =
      await createHealthExtractionService().extractPatientUpdate({
        originalText: input.originalText,
        translatedText: input.translatedText,
        recordedAt,
      });
    const event: TimelineEvent = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      type: input.sourceType === "voice" ? "patient_voice" : "patient_text",
      title:
        input.sourceType === "voice" ? "Voice update" : "Written update",
      summary: summaryFrom(input.translatedText ?? input.originalText),
      recordedAt,
      sourceKind: "patient_reported",
      ...(input.language ? { language: input.language } : {}),
      originalText: input.originalText,
      ...(input.translatedText ? { translatedText: input.translatedText } : {}),
      ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
      ...(input.severity === undefined && structuredUpdate.severity === undefined
        ? {}
        : { severity: input.severity ?? structuredUpdate.severity }),
      bodyLocations: structuredUpdate.bodyLocations,
      symptoms: structuredUpdate.symptoms,
      functionalImpacts: structuredUpdate.functionalImpacts,
      ...(structuredUpdate.medicationDetails
        ? { medicationDetails: structuredUpdate.medicationDetails }
        : {}),
      metadata: {
        transcriptionMode,
        categories: input.categories,
        structuredUpdate,
        organisedBy: "Thread",
        clinicalVerificationStatus: "not_clinically_verified",
      },
    };

    // Confirmed persistence happens only via saveReviewedPatientEvent after review.
    if (!input.save) return { structuredUpdate, event, saved: false };

    const saved = await this.saveReviewedPatientEvent(
      event as ReviewedPatientEventInput,
    );
    return { structuredUpdate, event: saved, saved: true };
  }

  async saveReviewedPatientEvent(
    event: ReviewedPatientEventInput,
  ): Promise<TimelineEvent> {
    const patient = await patientRepository.findById(event.patientId);
    if (!patient) {
      throw new DomainServiceError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    }

    const transcriptionMode = transcriptionModeFrom(
      event.metadata.transcriptionMode,
    );
    const rejection = rejectionForTranscriptionMode(transcriptionMode);
    if (rejection) {
      throw new DomainServiceError(422, rejection.code, rejection.message);
    }

    const timelineEvent = event as TimelineEvent;
    const structuredFromMetadata = event.metadata.structuredUpdate;
    const reviewedStructuredUpdate =
      structuredFromMetadata &&
      typeof structuredFromMetadata === "object" &&
      !Array.isArray(structuredFromMetadata)
        ? structuredFromMetadata
        : {
            symptoms: event.symptoms ?? [],
            ...(event.severity === undefined ? {} : { severity: event.severity }),
            bodyLocations: event.bodyLocations ?? [],
            functionalImpacts: event.functionalImpacts ?? [],
            ...(event.medicationDetails
              ? { medicationDetails: event.medicationDetails }
              : {}),
            categories: event.metadata.categories ?? [],
          };

    try {
      // Persist the reviewed object verbatim so extraction cannot change between
      // the review screen and the final save action. Upsert by id is idempotent.
      const isVoice = event.type === "patient_voice";
      await timelineRepository.saveConfirmedPatientUpdate(timelineEvent);
      await evidenceRepository.upsertConfirmedEvidence({
        patientId: event.patientId,
        patientUpdateId: event.id,
        sourceType: isVoice ? "voice_transcript" : "patient_text_update",
        title: isVoice ? "Patient voice update" : "Patient written update",
        originalContent: event.originalText,
        ...(event.translatedText === undefined
          ? {}
          : { translatedContent: event.translatedText }),
        occurredAt: event.recordedAt,
        metadata: {
          inputType: isVoice ? "voice" : "text",
          detectedLanguage: event.language ?? null,
          transcriptionMode,
          transcriptionProvider:
            transcriptionMode === "runware"
              ? "runware"
              : transcriptionMode === "typed"
                ? "patient-typed"
                : "synthetic-fallback",
          reviewedStructuredUpdate,
          clinicalVerificationStatus: "not_clinically_verified",
        },
      });

      // Re-read so returned event includes evidence + hydrated structured fields.
      const saved =
        await timelineRepository.saveConfirmedPatientUpdate(timelineEvent);

      revalidatePath("/clinician", "layout");
      revalidatePath("/patient", "layout");
      return saved;
    } catch (error) {
      if (error instanceof DomainServiceError) throw error;
      if (error instanceof RepositoryError) {
        throw new DomainServiceError(
          503,
          "CONFIRMED_SAVE_UNAVAILABLE",
          "Thread could not save this update to your health story. Please try again.",
        );
      }
      throw error;
    }
  }
}

export const timelineService = new TimelineService();
