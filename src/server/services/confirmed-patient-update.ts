/**
 * Pure helpers for confirmed patient-update persistence rules.
 * Kept free of server-only imports so unit tests can import them directly.
 */

export type TranscriptionMode = "runware" | "fallback" | "typed";

export type ConfirmedSaveRejection = {
  code: "SYNTHETIC_TRANSCRIPT_NOT_PERSISTABLE";
  message: string;
};

export const isDurableTranscriptionMode = (
  mode: TranscriptionMode | undefined,
): mode is "runware" | "typed" => mode === "runware" || mode === "typed";

export const rejectionForTranscriptionMode = (
  mode: TranscriptionMode | undefined,
): ConfirmedSaveRejection | null => {
  if (mode === "fallback") {
    return {
      code: "SYNTHETIC_TRANSCRIPT_NOT_PERSISTABLE",
      message:
        "This transcript is a synthetic demonstration fallback, not a transcription of your recording. Thread will not save it as your spoken words. Record again when live transcription is available, or write your update instead.",
    };
  }
  if (mode !== "runware" && mode !== "typed") {
    return {
      code: "SYNTHETIC_TRANSCRIPT_NOT_PERSISTABLE",
      message:
        "Thread could not confirm how this text was produced, so it will not save it as a durable patient update.",
    };
  }
  return null;
};

export type ReviewedStructuredSnapshot = {
  symptoms?: string[];
  severity?: number;
  bodyLocations?: string[];
  functionalImpacts?: string[];
  medicationDetails?: Record<string, unknown>;
  sleepImpact?: string;
  questionsForNextAppointment?: string[];
  evidenceSentences?: Array<{
    id: string;
    sentence: string;
    supports: string[];
  }>;
  categories?: string[];
};

export const reviewedStructuredFromMetadata = (
  metadata: Record<string, unknown> | undefined,
): ReviewedStructuredSnapshot | undefined => {
  const candidate = metadata?.reviewedStructuredUpdate;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }
  return candidate as ReviewedStructuredSnapshot;
};
