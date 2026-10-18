import { ClinicianDataError } from "@/components/clinician/clinician-data-error";
import { ClinicianTodayPage } from "@/components/clinician/clinician-today-page";
import { AMINA_PATIENT_ID } from "@/lib/constants";
import { RepositoryError } from "@/server/repositories/repository-support";
import { clinicianContextService } from "@/server/services/clinician-context-service";
import type { ClinicianContext } from "@/server/types/domain";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Today’s appointments | Thread",
  description: "Dr Rahman’s appointment working list for today.",
};

async function loadContext(): Promise<
  | { ok: true; context: ClinicianContext }
  | { ok: false; message: string }
> {
  try {
    const context = await clinicianContextService.getContext(AMINA_PATIENT_ID);
    return { ok: true, context };
  } catch (error) {
    console.error("[Thread clinician page]", error);
    return {
      ok: false,
      message:
        error instanceof RepositoryError
          ? "Thread could not load today’s patient context from the configured database. Demonstration seed data was not substituted."
          : "Thread could not load today’s patient context. Please try again.",
    };
  }
}

export default async function ClinicianPage() {
  const result = await loadContext();
  if (!result.ok) {
    return <ClinicianDataError message={result.message} />;
  }
  return <ClinicianTodayPage context={result.context} />;
}
