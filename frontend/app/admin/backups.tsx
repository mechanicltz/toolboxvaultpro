// Admin · Database Backups (audit #17).
// Only visible to accounts whose email is in the backend's ADMIN_EMAILS list.
// Non-admins get redirected back to the More tab.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  Modal,
  TextInput,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { api, getToken } from "../../src/api";
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import { PillButton } from "../../src/components/PillButton";

type BackupRow = {
  id: string;
  created_at: string;
  size_bytes: number;
  size_human: string;
  trigger: string;
  collections: string[];
  document_count: number;
};

type BackupConfig = {
  schedule: string;
  schedule_human: string;
  next_run_at: string;
  next_run_in_seconds: number;
  max_retained: number;
  collections_backed_up: string[];
};

type GdriveStatus = {
  connected: boolean;
  email?: string;
  connected_at?: string;
};

type GdriveFile = {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
};

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "any moment now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `in ${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `in ${hours}h ${minutes}m`;
}

export default function AdminBackupsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [gdrive, setGdrive] = useState<GdriveStatus | null>(null);
  const [gdriveFiles, setGdriveFiles] = useState<GdriveFile[] | null>(null);
  // Disaster-recovery UI state
  const [restoreTarget, setRestoreTarget] = useState<GdriveFile | null>(null);
  const [confirmEmailText, setConfirmEmailText] = useState("");
  const [recoveryResult, setRecoveryResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await api.adminWhoAmI();
      if (!me.is_admin) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const [list, cfg, gd] = await Promise.all([
        api.adminListBackups(),
        api.adminBackupConfig(),
        api.adminGdriveStatus().catch(() => ({ connected: false })),
      ]);
      setRows(list);
      setConfig(cfg);
      setGdrive(gd as GdriveStatus);
      // If connected, load file list too (best-effort)
      if ((gd as GdriveStatus).connected) {
        try {
          const f = await api.adminGdriveListFiles();
          setGdriveFiles(f.files);
        } catch {
          setGdriveFiles(null);
        }
      } else {
        setGdriveFiles(null);
      }
    } catch (e: any) {
      Alert.alert("Failed to load backups", String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  useEffect(() => {
    if (allowed === false) {
      Alert.alert("Admins only", "This screen is for admin accounts.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/more") },
      ]);
    }
  }, [allowed, router]);

  const connectGdrive = useCallback(async () => {
    setBusyAction("gdrive-connect");
    try {
      const { url } = await api.adminGdriveAuthUrl();
      await Linking.openURL(url);
      Alert.alert(
        "Google Drive",
        "Finish the consent flow in your browser, then return here and pull-to-refresh.",
      );
    } catch (e: any) {
      Alert.alert("Failed to open Google sign-in", String(e?.message || e));
    } finally {
      setBusyAction(null);
    }
  }, []);

  const disconnectGdrive = useCallback(async () => {
    Alert.alert(
      "Disconnect Google Drive?",
      "Future automatic backups will no longer be uploaded to Drive until you re-connect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusyAction("gdrive-disconnect");
            try {
              await api.adminGdriveDisconnect();
              await load();
            } catch (e: any) {
              Alert.alert("Disconnect failed", String(e?.message || e));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [load]);

  // Unified one-click backup — creates a full ZIP snapshot (db + envs) and,
  // if Google Drive is connected, immediately mirrors it offsite in one shot.
  const triggerFullBackup = useCallback(async () => {
    setBusyAction("full-backup");
    try {
      const r = await api.adminBackupFullNow();
      const driveLine = r.gdrive_uploaded
        ? `\n☁️ Uploaded to Google Drive${r.gdrive_filename ? `\n📄 ${r.gdrive_filename}` : ""}`
        : "\n⚠️ Not uploaded to Drive (connect Google Drive to enable offsite copy).";
      Alert.alert(
        "Backup complete ✓",
        `${r.size_human} · ${r.document_count.toLocaleString()} documents${driveLine}`,
      );
      await load();
    } catch (e: any) {
      Alert.alert("Backup failed", String(e?.message || e));
    } finally {
      setBusyAction(null);
    }
  }, [load]);

  // ---- Disaster recovery handlers ----
  const runFullSnapshot = useCallback(async () => {
    Alert.alert(
      "Create full encrypted snapshot?",
      "Bundles ALL code + database + secrets into one AES-256 password-protected " +
        "ZIP, uploads it to Google Drive, and saves its passphrase next to it.\n\n" +
        "This is large (~500 MB) and can take a few minutes. Keep the screen open.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: async () => {
            setBusyAction("full-snapshot");
            setRecoveryResult(null);
            try {
              const r = await api.adminFullSnapshot();
              setRecoveryResult(
                `✅ ${r.filename}\n${r.size_human} · ${r.document_count.toLocaleString()} docs\n` +
                  `Self-check: ${r.selfcheck_ok ? "PASSED" : "FAILED"} · ` +
                  `Drive: ${r.gdrive_uploaded ? "uploaded" : "skipped"} · ` +
                  `Passphrase: ${r.passphrase_uploaded ? "saved" : "not saved"}`,
              );
              await load();
            } catch (e: any) {
              Alert.alert("Snapshot failed", String(e?.message || e));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [load]);

  const doRestoreFromDrive = useCallback(async () => {
    if (!restoreTarget) return;
    const email = confirmEmailText.trim();
    if (!email) {
      Alert.alert("Email required", "Type your account email to confirm the restore.");
      return;
    }
    setBusyAction("restore-drive");
    try {
      const r = await api.adminRestoreFromDrive(restoreTarget.id, email);
      setRestoreTarget(null);
      setConfirmEmailText("");
      Alert.alert(
        "Restore complete ✓",
        `Restored ${r.total_documents.toLocaleString()} documents.\n` +
          `A safety snapshot of the previous data was taken first.`,
      );
      await load();
    } catch (e: any) {
      Alert.alert("Restore failed", String(e?.message || e));
    } finally {
      setBusyAction(null);
    }
  }, [restoreTarget, confirmEmailText, load]);

  const pickAndCheck = useCallback(async (mode: "verify" | "sandbox") => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      // Ask for a passphrase (encrypted backups need it). Use a simple prompt
      // on iOS; on Android fall back to attempting without, then guide the user.
      const runWith = async (passphrase: string) => {
        setBusyAction(mode === "verify" ? "verify" : "sandbox");
        setRecoveryResult(null);
        try {
          if (mode === "verify") {
            const r = await api.adminVerifyBackup(asset.uri, asset.name || "backup.zip", passphrase);
            setRecoveryResult(
              `✅ Valid backup ${r.encrypted ? "(encrypted)" : ""}\n` +
                `${r.total_documents.toLocaleString()} documents · ` +
                `code: ${r.has_code ? "yes" : "no"} · secrets: ${r.has_env ? "yes" : "no"}`,
            );
          } else {
            const r = await api.adminTestSandbox(asset.uri, asset.name || "backup.zip", passphrase);
            const allMatch = Object.values(r.comparison).every((c) => c.match);
            const total = Object.values(r.restored).reduce((a, b) => a + b, 0);
            setRecoveryResult(
              `🧪 Sandbox restore OK · ${total.toLocaleString()} docs\n` +
                `Matches production: ${allMatch ? "yes ✓" : "differences found"}\n` +
                `(sandbox auto-deleted — production untouched)`,
            );
          }
        } catch (e: any) {
          Alert.alert(mode === "verify" ? "Verify failed" : "Sandbox test failed", String(e?.message || e));
        } finally {
          setBusyAction(null);
        }
      };
      // @ts-ignore Alert.prompt is iOS-only
      if (Alert.prompt) {
        // @ts-ignore
        Alert.prompt(
          "Passphrase",
          "If this backup is encrypted, paste its passphrase (leave blank for unencrypted).",
          [
            { text: "Cancel", style: "cancel" },
            { text: mode === "verify" ? "Verify" : "Test", onPress: (txt?: string) => runWith((txt || "").trim()) },
          ],
          "plain-text",
        );
      } else {
        // Android: attempt without passphrase; backend returns a clear error if needed.
        await runWith("");
      }
    } catch (e: any) {
      Alert.alert("Could not open file", String(e?.message || e));
    }
  }, []);

  const downloadBackup = useCallback(async (row: BackupRow) => {
    setBusyAction(`dl-${row.id}`);
    try {
      const url = api.adminBackupDownloadUrl(row.id);
      const token = await getToken();
      // We use Linking.openURL with the token as a query param fallback.
      // The cleanest cross-platform pattern is to share a one-shot signed URL,
      // but since this is an admin-only endpoint and the token already has
      // admin claims, we attach via Authorization header by issuing a fetch
      // that downloads, base64s, then opens via a data: URL on web — or on
      // native we save to cache then share. For simplicity (single admin user
      // who just wants to grab the file), we fetch and use Linking.
      const res = await fetch(url, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const blob = await res.blob();
      // Web: trigger a real download via an anchor element.
      // Native: stash the file URI and open with the share sheet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _global: any = globalThis;
      if (typeof _global.document !== "undefined") {
        const objUrl = URL.createObjectURL(blob);
        const a = _global.document.createElement("a");
        a.href = objUrl;
        // Build a friendly filename — same format as Drive: "MM-DD-YYYY HH-MM Full Backup.zip"
        let stamp = row.created_at;
        try {
          const d = new Date(row.created_at);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yy = d.getFullYear();
          const hh = String(d.getHours()).padStart(2, "0");
          const mi = String(d.getMinutes()).padStart(2, "0");
          stamp = `${mm}-${dd}-${yy} ${hh}-${mi}`;
        } catch { /* fall back to raw */ }
        a.download = `${stamp} Full Backup.zip`;
        _global.document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      } else {
        // Native fallback: use Expo FileSystem + Sharing dynamic import.
        const FileSystem = await import("expo-file-system");
        const Sharing = await import("expo-sharing");
        // Friendly filename — matches Drive/web download
        let stamp = row.created_at;
        try {
          const d = new Date(row.created_at);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yy = d.getFullYear();
          const hh = String(d.getHours()).padStart(2, "0");
          const mi = String(d.getMinutes()).padStart(2, "0");
          stamp = `${mm}-${dd}-${yy} ${hh}-${mi}`;
        } catch { /* fall back to raw */ }
        const fileName = `${stamp} Full Backup.zip`;
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const base64 = dataUrl.split(",")[1] || "";
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          await Linking.openURL(fileUri);
        }
      }
    } catch (e: any) {
      Alert.alert("Download failed", String(e?.message || e));
    } finally {
      setBusyAction(null);
    }
  }, []);

  const deleteBackup = useCallback(async (row: BackupRow) => {
    Alert.alert(
      "Delete this backup?",
      `Created ${formatLocal(row.created_at)} · ${row.size_human}.\n` +
        "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyAction(`del-${row.id}`);
            try {
              await api.adminDeleteBackup(row.id);
              await load();
            } catch (e: any) {
              Alert.alert("Delete failed", String(e?.message || e));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [load]);

  if (loading || allowed === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }
  if (allowed === false) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <IndustrialBanner
        title="DATABASE BACKUPS"
        subtitle="Admin Only"
        leftSlot={
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color="#F97316" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Google Drive offsite backup status */}
        <BevelCard style={styles.banner}>
          <View style={styles.bannerHeader}>
            <Ionicons
              name={gdrive?.connected ? "cloud-done" : "cloud-offline"}
              size={18}
              color={gdrive?.connected ? theme.colors.success : theme.colors.textMuted}
            />
            <Text style={styles.bannerTitle}>Google Drive (offsite backup)</Text>
          </View>
          {gdrive?.connected ? (
            <>
              <Text style={styles.bannerLine}>
                Connected as <Text style={{ fontWeight: "900" }}>{gdrive.email}</Text>
              </Text>
              <Text style={styles.bannerLine}>
                {gdriveFiles
                  ? `${gdriveFiles.length} backup(s) in Drive folder`
                  : "Loading file list…"}
              </Text>
              <Text style={styles.bannerLine}>
                Daily backups auto-upload at 03:00 UTC. Keeps the 3 most recent and anything &lt; 30 days.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <PillButton
                  testID="gdrive-disconnect"
                  label="DISCONNECT"
                  icon="log-out-outline"
                  variant="danger"
                  onPress={disconnectGdrive}
                  disabled={busyAction === "gdrive-disconnect"}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.bannerLine}>
                Not connected. Connect now so daily backups also get pushed to your Drive folder.
              </Text>
              <View style={{ marginTop: 12 }}>
                <PillButton
                  testID="gdrive-connect"
                  label={busyAction === "gdrive-connect" ? "..." : "CONNECT GOOGLE DRIVE"}
                  icon="logo-google"
                  variant="active"
                  onPress={connectGdrive}
                  disabled={busyAction === "gdrive-connect"}
                />
              </View>
            </>
          )}
        </BevelCard>

        {/* Schedule banner */}
        {config && (
          <BevelCard style={styles.banner}>
            <View style={styles.bannerHeader}>
              <Ionicons name="time" size={18} color={theme.colors.accent} />
              <Text style={styles.bannerTitle}>Auto-backup schedule</Text>
            </View>
            <Text style={styles.bannerLine}>
              {config.schedule_human}
            </Text>
            <Text style={styles.bannerLine}>
              Next run: {formatLocal(config.next_run_at)}{" "}
              <Text style={styles.bannerSub}>
                ({formatCountdown(config.next_run_in_seconds)})
              </Text>
            </Text>
            <Text style={styles.bannerLine}>
              Retention: keep the {config.max_retained} most recent backups
            </Text>
            <Text style={styles.bannerLine}>
              Includes {config.collections_backed_up.length} collections
            </Text>
          </BevelCard>
        )}

        {/* Manual trigger — UNIFIED: snapshots DB + mirrors to Drive in one tap */}
        <TouchableOpacity
          style={styles.triggerBtn}
          onPress={triggerFullBackup}
          disabled={busyAction === "full-backup"}
          activeOpacity={0.7}
          testID="admin-backup-trigger"
        >
          {busyAction === "full-backup" ? (
            <ActivityIndicator color={theme.colors.bg} />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={18} color={theme.colors.bg} />
              <Text style={styles.triggerBtnText}>
                {gdrive?.connected ? "BACKUP NOW (DB + DRIVE)" : "BACKUP NOW"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* ============ DISASTER RECOVERY ============ */}
        <Text style={styles.sectionTitle}>Disaster Recovery</Text>

        <BevelCard style={styles.banner}>
          <View style={styles.bannerHeader}>
            <Ionicons name="shield-checkmark" size={18} color={theme.colors.accent} />
            <Text style={styles.bannerTitle}>Full encrypted snapshot</Text>
          </View>
          <Text style={styles.bannerLine}>
            One AES-256 password-protected ZIP with ALL code + database +
            secrets, pushed to Drive with its passphrase saved alongside.
            Runs automatically every day at 03:00 UTC.
          </Text>
          <View style={{ marginTop: 12 }}>
            <PillButton
              testID="dr-full-snapshot"
              label={busyAction === "full-snapshot" ? "WORKING… (a few min)" : "CREATE FULL SNAPSHOT NOW"}
              icon="cube-outline"
              variant="active"
              onPress={runFullSnapshot}
              disabled={!!busyAction}
            />
          </View>
          {recoveryResult && (
            <Text style={[styles.bannerLine, { marginTop: 10, color: theme.colors.success }]}>
              {recoveryResult}
            </Text>
          )}
        </BevelCard>

        {/* Verify / Sandbox (prove a backup works) */}
        <BevelCard style={styles.banner}>
          <View style={styles.bannerHeader}>
            <Ionicons name="flask" size={18} color={theme.colors.accent} />
            <Text style={styles.bannerTitle}>Prove a backup works</Text>
          </View>
          <Text style={styles.bannerLine}>
            Pick a backup file to verify it, or test-restore it into a throwaway
            sandbox DB (your live data is never touched).
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <PillButton
                testID="dr-verify"
                label={busyAction === "verify" ? "…" : "VERIFY FILE"}
                icon="checkmark-done-outline"
                variant="active"
                onPress={() => pickAndCheck("verify")}
                disabled={!!busyAction}
              />
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <PillButton
                testID="dr-sandbox"
                label={busyAction === "sandbox" ? "…" : "TEST TO SANDBOX"}
                icon="flask-outline"
                variant="active"
                onPress={() => pickAndCheck("sandbox")}
                disabled={!!busyAction}
              />
            </View>
          </View>
        </BevelCard>

        {/* Restore from Google Drive */}
        {gdrive?.connected && (
          <BevelCard style={styles.banner}>
            <View style={styles.bannerHeader}>
              <Ionicons name="cloud-download" size={18} color={theme.colors.danger} />
              <Text style={styles.bannerTitle}>Restore from Google Drive</Text>
            </View>
            <Text style={styles.bannerLine}>
              Replaces ALL current data with the chosen backup. A safety snapshot
              is taken first. Encrypted backups auto-use their Drive passphrase.
            </Text>
            {(gdriveFiles || [])
              .filter((f) => f.name.toLowerCase().endsWith(".zip"))
              .slice(0, 12)
              .map((f) => (
                <View key={f.id} style={styles.driveRow}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <Text style={styles.driveName} numberOfLines={1}>{f.name}</Text>
                    <Text style={styles.rowSub}>{formatLocal(f.createdTime)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionDelete, { flex: 0, flexShrink: 0, minWidth: 96, justifyContent: "center", paddingHorizontal: 12 }]}
                    onPress={() => { setConfirmEmailText(""); setRestoreTarget(f); }}
                    testID={`dr-restore-${f.id}`}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={16} color={theme.colors.danger} />
                    <Text style={styles.actionTextDanger}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ))}
            {(!gdriveFiles ||
              gdriveFiles.filter((f) => f.name.toLowerCase().endsWith(".zip")).length === 0) && (
              <Text style={[styles.rowSub, { marginTop: 8 }]}>No backup ZIPs in Drive yet.</Text>
            )}
          </BevelCard>
        )}

        {/* List of existing backups */}
        <Text style={styles.sectionTitle}>
          Backups ({rows.length})
        </Text>

        {rows.length === 0 && (
          <BevelCard style={styles.empty}>
            <Text style={styles.emptyText}>
              No backups yet. Tap "Backup Now" to create the first one — or wait
              for the scheduled run.
            </Text>
          </BevelCard>
        )}

        {rows.map((row) => (
          <BevelCard key={row.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowDate}>{formatLocal(row.created_at)}</Text>
                <Text style={styles.rowSub}>
                  {row.size_human} · {row.document_count.toLocaleString()} docs ·{" "}
                  <Text style={row.trigger === "scheduled" ? styles.triggerScheduled : styles.triggerManual}>
                    {row.trigger}
                  </Text>
                </Text>
              </View>
            </View>

            <View style={styles.rowActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDownload]}
                onPress={() => downloadBackup(row)}
                disabled={busyAction === `dl-${row.id}`}
                activeOpacity={0.7}
                testID={`admin-backup-download-${row.id}`}
              >
                {busyAction === `dl-${row.id}` ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.actionTextAccent}>Download</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDelete]}
                onPress={() => deleteBackup(row)}
                disabled={busyAction === `del-${row.id}`}
                activeOpacity={0.7}
                testID={`admin-backup-delete-${row.id}`}
              >
                {busyAction === `del-${row.id}` ? (
                  <ActivityIndicator color="#d9534f" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#d9534f" />
                    <Text style={styles.actionTextDanger}>Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </BevelCard>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Restore confirmation modal (type-email-to-confirm) */}
      <Modal
        visible={!!restoreTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRestoreTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm restore</Text>
            <Text style={styles.bannerLine} numberOfLines={2}>
              {restoreTarget?.name}
            </Text>
            <Text style={[styles.bannerLine, { marginTop: 8, color: theme.colors.danger }]}>
              This WIPES current data and restores this backup. A safety snapshot
              is taken first. Type your account email to confirm.
            </Text>
            <TextInput
              testID="dr-confirm-email"
              style={styles.modalInput}
              placeholder="your@email.com"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={confirmEmailText}
              onChangeText={setConfirmEmailText}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.colors.border, flex: 1 }]}
                onPress={() => { setRestoreTarget(null); setConfirmEmailText(""); }}
                disabled={busyAction === "restore-drive"}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.actionTextAccent, { color: theme.colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PillButton
                  testID="dr-confirm-restore"
                  label={busyAction === "restore-drive" ? "RESTORING…" : "RESTORE"}
                  icon="refresh"
                  variant="danger"
                  onPress={doRestoreFromDrive}
                  disabled={busyAction === "restore-drive"}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backBtn: { padding: 6, width: 32 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: c.textPrimary, textAlign: "center" },
  content: { padding: 16 },
  banner: { padding: 14, marginBottom: 14 },
  bannerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  bannerTitle: { fontSize: 14, fontWeight: "700", color: c.textPrimary, letterSpacing: 0.4 },
  bannerLine: { fontSize: 13, color: c.textSecondary, marginBottom: 2 },
  bannerSub: { color: c.textMuted, fontSize: 12 },
  triggerBtn: {
    backgroundColor: c.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 18,
  },
  triggerBtnText: { color: "#000", fontWeight: "700", fontSize: 15, letterSpacing: 0.4 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: c.textSecondary, letterSpacing: 0.6, marginBottom: 8, textTransform: "uppercase" },
  empty: { padding: 18 },
  emptyText: { color: c.textMuted, fontSize: 14, textAlign: "center", lineHeight: 19 },
  row: { padding: 14, marginBottom: 10 },
  rowHeader: { flexDirection: "row", alignItems: "center" },
  rowDate: { fontSize: 15, fontWeight: "600", color: c.textPrimary },
  rowSub: { fontSize: 12, color: c.textMuted, marginTop: 3 },
  triggerScheduled: { color: c.accent, fontWeight: "700" },
  triggerManual: { color: c.textSecondary, fontWeight: "700" },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionDownload: { borderColor: c.accent },
  actionDelete: { borderColor: "#d9534f" },
  actionTextAccent: { color: c.accent, fontSize: 13, fontWeight: "700" },
  actionTextDanger: { color: "#d9534f", fontSize: 13, fontWeight: "700" },
  driveRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
    marginTop: 6,
  },
  driveName: { fontSize: 13, fontWeight: "700", color: c.textPrimary },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: c.bgSecondary,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: c.textPrimary, marginBottom: 8 },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.textPrimary,
    backgroundColor: c.surface,
    fontSize: 15,
  },
}));
