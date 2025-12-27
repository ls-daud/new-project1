import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";
import { BottomNav } from "../components/BottomNav";

type ReportRow = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function ReportScreen() {
  const transactions = useDataStore((s) => s.transactions);
  const [selectedDate] = useState(() => new Date());

  const rows: ReportRow[] = useMemo(() => {
    const map = new Map<string, ReportRow>();
    transactions.forEach((tx) => {
      const created = new Date(tx.createdAt);
      if (!isSameDay(created, selectedDate)) return;
      tx.items.forEach((item) => {
        const existing = map.get(item.productId);
        const revenue = item.unitPrice * item.qty;
        if (!existing) {
          map.set(item.productId, {
            productId: item.productId,
            name: item.name,
            qty: item.qty,
            revenue,
          });
        } else {
          existing.qty += item.qty;
          existing.revenue += revenue;
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [transactions, selectedDate]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Produk Terjual</Text>
          <Pressable style={styles.exportBtn} onPress={() => Alert.alert("Info", "Fitur ekspor belum tersedia.")}>
            <Text style={styles.exportTxt}>Ekspor (.xlsx)</Text>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <Pressable style={styles.filterChip}>
            <Text style={styles.filterTxt}>Periode Harian</Text>
            <Text style={styles.filterArrow}>v</Text>
          </Pressable>
          <Pressable style={styles.filterChip}>
            <Text style={styles.filterTxt}>{selectedDate.toLocaleDateString("id-ID")}</Text>
            <Text style={styles.filterArrow}>v</Text>
          </Pressable>
          <Pressable style={styles.filterIcon}>
            <Text style={styles.filterIconTxt}>Filter</Text>
          </Pressable>
        </View>

        <FlashList
          data={rows}
          estimatedItemSize={80}
          keyExtractor={(x) => x.productId}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>SKU: -</Text>
                <Text style={styles.meta}>Terjual: {item.qty}</Text>
                <Text style={styles.meta}>Omzet: Rp {formatRupiah(item.revenue)}</Text>
              </View>
              <View style={styles.thumb} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada data.</Text>}
        />
      </View>

      <BottomNav active="Report" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f3f3" },
  content: { flex: 1, padding: 12 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "900", color: "#111" },
  exportBtn: { backgroundColor: "#e53935", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  exportTxt: { color: "#fff", fontWeight: "900" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#e9eef5",
  },
  filterTxt: { fontWeight: "800", color: "#111" },
  filterArrow: { color: "#b33", fontWeight: "900" },
  filterIcon: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
  },
  filterIconTxt: { fontWeight: "800", color: "#d32f2f" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  name: { fontWeight: "900", fontSize: 15, color: "#111" },
  meta: { color: "#666", marginTop: 4 },
  thumb: { width: 54, height: 54, borderRadius: 12, backgroundColor: "#f0f0f0" },
  empty: { padding: 16, color: "#666" },
});
