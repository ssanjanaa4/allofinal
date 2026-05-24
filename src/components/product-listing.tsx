"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PackageCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import {
  ApiClientError,
  createReservation,
  getProducts,
} from "@/lib/client/api";
import { storeReservation } from "@/lib/client/reservation-store";
import type { ProductSummary, WarehouseStock } from "@/types/inventory";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getBestWarehouse(product: ProductSummary) {
  return product.warehouses
    .filter((warehouse) => warehouse.availableStock > 0)
    .sort((a, b) => b.availableStock - a.availableStock)[0];
}

function StockLine({ warehouse }: { warehouse: WarehouseStock }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{warehouse.warehouseName}</p>
        <p className="text-xs text-muted-foreground">
          {warehouse.warehouseCode} - {warehouse.city}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold">{warehouse.availableStock}</p>
        <p className="text-xs text-muted-foreground">available</p>
      </div>
    </div>
  );
}

export function ProductListing() {
  const router = useRouter();
  const { notify } = useToast();
  const [products, setProducts] = React.useState<ProductSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [reservingProductId, setReservingProductId] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadProducts = React.useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setProducts(await getProducts());
      setError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not load products.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProducts();
    const interval = window.setInterval(() => void loadProducts(true), 10000);

    return () => window.clearInterval(interval);
  }, [loadProducts]);

  async function reserve(product: ProductSummary) {
    const warehouse = getBestWarehouse(product);

    if (!warehouse) {
      notify({
        tone: "error",
        title: "No stock available",
        description: "This product is currently sold out across warehouses.",
      });
      return;
    }

    setReservingProductId(product.id);
    setProducts((current) =>
      current.map((item) =>
        item.id === product.id
          ? {
              ...item,
              availableStock: Math.max(0, item.availableStock - 1),
              reservedStock: item.reservedStock + 1,
              warehouses: item.warehouses.map((stock) =>
                stock.warehouseId === warehouse.warehouseId
                  ? {
                      ...stock,
                      availableStock: Math.max(0, stock.availableStock - 1),
                      reservedStock: stock.reservedStock + 1,
                    }
                  : stock,
              ),
            }
          : item,
      ),
    );

    try {
      const reservation = await createReservation({
        productId: product.id,
        warehouseId: warehouse.warehouseId,
        quantity: 1,
      });

      storeReservation(reservation);
      notify({
        tone: "success",
        title: "Reservation created",
        description: "Stock is held while the checkout timer runs.",
      });
      router.push("/checkout");
    } catch (requestError) {
      void loadProducts(true);

      if (requestError instanceof ApiClientError && requestError.status === 409) {
        notify({
          tone: "error",
          title: "409 insufficient stock",
          description: requestError.message,
        });
      } else {
        notify({
          tone: "error",
          title: "Reservation failed",
          description:
            requestError instanceof Error
              ? requestError.message
              : "Please try again.",
        });
      }
    } finally {
      setReservingProductId(null);
    }
  }

  return (
    <main className="min-h-full bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Inventory</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserve stock from the best available warehouse and finish checkout
              before the hold expires.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadProducts(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-3 rounded-md border border-destructive p-4 text-sm">
            <AlertTriangle className="size-5 text-destructive" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-md border bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const reserving = reservingProductId === product.id;
              const canReserve = product.availableStock > 0 && !reserving;

              return (
                <article
                  key={product.id}
                  className="flex min-h-80 flex-col rounded-md border bg-card p-4 text-card-foreground"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {product.sku}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">
                        {product.name}
                      </h2>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {formatCurrency(product.priceInCents)}
                    </p>
                  </div>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                    {product.description}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{product.totalStock}</p>
                      <p className="text-xs text-muted-foreground">total</p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{product.reservedStock}</p>
                      <p className="text-xs text-muted-foreground">held</p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="font-semibold">{product.availableStock}</p>
                      <p className="text-xs text-muted-foreground">ready</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {product.warehouses.map((warehouse) => (
                      <StockLine
                        key={warehouse.warehouseId}
                        warehouse={warehouse}
                      />
                    ))}
                  </div>

                  <Button
                    type="button"
                    className="mt-auto w-full"
                    disabled={!canReserve}
                    onClick={() => void reserve(product)}
                  >
                    {reserving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PackageCheck className="size-4" />
                    )}
                    {product.availableStock > 0 ? "Reserve" : "Sold out"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
