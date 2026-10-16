import { describe, expect, it } from "vitest";

import { reviewedPatientEventSchema } from "@/server/schemas";

const baseEvent = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patientId: "11111111-1111-4111-8111-111111111111",
  type: "patient_voice" as const,
  title: "Voice update",
  summary: "Pelvic pain overnight.",
  recordedAt: "2026-10-16T16:00:00.000Z",
  sourceKind: "patient_reported" as const,
  originalText: "The pain woke me during the night.",
  language: "English",
};

describe("reviewedPatientEventSchema", () => {
  it("accepts a runware-confirmed voice event", () => {
    const parsed = reviewedPatientEventSchema.parse({
      ...baseEvent,
      metadata: {
        transcriptionMode: "runware",
        categories: ["pain"],
      },
    });
    expect(parsed.metadata.transcriptionMode).toBe("runware");
  });

  it("accepts typed written updates", () => {
    const parsed = reviewedPatientEventSchema.parse({
      ...baseEvent,
      type: "patient_text",
      metadata: { transcriptionMode: "typed" },
    });
    expect(parsed.metadata.transcriptionMode).toBe("typed");
  });

  it("requires transcriptionMode on metadata", () => {
    expect(() =>
      reviewedPatientEventSchema.parse({
        ...baseEvent,
        metadata: { categories: ["pain"] },
      }),
    ).toThrow();
  });
});
