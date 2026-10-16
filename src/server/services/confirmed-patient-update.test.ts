import { describe, expect, it } from "vitest";

import {
  isDurableTranscriptionMode,
  rejectionForTranscriptionMode,
  reviewedStructuredFromMetadata,
} from "./confirmed-patient-update";

describe("confirmed patient update rules", () => {
  it("allows runware and typed modes for durable saves", () => {
    expect(isDurableTranscriptionMode("runware")).toBe(true);
    expect(isDurableTranscriptionMode("typed")).toBe(true);
    expect(isDurableTranscriptionMode("fallback")).toBe(false);
    expect(isDurableTranscriptionMode(undefined)).toBe(false);
  });

  it("rejects synthetic fallback transcripts", () => {
    const rejection = rejectionForTranscriptionMode("fallback");
    expect(rejection?.code).toBe("SYNTHETIC_TRANSCRIPT_NOT_PERSISTABLE");
    expect(rejection?.message).toMatch(/synthetic/i);
  });

  it("rejects missing transcription mode", () => {
    const rejection = rejectionForTranscriptionMode(undefined);
    expect(rejection?.code).toBe("SYNTHETIC_TRANSCRIPT_NOT_PERSISTABLE");
  });

  it("accepts durable modes without rejection", () => {
    expect(rejectionForTranscriptionMode("runware")).toBeNull();
    expect(rejectionForTranscriptionMode("typed")).toBeNull();
  });

  it("reads reviewed structured snapshot from evidence metadata", () => {
    const reviewed = reviewedStructuredFromMetadata({
      transcriptionMode: "runware",
      reviewedStructuredUpdate: {
        symptoms: ["pelvic pain"],
        severity: 8,
        bodyLocations: ["pelvis"],
      },
    });

    expect(reviewed?.symptoms).toEqual(["pelvic pain"]);
    expect(reviewed?.severity).toBe(8);
    expect(reviewedStructuredFromMetadata({})).toBeUndefined();
  });
});
