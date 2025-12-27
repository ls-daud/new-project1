import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { BottomNav } from "../components/BottomNav";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";
import type { Product } from "../api/types";

export function StockScreen() {
  const products = useDataStore((s) => s.products);
  const setProducts = useDataStore((s) => s.setProducts);
  const [draft, setDraft] = useState<Product[]>(products);

  useEffect(() => {
    setDraft(products);
  }, [products]);

  const updateStock = (id: string, value: number) => {
    setDraft((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: Number.isNaN(value) ? 0 : value } : p))
    );
  };

  const save = async () => {
    await setProducts(draft);
    Alert.alert("Sukses", "Data berhasil diupdate.");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Stok</Text>
        <FlashList
          data={draft}
          estimatedItemSize={72}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>Rp {formatRupiah(item.price)}</Text>
              </View>
              <View style={styles.stockBox}>
                <Text style={styles.stockLabel}>Stok</Text>
                <View style={styles.stockControls}>
                  <Pressable
                    onPress={() => updateStock(item.id, Math.max(0, (item.stock ?? 0) - 1))}
                    style={styles.stockBtn}
                  >
                    <Text style={styles.stockBtnTxt}>-</Text>
                  </Pressable>
                  <TextInput
                    keyboardType="number-pad"
                    value={String(item.stock ?? 0)}
                    onChangeText={(t) => updateStock(item.id, Number(t.replace(/\D/g, "")) || 0)}
                    style={styles.stockInput}
                  />
                  <Pressable onPress={() => updateStock(item.id, (item.stock ?? 0) + 1)} style={styles.stockBtn}>
                    <Text style={styles.stockBtnTxt}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada produk.</Text>}
        />

        <Pressable onPress={save} style={styles.saveBtn}>
          <Text style={styles.saveTxt}>Update Stok</Text>
        </Pressable>
      </View>

      <BottomNav active="Stock" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 12 },
  title: { fontSize: 18, fontWeight: "900", color: "#111", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#f7f7f7",
    marginBottom: 10,
  },
  name: { fontWeight: "900", color: "#111" },
  price: { color: "#666", marginTop: 4 },
  stockBox: { alignItems: "flex-end" },
  stockLabel: { fontWeight: "800", color: "#444", marginBottom: 6 },
  stockControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  stockInput: {
    width: 90,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    paddingVertical: 8,
    textAlign: "center",
    fontWeight: "900",
  },
  stockBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  stockBtnTxt: { fontWeight: "900", color: "#111", fontSize: 16 },
  saveBtn: {
    marginTop: 8,
    backgroundColor: "#e23c33",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  saveTxt: { color: "#fff", fontWeight: "900" },
  empty: { padding: 16, color: "#666" },
});
