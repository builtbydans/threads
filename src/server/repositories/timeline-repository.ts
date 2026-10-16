import "server-only";

import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase";
import { compareTimelineEventsNewestFirst } from "@/lib/timeline-order";
import { evidenceRepository } from "@/server/repositories/evidence-repository";
import { fallbackStore } from "@/server/repositories/fallback-store";
import {
  mapClinicalEncounterTimelineEvent,
  mapPatientUpdateTimelineEvent,
  patientUpdateInsertFromTimelineEvent,
} from "@/server/repositories/mappers";
import {
  RepositoryError,
  requireSuccessfulQuery,
  withRepositoryFallback,
} from "@/server/repositories/repository-support";
import type { TimelineEvent } from "@/server/types/domain";

const exactNonEmptyString = z.string().refine((value) => value.trim().length > 0);
const liveVoiceProjectionSchema = z.object({
  patientId: z.string().uuid(),
  patientUpdateId: z.string().uuid(),
  evidenceRecordId: z.string().uuid(),
  originalTranscript: exactNonEmptyString,
  englishTranslation: z.string().optional(),
  detectedLanguage: z.string().optional(),
  transcriptionMode: z.literal("runware"),
  occurredAt: z.string().datetime({ offset: true }),
});

const patientUpdateSelect =
  "id, patient_id, input_type, original_text, original_language, english_translation, processing_status, processing_error, occurred_at, created_at, updated_at" as const;
const clinicalEncounterSelect =
  "id, patient_id, encounter_type, organisation, title, summary, raw_record, occurred_at, created_at, updated_at" as const;

export class TimelineRepository {
  async listByPatient(patientId: string): Promise<TimelineEvent[]> {
    return withRepositoryFallback({
      scope: "TimelineRepository.listByPatient",
      remote: async (client) => {
        const [updatesResult, encountersResult, evidence] = await Promise.all([
          client
            .from("patient_updates")
            .select(patientUpdateSelect)
            .eq("patient_id", patientId)
            .order("occurred_at", { ascending: false }),
          client
            .from("clinical_encounters")
            .select(clinicalEncounterSelect)
            .eq("patient_id", patientId)
            .order("occurred_at", { ascending: false }),
          evidenceRepository.listLiveForPatient(patientId),
        ]);

        requireSuccessfulQuery(
          "TimelineRepository.listByPatient.patient_updates",
          updatesResult.error,
        );
        requireSuccessfulQuery(
          "TimelineRepository.listByPatient.clinical_encounters",
          encountersResult.error,
        );

        const updateEvents = (updatesResult.data ?? []).map((row) =>
          mapPatientUpdateTimelineEvent(
            row,
            evidence.filter((reference) => reference.eventId === row.id),
          ),
        );
        const encounterEvents = (encountersResult.data ?? []).map(
          mapClinicalEncounterTimelineEvent,
        );
        return [...updateEvents, ...encounterEvents].sort(
          compareTimelineEventsNewestFirst,
        );
      },
      fallback: () =>
        structuredClone(
          fallbackStore.timelineEvents
            .filter((event) => event.patientId === patientId)
            .sort(compareTimelineEventsNewestFirst),
        ),
    });
  }

  async findById(eventId: string): Promise<TimelineEvent | null> {
    return withRepositoryFallback({
      scope: "TimelineRepository.findById",
      remote: async (client) => {
        const [updateResult, encounterResult] = await Promise.all([
          client
            .from("patient_updates")
            .select(patientUpdateSelect)
            .eq("id", eventId)
            .maybeSingle(),
          client
            .from("clinical_encounters")
            .select(clinicalEncounterSelect)
            .eq("id", eventId)
            .maybeSingle(),
        ]);
        requireSuccessfulQuery(
          "TimelineRepository.findById.patient_updates",
          updateResult.error,
        );
        requireSuccessfulQuery(
          "TimelineRepository.findById.clinical_encounters",
          encounterResult.error,
        );
        if (updateResult.data) {
          const evidence = await evidenceRepository.listForObservation(eventId);
          return mapPatientUpdateTimelineEvent(updateResult.data, evidence);
        }
        return encounterResult.data
          ? mapClinicalEncounterTimelineEvent(encounterResult.data)
          : null;
      },
      fallback: () => {
        const event = fallbackStore.timelineEvents.find(
          (candidate) => candidate.id === eventId,
        );
        return event ? structuredClone(event) : null;
      },
    });
  }

  async save(event: TimelineEvent): Promise<TimelineEvent> {
    return withRepositoryFallback({
      scope: "TimelineRepository.save",
      remote: async (client) => {
        if (event.sourceKind !== "patient_reported") {
          throw new RepositoryError(
            "TimelineRepository.save",
            "The live schema can persist timeline projections only as patient_updates.",
          );
        }
        const { data, error } = await client
          .from("patient_updates")
          .upsert(patientUpdateInsertFromTimelineEvent(event), {
            onConflict: "id",
          })
          .select(patientUpdateSelect)
          .single();
        requireSuccessfulQuery("TimelineRepository.save", error);
        if (!data) {
          throw new RepositoryError(
            "TimelineRepository.save",
            "Supabase returned no patient update row.",
          );
        }
        return mapPatientUpdateTimelineEvent(data, event.evidenceRefs);
      },
      fallback: () => {
        const index = fallbackStore.timelineEvents.findIndex(
          (candidate) => candidate.id === event.id,
        );
        if (index >= 0) fallbackStore.timelineEvents[index] = structuredClone(event);
        else fallbackStore.timelineEvents.push(structuredClone(event));
        return structuredClone(event);
      },
    });
  }

  /**
   * Durable confirmed save: requires the admin client and never falls back to
   * in-memory seed data. Upserts by event id so repeated saves are idempotent.
   */
  async saveConfirmedPatientUpdate(
    event: TimelineEvent,
  ): Promise<TimelineEvent> {
    if (event.sourceKind !== "patient_reported") {
      throw new RepositoryError(
        "TimelineRepository.saveConfirmedPatientUpdate",
        "Only patient-reported updates can be confirmed into patient_updates.",
      );
    }

    const client = getSupabaseAdmin();
    if (!client) {
      throw new RepositoryError(
        "TimelineRepository.saveConfirmedPatientUpdate",
        "SUPABASE_SECRET_KEY is not configured for confirmed update persistence.",
      );
    }

    const { data, error } = await client
      .from("patient_updates")
      .upsert(patientUpdateInsertFromTimelineEvent(event), {
        onConflict: "id",
      })
      .select(patientUpdateSelect)
      .single();

    requireSuccessfulQuery(
      "TimelineRepository.saveConfirmedPatientUpdate",
      error,
    );
    if (!data) {
      throw new RepositoryError(
        "TimelineRepository.saveConfirmedPatientUpdate",
        "Supabase returned no patient update row.",
      );
    }

    const evidence = await evidenceRepository.listForObservation(event.id);
    return mapPatientUpdateTimelineEvent(data, evidence);
  }

  async createLiveVoiceProjection(
    input: z.infer<typeof liveVoiceProjectionSchema>,
  ): Promise<TimelineEvent> {
    const validated = liveVoiceProjectionSchema.parse(input);
    const client = getSupabaseAdmin();
    if (!client) {
      throw new RepositoryError(
        "TimelineRepository.createLiveVoiceProjection",
        "SUPABASE_SECRET_KEY is not configured for timeline projection.",
      );
    }
    const { data, error } = await client
      .from("patient_updates")
      .select(patientUpdateSelect)
      .eq("id", validated.patientUpdateId)
      .eq("patient_id", validated.patientId)
      .maybeSingle();
    requireSuccessfulQuery(
      "TimelineRepository.createLiveVoiceProjection",
      error,
    );
    if (!data) {
      throw new RepositoryError(
        "TimelineRepository.createLiveVoiceProjection",
        `Patient update ${validated.patientUpdateId} was not found.`,
      );
    }
    const evidence = await evidenceRepository.listForObservation(
      validated.patientUpdateId,
    );
    return mapPatientUpdateTimelineEvent(data, evidence);
  }
}

export const timelineRepository = new TimelineRepository();
