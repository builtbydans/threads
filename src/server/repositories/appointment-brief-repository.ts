import "server-only";

import type {
  AppointmentBrief,
  AppointmentBriefStatus,
} from "@/server/types/domain";

import { fallbackStore } from "@/server/repositories/fallback-store";
import { validateAppointmentBrief } from "@/server/repositories/mappers";
import {
  RepositoryError,
  withRepositoryFallback,
} from "@/server/repositories/repository-support";

export class AppointmentBriefRepository {
  async findLatestByPatient(patientId: string): Promise<AppointmentBrief | null> {
    return withRepositoryFallback({
      scope: "AppointmentBriefRepository.findLatestByPatient",
      remote: async () => {
        // Live schema has no appointment_briefs table; return null so callers
        // can use an explicit demo brief without treating a thrown error as a
        // failed database read that should surface as DATA_SOURCE_UNAVAILABLE.
        return null;
      },
      fallback: () => {
        const briefs = fallbackStore.appointmentBriefs
          .filter((brief) => brief.patientId === patientId)
          .sort(
            (left, right) => {
              const appointmentDifference =
                Date.parse(right.appointment.date) -
                Date.parse(left.appointment.date);
              return appointmentDifference ||
                Date.parse(right.generatedAt) - Date.parse(left.generatedAt);
            },
          );
        return briefs[0]
          ? validateAppointmentBrief(structuredClone(briefs[0]))
          : null;
      },
    });
  }

  async save(brief: AppointmentBrief): Promise<AppointmentBrief> {
    return withRepositoryFallback({
      scope: "AppointmentBriefRepository.save",
      remote: async () => {
        throw new RepositoryError(
          "AppointmentBriefRepository.save",
          "The live schema has no public.appointment_briefs table; demonstration briefs are in-memory only.",
        );
      },
      fallback: () => {
        const index = fallbackStore.appointmentBriefs.findIndex(
          (candidate) => candidate.id === brief.id,
        );
        if (index >= 0)
          fallbackStore.appointmentBriefs[index] = structuredClone(brief);
        else fallbackStore.appointmentBriefs.push(structuredClone(brief));
        return structuredClone(brief);
      },
    });
  }

  async updateStatus(
    patientId: string,
    status: AppointmentBriefStatus,
  ): Promise<AppointmentBrief | null> {
    const brief = await this.findLatestByPatient(patientId);
    if (!brief) return null;

    return this.save({
      ...brief,
      status,
      generatedAt: new Date().toISOString(),
    });
  }
}

export const appointmentBriefRepository = new AppointmentBriefRepository();
