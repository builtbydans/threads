import { apiSuccess, handleRouteError } from "@/server/http/api-response";
import {
  patientUpdateInputSchema,
  reviewedPatientEventSchema,
  timelineQuerySchema,
} from "@/server/schemas";
import { timelineService } from "@/server/services/timeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = timelineQuerySchema.parse({
      patientId: url.searchParams.get("patientId") ?? undefined,
    });
    const events = await timelineService.getTimeline(input.patientId);

    return apiSuccess(
      { events, count: events.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = patientUpdateInputSchema.parse(await request.json());
    const result = await timelineService.organisePatientUpdate(input);

    return apiSuccess(
      {
        ...result,
        reviewNotice:
          "Thread organised the following details from your update. Please review them before saving.",
        sourceLabel: "Patient-reported",
        clinicalVerificationStatus: "not_clinically_verified",
      },
      {
        status: result.saved ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const reviewedEvent = reviewedPatientEventSchema.parse(await request.json());
    const event = await timelineService.saveReviewedPatientEvent(reviewedEvent);

    return apiSuccess(
      {
        event,
        saved: true,
        durable: true,
        reviewIntegrity: "saved_as_reviewed",
        idempotency: "upsert_by_event_id",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
