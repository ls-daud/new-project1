import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import uuid from "react-native-uuid";
import { useNavigation } from "@react-navigation/native";

import { useCartStore } from "../store/cartStore";
import { useDataStore } from "../store/dataStore";
import { useSettingsStore } from "../store/settingsStore";
import { formatRupiah } from "../utils/money";
import { connectBluetoothPrinter } from "../printers/printer";
import { printReceipt58mm } from "../printers/receipt";

const STORE_NAME = "Kedai jamu dan wedang rempah Sanjaya";

function makeReceiptNo(date: Date, id: string) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `BYJ${y}${m}${d}${id.slice(0, 4).toUpperCase()}`;
}

type ReceiptPreview = {
  lines: Array<{ productId: string; name: string; unitPrice: number; qty: number }>;
  total: number;
  paid: number;
  change: number;
  paymentMethod: "CASH" | "QRIS";
  note?: string;
};

export function PaymentScreen() {
  const nav = useNavigation<any>();

  const lines = useCartStore((s) => s.lines);
  const note = useCartStore((s) => s.note);
  const clear = useCartStore((s) => s.clear);
  const subtotal = useCartStore((s) => s.subtotal);

  const addTransaction = useDataStore((s) => s.addTransaction);
  const decrementStockByItems = useDataStore((s) => s.decrementStockByItems);
  const syncPendingTransactions = useDataStore((s) => s.syncPendingTransactions);
  const defaultPrinter = useSettingsStore((s) => s.defaultPrinter);

  const total = subtotal();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [paid, setPaid] = useState(total);
  const [showCalc, setShowCalc] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [preview, setPreview] = useState<ReceiptPreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS">("CASH");

  useEffect(() => {
    setPaid(total);
  }, [total]);

  const effectivePaid = useMemo(() => {
    if (paymentMethod === "QRIS") return total;
    return showCalc ? (paid === 0 ? total : paid) : total;
  }, [paid, total, showCalc, paymentMethod]);
  const change = useMemo(() => Math.max(0, effectivePaid - total), [effectivePaid, total]);

  const toggleCalc = () => {
    if (paymentMethod === "QRIS") return;
    setShowCalc((v) => {
      const next = !v;
      if (next && paid === 0) setPaid(total);
      return next;
    });
  };

  const onOpenReceipt = () => {
    if (lines.length === 0) {
      Alert.alert("Keranjang kosong", "Tambah produk dulu sebelum bayar.");
      return;
    }
    if (effectivePaid < total) {
      Alert.alert("Uang kurang", "Jumlah uang harus lebih besar atau sama dengan total.");
      return;
    }
    setPreview({
      lines: [...lines],
      total,
      paid: effectivePaid,
      change,
      paymentMethod,
      note: note?.trim() ? note.trim() : undefined,
    });
    setShowReceipt(true);
  };

  const finalizeTransaction = async (withPrint: boolean) => {
    if (!preview) return;
    const now = new Date();
    const localId = String(uuid.v4());
    const idempotencyKey = String(uuid.v4());

    const localTx = {
      localId,
      idempotencyKey,
      receiptNo: makeReceiptNo(now, localId),
      createdAt: now.toISOString(),
      totalAmount: preview.total,
      paidAmount: preview.paid,
      changeAmount: preview.change,
      paymentMethod: preview.paymentMethod,
      items: preview.lines,
      note: preview.note,
      status: "pending" as const,
    };

    try {
      await addTransaction(localTx);
      await decrementStockByItems(localTx.items);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Gagal menyimpan transaksi.");
      return;
    }

    clear();
    syncPendingTransactions();
    setShowReceipt(false);
    nav.navigate("Sale");

    if (!withPrint) return;
    const printerAddress = defaultPrinter?.address;
    if (!printerAddress) {
      Alert.alert("Printer belum diset", "Set default printer dulu di Setting Printer.", [
        { text: "Batal" },
        { text: "Setting Printer", onPress: () => nav.navigate("PrinterSetup") },
      ]);
      return;
    }

    try {
      await connectBluetoothPrinter(printerAddress);
      const txForPrint = {
        id: localTx.localId,
        receiptNo: localTx.receiptNo,
        createdAt: localTx.createdAt,
        totalAmount: localTx.totalAmount,
        paidAmount: localTx.paidAmount,
        changeAmount: localTx.changeAmount,
        paymentMethod: localTx.paymentMethod,
      };
      await printReceipt58mm({
        storeName: STORE_NAME,
        tx: txForPrint,
        lines: localTx.items,
        note: localTx.note,
      });
    } catch (e: any) {
      Alert.alert("Gagal Cetak", e?.message ?? "Tidak bisa cetak struk.");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Total Pembayaran</Text>
        <Text style={styles.total}>Rp {formatRupiah(total)}</Text>

        <Text style={styles.sectionTitle}>Nama Pelanggan</Text>
        <TextInput
          placeholder="Masukkan Nama Pelanggan (Opsional)"
          placeholderTextColor="#999"
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>Metode Pembayaran</Text>
        <View style={styles.methodRow}>
          <Pressable
            onPress={() => {
              setPaymentMethod("CASH");
              setShowCalc(false);
            }}
            style={[styles.methodBtn, paymentMethod === "CASH" && styles.methodActive]}
          >
            <Text style={[styles.methodTxt, paymentMethod === "CASH" && styles.methodTxtActive]}>Tunai</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPaymentMethod("QRIS");
              setShowCalc(false);
              setPaid(total);
            }}
            style={[styles.methodBtn, paymentMethod === "QRIS" && styles.methodActive]}
          >
            <Text style={[styles.methodTxt, paymentMethod === "QRIS" && styles.methodTxtActive]}>QRIS</Text>
          </Pressable>
        </View>

        <View style={styles.calcRow}>
          <Text style={styles.calcLabel}>Hitung Kembalian</Text>
          <Pressable onPress={toggleCalc} style={[styles.calcBtn, paymentMethod === "QRIS" && styles.calcDisabled]}>
            <Text style={[styles.calcTxt, paymentMethod === "QRIS" && styles.calcTxtDisabled]}>Kalkulator</Text>
          </Pressable>
        </View>

        {showCalc && (
          <>
            <View style={styles.moneyRow}>
              <View style={styles.moneyBox}>
                <Text style={styles.moneyLabel}>Jumlah Uang</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={String(paid || "")}
                  onChangeText={(t) => setPaid(Number(t.replace(/\D/g, "")) || 0)}
                  style={styles.moneyInput}
                />
              </View>
              <View style={styles.moneyBox}>
                <Text style={styles.moneyLabel}>Kembalian</Text>
                <Text style={styles.moneyValue}>Rp {formatRupiah(change)}</Text>
              </View>
            </View>

            <Pressable onPress={() => setPaid(total)} style={styles.quickBtn}>
              <Text style={styles.quickTxt}>Uang Pas</Text>
            </Pressable>

            <View style={styles.quickRow}>
              {[10000, 20000, 50000, 100000].map((v) => (
                <Pressable key={v} onPress={() => setPaid(v)} style={styles.quickOption}>
                  <Text style={styles.quickOptionTxt}>Rp {formatRupiah(v)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Rincian Pesanan</Text>
        <View style={styles.itemsCard}>
          {lines.map((item) => (
            <View key={item.productId} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSub}>
                  Rp {formatRupiah(item.unitPrice)} x {item.qty}
                </Text>
              </View>
              <Text style={styles.itemTotal}>Rp {formatRupiah(item.unitPrice * item.qty)}</Text>
            </View>
          ))}
          {lines.length === 0 && <Text style={styles.empty}>Belum ada item.</Text>}
        </View>

        <Pressable onPress={onOpenReceipt} style={styles.primaryBtn}>
          <Text style={styles.primaryTxt}>Konfirmasi Pembayaran</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showReceipt}
        transparent
        animationType="fade"
        supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isLandscape && styles.modalCardLandscape]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Struk</Text>
              <Pressable onPress={() => setShowReceipt(false)} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>X</Text>
              </Pressable>
            </View>

            <ScrollView style={[styles.modalScroll, isLandscape && styles.modalScrollLandscape]}>
              <Text style={styles.storeName}>{STORE_NAME}</Text>

              <View style={styles.divider} />

              {preview?.lines.map((item) => (
                <View key={item.productId} style={styles.itemRow}>
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

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Metode</Text>
                <Text style={styles.summaryValue}>
                  {preview?.paymentMethod === "QRIS" ? "QRIS" : "Tunai"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>Rp {formatRupiah(preview?.total ?? 0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bayar</Text>
                <Text style={styles.summaryValue}>Rp {formatRupiah(preview?.paid ?? 0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Kembali</Text>
                <Text style={styles.summaryValue}>Rp {formatRupiah(preview?.change ?? 0)}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => finalizeTransaction(true)} style={styles.primaryAction}>
                <View style={styles.actionContent}>
                  <Text style={styles.primaryActionTxt}>Selesai &amp; Print</Text>
                  <Text style={styles.printerEmoji}>🖨</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => finalizeTransaction(false)} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionTxt}>Selesai</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#efefef" },
  content: { padding: 16, paddingBottom: 30 },
  label: { color: "#444", fontWeight: "800" },
  total: { fontSize: 28, fontWeight: "900", color: "#1b8f2e", marginTop: 6 },
  sectionTitle: { marginTop: 16, fontWeight: "900", color: "#111" },
  input: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111",
    borderWidth: 1,
    borderColor: "#e8e8e8",
  },
  methodRow: { flexDirection: "row", marginTop: 8 },
  methodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    backgroundColor: "#fff",
    marginRight: 10,
  },
  methodActive: { borderColor: "#e23c33", backgroundColor: "#fff5f5" },
  methodTxt: { fontWeight: "900", color: "#111" },
  methodTxtActive: { color: "#e23c33" },
  calcRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  calcLabel: { fontWeight: "900", color: "#111" },
  calcBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e23c33",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  calcTxt: { fontWeight: "900", color: "#e23c33" },
  calcDisabled: { borderColor: "#ddd" },
  calcTxtDisabled: { color: "#bbb" },
  moneyRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  moneyBox: { flex: 1 },
  moneyLabel: { fontWeight: "800", color: "#444", marginBottom: 6 },
  moneyInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    textAlign: "center",
    fontWeight: "900",
  },
  moneyValue: {
    backgroundColor: "#f4f4f4",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    textAlign: "center",
    fontWeight: "900",
  },
  quickBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#eaf0f7",
    alignItems: "center",
  },
  quickTxt: { fontWeight: "900", color: "#111" },
  quickRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  quickOption: {
    flexGrow: 1,
    flexBasis: "48%",
    backgroundColor: "#eef3f9",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  quickOptionTxt: { fontWeight: "900", color: "#111" },
  itemsCard: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  itemName: { fontWeight: "800", color: "#111" },
  itemSub: { color: "#666", marginTop: 2 },
  itemTotal: { fontWeight: "800", color: "#111" },
  empty: { color: "#666" },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#e23c33",
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900", fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 20 },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    alignSelf: "center",
  },
  modalCardLandscape: {
    width: "92%",
    maxWidth: 720,
    maxHeight: "90%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontWeight: "900", fontSize: 18, color: "#111" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { fontWeight: "900", color: "#555" },
  storeName: { fontSize: 16, fontWeight: "900", textAlign: "center", color: "#111", marginTop: 8 },
  modalScroll: { maxHeight: 360 },
  modalScrollLandscape: { maxHeight: 300 },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryLabel: { color: "#666", fontWeight: "700" },
  summaryValue: { color: "#111", fontWeight: "800" },
  modalActionsRow: { marginTop: 14, flexDirection: "row", gap: 12 },
  actionContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  printerEmoji: { fontSize: 16 },
  primaryAction: {
    flex: 1,
    backgroundColor: "#e23c33",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryActionTxt: { color: "#fff", fontWeight: "900" },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e23c33",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  secondaryActionTxt: { color: "#e23c33", fontWeight: "900" },
});
