import React, { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, RefreshControl, ScrollView } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";

import type { Product } from "../api/types";
import { useCartStore } from "../store/cartStore";
import { useDataStore } from "../store/dataStore";
import { useSettingsStore } from "../store/settingsStore";
import { ProductTile } from "../components/ProductTile";
import { CartItemRow } from "../components/CartItemRow";
import { PrimaryButton } from "../components/PrimaryButton";
import { PrinterStatusPill } from "../components/PrinterStatusPill";
import { BottomNav } from "../components/BottomNav";
import { formatRupiah } from "../utils/money";

export function SaleScreen() {
  const nav = useNavigation<any>();

  const lines = useCartStore((s) => s.lines);
  const note = useCartStore((s) => s.note);
  const addItem = useCartStore((s) => s.addItem);
  const incQty = useCartStore((s) => s.incQty);
  const decQty = useCartStore((s) => s.decQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const setNote = useCartStore((s) => s.setNote);
  const subtotal = useCartStore((s) => s.subtotal);

  const defaultPrinter = useSettingsStore((s) => s.defaultPrinter);
  const products = useDataStore((s) => s.products);
  const hydrated = useDataStore((s) => s.hydrated);
  const hydrate = useDataStore((s) => s.hydrate);
  const clearLocalCache = useDataStore((s) => s.clearLocalCache);
  const syncPendingTransactions = useDataStore((s) => s.syncPendingTransactions);

  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const total = subtotal();
  const printerConnected = !!defaultPrinter?.address;

  const filtered: Product[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const onOpenPayment = () => {
    if (lines.length === 0) {
      Alert.alert("Keranjang kosong", "Tambah produk dulu sebelum bayar.");
      return;
    }
    nav.navigate("Payment");
  };

  const onRefresh = async () => {
    console.log("[SaleScreen] Starting refresh...");
    setRefreshing(true);
    try {
      await syncPendingTransactions();
      await hydrate();
      console.log("[SaleScreen] Refresh completed successfully");
    } catch (e: any) {
      console.log("[SaleScreen] Refresh failed:", e?.message);
      const errorMsg = e?.message ?? "Tidak bisa sync data.";
      Alert.alert(
        "Sync gagal",
        `${errorMsg}\n\nData lokal masih ditampilkan. Ingin hapus cache lokal dan coba lagi?`,
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Hapus Cache",
            style: "destructive",
            onPress: async () => {
              try {
                await clearLocalCache();
                await hydrate();
                Alert.alert("Berhasil", "Cache lokal sudah dihapus dan data di-refresh.");
              } catch (err: any) {
                Alert.alert("Error", err?.message ?? "Gagal menghapus cache.");
              }
            },
          },
        ]
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cari produk..."
            style={styles.search}
            placeholderTextColor="#888"
          />
        </View>

        <View style={{ width: 10 }} />
        <PrinterStatusPill connected={printerConnected} />
      </View>

      <View style={styles.body}>
        <View style={styles.left}>
          <FlashList
            data={filtered}
            keyExtractor={(p) => p.id}
            numColumns={3}
            estimatedItemSize={100}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#e23c33"]}
                tintColor="#e23c33"
                title={refreshing ? "Memuat data..." : "Tarik untuk refresh"}
                titleColor="#666"
              />
            }
            renderItem={({ item }) => (
              <View style={styles.tileWrap}>
                <ProductTile
                  p={item}
                  onPress={() => addItem({ productId: item.id, name: item.name, unitPrice: item.price })}
                />
              </View>
            )}
            ListHeaderComponent={
              <Text style={styles.sectionTitle}>{hydrated ? "Produk" : "Loading..."}</Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyProducts}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyText}>Belum ada produk</Text>
                <Text style={styles.emptyHint}>Tarik ke bawah untuk refresh</Text>
              </View>
            }
          />
        </View>

        <View style={styles.right}>
          <Text style={styles.sectionTitle}>Keranjang</Text>

          <View style={styles.cartList}>
            <FlashList
              data={lines}
              keyExtractor={(l) => l.productId}
              estimatedItemSize={60}
              renderItem={({ item }) => (
                <CartItemRow
                  line={item}
                  onInc={() => incQty(item.productId)}
                  onDec={() => decQty(item.productId)}
                  onRemove={() => remove(item.productId)}
                />
              )}
              ListEmptyComponent={<Text style={{ color: "#666" }}>Belum ada item.</Text>}
            />
          </View>

          <View style={{ height: 8 }} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>Rp {formatRupiah(total)}</Text>
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Catatan (opsional)"
            placeholderTextColor="#888"
            style={styles.note}
          />

          <PrimaryButton title="BAYAR" onPress={onOpenPayment} disabled={total <= 0 || lines.length === 0} style={{ marginTop: 10 }} />

          <View style={{ height: 10 }} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => clear()} style={[styles.secondaryBtn, { backgroundColor: "#fdecec" }]}>
              <Text style={[styles.secondaryTxt, { color: "#a00" }]}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <BottomNav active="Sale" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  top: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  search: {
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111",
  },

  body: { flex: 1, flexDirection: "row", paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  left: { flex: 1.25, backgroundColor: "#fff" },
  right: {
    flex: 1,
    backgroundColor: "#fff",
    borderLeftWidth: 1,
    borderLeftColor: "#eee",
    paddingLeft: 12,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", marginBottom: 8, color: "#111" },
  tileWrap: { flex: 1, padding: 6 },
  cartList: { flex: 1, backgroundColor: "#fff" },

  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontWeight: "900", color: "#111" },
  totalValue: { fontSize: 16, fontWeight: "900", color: "#111" },

  note: {
    marginTop: 10,
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111",
  },

  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center" },
  secondaryTxt: { fontWeight: "900", color: "#111" },

  emptyProducts: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 4 },
  emptyHint: { fontSize: 13, color: "#888" },
});
