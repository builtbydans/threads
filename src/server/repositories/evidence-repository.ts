import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { EvidenceRecord, EvidenceReference } from "@/server/types/domain";
import type { Json } from "@/types/database.types";

import { fallbackStore } from "@/server/repositories/fallback-store";
import {
  mapEvidenceRecord,
  mapEvidenceReference,
} from "@/server/repositories/mappers";
import {
  RepositoryError,
  requireSuccessfulQuery,
  withRepositoryFallback,
} from "@/server/repositories/repository-support";

const asJsonObject = (value: Record<string, unknown>): Json =>
  value as Json;

const nonEmptyExactString = z.string().refine((value) => value.trim().length > 0);
const voiceTranscriptEvidenceInputSchema = z.object({
  patientId: z.string().uuid(),
  patientUpdateId: z.string().uuid(),
  originalTranscript: nonEmptyExactString,
  translatedTranscript: z.string().optional(),
  detectedLanguage: z.string().optional(),
  preferredLanguage: z.string().optional(),
  transcriptionProvider: z.enum(["runware", "synthetic-fallback"]),
  transcriptionMode: z.enum(["runware", "fallback"]),
  occurredAt: z
    .string()
    .datetime({ offset: true, message: "Use an ISO 8601 date and time." }),
});

export type CreateVoiceTranscriptEvidenceInput = z.infer<
  typeof voiceTranscriptEvidenceInputSchema
>;

const confirmedEvidenceInputSchema = z.object({
  patientId: z.string().uuid(),
  patientUpdateId: z.string().uuid(),
  sourceType: z.enum(["voice_transcript", "patient_text_update"]),
  title: nonEmptyExactString,
  originalContent: nonEmptyExactString,
  translatedContent: z.string().optional(),
  occurredAt: z
    .string()
    .datetime({ offset: true, message: "Use an ISO 8601 date and time." }),
  metadata: z.record(z.string(), z.unknown()),
});

export type UpsertConfirmedEvidenceInput = z.infer<
  typeof confirmedEvidenceInputSchema
>;

export class EvidenceRepository {
  async createVoiceTranscriptEvidence(
    input: CreateVoiceTranscriptEvidenceInput,
  ): Promise<EvidenceRecord> {
    const validated = voiceTranscriptEvidenceInputSchema.parse(input);
    return this.upsertConfirmedEvidence({
      patientId: validated.patientId,
      patientUpdateId: validated.patientUpdateId,
      sourceType: "voice_transcript",
      title: "Patient voice update",
      originalContent: validated.originalTranscript,
      ...(validated.translatedTranscript === undefined
        ? {}
        : { translatedContent: validated.translatedTranscript }),
      occurredAt: validated.occurredAt,
      metadata: {
        inputType: "voice",
        detectedLanguage: validated.detectedLanguage ?? null,
        preferredLanguage: validated.preferredLanguage ?? null,
        transcriptionProvider: validated.transcriptionProvider,
        transcriptionMode: validated.transcriptionMode,
      },
    });
  }

  /**
   * Idempotent evidence write keyed by patient_update source_id.
   * Repeated saves of the same confirmed update update the existing row
   * instead of inserting duplicates.
   */
  async upsertConfirmedEvidence(
    input: UpsertConfirmedEvidenceInput,
  ): Promise<EvidenceRecord> {
    const validated = confirmedEvidenceInputSchema.parse(input);
    const client = getSupabaseAdmin();
    if (!client) {
      throw new RepositoryError(
        "EvidenceRepository.upsertConfirmedEvidence",
        "SUPABASE_SECRET_KEY is not configured for confirmed update persistence.",
      );
    }

    const existingResult = await client
      .from("evidence_records")
      .select(
        "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
      )
      .eq("patient_id", validated.patientId)
      .eq("source_id", validated.patientUpdateId)
      .order("created_at", { ascending: true })
      .limit(1);

    requireSuccessfulQuery(
      "EvidenceRepository.upsertConfirmedEvidence.lookup",
      existingResult.error,
    );

    const existingRow = existingResult.data?.[0];
    if (existingRow) {
      const { data, error } = await client
        .from("evidence_records")
        .update({
          source_type: validated.sourceType,
          title: validated.title,
          original_content: validated.originalContent,
          translated_content: validated.translatedContent ?? null,
          occurred_at: validated.occurredAt,
          metadata: asJsonObject(validated.metadata),
        })
        .eq("id", existingRow.id)
        .eq("patient_id", validated.patientId)
        .select(
          "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
        )
        .single();

      requireSuccessfulQuery(
        "EvidenceRepository.upsertConfirmedEvidence.update",
        error,
      );
      if (!data) {
        throw new RepositoryError(
          "EvidenceRepository.upsertConfirmedEvidence",
          "Supabase returned no evidence record after update.",
        );
      }
      return mapEvidenceRecord(data);
    }

    const evidenceId = randomUUID();
    const { data, error } = await client
      .from("evidence_records")
      .insert({
        id: evidenceId,
        patient_id: validated.patientId,
        source_type: validated.sourceType,
        source_id: validated.patientUpdateId,
        title: validated.title,
        original_content: validated.originalContent,
        translated_content: validated.translatedContent ?? null,
        occurred_at: validated.occurredAt,
        metadata: asJsonObject(validated.metadata),
      })
      .select(
        "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
      )
      .single();

    if (error || !data) {
      const { error: cleanupError } = await client
        .from("evidence_records")
        .delete()
        .eq("id", evidenceId)
        .eq("patient_id", validated.patientId);
      if (cleanupError) {
        console.error(
          "[Thread persistence] Failed to clean up an invalid evidence response",
          cleanupError,
        );
      }
      requireSuccessfulQuery(
        "EvidenceRepository.upsertConfirmedEvidence.insert",
        error,
      );
      throw new RepositoryError(
        "EvidenceRepository.upsertConfirmedEvidence",
        "Supabase returned an invalid evidence record row.",
      );
    }

    return mapEvidenceRecord(data);
  }

  async listForObservation(observationId: string): Promise<EvidenceReference[]> {
    return withRepositoryFallback({
      scope: "EvidenceRepository.listForObservation",
      remote: async (client) => {
        const { data, error } = await client
          .from("evidence_records")
          .select(
            "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
          )
          .eq("source_id", observationId)
          .order("occurred_at", { ascending: true });

        requireSuccessfulQuery("EvidenceRepository.listForObservation", error);
        return (data ?? []).map((row) => ({
          ...mapEvidenceReference(row),
          observationId,
        }));
      },
      fallback: () =>
        structuredClone(
          fallbackStore.evidenceReferences.filter(
            (reference) => reference.observationId === observationId,
          ),
        ),
    });
  }

  async listLiveForPatient(patientId: string): Promise<EvidenceReference[]> {
    const validatedPatientId = z.string().uuid().parse(patientId);
    return withRepositoryFallback({
      scope: "EvidenceRepository.listLiveForPatient",
      remote: async (client) => {
        const { data, error } = await client
          .from("evidence_records")
          .select(
            "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
          )
          .eq("patient_id", validatedPatientId)
          .order("occurred_at", { ascending: false });

        requireSuccessfulQuery("EvidenceRepository.listLiveForPatient", error);
        return (data ?? []).map(mapEvidenceReference);
      },
      fallback: () => [],
    });
  }

  async listForObservations(
    observationIds: string[],
  ): Promise<EvidenceReference[]> {
    if (observationIds.length === 0) return [];

    return withRepositoryFallback({
      scope: "EvidenceRepository.listForObservations",
      remote: async (client) => {
        const { data, error } = await client
          .from("evidence_records")
          .select(
            "id, patient_id, source_type, source_id, title, original_content, translated_content, occurred_at, metadata, created_at",
          )
          .in("source_id", observationIds)
          .order("occurred_at", { ascending: true });

        requireSuccessfulQuery("EvidenceRepository.listForObservations", error);
        return (data ?? []).map((row) => ({
          ...mapEvidenceReference(row),
          ...(row.source_id ? { observationId: row.source_id } : {}),
        }));
      },
      fallback: () => {
        const wanted = new Set(observationIds);
        return structuredClone(
          fallbackStore.evidenceReferences.filter(
            (reference) =>
              reference.observationId && wanted.has(reference.observationId),
          ),
        );
      },
    });
  }
}

export const evidenceRepository = new EvidenceRepository();
