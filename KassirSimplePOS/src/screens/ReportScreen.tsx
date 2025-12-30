import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Modal, TextInput } from "react-native";
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

type Period = "daily" | "weekly" | "monthly";

const PERIOD_LABELS: Record<Period, string> = {
  daily: "Periode Harian",
  weekly: "Periode Mingguan",
  monthly: "Periode Bulanan",
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getPeriodRange(date: Date, period: Period) {
  if (period === "daily") {
    return { start: startOfDay(date), end: endOfDay(date) };
  }
  if (period === "monthly") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }
  const start = startOfDay(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end: endOfDay(end) };
}

function formatDateInput(date: Date, period: Period) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  if (period === "monthly") return `${y}-${m}`;
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string, period: Period) {
  const trimmed = value.trim();
  if (period === "monthly") {
    const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || !month) return null;
    const date = new Date(year, month - 1, 1);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1) return null;
    return date;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function ReportScreen() {
  const transactions = useDataStore((s) => s.transactions);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [period, setPeriod] = useState<Period>("daily");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date(), "daily"));

  const range = useMemo(() => getPeriodRange(selectedDate, period), [selectedDate, period]);
  const rangeLabel = useMemo(() => {
    if (period === "daily") return range.start.toLocaleDateString("id-ID");
    if (period === "monthly") {
      return selectedDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    }
    return `${range.start.toLocaleDateString("id-ID")} - ${range.end.toLocaleDateString("id-ID")}`;
  }, [period, range, selectedDate]);

  const onSelectPeriod = () => {
    Alert.alert("Pilih Periode", "Tampilkan produk terjual untuk:", [
      { text: "Harian", onPress: () => setPeriod("daily") },
      { text: "Mingguan", onPress: () => setPeriod("weekly") },
      { text: "Bulanan", onPress: () => setPeriod("monthly") },
      { text: "Batal", style: "cancel" },
    ]);
  };

  const rows: ReportRow[] = useMemo(() => {
    const map = new Map<string, ReportRow>();
    transactions.forEach((tx) => {
      const created = new Date(tx.createdAt);
      if (created < range.start || created > range.end) return;
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
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  }, [transactions, range]);

  const totalRevenue = useMemo(() => rows.reduce((sum, row) => sum + row.revenue, 0), [rows]);
  const totalLabel = useMemo(() => {
    if (period === "weekly") return "Total pemasukan minggu ini";
    if (period === "monthly") return "Total pemasukan bulan ini";
    return "Total pemasukan hari ini";
  }, [period]);

  const openDatePicker = () => {
    setDateInput(formatDateInput(selectedDate, period));
    setShowDatePicker(true);
  };

  const applyDate = () => {
    const next = parseDateInput(dateInput, period);
    if (!next) {
      const hint = period === "monthly" ? "Gunakan format YYYY-MM." : "Gunakan format YYYY-MM-DD.";
      Alert.alert("Tanggal tidak valid", hint);
      return;
    }
    setSelectedDate(next);
    setShowDatePicker(false);
  };

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
          <Pressable style={styles.filterChip} onPress={onSelectPeriod}>
            <Text style={styles.filterTxt}>{PERIOD_LABELS[period]}</Text>
            <Text style={styles.filterArrow}>v</Text>
          </Pressable>
          <Pressable style={styles.filterChip} onPress={openDatePicker}>
            <Text style={styles.filterTxt}>{rangeLabel}</Text>
            <Text style={styles.filterArrow}>v</Text>
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
                <Text style={styles.meta}>Harga barang: Rp {formatRupiah(item.revenue)}</Text>
              </View>
              <View style={styles.thumb} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada data.</Text>}
          ListFooterComponent={
            rows.length > 0 ? (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>{totalLabel}</Text>
                <Text style={styles.totalValue}>Rp {formatRupiah(totalRevenue)}</Text>
              </View>
            ) : null
          }
        />
      </View>

      <BottomNav active="Report" />

      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {period === "weekly" ? "Pilih Awal Minggu" : period === "monthly" ? "Pilih Bulan" : "Pilih Tanggal"}
            </Text>
            <Text style={styles.modalHint}>
              {period === "monthly" ? "Gunakan format YYYY-MM" : "Gunakan format YYYY-MM-DD"}
            </Text>
            <TextInput
              value={dateInput}
              onChangeText={setDateInput}
              placeholder={period === "monthly" ? "YYYY-MM" : "YYYY-MM-DD"}
              placeholderTextColor="#999"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.modalSecondary}>
                <Text style={styles.modalSecondaryTxt}>Batal</Text>
              </Pressable>
              <Pressable onPress={applyDate} style={styles.modalPrimary}>
                <Text style={styles.modalPrimaryTxt}>Pilih</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  totalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#eee",
  },
  totalLabel: { color: "#666", fontWeight: "700" },
  totalValue: { color: "#111", fontWeight: "900", fontSize: 16, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalTitle: { fontWeight: "900", fontSize: 16, color: "#111" },
  modalHint: { color: "#666", marginTop: 6 },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e4e4e4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  modalSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  modalSecondaryTxt: { color: "#444", fontWeight: "800" },
  modalPrimary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: "#e53935" },
  modalPrimaryTxt: { color: "#fff", fontWeight: "900" },
});
