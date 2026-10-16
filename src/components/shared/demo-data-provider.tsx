"use client";

import * as React from "react";
import { seedTimelineEvents } from "@/data/seed";
import { sortTimelineEventsNewestFirst } from "@/lib/timeline-order";
import type { TimelineEvent } from "@/server/types/domain";

const STORAGE_KEY = "thread.demo.timeline-events.v1";

type DemoDataContextValue = {
  events: TimelineEvent[];
  isHydrated: boolean;
  addEvent: (event: TimelineEvent) => void;
  removeLocalEvent: (eventId: string) => void;
  resetLocalEvents: () => void;
};

const DemoDataContext = React.createContext<DemoDataContextValue | null>(null);

type TimelineApiEnvelope = {
  ok: boolean;
  data?: { events?: unknown[] };
};

function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TimelineEvent>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.recordedAt === "string"
    && ["patient_reported", "imported_clinical_record", "ai_organised"].includes(candidate.sourceKind ?? "");
}

export function DemoDataProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = React.useState<TimelineEvent[]>(() =>
    sortTimelineEventsNewestFirst(seedTimelineEvents),
  );
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);

    const hydrate = async () => {
      let localEvents: TimelineEvent[] = [];
      let repositoryEvents: TimelineEvent[] = [];

      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        localEvents = stored
          ? (JSON.parse(stored) as unknown[]).filter(isTimelineEvent).filter((event) => event.sourceKind === "patient_reported")
          : [];
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      try {
        const response = await fetch("/api/patient-updates", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json() as TimelineApiEnvelope;
        if (response.ok && body.ok && Array.isArray(body.data?.events)) {
          repositoryEvents = body.data.events.filter(isTimelineEvent);
        }
      } catch {
        // Seed and local browser data remain available when the repository route is unavailable.
      }

      const merged = new Map(seedTimelineEvents.map((event) => [event.id, event]));
      localEvents.forEach((event) => merged.set(event.id, event));
      repositoryEvents.forEach((event) => merged.set(event.id, event));
      window.clearTimeout(timeout);
      if (!cancelled) {
        setEvents(sortTimelineEventsNewestFirst(Array.from(merged.values())));
        setIsHydrated(true);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const syncLocalEvents = React.useCallback((nextEvents: TimelineEvent[]) => {
    const seedIds = new Set(seedTimelineEvents.map((event) => event.id));
    const localEvents = nextEvents.filter((event) => !seedIds.has(event.id));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localEvents));
  }, []);

  const addEvent = React.useCallback((event: TimelineEvent) => {
    setEvents((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== event.id);
      const next = sortTimelineEventsNewestFirst([event, ...withoutDuplicate]);
      syncLocalEvents(next);
      return next;
    });
  }, [syncLocalEvents]);

  const removeLocalEvent = React.useCallback((eventId: string) => {
    setEvents((current) => {
      const next = current.filter((event) => event.id !== eventId);
      syncLocalEvents(next);
      return next;
    });
  }, [syncLocalEvents]);

  const resetLocalEvents = React.useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setEvents(sortTimelineEventsNewestFirst(seedTimelineEvents));
  }, []);

  const value = React.useMemo(() => ({ events, isHydrated, addEvent, removeLocalEvent, resetLocalEvents }), [events, isHydrated, addEvent, removeLocalEvent, resetLocalEvents]);
  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = React.useContext(DemoDataContext);
  if (!context) throw new Error("useDemoData must be used within DemoDataProvider");
  return context;
}
