import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartLine, Product } from "../api/types";
import { supabase, uploadStockPhoto } from "../lib/supabase";

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

export type StockChange = {
  id: string;
  productId: string;
  productName: string;
  fromStock: number;
  toStock: number;
  delta: number;
  reason?: string;
  photoUri?: string;
  createdAt: string;
};

type DataState = {
  products: Product[];
  transactions: LocalTransaction[];
  stockChanges: StockChange[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  clearLocalCache: () => Promise<void>;
  setProducts: (products: Product[]) => Promise<void>;
  addStockChanges: (changes: StockChange[]) => Promise<void>;
  addTransaction: (tx: LocalTransaction) => Promise<void>;
  updateTransaction: (localId: string, patch: Partial<LocalTransaction>) => Promise<void>;
  decrementStockByItems: (items: CartLine[]) => Promise<void>;
  syncPendingTransactions: () => Promise<void>;
};

const PRODUCTS_KEY = "local.products.v1";
const TX_KEY = "local.transactions.v1";
const STOCK_CHANGES_KEY = "local.stockChanges.v1";

type SupabaseProductRow = {
  id: number;
  name: string;
  price: number | string | null;
  stock: number | string | null;
  image_url: string | null;
  created_at?: string | null;
};

type SupabaseTransactionItemRow = {
  id: number;
  transaction_id: number;
  product_id: number | string | null;
  product_name: string | null;
  qty: number | string | null;
  price: number | string | null;
  created_at: string | null;
};

type SupabaseTransactionRow = {
  id: number;
  total: number | string | null;
  created_at: string | null;
  transaction_items?: SupabaseTransactionItemRow[] | null;
};

type SupabaseStockHistoryRow = {
  id: number;
  product_id: number | string | null;
  adjustment_type: string | null;
  quantity: number | string | null;
  previous_stock: number | string | null;
  new_stock: number | string | null;
  reason: string | null;
  photo_url: string | null;
  created_at: string | null;
  products?: { name?: string | null } | null;
};

const normalizeProductId = (value: string | number) => {
  const raw = String(value ?? "");
  const match = /^p(\d+)$/i.exec(raw);
  return match ? match[1] : raw;
};

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toNumberId = (value: string | number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;
    const match = trimmed.match(/(\d+)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const toOptionalString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const mapSupabaseProduct = (row: SupabaseProductRow): Product => ({
  id: normalizeProductId(row.id),
  name: row.name ?? "",
  price: toNumber(row.price, 0),
  stock: toNumber(row.stock, 0),
  photoUri: toOptionalString(row.image_url) ?? "",
});

const mapSupabaseTransaction = (row: SupabaseTransactionRow): LocalTransaction => {
  const remoteId = String(row.id);
  const createdAt = row.created_at ?? new Date().toISOString();
  const items: CartLine[] = (row.transaction_items ?? []).map((item) => ({
    productId: normalizeProductId(item.product_id ?? ""),
    name: item.product_name ?? "",
    unitPrice: toNumber(item.price, 0),
    qty: toNumber(item.qty, 0),
  }));
  const computedTotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const totalAmount = toNumber(row.total, computedTotal);
  return {
    localId: `remote-${remoteId}`,
    idempotencyKey: `remote-${remoteId}`,
    receiptNo: `TRX-${remoteId}`,
    createdAt,
    totalAmount,
    paidAmount: totalAmount,
    changeAmount: 0,
    paymentMethod: "CASH",
    items,
    status: "synced",
    remoteId,
  };
};

const mapSupabaseStockChange = (row: SupabaseStockHistoryRow): StockChange => {
  const qty = Math.abs(toNumber(row.quantity, 0));
  const isReduce = String(row.adjustment_type).toUpperCase() === "REDUCE";
  const delta = isReduce ? -qty : qty;
  return {
    id: String(row.id),
    productId: normalizeProductId(row.product_id ?? ""),
    productName: row.products?.name ?? "",
    fromStock: toNumber(row.previous_stock, 0),
    toStock: toNumber(row.new_stock, 0),
    delta,
    reason: toOptionalString(row.reason),
    photoUri: toOptionalString(row.photo_url),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
};

const makeStockChangeKey = (change: StockChange) =>
  `${normalizeProductId(change.productId)}|${change.createdAt}|${change.fromStock}|${change.toStock}|${change.delta}|${change.reason ?? ""}`;

const mergeTransactions = (local: LocalTransaction[], remote: LocalTransaction[]) => {
  const map = new Map<string, LocalTransaction>();
  remote.forEach((tx) => {
    const key = tx.remoteId ? `remote:${tx.remoteId}` : `local:${tx.localId}`;
    map.set(key, tx);
  });
  local.forEach((tx) => {
    const key = tx.remoteId ? `remote:${tx.remoteId}` : `local:${tx.localId}`;
    map.set(key, tx);
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

const mergeStockChanges = (local: StockChange[], remote: StockChange[]) => {
  const map = new Map<string, StockChange>();
  remote.forEach((change) => map.set(makeStockChangeKey(change), change));
  local.forEach((change) => map.set(makeStockChangeKey(change), change));
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

async function fetchSupabaseProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,stock,image_url,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapSupabaseProduct(row as SupabaseProductRow));
}

async function fetchSupabaseTransactions(): Promise<LocalTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,total,created_at,transaction_items(id,product_id,product_name,qty,price,created_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapSupabaseTransaction(row as SupabaseTransactionRow));
}

async function fetchSupabaseStockChanges(): Promise<StockChange[]> {
  const { data, error } = await supabase
    .from("stock_history")
    .select(
      "id,product_id,adjustment_type,quantity,previous_stock,new_stock,reason,photo_url,created_at,products(name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapSupabaseStockChange(row as SupabaseStockHistoryRow));
}

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
  stockChanges: [],
  hydrated: false,
  hydrate: async () => {
    const localProducts = (await loadJson<Product[]>(PRODUCTS_KEY, [])).map((p) => ({
      ...p,
      id: normalizeProductId(p.id),
      stock: typeof p.stock === "number" ? p.stock : toNumber(p.stock, 0),
      photoUri: typeof p.photoUri === "string" ? p.photoUri : "",
    }));
    const localTransactions = (await loadJson<LocalTransaction[]>(TX_KEY, [])).map((tx) => ({
      paymentMethod: "CASH",
      ...tx,
      items: (tx.items ?? []).map((item) => ({
        ...item,
        productId: normalizeProductId(item.productId),
        unitPrice: toNumber(item.unitPrice, 0),
        qty: toNumber(item.qty, 0),
      })),
    }));
    const localStockChanges = (await loadJson<StockChange[]>(STOCK_CHANGES_KEY, [])).map((change) => ({
      ...change,
      productId: normalizeProductId(change.productId),
    }));

    let products = localProducts;
    let transactions = localTransactions;
    let stockChanges = localStockChanges;
    let hasError = false;
    let errorMessage = "";

    try {
      const remoteProducts = await fetchSupabaseProducts();
      console.log("[Supabase] Fetched products:", remoteProducts.length);
      // Selalu gunakan data dari server (meskipun kosong)
      products = remoteProducts;
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    } catch (error: any) {
      hasError = true;
      errorMessage = error?.message || "Gagal fetch products dari server";
      console.error("[Supabase] Error fetching products:", error);
      // Keep local cache on Supabase error.
    }

    try {
      const remoteTransactions = await fetchSupabaseTransactions();
      console.log("[Supabase] Fetched transactions:", remoteTransactions.length);
      // Merge: keep pending local transactions, replace synced with remote
      const pendingLocal = localTransactions.filter((t) => t.status === "pending");
      transactions = mergeTransactions(pendingLocal, remoteTransactions);
      await AsyncStorage.setItem(TX_KEY, JSON.stringify(transactions));
    } catch (error: any) {
      hasError = true;
      errorMessage = errorMessage || error?.message || "Gagal fetch transactions dari server";
      console.error("[Supabase] Error fetching transactions:", error);
      // Keep local cache on Supabase error.
    }

    try {
      const remoteChanges = await fetchSupabaseStockChanges();
      console.log("[Supabase] Fetched stock changes:", remoteChanges.length);
      // Selalu gunakan data dari server
      stockChanges = remoteChanges;
      await AsyncStorage.setItem(STOCK_CHANGES_KEY, JSON.stringify(stockChanges));
    } catch (error: any) {
      hasError = true;
      errorMessage = errorMessage || error?.message || "Gagal fetch stock history dari server";
      console.error("[Supabase] Error fetching stock changes:", error);
      // Keep local cache on Supabase error.
    }

    set({ products, transactions, stockChanges, hydrated: true });

    if (hasError) {
      throw new Error(errorMessage || "Gagal sinkronisasi dengan server. Menggunakan data lokal.");
    }
  },
  clearLocalCache: async () => {
    console.log("[Cache] Clearing all local cache...");
    await AsyncStorage.removeItem(PRODUCTS_KEY);
    await AsyncStorage.removeItem(TX_KEY);
    await AsyncStorage.removeItem(STOCK_CHANGES_KEY);
    set({ products: [], transactions: [], stockChanges: [], hydrated: false });
    console.log("[Cache] Local cache cleared");
  },
  setProducts: async (products) => {
    const normalized = products.map((p) => ({
      ...p,
      id: normalizeProductId(p.id),
      stock: typeof p.stock === "number" ? p.stock : toNumber(p.stock, 0),
      photoUri: typeof p.photoUri === "string" ? p.photoUri : "",
    }));
    set({ products: normalized });
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));

    try {
      const payload: Array<{
        id: number;
        name: string;
        price: number;
        stock: number;
        image_url: string | null;
      }> = [];

      for (const p of normalized) {
        const id = toNumberId(p.id);
        if (!id) continue;

        let imageUrl: string | null = toOptionalString(p.photoUri) ?? null;
        if (imageUrl && !imageUrl.startsWith("http")) {
          const uploadedUrl = await uploadStockPhoto(imageUrl);
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
          }
        }

        payload.push({
          id,
          name: p.name,
          price: toNumber(p.price, 0),
          stock: toNumber(p.stock, 0),
          image_url: imageUrl,
        });
      }

      if (payload.length > 0) {
        await supabase.from("products").upsert(payload, { onConflict: "id" });
      }
    } catch {
      // Ignore Supabase errors for local save.
    }
  },
  addStockChanges: async (changes) => {
    const normalized = changes.map((change) => ({
      ...change,
      productId: normalizeProductId(change.productId),
    }));
    const next = [...normalized, ...get().stockChanges];
    set({ stockChanges: next });
    await AsyncStorage.setItem(STOCK_CHANGES_KEY, JSON.stringify(next));

    try {
      const payload: Array<{
        product_id: number;
        adjustment_type: string;
        quantity: number;
        previous_stock: number;
        new_stock: number;
        reason: string | null;
        photo_url: string | null;
        created_at: string;
      }> = [];

      for (const change of normalized) {
        const productId = toNumberId(change.productId);
        if (!productId) continue;

        const adjustmentType = change.delta >= 0 ? "ADD" : "REDUCE";
        let photoUrl: string | null = toOptionalString(change.photoUri) ?? null;

        if (photoUrl && !photoUrl.startsWith("http")) {
          const uploadedUrl = await uploadStockPhoto(photoUrl);
          if (uploadedUrl) {
            photoUrl = uploadedUrl;
          }
        }

        payload.push({
          product_id: productId,
          adjustment_type: adjustmentType,
          quantity: Math.abs(change.delta),
          previous_stock: toNumber(change.fromStock, 0),
          new_stock: toNumber(change.toStock, 0),
          reason: toOptionalString(change.reason) ?? null,
          photo_url: photoUrl,
          created_at: change.createdAt,
        });
      }

      if (payload.length > 0) {
        await supabase.from("stock_history").insert(payload);
      }
    } catch {
      // Ignore Supabase errors for local save.
    }
  },
  addTransaction: async (tx) => {
    const normalized: LocalTransaction = {
      ...tx,
      items: (tx.items ?? []).map((item) => ({
        ...item,
        productId: normalizeProductId(item.productId),
      })),
    };
    const next = [normalized, ...get().transactions];
    set({ transactions: next });
    await AsyncStorage.setItem(TX_KEY, JSON.stringify(next));
  },
  decrementStockByItems: async (items) => {
    const normalizedItems = items.map((item) => ({
      ...item,
      productId: normalizeProductId(item.productId),
    }));
    const next = get().products.map((p) => {
      const line = normalizedItems.find((it) => it.productId === p.id);
      if (!line) return p;
      const current = typeof p.stock === "number" ? p.stock : 0;
      return { ...p, stock: Math.max(0, current - line.qty) };
    });
    set({ products: next });
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));

    try {
      const touched = new Set(normalizedItems.map((item) => item.productId));
      const payload = next
        .filter((p) => touched.has(p.id))
        .map((p) => {
          const id = toNumberId(p.id);
          if (!id) return null;
          return { id, stock: toNumber(p.stock, 0) };
        })
        .filter(Boolean) as Array<{ id: number; stock: number }>;
      if (payload.length > 0) {
        await supabase.from("products").upsert(payload, { onConflict: "id" });
      }
    } catch {
      // Ignore Supabase errors for local save.
    }
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
        const createdAt = tx.createdAt || new Date().toISOString();
        const total = Number.isFinite(tx.totalAmount)
          ? tx.totalAmount
          : tx.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

        const { data: inserted, error } = await supabase
          .from("transactions")
          .insert({ total, created_at: createdAt })
          .select("id, created_at")
          .single();

        if (error || !inserted) {
          continue;
        }

        const itemsPayload = tx.items
          .map((item) => {
            const productId = toNumberId(normalizeProductId(item.productId));
            if (!productId) return null;
            return {
              transaction_id: inserted.id,
              product_id: productId,
              product_name: item.name,
              qty: item.qty,
              price: item.unitPrice,
              created_at: createdAt,
            };
          })
          .filter(Boolean) as Array<{
          transaction_id: number;
          product_id: number;
          product_name: string;
          qty: number;
          price: number;
          created_at: string;
        }>;

        if (itemsPayload.length > 0) {
          const { error: itemError } = await supabase
            .from("transaction_items")
            .insert(itemsPayload);
          if (itemError) {
            await supabase.from("transactions").delete().eq("id", inserted.id);
            continue;
          }
        }

        await get().updateTransaction(tx.localId, {
          status: "synced",
          remoteId: String(inserted.id),
          createdAt: inserted.created_at ?? createdAt,
        });
      } catch {
        // Keep pending; sync will retry later.
      }
    }
  },
}));
