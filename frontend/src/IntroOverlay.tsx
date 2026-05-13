// IntroOverlay — a full-screen, self-contained splash player rendered
// directly above the app's normal content when needed. Using an
// overlay instead of a separate route avoids race conditions between
// AuthContext bootstrapping, expo-router's Stack mount, and our
// "should we show the intro" logic.
//
// Layout rules (per product spec):
//   • Black background everywhere — letterbox the video so any leftover
//     screen real estate is solid black, never stretched or cropped.
//   • `contain` resize so the entire frame is visible on any device.
//   • No native player chrome.
//   • Auto-plays the moment it mounts.
//   • Does NOT loop — fires `onDone` exactly once when playback finishes
//     or after a 15s safety timeout.

import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Pressable, Dimensions } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

const INTRO_VIDEO = require("../assets/videos/intro.mp4");

export function IntroOverlay({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);

  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.play();
  });

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Primary signal: native end-of-playback event.
  useEffect(() => {
    const sub = player.addListener("playToEnd", finish);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Safety net: poll every 250ms; if we're past duration or stalled
  // beyond 15 seconds, advance anyway.
  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const dur = player.duration || 0;
      const cur = player.currentTime || 0;
      const elapsed = Date.now() - startedAt;
      if ((dur > 0 && cur >= dur - 0.05) || elapsed > 15000) {
        finish();
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const { width, height } = Dimensions.get("window");

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.center}
        onPress={finish}
        accessibilityLabel="Skip intro"
      >
        <VideoView
          player={player}
          style={{ width, height }}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
          requiresLinearPlayback
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
