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
