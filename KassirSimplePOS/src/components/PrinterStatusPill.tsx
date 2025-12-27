import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function PrinterStatusPill(props: { connected: boolean }) {
  return (
    <View style={[styles.pill, props.connected ? styles.ok : styles.bad]}>
      <Text style={styles.text}>{props.connected ? "Printer: *" : "Printer: o"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  ok: { backgroundColor: "#e7f7ef" },
  bad: { backgroundColor: "#fdecec" },
  text: { fontWeight: "700" },
});
