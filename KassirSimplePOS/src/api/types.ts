export type Product = {
  id: string;
  name: string;
  price: number; // rupiah integer
  category?: string | null;
  isActive?: boolean;
  stock?: number;
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
  paymentMethod: "CASH" | "QRIS";
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
  paymentMethod?: "CASH" | "QRIS";
};

export type TopProductRow = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
};
