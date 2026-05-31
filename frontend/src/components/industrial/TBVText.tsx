/**
 * TBVText — unified text component honoring the Part 6 typography stack.
 * Use variants for consistency: display/h1/h2/h3/body/button/label/caption.
 */
import React from "react";
import { Text, TextProps, TextStyle } from "react-native";
import { useTBV } from "./TBVThemeContext";
import { TextVariant } from "./tokens";

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
  weight?: "400" | "500" | "600" | "700" | "800" | "900";
  align?: "left" | "center" | "right";
  /** Convenience: shortcut for muted text */
  muted?: boolean;
  /** Convenience: shortcut for accent (orange) text */
  accent?: boolean;
}

export function TBVText({
  variant = "body",
  color,
  weight,
  align,
  muted,
  accent,
  style,
  children,
  ...rest
}: Props) {
  const { palette, text } = useTBV();
  const variantStyle = text[variant];
  const resolved: TextStyle = {
    ...variantStyle,
    color: color ?? (accent ? palette.accent : muted ? palette.textMuted : palette.text),
  };
  if (weight) resolved.fontWeight = weight;
  if (align) resolved.textAlign = align;
  return (
    <Text {...rest} style={[resolved, style]}>
      {children}
    </Text>
  );
}
