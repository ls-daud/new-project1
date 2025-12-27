import { Printer } from "react-native-thermal-receipt-printer-image-qr";

export type BtDevice = { name: string; address: string };

export async function listBluetoothDevices(): Promise<BtDevice[]> {
  const list = await Printer.getDeviceList();
  return (Array.isArray(list) ? list : []).map((d: any) => ({
    name: String(d?.device_name ?? d?.name ?? "Printer"),
    address: String(d?.inner_mac_address ?? d?.address ?? d?.macAddress ?? ""),
  }));
}

export async function connectBluetoothPrinter(address: string): Promise<void> {
  if (!address) throw new Error("Printer address is empty");
  return;
}
