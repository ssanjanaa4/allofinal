"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, ShoppingBag, Timer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import {
  ApiClientError,
  confirmReservation,
  releaseReservation,
} from "@/lib/client/api";
import {
  clearStoredReservation,
  getStoredReservation,
  storeReservation,
} from "@/lib/client/reservation-store";
import type { ReservationSummary } from "@/types/inventory";

function formatRemaining(expiresAt: string | null) {
  if (!expiresAt) {
    return "No expiry";
  }

  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Checkout() {
  const router = useRouter();
  const { notify } = useToast();
  const [reservation, setReservation] =
    React.useState<ReservationSummary | null>(null);
  const [remaining, setRemaining] = React.useState("0:00");
  const [busyAction, setBusyAction] = React.useState<"confirm" | "cancel" | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedReservation = getStoredReservation();
    setReservation(storedReservation);
    setRemaining(formatRemaining(storedReservation?.expiresAt ?? null));
  }, []);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(formatRemaining(reservation?.expiresAt ?? null));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [reservation?.expiresAt]);

  const expired =
    reservation?.expiresAt != null &&
    new Date(reservation.expiresAt).getTime() <= Date.now();

  async function confirm() {
    if (!reservation) {
      return;
    }

    setBusyAction("confirm");
    setError(null);

    try {
      const confirmed = await confirmReservation(reservation.id);
      setReservation(confirmed);
      storeReservation(confirmed);
      notify({
        tone: "success",
        title: "Purchase confirmed",
        description: "Inventory was decremented permanently.",
      });
      clearStoredReservation();
      router.refresh();
      router.push("/");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 410) {
        clearStoredReservation();
        setError("410 expired reservation. Stock was released.");
        notify({
          tone: "error",
          title: "410 reservation expired",
          description: requestError.message,
        });
      } else if (
        requestError instanceof ApiClientError &&
        requestError.status === 409
      ) {
        setError("409 state conflict. Refresh inventory before retrying.");
        notify({
          tone: "error",
          title: "409 reservation conflict",
          description: requestError.message,
        });
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not confirm reservation.",
        );
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function cancel() {
    if (!reservation) {
      return;
    }

    setBusyAction("cancel");
    setError(null);

    try {
      const released = await releaseReservation(reservation.id);
      setReservation(released);
      clearStoredReservation();
      notify({
        tone: released.status === "EXPIRED" ? "error" : "success",
        title:
          released.status === "EXPIRED"
            ? "Reservation expired"
            : "Reservation cancelled",
        description: "Held stock is available again.",
      });
      router.refresh();
      router.push("/");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 410) {
        clearStoredReservation();
        setError("410 expired reservation. Stock was released.");
        notify({
          tone: "error",
          title: "410 reservation expired",
          description: requestError.message,
        });
      } else if (
        requestError instanceof ApiClientError &&
        requestError.status === 409
      ) {
        setError("409 state conflict. Reservation cannot be cancelled.");
        notify({
          tone: "error",
          title: "409 reservation conflict",
          description: requestError.message,
        });
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not cancel reservation.",
        );
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-full bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between border-b pb-5">
          <div>
            <h1 className="text-2xl font-semibold">Checkout</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirm the held inventory before the timer reaches zero.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/">Inventory</Link>
          </Button>
        </div>

        {!reservation ? (
          <div className="rounded-md border bg-card p-6 text-card-foreground">
            <p className="font-medium">No active reservation</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reserve an item from the inventory page to start checkout.
            </p>
          </div>
        ) : (
          <div className="rounded-md border bg-card p-5 text-card-foreground">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {reservation.product.sku}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {reservation.product.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {reservation.warehouse.name} - {reservation.warehouse.code}
                </p>
              </div>
              <div className="rounded-md border px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Timer className="size-4" />
                  expires in
                </div>
                <p className="mt-1 text-2xl font-semibold">{remaining}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">Quantity</p>
                <p className="text-lg font-semibold">{reservation.quantity}</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">Available now</p>
                <p className="text-lg font-semibold">
                  {reservation.inventory.availableStock}
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-lg font-semibold">{reservation.status}</p>
              </div>
            </div>

            {error ? (
              <div className="mt-5 flex items-center gap-3 rounded-md border border-destructive p-4 text-sm">
                <AlertTriangle className="size-5 text-destructive" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="flex-1"
                disabled={Boolean(busyAction) || expired}
                onClick={() => void confirm()}
              >
                {busyAction === "confirm" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShoppingBag className="size-4" />
                )}
                Confirm purchase
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => void cancel()}
              >
                {busyAction === "cancel" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
