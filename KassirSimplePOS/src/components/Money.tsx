import React from "react";
import { Text, TextProps } from "react-native";
import { formatRupiah } from "../utils/money";

export function Money(
  props: { value: number; prefix?: string } & TextProps
) {
  const { value, prefix = "Rp ", ...rest } = props;
  return <Text {...rest}>{`${prefix}${formatRupiah(value)}`}</Text>;
}
