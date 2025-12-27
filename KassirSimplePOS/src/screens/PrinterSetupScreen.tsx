import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { listBluetoothDevices } from "../printers/printer";
import { useSettingsStore } from "../store/settingsStore";

export function PrinterSetupScreen() {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Array<{ name: string; address: string }>>([]);
  const defaultPrinter = useSettingsStore((s) => s.defaultPrinter);
  const setDefaultPrinter = useSettingsStore((s) => s.setDefaultPrinter);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listBluetoothDevices();
      setDevices(list.filter((d) => d.address));
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Tidak bisa ambil device list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Pair printer dulu lewat Bluetooth Settings Android. Setelah itu pilih di sini.
      </Text>

      <Pressable onPress={refresh} style={styles.refresh}>
        <Text style={styles.refreshTxt}>Refresh Device List</Text>
      </Pressable>

      {loading && <ActivityIndicator />}

      <View style={{ height: 12 }} />

      {devices.map((d) => {
        const selected = defaultPrinter?.address === d.address;
        return (
          <Pressable
            key={d.address}
            onPress={() => setDefaultPrinter({ name: d.name, address: d.address })}
            style={[styles.row, selected && styles.rowSelected]}
          >
            <Text style={styles.name}>{d.name}</Text>
            <Text style={styles.addr}>{d.address}</Text>
            {selected && <Text style={styles.badge}>DEFAULT</Text>}
          </Pressable>
        );
      })}

      <View style={{ height: 16 }} />

      <Pressable
        onPress={() => setDefaultPrinter(null)}
        style={[styles.row, { backgroundColor: "#fdecec" }]}
      >
        <Text style={{ fontWeight: "800", color: "#a00" }}>Hapus Default Printer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  hint: { color: "#444", marginBottom: 12 },
  refresh: { padding: 12, borderRadius: 12, backgroundColor: "#f2f2f2" },
  refreshTxt: { fontWeight: "800" },
  row: { padding: 12, borderRadius: 12, backgroundColor: "#f7f7f7", marginBottom: 10 },
  rowSelected: { borderWidth: 2, borderColor: "#111" },
  name: { fontWeight: "800", color: "#111" },
  addr: { color: "#555", marginTop: 4, fontSize: 12 },
  badge: { marginTop: 6, fontWeight: "900" },
});
