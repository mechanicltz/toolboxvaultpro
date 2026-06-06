/**
 * ContactIconButton
 * -----------------
 * The single, app-wide control for Call / Text / Share actions. Renders the
 * user's custom glossy 3D PNG icons directly (NO BevelCard / "pillow" surface
 * behind them) so they look identical in every theme.
 *
 *   call  -> phone.png   (dial)
 *   text  -> text.png    (sms)
 *   share -> share.png   (share / save)
 *
 * Use this everywhere a call, text, or share button is needed.
 */
import React from "react";
import { Image, TouchableOpacity, StyleProp, ViewStyle } from "react-native";

const ICONS = {
  call: require("../../assets/contact-icons/phone.png"),
  text: require("../../assets/contact-icons/text.png"),
  share: require("../../assets/contact-icons/share.png"),
} as const;

export type ContactIconType = keyof typeof ICONS;

export function ContactIconButton({
  type,
  onPress,
  size = 40,
  style,
  testID,
  disabled,
}: {
  type: ContactIconType;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={8}
      disabled={disabled}
      testID={testID}
      style={style}
    >
      <Image
        source={ICONS[type]}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
}

export default ContactIconButton;
