"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CalendarDays, CirclePlus, Clock3, Home, Stethoscope } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDemoData } from "@/components/shared/demo-data-provider";
import { ThreadLogo } from "@/components/shared/thread-logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/patient", label: "Today", icon: Home, exact: true },
  { href: "/patient/timeline", label: "Timeline", icon: Clock3 },
  { href: "/patient/update", label: "Add", icon: CirclePlus, central: true },
  { href: "/patient/prepare", label: "Appointment", icon: CalendarDays },
];

function isCurrent(pathname: string, item: (typeof navItems)[number]) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function PatientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isHydrated, liveDataStatus, liveDataMessage } = useDemoData();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-dvh bg-[#f7f4ef] pb-24 md:pb-8">
        <header className="sticky top-0 z-40 border-b border-plum-100/80 bg-[#f7f4ef]/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-5 sm:px-7 lg:px-8">
            <ThreadLogo href="/patient" />
            <nav className="hidden items-center gap-1 rounded-full border bg-white/70 p-1 shadow-sm md:flex" aria-label="Patient navigation">
              {navItems.map((item) => {
                const active = isCurrent(pathname, item);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={cn("inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-plum-950 text-white" : "text-muted-foreground hover:bg-plum-50 hover:text-plum-800")}>
                    <Icon className="size-3.5" />{item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/clinician" className="hidden size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white hover:text-plum-700 sm:flex" aria-label="Switch to clinician view"><Stethoscope className="size-4" /></Link>
                </TooltipTrigger>
                <TooltipContent>Switch to clinician view</TooltipContent>
              </Tooltip>
              <button type="button" className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white hover:text-plum-700" aria-label="Notifications">
                <Bell className="size-[18px]" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-plum-500 ring-2 ring-[#f7f4ef]" />
              </button>
              <Avatar className="size-9 ring-2 ring-white"><AvatarFallback>AK</AvatarFallback></Avatar>
            </div>
          </div>
        </header>

        {isHydrated && liveDataStatus !== "live" && liveDataMessage ? (
          <div
            role="status"
            className={cn(
              "border-b px-5 py-2.5 text-center text-xs leading-5 sm:px-7",
              liveDataStatus === "unavailable"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-plum-100 bg-plum-50/80 text-plum-900",
            )}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {liveDataStatus === "unavailable" ? (
                <AlertTriangle className="size-3.5 shrink-0" />
              ) : null}
              {liveDataMessage}
            </span>
          </div>
        ) : null}

        {children}

        <nav className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-[25rem] grid-cols-4 rounded-[1.4rem] border border-white/80 bg-white/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_18px_50px_-18px_rgba(42,20,32,.45)] backdrop-blur-xl md:hidden" aria-label="Patient navigation">
          {navItems.map((item) => {
            const active = isCurrent(pathname, item);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors", active ? "text-plum-700" : "text-muted-foreground", item.central && "-mt-6")}>
                {item.central ? (
                  <span className={cn("flex size-12 items-center justify-center rounded-full border-4 border-[#f7f4ef] bg-plum-700 text-white shadow-lg transition-transform active:scale-95", active && "bg-plum-950")}><Icon className="size-6" /></span>
                ) : (
                  <span className={cn("flex size-7 items-center justify-center rounded-xl", active && "bg-plum-100")}><Icon className="size-[18px]" /></span>
                )}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}
