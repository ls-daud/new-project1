import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import { printReceipt58mm } from "../printers/receipt";
import { connectBluetoothPrinter } from "../printers/printer";
import { useDataStore } from "../store/dataStore";
import { useSettingsStore } from "../store/settingsStore";
import { BottomNav } from "../components/BottomNav";

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const rows = useDataStore((s) => s.transactions);
  const syncPendingTransactions = useDataStore((s) => s.syncPendingTransactions);
  const defaultPrinter = useSettingsStore((s) => s.defaultPrinter);
  const [loading, setLoading] = useState(false);

  const onSync = async () => {
    setLoading(true);
    await syncPendingTransactions();
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Pressable onPress={onSync} style={styles.refresh}>
          <Text style={styles.refreshTxt}>{loading ? "Sync..." : "Sync Transaksi"}</Text>
        </Pressable>

        <FlashList
          data={rows}
          estimatedItemSize={72}
          keyExtractor={(x) => x.localId}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.receiptNo}</Text>
              <Text style={styles.sub}>{new Date(item.createdAt).toLocaleString()}</Text>
              {item.status !== "synced" && <Text style={styles.badge}>PENDING SYNC</Text>}

              <View style={{ height: 10 }} />
              <Pressable
                onPress={async () => {
                  try {
                    const printerAddress = defaultPrinter?.address;
                    if (!printerAddress) {
                      Alert.alert("Printer belum diset", "Set default printer dulu di Setting Printer.", [
                        { text: "Batal" },
                        { text: "Setting Printer", onPress: () => nav.navigate("PrinterSetup") },
                      ]);
                      return;
                    }
                    await connectBluetoothPrinter(printerAddress);
                    const tx = {
                      id: item.remoteId ?? item.localId,
                      receiptNo: item.receiptNo,
                      createdAt: item.createdAt,
                      totalAmount: item.totalAmount,
                      paidAmount: item.paidAmount,
                      changeAmount: item.changeAmount,
                      paymentMethod: item.paymentMethod,
                    };
                    await printReceipt58mm({
                      storeName: "TOKO",
                      tx,
                      lines: item.items,
                      note: item.note,
                    });
                  } catch (e: any) {
                    Alert.alert("Gagal", e?.message ?? "Gagal reprint");
                  }
                }}
                style={styles.btn}
              >
                <Text style={styles.btnTxt}>Reprint</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={{ padding: 16, color: "#666" }}>Belum ada transaksi.</Text>}
        />
      </View>

      <BottomNav active="History" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 12 },
  refresh: { padding: 12, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center", marginBottom: 10 },
  refreshTxt: { fontWeight: "900" },
  card: { padding: 12, borderRadius: 14, backgroundColor: "#f7f7f7", marginBottom: 10 },
  title: { fontWeight: "900", fontSize: 16 },
  sub: { color: "#555", marginTop: 4 },
  badge: { marginTop: 6, color: "#b25b00", fontWeight: "900" },
  btn: { marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: "#111", alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "900" },
});
