import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

type NavKey = "Sale" | "Stock" | "Report" | "History";

export function BottomNav(props: { active: NavKey }) {
  const nav = useNavigation<any>();

  const items: Array<{ key: NavKey; label: string; icon: string }> = [
    { key: "Sale", label: "Kasir", icon: "K" },
    { key: "Stock", label: "Stok", icon: "S" },
    { key: "Report", label: "Report", icon: "R" },
    { key: "History", label: "Riwayat", icon: "H" },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const active = props.active === item.key;
        return (
          <Pressable key={item.key} onPress={() => nav.navigate(item.key)} style={styles.item}>
            <View style={[styles.icon, active && styles.iconActive]}>
              <Text style={[styles.iconTxt, active && styles.iconTxtActive]}>{item.icon}</Text>
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  item: { alignItems: "center", gap: 6 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: "#e23c33" },
  iconTxt: { fontWeight: "900", color: "#555" },
  iconTxtActive: { color: "#fff" },
  label: { fontSize: 12, fontWeight: "800", color: "#666" },
  labelActive: { color: "#e23c33" },
});
