import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { ClinicianHeader } from "@/components/clinician/clinician-header";
import { Button } from "@/components/ui/button";

export function ClinicianDataError({
  title = "Live health record unavailable",
  message = "Thread could not load this patient from the configured database. Demonstration seed data was not substituted.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="min-h-dvh bg-[#f4f2ef] text-[#251c21]">
      <ClinicianHeader mode="today" />
      <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-[-.03em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <Button asChild className="mt-6">
          <Link href="/clinician">Back to today’s list</Link>
        </Button>
      </main>
    </div>
  );
}
