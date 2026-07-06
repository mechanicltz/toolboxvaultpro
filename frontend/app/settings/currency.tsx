import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  COMMON_CURRENCIES,
  OTHER_CURRENCIES,
  Currency,
  useCurrency,
  setCurrency,
} from "../../src/currency";
import { themedStyles, useColors } from "../../src/themeContext";

type Row =
  | { kind: "header"; title: string }
  | { kind: "item"; currency: Currency };

export default function CurrencyPicker() {
  const router = useRouter();
  const c = useColors();
  const styles = useStyles();
  const active = useCurrency();
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (x: Currency) =>
      !q ||
      x.code.toLowerCase().includes(q) ||
      x.name.toLowerCase().includes(q);
    // USD is index 0 of COMMON — keep it pinned at the very top.
    const common = COMMON_CURRENCIES.filter(match);
    const other = [...OTHER_CURRENCIES].filter(match).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const out: Row[] = [];
    if (common.length) {
      out.push({ kind: "header", title: "MOST COMMON" });
      common.forEach((cur) => out.push({ kind: "item", currency: cur }));
    }
    if (other.length) {
      out.push({ kind: "header", title: "ALL CURRENCIES (A–Z)" });
      other.forEach((cur) => out.push({ kind: "item", currency: cur }));
    }
    return out;
  }, [query]);

  const choose = async (cur: Currency) => {
    await setCurrency(cur.code);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="currency-back">
          <Ionicons name="chevron-back" size={26} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CURRENCY</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={c.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search currency or code…"
          placeholderTextColor={c.textMuted}
          style={styles.searchInput}
          autoCapitalize="characters"
          testID="currency-search"
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === "item" ? r.currency.code : `h-${i}`)}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }
          const cur = item.currency;
          const selected = cur.code === active.code;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => choose(cur)}
              activeOpacity={0.7}
              testID={`currency-${cur.code}`}
            >
              <View style={styles.symbolBox}>
                <Text style={styles.symbol}>{cur.symbol.trim() || cur.code}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{cur.name}</Text>
                <Text style={styles.rowCode}>{cur.code}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={c.accent} />}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const useStyles = () =>
  themedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: { flex: 1, color: c.textPrimary, fontSize: 14 },
    sectionHeader: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSubtle,
    },
    symbolBox: {
      width: 44,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    symbol: { color: c.textPrimary, fontSize: 13, fontWeight: "800" },
    rowName: { color: c.textPrimary, fontSize: 14, fontWeight: "600" },
    rowCode: { color: c.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  }))();
