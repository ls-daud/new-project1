import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { BLEPrinter } from "react-native-thermal-receipt-printer-image-qr";

export type BtDevice = { name: string; address: string };

let bleInitPromise: Promise<void> | null = null;

async function ensureBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    const denied = Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied) {
      throw new Error("Izin Bluetooth belum diberikan.");
    }
    return;
  }
  const locationGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (locationGranted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Izin lokasi dibutuhkan untuk Bluetooth.");
  }
}

async function ensureBleReady(): Promise<void> {
  if (!NativeModules?.RNBLEPrinter || !BLEPrinter || typeof BLEPrinter.init !== "function") {
    throw new Error("Printer Bluetooth hanya tersedia di perangkat fisik. Emulator tidak mendukung.");
  }
  await ensureBluetoothPermissions();
  if (!bleInitPromise) {
    bleInitPromise = BLEPrinter.init().catch((err) => {
      bleInitPromise = null;
      throw err;
    });
  }
  await bleInitPromise;
}

export async function listBluetoothDevices(): Promise<BtDevice[]> {
  if (!BLEPrinter || typeof BLEPrinter.getDeviceList !== "function") {
    throw new Error("Printer Bluetooth hanya tersedia di perangkat fisik. Emulator tidak mendukung.");
  }
  await ensureBleReady();
  const list = await BLEPrinter.getDeviceList();
  return (Array.isArray(list) ? list : []).map((d: any) => ({
    name: String(d?.device_name ?? d?.name ?? "Printer"),
    address: String(d?.inner_mac_address ?? d?.address ?? d?.macAddress ?? ""),
  }));
}

export async function connectBluetoothPrinter(address: string): Promise<void> {
  if (!address) throw new Error("Printer address is empty");
  await ensureBleReady();
  await BLEPrinter.connectPrinter(address);
}
