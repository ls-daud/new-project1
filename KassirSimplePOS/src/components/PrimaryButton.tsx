import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";

export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.btn, props.disabled && styles.btnDisabled, props.style]}
    >
      <Text style={styles.txt}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: "#e23c33", paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  btnDisabled: { opacity: 0.5 },
  txt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
