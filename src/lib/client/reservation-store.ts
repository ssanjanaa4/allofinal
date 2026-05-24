import type { ReservationSummary } from "@/types/inventory";

const reservationStorageKey = "allofinal.activeReservation";

export function getStoredReservation() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(reservationStorageKey);

  return value ? (JSON.parse(value) as ReservationSummary) : null;
}

export function storeReservation(reservation: ReservationSummary) {
  window.localStorage.setItem(
    reservationStorageKey,
    JSON.stringify(reservation),
  );
}

export function clearStoredReservation() {
  window.localStorage.removeItem(reservationStorageKey);
}
