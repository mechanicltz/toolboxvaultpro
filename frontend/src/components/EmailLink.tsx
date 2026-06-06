/**
 * EmailLink
 * ---------
 * System-wide default for displaying an email address: blue underlined link
 * text that opens the device's default mail app (mailto:) when tapped.
 *
 * Use this anywhere an email is shown so the treatment stays consistent.
 */
import React from "react";
import { Text, Linking, TextStyle, StyleProp, Alert } from "react-native";

/** Standard link blue (works on both Light and Dark). */
export const LINK_BLUE = "#3B82F6";

export function EmailLink({
  email,
  style,
  numberOfLines,
  testID,
}: {
  email?: string | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  if (!email) return null;
  const addr = String(email).trim();
  const open = () => {
    Linking.openURL(`mailto:${addr}`).catch(() =>
      Alert.alert("Couldn't open mail", `No mail app available for ${addr}.`),
    );
  };
  return (
    <Text
      testID={testID}
      onPress={open}
      numberOfLines={numberOfLines}
      style={[{ color: LINK_BLUE, textDecorationLine: "underline", fontWeight: "600" }, style]}
    >
      {addr}
    </Text>
  );
}

export default EmailLink;
