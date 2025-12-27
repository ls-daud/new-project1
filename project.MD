Minta koding lengkap React Native, jadi ini aku kasih project skeleton yang bisa langsung kamu copy-paste (Android-only, tablet jadul friendly), dengan:
	•	2-step flow: Tambah barang → Bayar & Cetak (uang pas)
	•	Optional: Input uang (kembalian) via bottom sheet
	•	Bluetooth ESC/POS 58mm generic pakai library react-native-thermal-receipt-printer-image-qr (punya API getDeviceList, connectPrinter, printBill, printColumnsText, dll).  ￼
	•	Online-only API client (REST), dengan idempotency key biar tidak dobel transaksi

Catatan realita: Bluetooth printing di RN itu tidak “tinggal import terus bahagia”. Ini akan tetap butuh test di printer beneran, terutama tablet jadul. Tapi struktur di bawah ini sudah “waras” dan production-minded.

⸻

0) Setup Project (React Native CLI, bukan Expo)

npx react-native init KassirSimplePOS --template react-native-template-typescript
cd KassirSimplePOS

Install dependencies:

yarn add @react-navigation/native @react-navigation/native-stack
yarn add react-native-screens react-native-safe-area-context react-native-gesture-handler
yarn add zustand axios
yarn add @shopify/flash-list
yarn add @react-native-async-storage/async-storage
yarn add react-native-thermal-receipt-printer-image-qr react-native-ping
yarn add react-native-uuid

Android-only: pastikan MainActivity sudah setup gesture handler (template baru biasanya sudah).

⸻

1) Android permissions (Bluetooth)

Tambahkan di android/app/src/main/AndroidManifest.xml:

<manifest ...>
  <uses-permission android:name="android.permission.BLUETOOTH" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />

  <!-- Android 12+ -->
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

  <application ...>
    ...
  </application>
</manifest>

Android 12+ kadang minta runtime permission untuk scan/connect. Kalau tablet jadul kamu Android 8–10, biasanya lebih “longgar”, tapi aman kalau disiapkan.

⸻

2) Struktur Folder

Bikin struktur ini:

src/
  api/
    client.ts
    types.ts
  components/
    ProductTile.tsx
    CartItemRow.tsx
    PrimaryButton.tsx
    PrinterStatusPill.tsx
    Money.tsx
  navigation/
    AppNavigator.tsx
  printers/
    printer.ts
    receipt.ts
  screens/
    SaleScreen.tsx
    ReportScreen.tsx
    HistoryScreen.tsx
    PrinterSetupScreen.tsx
  store/
    cartStore.ts
    settingsStore.ts
  utils/
    debounce.ts
    money.ts


⸻

3) Konfigurasi API

Buat file src/api/client.ts:

import axios from "axios";

export const api = axios.create({
  baseURL: "https://YOUR_BACKEND_BASE_URL", // ganti
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  config.headers["Content-Type"] = "application/json";
  return config;
});

src/api/types.ts:

export type Product = {
  id: string;
  name: string;
  price: number; // rupiah integer
  category?: string | null;
  isActive?: boolean;
};

export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
};

export type TransactionCreateRequest = {
  idempotencyKey: string;
  note?: string;
  paymentMethod: "CASH";
  paidAmount: number;
  items: Array<{
    productId: string;
    qty: number;
    unitPrice: number;
  }>;
};

export type TransactionCreateResponse = {
  id: string;
  receiptNo: string;
  createdAt: string;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
};

export type TopProductRow = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
};


⸻

4) State Management (Zustand)

src/store/cartStore.ts:

import { create } from "zustand";
import type { CartLine } from "../api/types";

type CartState = {
  lines: CartLine[];
  note: string;
  addItem: (item: { productId: string; name: string; unitPrice: number }) => void;
  incQty: (productId: string) => void;
  decQty: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setNote: (note: string) => void;
  subtotal: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  note: "",
  addItem: (item) =>
    set((s) => {
      const idx = s.lines.findIndex((x) => x.productId === item.productId);
      if (idx >= 0) {
        const next = [...s.lines];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return { lines: next };
      }
      return { lines: [...s.lines, { ...item, qty: 1 }] };
    }),
  incQty: (productId) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l)),
    })),
  decQty: (productId) =>
    set((s) => ({
      lines: s.lines
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    })),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  clear: () => set({ lines: [], note: "" }),
  setNote: (note) => set({ note }),
  subtotal: () => get().lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
}));

src/store/settingsStore.ts:

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

type PrinterDevice = {
  name: string;
  address: string; // MAC / identifier
};

type SettingsState = {
  defaultPrinter: PrinterDevice | null;
  setDefaultPrinter: (p: PrinterDevice | null) => Promise<void>;
  hydrate: () => Promise<void>;
};

const KEY = "settings.defaultPrinter.v1";

export const useSettingsStore = create<SettingsState>((set, get) => ({
  defaultPrinter: null,
  hydrate: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) set({ defaultPrinter: JSON.parse(raw) });
  },
  setDefaultPrinter: async (p) => {
    set({ defaultPrinter: p });
    if (p) await AsyncStorage.setItem(KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(KEY);
  },
}));


⸻

5) Printer Service (ESC/POS)

Kita pakai react-native-thermal-receipt-printer-image-qr. API utamanya ada getDeviceList, connectPrinter, printBill, printColumnsText.  ￼

src/printers/printer.ts:

import { Printer } from "react-native-thermal-receipt-printer-image-qr";

export type BtDevice = { name: string; address: string };

export async function listBluetoothDevices(): Promise<BtDevice[]> {
  // Library returns list (format bisa beda antar device/printer)
  const list = await Printer.getDeviceList();
  // Try normalize
  return (Array.isArray(list) ? list : []).map((d: any) => ({
    name: String(d?.device_name ?? d?.name ?? "Printer"),
    address: String(d?.inner_mac_address ?? d?.address ?? d?.macAddress ?? ""),
  }));
}

export async function connectBluetoothPrinter(address: string): Promise<void> {
  // Some libs need "connectPrinter" for net; for BLE/BT it often auto-connects internally.
  // Many implementations accept "address" in internal connect method; if not, printing will try the selected device.
  // We'll try connectPrinter as a no-op fallback if needed.
  // If your library requires explicit connect for BT, adjust here.
  // For this fork, device selection is generally handled by OS pairing + device list.
  // Keep function for future compatibility.
  if (!address) throw new Error("Printer address is empty");
  return;
}

src/printers/receipt.ts:

import { Printer, ColumnAlignment, COMMANDS } from "react-native-thermal-receipt-printer-image-qr";
import type { TransactionCreateResponse, CartLine } from "../api/types";
import { formatRupiah } from "../utils/money";

export async function printReceipt58mm(params: {
  storeName?: string;
  tx: TransactionCreateResponse;
  lines: CartLine[];
  note?: string;
}): Promise<void> {
  const { storeName = "TOKO", tx, lines, note } = params;

  const BOLD_ON = COMMANDS.TEXT_FORMAT.TXT_BOLD_ON;
  const BOLD_OFF = COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF;
  const CENTER = COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT;
  const LEFT = COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT;
  const NEWLINE = "\n";

  const header = `${CENTER}${BOLD_ON}${storeName}${BOLD_OFF}${NEWLINE}${CENTER}Receipt: ${tx.receiptNo}${NEWLINE}${CENTER}${new Date(tx.createdAt).toLocaleString()}${NEWLINE}${NEWLINE}`;
  Printer.printText(header);

  // 58mm => sekitar 30 char; library contoh kolom 58mm = 30  [oai_citation:2‡GitHub](https://github.com/thiendangit/react-native-thermal-receipt-printer-image-qr)
  const colAlign = [ColumnAlignment.LEFT, ColumnAlignment.CENTER, ColumnAlignment.RIGHT] as any;
  const colWidth = [18, 4, 8]; // total 30

  Printer.printColumnsText(["Item", "Qty", "Rp"], colWidth, colAlign, [`${BOLD_ON}`, "", ""], {});

  lines.forEach((l) => {
    const name = l.name.length > 18 ? l.name.slice(0, 17) + "…" : l.name;
    Printer.printColumnsText(
      [name, String(l.qty), formatRupiah(l.unitPrice * l.qty)],
      colWidth,
      colAlign,
      [`${BOLD_OFF}`, "", ""],
      {}
    );
  });

  Printer.printText(`${LEFT}${NEWLINE}`);
  Printer.printText(`${LEFT}TOTAL  : ${formatRupiah(tx.totalAmount)}${NEWLINE}`);
  Printer.printText(`${LEFT}TUNAI  : ${formatRupiah(tx.paidAmount)}${NEWLINE}`);
  Printer.printText(`${LEFT}KEMBALI: ${formatRupiah(tx.changeAmount)}${NEWLINE}`);

  if (note?.trim()) Printer.printText(`${LEFT}${NEWLINE}Catatan: ${note.trim()}${NEWLINE}`);

  Printer.printBill(`${CENTER}${NEWLINE}Terima kasih${NEWLINE}${NEWLINE}`);
}


⸻

6) Utils

src/utils/money.ts:

export function formatRupiah(v: number): string {
  const n = Math.round(v);
  return n.toLocaleString("id-ID");
}

src/utils/debounce.ts:

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


⸻

7) UI Components

src/components/PrimaryButton.tsx:

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
  btn: { backgroundColor: "#111", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnDisabled: { opacity: 0.5 },
  txt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

src/components/PrinterStatusPill.tsx:

import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function PrinterStatusPill(props: { connected: boolean }) {
  return (
    <View style={[styles.pill, props.connected ? styles.ok : styles.bad]}>
      <Text style={styles.text}>{props.connected ? "Printer: ●" : "Printer: ○"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  ok: { backgroundColor: "#e7f7ef" },
  bad: { backgroundColor: "#fdecec" },
  text: { fontWeight: "700" },
});

src/components/ProductTile.tsx:

import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import type { Product } from "../api/types";
import { formatRupiah } from "../utils/money";

export function ProductTile(props: { p: Product; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.tile}>
      <Text numberOfLines={2} style={styles.name}>{props.p.name}</Text>
      <View style={{ height: 6 }} />
      <Text style={styles.price}>Rp {formatRupiah(props.p.price)}</Text>
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
});

src/components/CartItemRow.tsx:

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
        <Text numberOfLines={1} style={styles.name}>{line.name}</Text>
        <Text style={styles.sub}>Rp {formatRupiah(line.unitPrice * line.qty)}</Text>
      </View>

      <View style={styles.qtyBox}>
        <Pressable onPress={props.onDec} style={styles.qtyBtn}><Text style={styles.qtyTxt}>-</Text></Pressable>
        <Text style={styles.qtyNum}>{line.qty}</Text>
        <Pressable onPress={props.onInc} style={styles.qtyBtn}><Text style={styles.qtyTxt}>+</Text></Pressable>
      </View>

      <Pressable onPress={props.onRemove} style={styles.remove}>
        <Text style={styles.removeTxt}>Hapus</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  name: { fontSize: 14, fontWeight: "700", color: "#111" },
  sub: { fontSize: 12, color: "#444", marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#f2f2f2", alignItems: "center", justifyContent: "center" },
  qtyTxt: { fontSize: 18, fontWeight: "800" },
  qtyNum: { width: 22, textAlign: "center", fontWeight: "800" },
  remove: { marginLeft: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#fdecec" },
  removeTxt: { fontWeight: "800", color: "#a00" },
});


⸻

8) Navigation

src/navigation/AppNavigator.tsx:

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SaleScreen } from "../screens/SaleScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { PrinterSetupScreen } from "../screens/PrinterSetupScreen";

export type RootStackParamList = {
  Sale: undefined;
  Report: undefined;
  History: undefined;
  PrinterSetup: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Sale">
        <Stack.Screen name="Sale" component={SaleScreen} options={{ title: "Sale / Kasir" }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: "Produk Terjual" }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: "Riwayat" }} />
        <Stack.Screen name="PrinterSetup" component={PrinterSetupScreen} options={{ title: "Setting Printer" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

App.tsx:

import React, { useEffect } from "react";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { useSettingsStore } from "./src/store/settingsStore";

export default function App() {
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <AppNavigator />;
}


⸻

9) Screen: Printer Setup (pilih default printer)

src/screens/PrinterSetupScreen.tsx:

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

  useEffect(() => { refresh(); }, []);

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


⸻

10) Screen: Sale (inti 2-step)

src/screens/SaleScreen.tsx:

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Modal } from "react-native";
import { FlashList } from "@shopify/flash-list";
import uuid from "react-native-uuid";
import { useNavigation } from "@react-navigation/native";

import { api } from "../api/client";
import type { Product, TransactionCreateRequest, TransactionCreateResponse } from "../api/types";
import { useCartStore } from "../store/cartStore";
import { useSettingsStore } from "../store/settingsStore";
import { ProductTile } from "../components/ProductTile";
import { CartItemRow } from "../components/CartItemRow";
import { PrimaryButton } from "../components/PrimaryButton";
import { PrinterStatusPill } from "../components/PrinterStatusPill";
import { formatRupiah } from "../utils/money";
import { debounce } from "../utils/debounce";
import { printReceipt58mm } from "../printers/receipt";

type CashSheetState = { open: boolean; paid: number };

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

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [cashSheet, setCashSheet] = useState<CashSheetState>({ open: false, paid: 0 });

  const total = subtotal();

  const printerConnected = !!defaultPrinter?.address; // indicator sederhana (real connect di print time)

  const fetchProducts = async (q: string) => {
    setLoadingProducts(true);
    try {
      const res = await api.get<Product[]>("/products", { params: { search: q, limit: 80 } });
      setProducts(res.data ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Gagal load produk");
    } finally {
      setLoadingProducts(false);
    }
  };

  const debouncedFetch = useMemo(() => debounce(fetchProducts, 250), []);

  useEffect(() => { fetchProducts(""); }, []);

  useEffect(() => {
    debouncedFetch(query.trim());
  }, [query, debouncedFetch]);

  const createTx = async (paidAmount: number): Promise<TransactionCreateResponse> => {
    const idempotencyKey = String(uuid.v4());
    const req: TransactionCreateRequest = {
      idempotencyKey,
      paymentMethod: "CASH",
      paidAmount,
      note: note?.trim() ? note.trim() : undefined,
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
    };

    const res = await api.post<TransactionCreateResponse>("/transactions", req, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
    return res.data;
  };

  const doCheckout = async (paidAmount: number) => {
    if (lines.length === 0) return;
    if (!defaultPrinter?.address) {
      Alert.alert(
        "Printer belum diset",
        "Set default printer dulu di Setting Printer.",
        [
          { text: "Batal" },
          { text: "Setting Printer", onPress: () => nav.navigate("PrinterSetup") },
        ]
      );
      return;
    }

    setSubmitting(true);
    try {
      // 1) Create transaction on server (online-only => print after ack)
      const tx = await createTx(paidAmount);

      // 2) Print
      try {
        await printReceipt58mm({ storeName: "TOKO", tx, lines, note });
      } catch (printErr: any) {
        // Printer error panel
        Alert.alert(
          "Gagal Cetak",
          "Transaksi sudah tersimpan. Coba reprint dari Riwayat atau coba cetak lagi.",
          [
            { text: "OK" },
            { text: "Riwayat", onPress: () => nav.navigate("History") },
          ]
        );
      }

      // 3) Clear cart
      clear();
    } catch (e: any) {
      Alert.alert("Gagal", e?.response?.data?.message ?? e?.message ?? "Gagal simpan transaksi");
    } finally {
      setSubmitting(false);
    }
  };

  const onPayAndPrintExact = () => {
    if (total <= 0 || lines.length === 0) return;
    doCheckout(total);
  };

  const onOpenCashSheet = () => {
    if (total <= 0 || lines.length === 0) return;
    setCashSheet({ open: true, paid: total });
  };

  const changeAmount = Math.max(0, cashSheet.paid - total);

  return (
    <View style={styles.container}>
      {/* Top bar */}
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

        <View style={{ width: 10 }} />
        <Pressable onPress={() => nav.navigate("History")} style={styles.navBtn}>
          <Text style={styles.navTxt}>Riwayat</Text>
        </Pressable>
        <View style={{ width: 8 }} />
        <Pressable onPress={() => nav.navigate("PrinterSetup")} style={styles.navBtn}>
          <Text style={styles.navTxt}>Printer</Text>
        </Pressable>
        <View style={{ width: 8 }} />
        <Pressable onPress={() => nav.navigate("Report")} style={styles.navBtn}>
          <Text style={styles.navTxt}>Report</Text>
        </Pressable>
      </View>

      {/* Split screen */}
      <View style={styles.body}>
        {/* Left: product grid */}
        <View style={styles.left}>
          <FlashList
            data={products}
            keyExtractor={(p) => p.id}
            numColumns={3}
            estimatedItemSize={100}
            renderItem={({ item }) => (
              <View style={styles.tileWrap}>
                <ProductTile
                  p={item}
                  onPress={() => addItem({ productId: item.id, name: item.name, unitPrice: item.price })}
                />
              </View>
            )}
            ListHeaderComponent={
              <Text style={styles.sectionTitle}>
                {loadingProducts ? "Loading..." : "Produk"}
              </Text>
            }
          />
        </View>

        {/* Right: cart */}
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

          <PrimaryButton
            title="BAYAR & CETAK (UANG PAS)"
            onPress={onPayAndPrintExact}
            disabled={submitting || total <= 0 || lines.length === 0}
            style={{ marginTop: 10 }}
          />

          <View style={{ height: 10 }} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onOpenCashSheet}
              disabled={submitting || total <= 0 || lines.length === 0}
              style={[styles.secondaryBtn, (submitting || total <= 0 || lines.length === 0) && { opacity: 0.5 }]}
            >
              <Text style={styles.secondaryTxt}>Input Uang</Text>
            </Pressable>
            <Pressable
              onPress={() => clear()}
              disabled={submitting}
              style={[styles.secondaryBtn, { backgroundColor: "#fdecec" }, submitting && { opacity: 0.5 }]}
            >
              <Text style={[styles.secondaryTxt, { color: "#a00" }]}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Cash bottom sheet */}
      <Modal
        visible={cashSheet.open}
        transparent
        animationType="fade"
        onRequestClose={() => setCashSheet({ open: false, paid: total })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>PEMBAYARAN (TUNAI)</Text>
            <Text style={styles.sheetLine}>Total: Rp {formatRupiah(total)}</Text>

            <View style={{ height: 10 }} />

            <View style={styles.inputRow}>
              <Text style={{ fontWeight: "800" }}>Uang diterima:</Text>
              <TextInput
                keyboardType="number-pad"
                value={String(cashSheet.paid)}
                onChangeText={(t) => setCashSheet((s) => ({ ...s, paid: Number(t.replace(/\D/g, "")) || 0 }))}
                style={styles.moneyInput}
              />
            </View>

            <Text style={styles.sheetLine}>Kembalian: Rp {formatRupiah(changeAmount)}</Text>

            <View style={{ height: 12 }} />

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {[total, 50000, 100000, 200000].map((v) => (
                <Pressable
                  key={String(v)}
                  onPress={() => setCashSheet((s) => ({ ...s, paid: v }))}
                  style={styles.quickCash}
                >
                  <Text style={{ fontWeight: "900" }}>{v === total ? `${formatRupiah(total)}` : formatRupiah(v)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: 12 }} />

            <PrimaryButton
              title="KONFIRMASI & CETAK"
              onPress={async () => {
                if (cashSheet.paid < total) {
                  Alert.alert("Uang kurang", "Uang diterima harus >= total.");
                  return;
                }
                setCashSheet({ open: false, paid: total });
                await doCheckout(cashSheet.paid);
              }}
              disabled={submitting || lines.length === 0}
            />

            <View style={{ height: 10 }} />

            <Pressable
              onPress={() => setCashSheet({ open: false, paid: total })}
              style={[styles.secondaryBtn, { alignSelf: "stretch" }]}
            >
              <Text style={styles.secondaryTxt}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  top: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  search: { backgroundColor: "#f2f2f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#111" },
  navBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#f2f2f2" },
  navTxt: { fontWeight: "800" },

  body: { flex: 1, flexDirection: "row", paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  left: { flex: 1.25, backgroundColor: "#fff" },
  right: { flex: 1, backgroundColor: "#fff", borderLeftWidth: 1, borderLeftColor: "#eee", paddingLeft: 12 },

  sectionTitle: { fontSize: 16, fontWeight: "900", marginBottom: 8, color: "#111" },
  tileWrap: { flex: 1, padding: 6 },
  cartList: { flex: 1, backgroundColor: "#fff" },

  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontWeight: "900", color: "#111" },
  totalValue: { fontSize: 16, fontWeight: "900", color: "#111" },

  note: { marginTop: 10, backgroundColor: "#f2f2f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#111" },

  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center" },
  secondaryTxt: { fontWeight: "900", color: "#111" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  sheetTitle: { fontWeight: "900", fontSize: 16, marginBottom: 8 },
  sheetLine: { color: "#111", marginTop: 6, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moneyInput: { width: 160, backgroundColor: "#f2f2f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlign: "right", fontWeight: "900" },
  quickCash: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: "#f2f2f2" },
});


⸻

11) Screen: History (untuk reprint)

src/screens/HistoryScreen.tsx (simple, fetch list terakhir):

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { api } from "../api/client";
import { printReceipt58mm } from "../printers/receipt";
import { useCartStore } from "../store/cartStore";

type TxRow = {
  id: string;
  receiptNo: string;
  createdAt: string;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  items: Array<{ name: string; qty: number; unitPrice: number; productId: string }>;
  note?: string;
};

export function HistoryScreen() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<TxRow[]>("/transactions", { params: { limit: 50 } });
      setRows(res.data ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Gagal load riwayat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <Pressable onPress={load} style={styles.refresh}>
        <Text style={styles.refreshTxt}>{loading ? "Loading..." : "Refresh"}</Text>
      </Pressable>

      <FlashList
        data={rows}
        estimatedItemSize={72}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.receiptNo}</Text>
            <Text style={styles.sub}>{new Date(item.createdAt).toLocaleString()}</Text>

            <View style={{ height: 10 }} />
            <Pressable
              onPress={async () => {
                try {
                  await printReceipt58mm({
                    storeName: "TOKO",
                    tx: item,
                    lines: item.items.map((it) => ({
                      productId: it.productId,
                      name: it.name,
                      unitPrice: it.unitPrice,
                      qty: it.qty,
                    })),
                    note: item.note,
                  } as any);
                } catch (e: any) {
                  Alert.alert("Gagal", e?.message ?? "Gagal reprint");
                }
              }}
              style={styles.btn}
            >
              <Text style={styles.btnTxt}>Reprint</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={{ padding: 16, color: "#666" }}>Belum ada transaksi.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 12 },
  refresh: { padding: 12, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center", marginBottom: 10 },
  refreshTxt: { fontWeight: "900" },
  card: { padding: 12, borderRadius: 14, backgroundColor: "#f7f7f7", marginBottom: 10 },
  title: { fontWeight: "900", fontSize: 16 },
  sub: { color: "#555", marginTop: 4 },
  btn: { marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: "#111", alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "900" },
});


⸻

12) Screen: Report Produk Terjual

src/screens/ReportScreen.tsx:

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { api } from "../api/client";
import type { TopProductRow } from "../api/types";
import { formatRupiah } from "../utils/money";

export function ReportScreen() {
  const [rows, setRows] = useState<TopProductRow[]>([]);
  const [loading, setLoading] = useState(false);

  // default: hari ini
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<TopProductRow[]>("/reports/top-products", {
        params: { start: start.toISOString(), end: end.toISOString(), granularity: "daily" },
      });
      setRows(res.data ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Gagal load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <Pressable onPress={load} style={styles.refresh}>
        <Text style={styles.refreshTxt}>{loading ? "Loading..." : "Refresh"}</Text>
      </Pressable>

      <Text style={styles.date}>{start.toLocaleDateString()}</Text>

      <FlashList
        data={rows}
        estimatedItemSize={60}
        keyExtractor={(x) => x.productId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>Terjual: {item.qty} | Omzet: Rp {formatRupiah(item.revenue)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ padding: 16, color: "#666" }}>Belum ada data.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 12 },
  refresh: { padding: 12, borderRadius: 12, backgroundColor: "#f2f2f2", alignItems: "center", marginBottom: 10 },
  refreshTxt: { fontWeight: "900" },
  date: { fontWeight: "900", marginBottom: 8 },
  row: { padding: 12, borderRadius: 14, backgroundColor: "#f7f7f7", marginBottom: 10 },
  name: { fontWeight: "900", fontSize: 15 },
  meta: { marginTop: 6, color: "#555" },
});


⸻

13) Jalankan

yarn android


⸻

14) Kontrak Backend yang diasumsikan (biar RN jalan)

RN code di atas mengasumsikan endpoint:
	•	GET /products?search=&limit=
	•	POST /transactions (create transaksi + items)
	•	GET /transactions?limit=
	•	GET /reports/top-products?start=&end=&granularity=

Kalau backend kamu belum ada, bilang aja kamu mau backend pakai Supabase atau Express dan aku bikinin sekalian. Tapi kamu tadi minta “koding RN lengkap”, jadi aku berhenti di sini biar kamu tidak tenggelam.

⸻

Kenapa aku pilih library ini?

Karena readme-nya jelas dan ada API untuk print text/bill/columns dan mention 58mm ~ 30 char, jadi cocok buat struk standar.  ￼
Walau ya… issue list-nya juga menunjukkan “hidup itu tidak sempurna” untuk printer thermal di RN, jadi kamu tetap harus tes di device/printer kamu.  ￼

⸻

Kalau kamu kirim format JSON produk yang ada di backend kamu (atau schema DB yang kamu pilih), aku bisa sesuaikan mapping endpoint supaya plug-and-play tanpa kamu mikir.