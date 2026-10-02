"use client";

import { useEffect, useState } from "react";

export type BookingOffer = {
  id: string;
  title: string;
  detail: string;
  nightlyPrice: number;
};

const money = (amount: number) =>
  `MWK ${Math.round(amount).toLocaleString("en-US")}`;

export function useBookingOffers() {
  const [offers, setOffers] = useState<BookingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/booking-offers", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load optional offers.");
        if (!Array.isArray(data.offers)) throw new Error("The booking offers response was invalid.");
        const items = data.offers as unknown[];
        if (!items.every((item) =>
          item !== null &&
          typeof item === "object" &&
          "id" in item && typeof item.id === "string" &&
          "title" in item && typeof item.title === "string" &&
          "detail" in item && typeof item.detail === "string" &&
          "nightlyPrice" in item && Number.isSafeInteger(item.nightlyPrice) && Number(item.nightlyPrice) >= 0,
        )) {
          throw new Error("The booking offers response contained invalid prices.");
        }
        return items as BookingOffer[];
      })
      .then((items) => {
        if (!cancelled) setOffers(items);
      })
      .catch((reason: unknown) => {
        console.error("Booking offer request failed", reason);
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load optional offers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { offers, loading, error };
}

export function BookingOfferOptions({
  offers,
  loading,
  error,
  nights,
  selectedIds,
  onSelectionChange,
}: {
  offers: BookingOffer[];
  loading: boolean;
  error: string;
  nights: number;
  selectedIds: string[];
  onSelectionChange: (offerId: string, checked: boolean) => void;
}) {
  if (loading) return <p className="booking-offers-status" role="status">Checking optional booking offers…</p>;
  if (error) return <p className="booking-offers-status" role="status">Optional offers could not be loaded: {error}</p>;
  if (offers.length === 0) return null;

  return (
    <fieldset className="booking-offers-select">
      <legend>Optional motel offers</legend>
      {offers.map((offer) => (
        <label className="booking-offer-option" key={offer.id}>
          <span>
            <strong>{offer.title}</strong>
            <small>{money(offer.nightlyPrice)} per room-night · {money(offer.nightlyPrice * nights)} for {nights} night{nights === 1 ? "" : "s"}</small>
            <span>{offer.detail}</span>
          </span>
          <input
            type="checkbox"
            checked={selectedIds.includes(offer.id)}
            onChange={(event) => onSelectionChange(offer.id, event.currentTarget.checked)}
            aria-label={`Add ${offer.title} to booking`}
          />
        </label>
      ))}
    </fieldset>
  );
}
