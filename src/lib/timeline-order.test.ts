import { describe, expect, it } from "vitest";

import {
  compareTimelineEventsNewestFirst,
  occurrenceTimestampMs,
  resolveEvidenceIdsForEvent,
  selectLatestPatientReport,
  selectRecentPatientReports,
  sortTimelineEventsNewestFirst,
} from "@/lib/timeline-order";
import type { TimelineEvent } from "@/server/types/domain";

const base = {
  patientId: "patient-1",
  title: "Update",
  summary: "Summary",
} as const;

function event(
  overrides: Partial<TimelineEvent> &
    Pick<TimelineEvent, "id" | "type" | "recordedAt" | "sourceKind">,
): TimelineEvent {
  return {
    ...base,
    ...overrides,
  };
}

describe("occurrenceTimestampMs", () => {
  it("parses valid ISO timestamps", () => {
    expect(occurrenceTimestampMs("2026-07-16T08:12:00+01:00")).toBe(
      Date.parse("2026-07-16T08:12:00+01:00"),
    );
  });

  it("treats missing and malformed dates as oldest", () => {
    expect(occurrenceTimestampMs(undefined)).toBe(Number.NEGATIVE_INFINITY);
    expect(occurrenceTimestampMs(null)).toBe(Number.NEGATIVE_INFINITY);
    expect(occurrenceTimestampMs("")).toBe(Number.NEGATIVE_INFINITY);
    expect(occurrenceTimestampMs("not-a-date")).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("sortTimelineEventsNewestFirst", () => {
  it("orders mixed patient, imported and AI sources by occurrence time", () => {
    const mixed = [
      event({
        id: "seed-old",
        type: "patient_text",
        recordedAt: "2026-04-14T09:10:00+01:00",
        sourceKind: "patient_reported",
      }),
      event({
        id: "local-new",
        type: "patient_voice",
        recordedAt: "2026-10-16T16:00:00.000Z",
        sourceKind: "patient_reported",
      }),
      event({
        id: "repo-mid",
        type: "ae_encounter",
        recordedAt: "2026-05-17T18:42:00+01:00",
        sourceKind: "imported_clinical_record",
      }),
      event({
        id: "ai-top-date",
        type: "ai_observation",
        recordedAt: "2026-07-17T14:00:00+01:00",
        sourceKind: "ai_organised",
      }),
      event({
        id: "malformed",
        type: "patient_text",
        recordedAt: "yesterday",
        sourceKind: "patient_reported",
      }),
    ];

    const sorted = sortTimelineEventsNewestFirst(mixed);
    expect(sorted.map((item) => item.id)).toEqual([
      "local-new",
      "ai-top-date",
      "repo-mid",
      "seed-old",
      "malformed",
    ]);
  });

  it("breaks equal timestamps deterministically by id", () => {
    const sameTime = "2026-07-16T08:12:00+01:00";
    const sorted = sortTimelineEventsNewestFirst([
      event({
        id: "z-event",
        type: "patient_text",
        recordedAt: sameTime,
        sourceKind: "patient_reported",
      }),
      event({
        id: "a-event",
        type: "patient_voice",
        recordedAt: sameTime,
        sourceKind: "patient_reported",
      }),
      event({
        id: "m-event",
        type: "gp_review",
        recordedAt: sameTime,
        sourceKind: "imported_clinical_record",
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "a-event",
      "m-event",
      "z-event",
    ]);
  });

  it("uses recordedAt rather than relying on array insertion order", () => {
    const older = event({
      id: "created-later-but-older-occurrence",
      type: "patient_text",
      recordedAt: "2026-06-01T10:00:00.000Z",
      sourceKind: "patient_reported",
    });
    const newer = event({
      id: "created-earlier-but-newer-occurrence",
      type: "patient_text",
      recordedAt: "2026-09-01T10:00:00.000Z",
      sourceKind: "patient_reported",
    });

    expect(
      compareTimelineEventsNewestFirst(older, newer),
    ).toBeGreaterThan(0);
    expect(sortTimelineEventsNewestFirst([older, newer])[0]?.id).toBe(
      newer.id,
    );
  });
});

describe("selectLatestPatientReport", () => {
  it("selects the newest patient-reported update, ignoring AI and imports", () => {
    const events = [
      event({
        id: "ai",
        type: "ai_observation",
        recordedAt: "2026-10-20T00:00:00.000Z",
        sourceKind: "ai_organised",
      }),
      event({
        id: "import",
        type: "ae_encounter",
        recordedAt: "2026-10-19T00:00:00.000Z",
        sourceKind: "imported_clinical_record",
      }),
      event({
        id: "voice",
        type: "patient_voice",
        recordedAt: "2026-10-18T00:00:00.000Z",
        sourceKind: "patient_reported",
        originalText: "Pain woke me up",
      }),
      event({
        id: "older-text",
        type: "patient_text",
        recordedAt: "2026-10-10T00:00:00.000Z",
        sourceKind: "patient_reported",
      }),
    ];

    const latest = selectLatestPatientReport(events);
    expect(latest?.id).toBe("voice");
    expect(latest?.originalText).toBe("Pain woke me up");
  });
});

describe("selectRecentPatientReports", () => {
  it("returns subsequent history newest-first excluding the featured id", () => {
    const events = [
      event({
        id: "newest",
        type: "patient_text",
        recordedAt: "2026-10-16T00:00:00.000Z",
        sourceKind: "patient_reported",
      }),
      event({
        id: "mid",
        type: "patient_voice",
        recordedAt: "2026-10-10T00:00:00.000Z",
        sourceKind: "patient_reported",
      }),
      event({
        id: "old",
        type: "medication_update",
        recordedAt: "2026-09-01T00:00:00.000Z",
        sourceKind: "patient_reported",
      }),
      event({
        id: "import",
        type: "gp_review",
        recordedAt: "2026-10-15T00:00:00.000Z",
        sourceKind: "imported_clinical_record",
      }),
    ];

    expect(
      selectRecentPatientReports(events, {
        limit: 2,
        excludeId: "newest",
      }).map((item) => item.id),
    ).toEqual(["mid", "old"]);
  });
});

describe("resolveEvidenceIdsForEvent", () => {
  it("prefers evidenceRefs and falls back to the event id", () => {
    expect(
      resolveEvidenceIdsForEvent(
        event({
          id: "event-1",
          type: "patient_text",
          recordedAt: "2026-10-16T00:00:00.000Z",
          sourceKind: "patient_reported",
          evidenceRefs: [
            {
              id: "ev-a",
              eventId: "event-1",
              sourceKind: "patient_reported",
              label: "A",
              excerpt: "excerpt",
              recordedAt: "2026-10-16T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toEqual(["ev-a"]);

    expect(
      resolveEvidenceIdsForEvent(
        event({
          id: "event-2",
          type: "patient_text",
          recordedAt: "2026-10-16T00:00:00.000Z",
          sourceKind: "patient_reported",
        }),
      ),
    ).toEqual(["event-2"]);
  });
});
