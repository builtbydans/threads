"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  Activity,
  CalendarRange,
  CirclePlus,
  Clock3,
  FileHeart,
  FlaskConical,
  ListFilter,
  Pill,
  UserRound,
} from "lucide-react";
import * as React from "react";

import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import { useDemoData } from "@/components/shared/demo-data-provider";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { EncounterDetailsSheet } from "@/components/timeline/encounter-details-sheet";
import { PainTrendCard } from "@/components/timeline/pain-trend-card";
import { TimelineList } from "@/components/timeline/timeline-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { seedEvidenceReferences } from "@/data/seed";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/server/types/domain";

type TimelineFilter =
  | "all"
  | "updates"
  | "encounters"
  | "medication"
  | "results";

const filterOptions: Array<{
  value: TimelineFilter;
  label: string;
  icon: typeof Activity;
}> = [
  { value: "all", label: "All events", icon: CalendarRange },
  { value: "updates", label: "Symptoms", icon: UserRound },
  { value: "encounters", label: "Appointments", icon: FileHeart },
  { value: "medication", label: "Medications", icon: Pill },
  { value: "results", label: "Test results", icon: FlaskConical },
];

function eventMatchesFilter(event: TimelineEvent, filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "updates") {
    return event.type === "patient_text" || event.type === "patient_voice";
  }
  if (filter === "encounters") {
    return [
      "ae_encounter",
      "gp_review",
      "specialist_review",
      "referral",
    ].includes(event.type);
  }
  if (filter === "medication") {
    return event.type === "medication_update" || Boolean(event.medicationDetails);
  }
  return event.type === "test_result" || Boolean(event.bloodResults?.length);
}

function overviewHighlights(events: TimelineEvent[]) {
  const latest = events[0] ?? null;
  const latestReport = events.find(
    (event) =>
      event.sourceKind === "patient_reported" &&
      (event.type === "patient_text" ||
        event.type === "patient_voice" ||
        event.type === "medication_update"),
  );
  const encounters = events.filter((event) =>
    ["ae_encounter", "gp_review", "specialist_review", "referral"].includes(
      event.type,
    ),
  );
  const oldest = events.length
    ? [...events].sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      )[0]
    : null;

  return {
    latest,
    latestReport,
    encounterCount: encounters.length,
    patientReportedCount: events.filter(
      (event) => event.sourceKind === "patient_reported",
    ).length,
    spanLabel:
      oldest && latest
        ? `${format(new Date(oldest.recordedAt), "MMM yyyy")} – ${format(new Date(latest.recordedAt), "MMM yyyy")}`
        : null,
  };
}

export default function PatientTimelinePage() {
  const { events, isHydrated } = useDemoData();
  const [filter, setFilter] = React.useState<TimelineFilter>("all");
  const [evidenceEvent, setEvidenceEvent] = React.useState<TimelineEvent | null>(
    null,
  );
  const [encounterEvent, setEncounterEvent] =
    React.useState<TimelineEvent | null>(null);

  const filteredEvents = React.useMemo(
    () => events.filter((event) => eventMatchesFilter(event, filter)),
    [events, filter],
  );

  const highlights = React.useMemo(
    () => overviewHighlights(events),
    [events],
  );

  const availableFilters = React.useMemo(
    () =>
      filterOptions.filter((option) => {
        if (option.value === "all") return true;
        return events.some((event) => eventMatchesFilter(event, option.value));
      }),
    [events],
  );

  const evidence = evidenceEvent?.evidenceRefs?.length
    ? evidenceEvent.evidenceRefs
    : seedEvidenceReferences;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-7 sm:py-8 lg:px-8">
      <header className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-plum-500">
            <Activity className="size-3.5" /> Amina&apos;s Thread
          </div>
          <h1 className="mt-1.5 text-[clamp(1.85rem,6vw,2.75rem)] font-semibold leading-none tracking-[-.05em] text-plum-950">
            Your health story
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            A connected view of your updates, appointments, and important
            changes — organised so you can find what matters without endless
            scrolling.
          </p>
        </div>
        <Button asChild className="shrink-0 self-start sm:self-auto">
          <Link href="/patient/update">
            <CirclePlus /> Add an update
          </Link>
        </Button>
      </header>

      {/* Health overview */}
      <section
        aria-label="Health overview"
        className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_14.5rem]"
      >
        <Card className="bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.11em] text-plum-500">
            Overview
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-plum-100/80 bg-plum-50/40 px-3 py-2.5">
              <p className="text-2xl font-semibold tracking-[-.04em] text-plum-950">
                {isHydrated ? events.length : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                recorded moments
              </p>
            </div>
            <div className="rounded-xl border border-plum-100/80 bg-white px-3 py-2.5">
              <p className="text-2xl font-semibold tracking-[-.04em] text-plum-950">
                {isHydrated ? highlights.encounterCount : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                appointments
              </p>
            </div>
            <div className="rounded-xl border border-plum-100/80 bg-white px-3 py-2.5">
              <p className="text-2xl font-semibold tracking-[-.04em] text-plum-950">
                {isHydrated ? highlights.patientReportedCount : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                your updates
              </p>
            </div>
          </div>
          {highlights.spanLabel ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5 shrink-0" />
              Story span {highlights.spanLabel}
            </p>
          ) : null}
        </Card>

        <Card className="bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.11em] text-plum-500">
            Most recent
          </p>
          {isHydrated && highlights.latest ? (
            <div className="mt-3">
              <p className="text-sm font-semibold tracking-[-.02em] text-plum-950">
                {highlights.latest.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {highlights.latest.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {format(
                    new Date(highlights.latest.recordedAt),
                    "d MMM yyyy",
                  )}
                </Badge>
                {highlights.latestReport &&
                highlights.latestReport.id !== highlights.latest.id ? (
                  <span className="text-[11px] text-muted-foreground">
                    Last update ·{" "}
                    {format(
                      new Date(highlights.latestReport.recordedAt),
                      "d MMM",
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}
        </Card>

        <PainTrendCard compact className="hidden lg:flex lg:flex-col" />
      </section>

      <div className="mt-3 lg:hidden">
        <PainTrendCard compact />
      </div>

      {/* Timeline */}
      <section aria-label="Health timeline" className="mt-6">
        <Card className="overflow-hidden bg-white p-0 shadow-card">
          <div className="border-b border-plum-100/80 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold tracking-[-.025em] text-plum-950">
                  Timeline
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isHydrated
                    ? `${filteredEvents.length} ${filteredEvents.length === 1 ? "moment" : "moments"} · newest first`
                    : "Loading your story…"}
                </p>
              </div>
              <Badge variant="outline" className="hidden sm:inline-flex">
                Grouped by month
              </Badge>
            </div>

            <div
              className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5"
              role="toolbar"
              aria-label="Filter timeline"
            >
              <span className="mr-0.5 hidden size-8 shrink-0 items-center justify-center rounded-lg bg-plum-50 text-plum-600 sm:flex">
                <ListFilter className="size-3.5" />
              </span>
              {availableFilters.map((option) => {
                const active = filter === option.value;
                const Icon = option.icon;
                const count = events.filter((event) =>
                  eventMatchesFilter(event, option.value),
                ).length;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                      active
                        ? "bg-plum-950 text-white"
                        : "bg-plum-50/80 text-muted-foreground hover:bg-plum-100 hover:text-plum-800",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                    <span
                      className={cn(
                        "tabular-nums text-[10px]",
                        active ? "text-plum-200" : "text-muted-foreground/70",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bounded scroll on desktop/tablet; natural page scroll on mobile */}
          <div
            className={cn(
              "px-3 py-3 sm:px-4 sm:py-4",
              "md:max-h-[min(34rem,calc(100dvh-16rem))] md:overflow-y-auto md:overscroll-contain",
            )}
          >
            {!isHydrated ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton key={item} className="h-28 rounded-2xl" />
                ))}
              </div>
            ) : filteredEvents.length ? (
              <TimelineList
                events={filteredEvents}
                groupByMonth
                onViewEvidence={setEvidenceEvent}
                onViewEncounter={setEncounterEvent}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-plum-200 bg-plum-50/30 px-6 py-10 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white text-plum-600 shadow-sm">
                  <ListFilter className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-plum-950">
                  No matching moments yet
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Choose another filter or add an update in your own words.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-5">
                  <Link href="/patient/update">Add an update</Link>
                </Button>
              </div>
            )}
          </div>
        </Card>
      </section>

      <SafetyNotice className="mx-auto mt-4 max-w-2xl border-t pt-4" compact />

      <EvidenceDrawer
        open={Boolean(evidenceEvent)}
        onOpenChange={(open) => {
          if (!open) setEvidenceEvent(null);
        }}
        observation={evidenceEvent?.summary ?? ""}
        evidence={evidence}
      />
      <EncounterDetailsSheet
        event={encounterEvent}
        open={Boolean(encounterEvent)}
        onOpenChange={(open) => {
          if (!open) setEncounterEvent(null);
        }}
      />
    </main>
  );
}
