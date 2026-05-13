// Splash intro screen — plays the brand intro video full-screen on app
// open (and after 5 minutes of inactivity). After the video ends we
// route the user to either the home tabs (if signed in) or /login. A
// quick tap on the video also lets the user skip ahead.
//
// Layout rules (per product spec):
//   • Black background everywhere — letterbox the video so any leftover
//     screen real estate is solid black, never stretched or cropped.
//   • `contain` resize so the entire frame is visible on any device
//     (phone, tablet, foldable). No content is clipped.
//   • No native player chrome (no play/pause/scrubber/fullscreen
//     buttons). The video is purely decorative.
//   • Auto-plays the moment it mounts.
//   • Does NOT loop — fires onPlaybackEnd exactly once.

import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Pressable, Dimensions } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../src/AuthContext";
import { markAppActive } from "../src/idle";

// Static require so the asset is bundled with the build.
const INTRO_VIDEO = require("../assets/videos/intro.mp4");

export default function IntroScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const navigatedRef = useRef(false);

  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.play();
  });

  function finish() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Record that the app was just made active so the 5-minute idle
    // guard doesn't immediately re-trigger.
    markAppActive();
    if (loading) {
      router.replace("/login");
      return;
    }
    router.replace(user ? "/" : "/login");
  }

  // Primary signal: the player's "playToEnd" event.
  useEffect(() => {
    const sub = player.addListener("playToEnd", finish);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Belt-and-suspenders: poll every 250ms in case the playToEnd event
  // doesn't fire (occasionally happens on web). If we're within 50ms
  // of the duration we end the splash ourselves. Also acts as a hard
  // safety net — after 15 seconds we always advance, even if the
  // video stalls (e.g. asset load failure).
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
      <StatusBar style="light" hidden />
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
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          requiresLinearPlayback
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
