import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import type { Product } from "../api/types";
import { formatRupiah } from "../utils/money";

export function ProductTile(props: { p: Product; onPress: () => void }) {
  const stock = props.p.stock ?? 0;
  const stockTone = stock <= 0 ? styles.stockOut : stock <= 5 ? styles.stockLow : styles.stockOk;
  return (
    <Pressable onPress={props.onPress} style={styles.tile}>
      <Text numberOfLines={2} style={styles.name}>
        {props.p.name}
      </Text>
      <View style={{ height: 6 }} />
      <Text style={styles.price}>Rp {formatRupiah(props.p.price)}</Text>
      <View style={{ height: 6 }} />
      <View style={[styles.stockPill, stockTone]}>
        <Text style={styles.stockTxt}>Stok: {stock}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: "#f2f2f2",
    borderRadius: 14,
    padding: 12,
    minHeight: 86,
    justifyContent: "space-between",
  },
  name: { fontSize: 14, fontWeight: "700", color: "#111" },
  price: { fontSize: 13, fontWeight: "700", color: "#111" },
  stockPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stockTxt: { fontSize: 11, fontWeight: "800", color: "#111" },
  stockOk: { backgroundColor: "#e7f7ef" },
  stockLow: { backgroundColor: "#fff3cd" },
  stockOut: { backgroundColor: "#fdecec" },
});
