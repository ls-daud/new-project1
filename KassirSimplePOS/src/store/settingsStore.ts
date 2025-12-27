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
