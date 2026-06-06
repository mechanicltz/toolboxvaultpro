import React from "react";
import { Switch, SwitchProps } from "react-native";
import { theme } from "../theme";

/**
 * AppSwitch — the single, app-wide toggle switch.
 *
 * Enforces ONE uniform size for every toggle in the app (the size locked in on
 * the "Home Screen Rows" sheet: scale 0.78) and the standard accent / border
 * track colors. Callers can still override value / onValueChange / testID etc.
 * The size is enforced last so all switches stay visually identical.
 */
const SWITCH_SCALE = 0.78;

export function AppSwitch({ style, trackColor, thumbColor, ...rest }: SwitchProps) {
  return (
    <Switch
      trackColor={trackColor ?? { true: theme.colors.accent, false: theme.colors.border }}
      thumbColor={thumbColor ?? "#fff"}
      {...rest}
      style={[style, { transform: [{ scale: SWITCH_SCALE }] }]}
    />
  );
}

export default AppSwitch;
