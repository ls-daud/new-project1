import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartLine, Product, TransactionCreateRequest, TransactionCreateResponse } from "../api/types";
import { api } from "../api/client";

export type LocalTransaction = {
  localId: string;
  idempotencyKey: string;
  receiptNo: string;
  createdAt: string;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: "CASH" | "QRIS";
  items: CartLine[];
  note?: string;
  status: "pending" | "synced";
  remoteId?: string;
};

type DataState = {
  products: Product[];
  transactions: LocalTransaction[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setProducts: (products: Product[]) => Promise<void>;
  addTransaction: (tx: LocalTransaction) => Promise<void>;
  updateTransaction: (localId: string, patch: Partial<LocalTransaction>) => Promise<void>;
  decrementStockByItems: (items: CartLine[]) => Promise<void>;
  syncPendingTransactions: () => Promise<void>;
};

const PRODUCTS_KEY = "local.products.v1";
const TX_KEY = "local.transactions.v1";

const seedProducts: Product[] = [
  { id: "p1", name: "Indomie", price: 20000, stock: 24 },
  { id: "p2", name: "Sedang Jahe", price: 15000, stock: 18 },
  { id: "p3", name: "Teh Manis", price: 8000, stock: 30 },
  { id: "p4", name: "Kopi Hitam", price: 12000, stock: 14 },
  { id: "p5", name: "Air Mineral", price: 5000, stock: 40 },
  { id: "p6", name: "Roti Bakar", price: 18000, stock: 10 },
];

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const useDataStore = create<DataState>((set, get) => ({
  products: [],
  transactions: [],
  hydrated: false,
  hydrate: async () => {
    const products = (await loadJson<Product[]>(PRODUCTS_KEY, seedProducts)).map((p) => ({
      ...p,
      stock: typeof p.stock === "number" ? p.stock : 0,
    }));
    const transactions = (await loadJson<LocalTransaction[]>(TX_KEY, [])).map((tx) => ({
      paymentMethod: "CASH",
      ...tx,
    }));
    if (products.length === 0) {
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(seedProducts));
      set({ products: seedProducts, transactions, hydrated: true });
      return;
    }
    set({ products, transactions, hydrated: true });
  },
  setProducts: async (products) => {
    set({ products });
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  },
  addTransaction: async (tx) => {
    const next = [tx, ...get().transactions];
    set({ transactions: next });
    await AsyncStorage.setItem(TX_KEY, JSON.stringify(next));
  },
  decrementStockByItems: async (items) => {
    const next = get().products.map((p) => {
      const line = items.find((it) => it.productId === p.id);
      if (!line) return p;
      const current = typeof p.stock === "number" ? p.stock : 0;
      return { ...p, stock: Math.max(0, current - line.qty) };
    });
    set({ products: next });
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
  },
  updateTransaction: async (localId, patch) => {
    const next = get().transactions.map((t) => (t.localId === localId ? { ...t, ...patch } : t));
    set({ transactions: next });
    await AsyncStorage.setItem(TX_KEY, JSON.stringify(next));
  },
  syncPendingTransactions: async () => {
    const pending = get().transactions.filter((t) => t.status === "pending");
    for (const tx of pending) {
      try {
        const req: TransactionCreateRequest = {
          idempotencyKey: tx.idempotencyKey,
          paymentMethod: tx.paymentMethod,
          paidAmount: tx.paidAmount,
          note: tx.note,
          items: tx.items.map((it) => ({
            productId: it.productId,
            qty: it.qty,
            unitPrice: it.unitPrice,
          })),
        };
        const res = await api.post<TransactionCreateResponse>("/transactions", req, {
          headers: { "Idempotency-Key": tx.idempotencyKey },
        });
        const data = res.data;
        await get().updateTransaction(tx.localId, {
          status: "synced",
          remoteId: data.id,
          receiptNo: data.receiptNo,
          createdAt: data.createdAt,
          totalAmount: data.totalAmount,
          paidAmount: data.paidAmount,
          changeAmount: data.changeAmount,
          paymentMethod: data.paymentMethod ?? tx.paymentMethod,
        });
      } catch {
        // Keep pending; sync will retry later.
      }
    }
  },
}));
