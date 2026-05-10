// Native (iOS/Android) implementation — uses react-native-image-viewing
// which provides full pinch-to-zoom + swipe-to-dismiss.
import React from "react";
import ImageView from "react-native-image-viewing";

export type PinchZoomImageViewerProps = {
  images: { uri: string }[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
};

export default function PinchZoomImageViewer({
  images,
  imageIndex,
  visible,
  onRequestClose,
}: PinchZoomImageViewerProps) {
  if (!images || images.length === 0) return null;
  return (
    <ImageView
      images={images}
      imageIndex={imageIndex}
      visible={visible}
      onRequestClose={onRequestClose}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      presentationStyle="fullScreen"
    />
  );
}
