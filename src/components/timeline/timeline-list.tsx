"use client";

import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { TimelineEventCard } from "@/components/timeline/timeline-event-card";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/server/types/domain";

type TimelineGroup = {
  key: string;
  label: string;
  events: TimelineEvent[];
};

function groupEventsByMonth(events: TimelineEvent[]): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();

  for (const event of events) {
    const date = new Date(event.recordedAt);
    const key = Number.isFinite(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    const label = Number.isFinite(date.getTime())
      ? format(date, "MMMM yyyy")
      : "Unknown date";

    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(key, { key, label, events: [event] });
    }
  }

  return Array.from(groups.values());
}

function defaultExpandedKeys(groups: TimelineGroup[]) {
  return new Set(groups[0] ? [groups[0].key] : []);
}

export function TimelineList({
  events,
  compact = false,
  groupByMonth = false,
  onViewEvidence,
  onViewEncounter,
}: {
  events: TimelineEvent[];
  compact?: boolean;
  /** When true, render month/year sections with older groups collapsed. */
  groupByMonth?: boolean;
  onViewEvidence?: (event: TimelineEvent) => void;
  onViewEncounter?: (event: TimelineEvent) => void;
}) {
  const groups = React.useMemo(
    () => (groupByMonth ? groupEventsByMonth(events) : null),
    [events, groupByMonth],
  );

  const groupSignature = groups?.map((group) => group.key).join("|") ?? "";
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(() =>
    defaultExpandedKeys(groups ?? []),
  );
  const [signature, setSignature] = React.useState(groupSignature);

  if (groupByMonth && groups && signature !== groupSignature) {
    setSignature(groupSignature);
    setExpandedKeys(defaultExpandedKeys(groups));
  }

  const toggleGroup = React.useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!groupByMonth || !groups) {
    return (
      <div>
        {events.map((event) => (
          <TimelineEventCard
            key={event.id}
            event={event}
            compact={compact}
            onViewEvidence={onViewEvidence}
            onViewEncounter={onViewEncounter}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group, index) => {
        const expanded = expandedKeys.has(group.key);
        const isNewest = index === 0;

        return (
          <section key={group.key} className="scroll-mt-4">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={expanded}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors",
                "hover:bg-plum-50/80 md:sticky md:top-0 md:z-10 md:bg-white/95 md:backdrop-blur-sm",
              )}
            >
              <span className="text-sm font-semibold tracking-[-.02em] text-plum-950">
                {group.label}
              </span>
              <span className="rounded-md bg-plum-50 px-1.5 py-0.5 text-[10px] font-semibold text-plum-600">
                {group.events.length}
              </span>
              {isNewest ? (
                <span className="text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">
                  Latest
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  "ml-auto size-4 text-muted-foreground transition-transform",
                  !expanded && "-rotate-90",
                )}
              />
            </button>

            {expanded ? (
              <div className="pt-1">
                {group.events.map((event) => (
                  <TimelineEventCard
                    key={event.id}
                    event={event}
                    compact={compact}
                    onViewEvidence={onViewEvidence}
                    onViewEncounter={onViewEncounter}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
