// First-run onboarding tour — provider + hook.
//
// Drives the guided tour: navigates screen-to-screen through the core features
// and tracks the current step. The visual is rendered separately by
// <OnboardingTourOverlay/> (mounted once at the root). "Watch" mode — the user
// advances with NEXT; the dimmed overlay blocks accidental taps underneath.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useRouter } from "expo-router";
import { api } from "../api";
import { buildTourSteps, TourStep } from "./tourSteps";

type TourCtxValue = {
  active: boolean;
  steps: TourStep[];
  index: number;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
};

const TourCtx = createContext<TourCtxValue | null>(null);

export function useOnboardingTour(): TourCtxValue {
  const ctx = useContext(TourCtx);
  if (!ctx) {
    throw new Error("useOnboardingTour must be used within <OnboardingTourProvider>");
  }
  return ctx;
}

export function OnboardingTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);

  const navTo = useCallback(
    (route: string) => {
      try {
        router.push(route as any);
      } catch {
        /* navigation not ready yet — ignore */
      }
    },
    [router],
  );

  const start = useCallback(() => {
    // Show the tour immediately with list-based fallbacks, then upgrade the two
    // deep-link steps (mark-broken / dealer-agent) with a real sample record id
    // in the background. This way the overlay never waits on a network round-trip.
    const initial = buildTourSteps({});
    setSteps(initial);
    setIndex(0);
    setActive(true);
    if (initial[0]) navTo(initial[0].route);

    (async () => {
      let toolId: string | undefined;
      let dealerId: string | undefined;
      try {
        const tools = await api.listTools({});
        if (Array.isArray(tools) && tools.length) toolId = tools[0]?.id;
      } catch {
        /* ignore */
      }
      try {
        const dealers = await api.listDealers();
        if (Array.isArray(dealers) && dealers.length) dealerId = dealers[0]?.id;
      } catch {
        /* ignore */
      }
      if (toolId || dealerId) setSteps(buildTourSteps({ toolId, dealerId }));
    })();
  }, [navTo]);

  const stop = useCallback(() => {
    setActive(false);
    navTo("/(tabs)");
  }, [navTo]);

  const next = useCallback(() => {
    const ni = index + 1;
    if (ni >= steps.length) {
      setActive(false);
      navTo("/(tabs)");
      return;
    }
    setIndex(ni);
    if (steps[ni]) navTo(steps[ni].route);
  }, [index, steps, navTo]);

  const back = useCallback(() => {
    const pi = Math.max(0, index - 1);
    setIndex(pi);
    if (steps[pi]) navTo(steps[pi].route);
  }, [index, steps, navTo]);

  const value = useMemo(
    () => ({ active, steps, index, start, next, back, stop }),
    [active, steps, index, start, next, back, stop],
  );

  return <TourCtx.Provider value={value}>{children}</TourCtx.Provider>;
}
