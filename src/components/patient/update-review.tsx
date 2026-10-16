"use client";

import {
  BedDouble,
  Check,
  ChevronLeft,
  CircleHelp,
  FileText,
  LoaderCircle,
  MapPin,
  Pill,
  Save,
  Sparkles,
  Target,
} from "lucide-react";

import { SafetyNotice } from "@/components/shared/safety-notice";
import { SourceBadge, VerificationBadge } from "@/components/shared/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { StructuredPatientUpdate, TimelineEvent } from "@/server/types/domain";

function DetailBlock({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.09em] text-plum-600"><Icon className="size-3.5" />{title}</div>
      <div className="mt-3 text-sm leading-6">{children}</div>
    </div>
  );
}

function Tags({ items, empty = "Nothing identified" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return <div className="flex flex-wrap gap-2">{items.map((item) => <Badge key={item} variant="patient">{item}</Badge>)}</div>;
}

export function UpdateReview({
  structuredUpdate,
  event,
  onSave,
  onEdit,
  onCancel,
  saving,
  saveDisabled = false,
  saveDisabledReason,
  saveError,
}: {
  structuredUpdate: StructuredPatientUpdate;
  event: TimelineEvent;
  onSave: () => void | Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
  saving: boolean;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
  saveError?: string;
}) {
  const medicationNotes = [
    ...(structuredUpdate.medicationNotes ?? []),
    ...(structuredUpdate.medicationDetails?.action ? [structuredUpdate.medicationDetails.action] : []),
    ...(structuredUpdate.medicationDetails?.reportedSideEffects?.length
      ? [`Reported side effects: ${structuredUpdate.medicationDetails.reportedSideEffects.join(", ")}`]
      : []),
  ];

  return (
    <section className="animate-fade-up">
      <button type="button" onClick={onEdit} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-plum-700 hover:text-plum-900">
        <ChevronLeft className="size-4" /> Back to your update
      </button>
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sage-100 text-sage-700"><Check className="size-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.11em] text-sage-700">Ready to review</p>
          <h1 className="mt-1 text-[clamp(2rem,7vw,3.25rem)] font-semibold leading-none tracking-[-.05em]">Does this look right?</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Thread organised the following details from your update. Please review them before saving.
          </p>
        </div>
      </div>

      <Card className="mt-7 overflow-hidden border-plum-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-plum-50/55 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <SourceBadge sourceKind="patient_reported" />
            <Badge variant="ai"><Sparkles /> Thread-organised</Badge>
            <VerificationBadge />
          </div>
          {structuredUpdate.severity !== undefined ? <Badge variant={structuredUpdate.severity >= 7 ? "warning" : "patient"}>{structuredUpdate.severity}/10 reported</Badge> : null}
        </div>

        <div className="p-5 sm:p-6">
          <div className="rounded-2xl bg-[#f8f5f1] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em] text-muted-foreground"><FileText className="size-3.5" />Your original {event.type === "patient_voice" ? "transcript" : "words"}</p>
            <blockquote className="mt-3 whitespace-pre-wrap text-sm leading-7 text-plum-950 sm:text-base">“{structuredUpdate.originalText}”</blockquote>
            {structuredUpdate.translatedText ? (
              <div className="mt-4 border-t pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-plum-500">English translation</p>
                <p className="mt-2 text-sm leading-6">{structuredUpdate.translatedText}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <DetailBlock icon={Target} title="Symptoms"><Tags items={structuredUpdate.symptoms} /></DetailBlock>
            <DetailBlock icon={MapPin} title="Body location"><Tags items={structuredUpdate.bodyLocations} empty="No body location identified" /></DetailBlock>
            <DetailBlock icon={Target} title="Impact on your day"><Tags items={structuredUpdate.functionalImpacts} empty="No functional impact identified" /></DetailBlock>
            <DetailBlock icon={Pill} title="Medication notes"><Tags items={medicationNotes} empty="No medication detail identified" /></DetailBlock>
            <DetailBlock icon={BedDouble} title="Sleep impact"><p className={structuredUpdate.sleepImpact ? "" : "text-xs text-muted-foreground"}>{structuredUpdate.sleepImpact ?? "No sleep impact identified"}</p></DetailBlock>
            <DetailBlock icon={CircleHelp} title="Questions for next appointment"><Tags items={structuredUpdate.questionsForNextAppointment} empty="No questions identified — you can add these later" /></DetailBlock>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/55 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-amber-900">How Thread connected the details</p>
              <Badge variant="outline">{structuredUpdate.evidenceSentences.length} {structuredUpdate.evidenceSentences.length === 1 ? "sentence" : "sentences"}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {structuredUpdate.evidenceSentences.map((reference, index) => (
                <div key={reference.id} className="grid grid-cols-[1.6rem_1fr] gap-2.5 text-xs leading-5">
                  <span className="flex size-6 items-center justify-center rounded-full bg-white font-semibold text-amber-800 shadow-sm">{index + 1}</span>
                  <div>
                    <p>“{reference.sentence}”</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Supports: {reference.supports.join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator />
        <div className="flex flex-col gap-3 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-md text-[11px] leading-5 text-muted-foreground">
            {saveDisabledReason ??
              "Saving confirms this patient-reported update and writes it to your durable Thread. You can still explain or correct it in a future update."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={saving || saveDisabled}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}{" "}
              {saving ? "Saving…" : "Save to timeline"}
            </Button>
          </div>
        </div>
        {saveError ? (
          <div
            className="border-t border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-950 sm:px-6"
            role="alert"
          >
            {saveError}
          </div>
        ) : null}
      </Card>

      <SafetyNotice className="mx-auto mt-5 max-w-2xl" compact />
    </section>
  );
}
