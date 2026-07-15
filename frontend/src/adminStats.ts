/*
 * adminStats — tiny global signal to open the admin stats popup from anywhere
 * (the build-number badge in the header calls openAdminStats(); the modal is
 * mounted once at the app root and listens for the signal).
 */
import { useEffect, useState } from "react";

let counter = 0;
const listeners = new Set<() => void>();

export function openAdminStats(): void {
  counter += 1;
  listeners.forEach((l) => l());
}

/** Returns an incrementing token; changes each time openAdminStats() is called. */
export function useAdminStatsOpenSignal(): number {
  const [v, setV] = useState(counter);
  useEffect(() => {
    const l = () => setV(counter);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
