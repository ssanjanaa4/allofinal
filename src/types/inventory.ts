export type WarehouseStock = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  city: string;
  country: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
};

export type ProductSummary = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceInCents: number;
  isActive: boolean;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  warehouses: WarehouseStock[];
  createdAt: string;
  updatedAt: string;
};

export type ReservationSummary = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  quantity: number;
  idempotencyKey: string | null;
  expiresAt: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
  };
  warehouse: {
    id: string;
    code: string;
    name: string;
  };
  inventory: {
    id: string;
    totalStock: number;
    reservedStock: number;
    availableStock: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type ApiEnvelope<TData, TMeta = Record<string, unknown>> = {
  data: TData;
  meta?: TMeta;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
