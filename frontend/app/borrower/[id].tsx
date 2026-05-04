import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import { formatDateTime } from "../../src/dt";
import { parseContacts, openEmail, openPhone, openSms } from "../../src/contactLinks";

export default function BorrowerHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api.borrowerHistory(id);
      setData(d);
    } catch {
      router.back();
    }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const b = data.borrower;
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{b.name.toUpperCase()}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroBox}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>
              {b.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.bigName}>{b.name}</Text>
          <ContactActions raw={b.contact} />
        </View>

        <View style={styles.statGrid}>
          <Cell label="Total checkouts" value={String(data.total_checkouts || 0)} />
          <Cell label="Unique tools" value={String(data.unique_tools || 0)} />
          <Cell label="Currently held" value={String(data.currently_held?.length || 0)} highlight={data.currently_held?.length > 0} />
        </View>

        {data.currently_held?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>CURRENTLY CHECKED OUT</Text>
            {data.currently_held.map((c: any) => (
              <TouchableOpacity
                key={c.tool_id}
                testID={`held-${c.tool_id}`}
                style={[styles.row, { borderLeftColor: theme.colors.accentSecondary, borderLeftWidth: 3 }]}
                onPress={() => router.push(`/tool/${c.tool_id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{c.tool_name}</Text>
                  <Text style={styles.rowMeta}>
                    Out since {formatDateTime(c.checked_out_at)}
                  </Text>
                  {!!c.notes && <Text style={styles.rowNotes}>{c.notes}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>
          PER-TOOL TOTALS
        </Text>
        {data.per_tool.length === 0 ? (
          <Text style={styles.empty}>No checkout history yet.</Text>
        ) : (
          data.per_tool.map((t: any, idx: number) => (
            <TouchableOpacity
              key={t.tool_id}
              testID={`per-tool-${t.tool_id}`}
              style={styles.row}
              onPress={() => router.push(`/tool/${t.tool_id}`)}
            >
              <View style={styles.rank}>
                <Text style={styles.rankText}>{idx + 1}</Text>
              </View>
              <View style={styles.thumb}>
                {t.photo ? (
                  <Image source={{ uri: t.photo }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Ionicons name="construct" size={18} color={theme.colors.accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{t.tool_name}</Text>
                <Text style={styles.rowMeta}>
                  Last out {formatDateTime(t.last_checked_out_at)}
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countNum}>{t.checkout_count}</Text>
                <Text style={styles.countLbl}>×</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.sectionLabel}>RECENT TIMELINE</Text>
        {data.history.length === 0 ? (
          <Text style={styles.empty}>No checkouts yet.</Text>
        ) : (
          data.history.map((h: any, i: number) => (
            <View key={i} style={styles.histRow}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histTool}>{h.tool_name}</Text>
                <Text style={styles.histTime}>
                  Out: {formatDateTime(h.checked_out_at)}
                </Text>
                <Text style={styles.histTime}>
                  In:{"  "}{h.checked_in_at ? formatDateTime(h.checked_in_at) : "still out"}
                </Text>
                {!!h.notes && <Text style={styles.rowNotes}>{h.notes}</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.cell, highlight && { borderColor: theme.colors.accentSecondary }]}>
      <Text style={[styles.cellValue, highlight && { color: theme.colors.accentSecondary }]}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

function ContactActions({ raw }: { raw?: string | null }) {
  if (!raw) return null;
  const { emails, phones } = parseContacts(raw);
  if (emails.length === 0 && phones.length === 0) {
    // unparseable — still render the raw text muted but not tappable
    return <Text style={styles.contact}>{raw}</Text>;
  }
  return (
    <View style={styles.actionsWrap}>
      {phones.map((p) => (
        <View key={`pgrp-${p}`} style={styles.actionGroup}>
          <TouchableOpacity
            testID={`contact-call-${p}`}
            style={styles.actionBtn}
            onPress={() => openPhone(p)}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={16} color={theme.colors.accent} />
            <Text style={styles.actionText} numberOfLines={1}>{p}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`contact-text-${p}`}
            style={[styles.actionBtn, styles.actionBtnSmall]}
            onPress={() => openSms(p)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses" size={15} color={theme.colors.accent} />
            <Text style={styles.actionText}>Text</Text>
          </TouchableOpacity>
        </View>
      ))}
      {emails.map((e) => (
        <TouchableOpacity
          key={`e-${e}`}
          testID={`contact-email-${e}`}
          style={styles.actionBtn}
          onPress={() => openEmail(e)}
          activeOpacity={0.7}
        >
          <Ionicons name="mail" size={16} color={theme.colors.accent} />
          <Text style={styles.actionText} numberOfLines={1}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, flex: 1, textAlign: "center" },
  heroBox: { alignItems: "center", paddingVertical: 16 },
  bigAvatar: {
    width: 70, height: 70, backgroundColor: theme.colors.surface,
    borderWidth: 2, borderColor: theme.colors.accent,
    alignItems: "center", justifyContent: "center", borderRadius: 4,
  },
  bigAvatarText: { color: theme.colors.accent, fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  bigName: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 1, marginTop: 12 },
  contact: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 4 },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
  },
  actionGroup: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  actionBtnSmall: {
    paddingHorizontal: 10,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, marginVertical: 12, gap: 8 },
  cell: {
    flex: 1, minWidth: 90, paddingVertical: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSecondary,
    alignItems: "center", borderRadius: 4,
  },
  cellValue: { color: theme.colors.textPrimary, fontWeight: "900", fontSize: 16 },
  cellLabel: {
    color: theme.colors.textMuted, fontSize: 7,
    fontWeight: "800", letterSpacing: 1, marginTop: 2, textTransform: "uppercase",
  },
  sectionLabel: {
    color: theme.colors.textMuted, fontSize: 8, fontWeight: "800",
    letterSpacing: 2, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomColor: theme.colors.borderSubtle, borderBottomWidth: 1,
    backgroundColor: theme.colors.bgSecondary,
    marginHorizontal: 14, marginBottom: 6, borderRadius: 4,
  },
  rank: {
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface, borderRadius: 4,
  },
  rankText: { color: theme.colors.accent, fontWeight: "900", fontSize: 10 },
  thumb: {
    width: 36, height: 36, borderRadius: 4, overflow: "hidden",
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 10 },
  rowMeta: { color: theme.colors.textSecondary, fontSize: 8, marginTop: 2 },
  rowNotes: { color: theme.colors.textMuted, fontStyle: "italic", fontSize: 8, marginTop: 4 },
  countPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: theme.colors.accent, borderRadius: 4,
  },
  countNum: { color: "#000", fontWeight: "900", fontSize: 10 },
  countLbl: { color: "#000", fontWeight: "900", fontSize: 8 },
  histRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomColor: theme.colors.borderSubtle, borderBottomWidth: 1,
  },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: theme.colors.accent, marginTop: 6,
  },
  histTool: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 10 },
  histTime: { color: theme.colors.textSecondary, fontSize: 8, marginTop: 2 },
  empty: { color: theme.colors.textMuted, fontStyle: "italic", padding: 20, textAlign: "center" },
});
