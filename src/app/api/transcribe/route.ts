import { apiError, apiSuccess, handleRouteError } from "@/server/http/api-response";
import { transcribeMetadataSchema } from "@/server/schemas";
import { createTranscriptionService } from "@/server/services/transcription-service";

export const runtime = "nodejs";

/**
 * Transcription is provisional only. Confirmed patient records are created when
 * the patient reviews and saves via PUT /api/patient-updates.
 */
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
      return apiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Send the recording as multipart form data with an audio field.",
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return apiError(
        400,
        "AUDIO_REQUIRED",
        "Choose or record an audio update before submitting.",
      );
    }

    const preferredLanguageValue = formData.get("preferredLanguage");
    const preferredLanguage =
      typeof preferredLanguageValue === "string" && preferredLanguageValue.trim()
        ? preferredLanguageValue
        : undefined;

    const metadata = transcribeMetadataSchema.parse({
      preferredLanguage,
      mimeType: audio.type,
      byteLength: audio.size,
    });

    const result = await createTranscriptionService().transcribe({
      audio: Buffer.from(await audio.arrayBuffer()),
      mimeType: metadata.mimeType,
      preferredLanguage: metadata.preferredLanguage,
    });

    return apiSuccess(
      {
        transcription: {
          ...result,
          persisted: false,
        },
        safety:
          "Thread organised this transcript for review. It is provisional until you confirm and save. It is patient-reported and not clinically verified.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
