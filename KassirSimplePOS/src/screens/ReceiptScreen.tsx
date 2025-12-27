import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";

import { printReceipt58mm } from "../printers/receipt";
import { listBluetoothDevices } from "../printers/printer";
import { useSettingsStore } from "../store/settingsStore";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";

type RouteParams = { localId: string };

const STORE_NAME = "Kedai jamu dan wedang rempah Sanjaya";

export function ReceiptScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { localId } = route.params as RouteParams;

  const transactions = useDataStore((s) => s.transactions);
  const defaultPrinter = useSettingsStore((s) => s.defaultPrinter);
  const setDefaultPrinter = useSettingsStore((s) => s.setDefaultPrinter);

  const tx = useMemo(() => transactions.find((t) => t.localId === localId), [transactions, localId]);

  const [devices, setDevices] = useState<Array<{ name: string; address: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(defaultPrinter?.address ?? null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listBluetoothDevices();
      setDevices(list.filter((d) => d.address));
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Tidak bisa ambil device list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (defaultPrinter?.address) setSelected(defaultPrinter.address);
  }, [defaultPrinter]);

  if (!tx) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Transaksi tidak ditemukan.</Text>
        <Pressable onPress={() => nav.navigate("Sale")} style={styles.primaryBtn}>
          <Text style={styles.primaryTxt}>Kembali ke Kasir</Text>
        </Pressable>
      </View>
    );
  }

  const onPrint = async () => {
    if (!selected) {
      Alert.alert("Pilih printer", "Pilih printer Bluetooth terlebih dulu.");
      return;
    }
    await setDefaultPrinter({ name: devices.find((d) => d.address === selected)?.name ?? "Printer", address: selected });
    try {
      const txForPrint = {
        id: tx.remoteId ?? tx.localId,
        receiptNo: tx.receiptNo,
        createdAt: tx.createdAt,
        totalAmount: tx.totalAmount,
        paidAmount: tx.paidAmount,
        changeAmount: tx.changeAmount,
        paymentMethod: tx.paymentMethod,
      };
      await printReceipt58mm({ storeName: STORE_NAME, tx: txForPrint, lines: tx.items, note: tx.note });
      Alert.alert("Berhasil", "Struk berhasil dicetak.");
    } catch (e: any) {
      Alert.alert("Gagal Cetak", e?.message ?? "Tidak bisa cetak struk.");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.card}>
          <Text style={styles.storeName}>{STORE_NAME}</Text>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>No</Text>
            <Text style={styles.infoValue}>{tx.receiptNo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tanggal</Text>
            <Text style={styles.infoValue}>{new Date(tx.createdAt).toLocaleString()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Kasir</Text>
            <Text style={styles.infoValue}>Kasir</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pembayaran</Text>
            <Text style={styles.infoValue}>{tx.paymentMethod === "QRIS" ? "QRIS" : "Tunai"}</Text>
          </View>

          <View style={styles.divider} />

          {tx.items.map((item) => (
            <View key={`${item.productId}-${item.qty}`} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSub}>
                  Rp {formatRupiah(item.unitPrice)} x {item.qty}
                </Text>
              </View>
              <Text style={styles.itemTotal}>Rp {formatRupiah(item.unitPrice * item.qty)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Pesanan</Text>
            <Text style={styles.infoValue}>Rp {formatRupiah(tx.totalAmount)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bayar</Text>
            <Text style={styles.infoValue}>Rp {formatRupiah(tx.paidAmount)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Kembali</Text>
            <Text style={styles.infoValue}>Rp {formatRupiah(tx.changeAmount)}</Text>
          </View>
        </View>

        <Text style={styles.selectTitle}>Pilih Printer Bluetooth</Text>

        {loading && <ActivityIndicator />}

        {devices.map((d) => {
          const isSelected = selected === d.address;
          return (
            <Pressable key={d.address} onPress={() => setSelected(d.address)} style={styles.deviceRow}>
              <View style={[styles.radio, isSelected && styles.radioActive]} />
              <Text style={styles.deviceName}>{d.name}</Text>
            </Pressable>
          );
        })}
        {!loading && devices.length === 0 && <Text style={styles.empty}>Belum ada printer terdeteksi.</Text>}

        <Text style={styles.helper}>
          Tidak dapat menemukan printer kamu? Pastikan perangkatmu telah terkoneksi di Pengaturan Bluetooth.
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable onPress={() => nav.navigate("Sale")} style={styles.cancelBtn}>
          <Text style={styles.cancelTxt}>Batal</Text>
        </Pressable>
        <Pressable onPress={onPrint} style={styles.pickBtn}>
          <Text style={styles.pickTxt}>Pilih</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f3f3", padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
  },
  storeName: { fontSize: 18, fontWeight: "900", textAlign: "center", color: "#111" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  infoLabel: { color: "#666", fontWeight: "700" },
  infoValue: { color: "#111", fontWeight: "800" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  itemName: { fontWeight: "800", color: "#111" },
  itemSub: { color: "#666", marginTop: 2 },
  itemTotal: { fontWeight: "800", color: "#111" },
  selectTitle: { marginTop: 16, color: "#e23c33", fontWeight: "900", textAlign: "center" },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  deviceName: { fontWeight: "800", color: "#111" },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#e23c33",
  },
  radioActive: { backgroundColor: "#e23c33" },
  helper: { marginTop: 8, color: "#666", fontSize: 12, textAlign: "center" },
  bottomBar: { flexDirection: "row", gap: 12, paddingTop: 10 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e23c33",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  cancelTxt: { color: "#e23c33", fontWeight: "900" },
  pickBtn: { flex: 1, backgroundColor: "#e23c33", paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  pickTxt: { color: "#fff", fontWeight: "900" },
  empty: { color: "#666", marginBottom: 12 },
  primaryBtn: { backgroundColor: "#e23c33", paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  primaryTxt: { color: "#fff", fontWeight: "900" },
});
