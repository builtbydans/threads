"use client";

import * as React from "react";
import { seedTimelineEvents } from "@/data/seed";
import { sortTimelineEventsNewestFirst } from "@/lib/timeline-order";
import type { TimelineEvent } from "@/server/types/domain";

const STORAGE_KEY = "thread.demo.timeline-events.v1";

export type LiveDataStatus = "loading" | "live" | "demo" | "unavailable";

type DemoDataContextValue = {
  events: TimelineEvent[];
  isHydrated: boolean;
  liveDataStatus: LiveDataStatus;
  liveDataMessage: string | null;
  addEvent: (event: TimelineEvent) => void;
  removeLocalEvent: (eventId: string) => void;
  resetLocalEvents: () => void;
};

const DemoDataContext = React.createContext<DemoDataContextValue | null>(null);

type TimelineApiEnvelope = {
  ok: boolean;
  data?: { events?: unknown[]; dataSource?: "supabase" | "fallback" };
  error?: { code?: string; message?: string };
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
  const [liveDataStatus, setLiveDataStatus] =
    React.useState<LiveDataStatus>("loading");
  const [liveDataMessage, setLiveDataMessage] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);

    const hydrate = async () => {
      let localEvents: TimelineEvent[] = [];
      let repositoryEvents: TimelineEvent[] = [];
      let nextStatus: LiveDataStatus = "demo";
      let nextMessage: string | null =
        "Demonstration data — Supabase is not connected for this session.";

      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        localEvents = stored
          ? (JSON.parse(stored) as unknown[])
              .filter(isTimelineEvent)
              .filter((event) => event.sourceKind === "patient_reported")
          : [];
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      try {
        const response = await fetch("/api/patient-updates", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as TimelineApiEnvelope;
        if (response.ok && body.ok && Array.isArray(body.data?.events)) {
          repositoryEvents = body.data.events.filter(isTimelineEvent);
          if (body.data.dataSource === "fallback") {
            nextStatus = "demo";
            nextMessage =
              "Demonstration mode — no live database is configured.";
          } else {
            nextStatus = "live";
            nextMessage = null;
          }
        } else if (
          response.status === 503 ||
          body.error?.code === "DATA_SOURCE_UNAVAILABLE"
        ) {
          nextStatus = "unavailable";
          nextMessage =
            body.error?.message ??
            "Live health record store is unavailable. Showing labelled demonstration data only.";
        } else if (!response.ok) {
          nextStatus = "unavailable";
          nextMessage =
            "Thread could not load the live health record. Showing labelled demonstration data only.";
        }
      } catch {
        // Network/abort: keep seed + local as explicitly labelled demo data.
        nextStatus = "unavailable";
        nextMessage =
          "Thread could not reach the live health record. Showing labelled demonstration data only.";
      }

      const merged = new Map(
        seedTimelineEvents.map((event) => [event.id, event]),
      );
      localEvents.forEach((event) => merged.set(event.id, event));
      // Only merge repository events when the live request succeeded.
      if (nextStatus === "live") {
        repositoryEvents.forEach((event) => merged.set(event.id, event));
      }
      window.clearTimeout(timeout);
      if (!cancelled) {
        setEvents(sortTimelineEventsNewestFirst(Array.from(merged.values())));
        setLiveDataStatus(nextStatus);
        setLiveDataMessage(
          nextStatus === "live"
            ? null
            : nextStatus === "demo"
              ? "Demonstration mode — no live database is configured."
              : nextMessage,
        );
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

  const value = React.useMemo(
    () => ({
      events,
      isHydrated,
      liveDataStatus,
      liveDataMessage,
      addEvent,
      removeLocalEvent,
      resetLocalEvents,
    }),
    [
      events,
      isHydrated,
      liveDataStatus,
      liveDataMessage,
      addEvent,
      removeLocalEvent,
      resetLocalEvents,
    ],
  );
  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = React.useContext(DemoDataContext);
  if (!context) throw new Error("useDemoData must be used within DemoDataProvider");
  return context;
}
