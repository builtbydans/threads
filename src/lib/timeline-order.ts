import type { TimelineEvent } from "@/server/types/domain";

const PATIENT_UPDATE_TYPES = new Set([
  "patient_text",
  "patient_voice",
  "medication_update",
]);

/**
 * Canonical occurrence timestamp for timeline ordering.
 * Uses recordedAt (mapped from occurred_at), not created_at.
 * Missing or malformed dates sort as oldest under newest-first ordering.
 */
export function occurrenceTimestampMs(
  recordedAt: string | null | undefined,
): number {
  if (!recordedAt || typeof recordedAt !== "string") {
    return Number.NEGATIVE_INFINITY;
  }
  const ms = Date.parse(recordedAt);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** Newest first; identical timestamps break ties by id ascending. */
export function compareTimelineEventsNewestFirst(
  left: TimelineEvent,
  right: TimelineEvent,
): number {
  const diff =
    occurrenceTimestampMs(right.recordedAt) -
    occurrenceTimestampMs(left.recordedAt);
  if (diff !== 0) return diff;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function sortTimelineEventsNewestFirst(
  events: readonly TimelineEvent[],
): TimelineEvent[] {
  return [...events].sort(compareTimelineEventsNewestFirst);
}

export function isPatientReportedUpdate(event: TimelineEvent): boolean {
  return (
    event.sourceKind === "patient_reported" &&
    PATIENT_UPDATE_TYPES.has(event.type)
  );
}

/** Latest patient-reported symptom/update by occurrence time. */
export function selectLatestPatientReport(
  events: readonly TimelineEvent[],
): TimelineEvent | null {
  return (
    sortTimelineEventsNewestFirst(events).find(isPatientReportedUpdate) ?? null
  );
}

/** Recent patient reports, newest first, excluding an optional featured id. */
export function selectRecentPatientReports(
  events: readonly TimelineEvent[],
  options: { limit?: number; excludeId?: string } = {},
): TimelineEvent[] {
  const { limit = 5, excludeId } = options;
  return sortTimelineEventsNewestFirst(events)
    .filter(isPatientReportedUpdate)
    .filter((event) => event.id !== excludeId)
    .slice(0, limit);
}

/**
 * Evidence ids that open the drawer for a timeline event.
 * Prefer linked evidenceRefs; fall back to the event id used when
 * clinician context synthesises a reference from the event itself.
 */
export function resolveEvidenceIdsForEvent(event: TimelineEvent): string[] {
  if (event.evidenceRefs?.length) {
    return event.evidenceRefs.map((reference) => reference.id);
  }
  return [event.id];
}
