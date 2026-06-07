import React from "react";
import { Switch, SwitchProps } from "react-native";
import { theme } from "../theme";

/**
 * AppSwitch — the single, app-wide toggle switch.
 *
 * Enforces ONE uniform size (scale 0.78 — the size locked in on the "Home
 * Screen Rows" sheet) AND uniform track/thumb colors for every toggle in the
 * app. Per-caller trackColor / thumbColor are intentionally ignored so every
 * switch looks identical (and the OFF state stays visible in light mode).
 */
const SWITCH_SCALE = 0.78;

export function AppSwitch({
  style,
  trackColor: _ignoredTrack,
  thumbColor: _ignoredThumb,
  ...rest
}: SwitchProps) {
  return (
    <Switch
      {...rest}
      trackColor={{ true: theme.colors.accent, false: theme.colors.switchTrackOff }}
      ios_backgroundColor={theme.colors.switchTrackOff}
      thumbColor="#fff"
      style={[style, { transform: [{ scale: SWITCH_SCALE }] }]}
    />
  );
}

export default AppSwitch;
