"use client";

import { format } from "date-fns";
import {
  ArrowUpRight,
  Bed,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  MapPin,
  Pill,
  Volume2,
} from "lucide-react";
import * as React from "react";

import { EventIcon } from "@/components/timeline/event-icon";
import {
  SourceBadge,
  VerificationBadge,
  VoiceBadge,
} from "@/components/shared/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/server/types/domain";

const eventLabel: Record<TimelineEvent["type"], string> = {
  patient_text: "Written update",
  patient_voice: "Voice update",
  medication_update: "Medication",
  ae_encounter: "A&E encounter",
  gp_review: "GP review",
  specialist_review: "Specialist review",
  test_result: "Test result",
  referral: "Referral",
  ai_observation: "Thread observation",
};

export function TimelineEventCard({
  event,
  compact = false,
  onViewEvidence,
  onViewEncounter,
}: {
  event: TimelineEvent;
  compact?: boolean;
  onViewEvidence?: (event: TimelineEvent) => void;
  onViewEncounter?: (event: TimelineEvent) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isEncounter = Boolean(event.encounterDetails);
  const isAi = event.sourceKind === "ai_organised";

  const hasMetaChips = Boolean(
    event.organisation ||
      event.bodyLocations?.length ||
      event.functionalImpacts?.length ||
      event.medicationDetails,
  );
  const hasVoiceDetails = event.type === "patient_voice" && Boolean(event.originalText);
  const hasExpandableDetails = !compact && (hasMetaChips || hasVoiceDetails);

  return (
    <article
      className={cn(
        "group relative grid grid-cols-[2rem_1fr] gap-2.5 animate-fade-up sm:grid-cols-[2.25rem_1fr] sm:gap-3",
        compact ? "pb-4" : "pb-3",
      )}
    >
      <div
        className="absolute bottom-0 left-[15px] top-8 w-px bg-plum-200/70 sm:left-[17px]"
        aria-hidden="true"
      />
      <EventIcon type={event.type} className={compact ? "size-8" : "size-8 sm:size-9"} />

      <div
        className={cn(
          "rounded-2xl border bg-white shadow-card transition-colors duration-200 group-hover:border-plum-200",
          compact ? "p-3.5" : "px-3.5 py-3 sm:px-4 sm:py-3.5",
          isAi && "border-amber-200/80 bg-amber-50/40",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="font-semibold uppercase tracking-[.08em] text-plum-600">
              {eventLabel[event.type]}
            </span>
            <span className="text-border" aria-hidden="true">
              ·
            </span>
            <time
              className="text-muted-foreground"
              dateTime={event.recordedAt}
            >
              {format(
                new Date(event.recordedAt),
                compact ? "d MMM" : "d MMM yyyy · HH:mm",
              )}
            </time>
          </div>
          {event.severity !== undefined ? (
            <Badge variant={event.severity >= 7 ? "warning" : "patient"}>
              {event.severity}/10
            </Badge>
          ) : null}
        </div>

        <h3
          className={cn(
            "mt-1.5 font-semibold tracking-[-.02em] text-plum-950",
            compact ? "text-sm" : "text-[0.95rem] sm:text-base",
          )}
        >
          {event.title}
        </h3>
        <p
          className={cn(
            "mt-1 leading-relaxed text-muted-foreground",
            compact
              ? "line-clamp-2 text-xs"
              : expanded
                ? "text-sm"
                : "line-clamp-2 text-sm",
          )}
        >
          {event.summary}
        </p>

        {hasExpandableDetails && expanded ? (
          <div className="mt-3 space-y-3 border-t border-plum-100/80 pt-3">
            {hasMetaChips ? (
              <div className="flex flex-wrap gap-1.5">
                {event.organisation ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    <MapPin className="size-3" />
                    {event.organisation}
                  </span>
                ) : null}
                {event.bodyLocations?.slice(0, 3).map((location) => (
                  <span
                    key={location}
                    className="rounded-lg bg-plum-50 px-2 py-1 text-[11px] text-plum-700"
                  >
                    {location}
                  </span>
                ))}
                {event.functionalImpacts?.some((impact) =>
                  impact.toLowerCase().includes("work"),
                ) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    <BriefcaseBusiness className="size-3" />
                    Work affected
                  </span>
                ) : null}
                {event.functionalImpacts?.some(
                  (impact) =>
                    impact.toLowerCase().includes("sleep") ||
                    impact.toLowerCase().includes("woke"),
                ) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    <Bed className="size-3" />
                    Sleep affected
                  </span>
                ) : null}
                {event.medicationDetails ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    <Pill className="size-3" />
                    {event.medicationDetails.medicationName ?? "Medication"}
                  </span>
                ) : null}
              </div>
            ) : null}

            {hasVoiceDetails ? (
              <div className="rounded-xl border border-plum-100 bg-plum-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="size-3.5 text-plum-600" />
                  <VoiceBadge translated={Boolean(event.translatedText)} />
                </div>
                {event.originalText ? (
                  <p className="mt-2 line-clamp-3 text-xs italic leading-5 text-plum-900">
                    “{event.originalText}”
                  </p>
                ) : null}
                {event.translatedText ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {event.translatedText}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "mt-2.5 flex flex-wrap items-center gap-1.5",
            compact && "mt-2",
          )}
        >
          <SourceBadge sourceKind={event.sourceKind} compact />
          {isAi ? <VerificationBadge compact /> : null}

          <div className="ml-auto flex items-center gap-0.5">
            {hasExpandableDetails ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="h-8 px-2 text-muted-foreground hover:text-plum-800"
              >
                {expanded ? "Less" : "Details"}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </Button>
            ) : null}
            {isAi && onViewEvidence ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewEvidence(event)}
                className="h-8 px-2 text-plum-700"
              >
                {event.evidenceRefs?.length ?? 0} sources <ChevronRight />
              </Button>
            ) : null}
            {!isAi && event.evidenceRefs?.length && onViewEvidence ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewEvidence(event)}
                className="h-8 px-2 text-plum-700"
              >
                Evidence <ChevronRight />
              </Button>
            ) : null}
            {isEncounter && onViewEncounter ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewEncounter(event)}
                className="h-8 px-2 text-sage-700"
              >
                Record <ArrowUpRight />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
