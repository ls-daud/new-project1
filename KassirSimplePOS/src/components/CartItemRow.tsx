import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { CartLine } from "../api/types";
import { formatRupiah } from "../utils/money";

export function CartItemRow(props: {
  line: CartLine;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const { line } = props;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.name}>
          {line.name}
        </Text>
        <Text style={styles.sub}>Rp {formatRupiah(line.unitPrice * line.qty)}</Text>
      </View>

      <View style={styles.qtyBox}>
        <Pressable onPress={props.onDec} style={styles.qtyBtn}>
          <Text style={styles.qtyTxt}>-</Text>
        </Pressable>
        <Text style={styles.qtyNum}>{line.qty}</Text>
        <Pressable onPress={props.onInc} style={styles.qtyBtn}>
          <Text style={styles.qtyTxt}>+</Text>
        </Pressable>
      </View>

      <Pressable onPress={props.onRemove} style={styles.remove}>
        <Text style={styles.removeTxt}>Hapus</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  name: { fontSize: 14, fontWeight: "700", color: "#111" },
  sub: { fontSize: 12, color: "#444", marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyTxt: { fontSize: 18, fontWeight: "800" },
  qtyNum: { width: 22, textAlign: "center", fontWeight: "800" },
  remove: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fdecec",
  },
  removeTxt: { fontWeight: "800", color: "#a00" },
});
