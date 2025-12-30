import React, { useMemo } from "react";
import { View, Text, StyleSheet, Image, FlatList } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";
import type { RootStackParamList } from "../navigation/AppNavigator";

type StockDetailRoute = RouteProp<RootStackParamList, "StockDetail">;

export function StockDetailScreen() {
  const route = useRoute<StockDetailRoute>();
  const productId = route.params.productId;
  const product = useDataStore((s) => s.products.find((p) => p.id === productId));
  const stockChanges = useDataStore((s) => s.stockChanges);

  const rows = useMemo(() => {
    return stockChanges
      .filter((c) => c.productId === productId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [stockChanges, productId]);

  if (!product) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Produk tidak ditemukan.</Text>
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      {product.photoUri ? (
        <Image source={{ uri: product.photoUri }} style={styles.heroPhoto} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroPlaceholderTxt}>FOTO</Text>
        </View>
      )}
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>Rp {formatRupiah(product.price)}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Stok: {product.stock ?? 0}</Text>
        {product.category ? <Text style={styles.meta}>Kategori: {product.category}</Text> : null}
        {product.isActive === false ? <Text style={styles.meta}>Status: Nonaktif</Text> : null}
      </View>
      <Text style={styles.sectionTitle}>Riwayat perubahan stok</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.changeTitle}>
                {item.delta >= 0 ? "Tambah Stok" : "Kurangi Stok"}
              </Text>
              <Text style={styles.changeDate}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={styles.changeStock}>
              {item.fromStock} → {item.toStock} ({item.delta >= 0 ? "+" : ""}
              {item.delta})
            </Text>
            {item.reason ? <Text style={styles.reason}>Alasan: {item.reason}</Text> : null}
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.changePhoto} />
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Belum ada riwayat perubahan stok.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  listContent: { padding: 12 },
  header: { marginBottom: 10 },
  heroPhoto: { width: "100%", height: 220, borderRadius: 16, backgroundColor: "#eee" },
  heroPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#e9e9e9",
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderTxt: { fontWeight: "900", color: "#888", fontSize: 14 },
  name: { marginTop: 12, fontWeight: "900", fontSize: 20, color: "#111" },
  price: { color: "#666", marginTop: 4 },
  metaRow: { marginTop: 8, gap: 4 },
  meta: { color: "#444", fontWeight: "700" },
  sectionTitle: { marginTop: 16, fontWeight: "900", fontSize: 16, color: "#111" },
  card: { padding: 12, borderRadius: 14, backgroundColor: "#f7f7f7", marginTop: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  changeTitle: { fontWeight: "900", color: "#111" },
  changeDate: { color: "#666" },
  changeStock: { marginTop: 6, fontWeight: "800", color: "#333" },
  reason: { marginTop: 6, color: "#444" },
  changePhoto: { marginTop: 10, width: "100%", height: 160, borderRadius: 12, backgroundColor: "#eee" },
  empty: { padding: 16, color: "#666" },
});
