
import { apiRequest } from "./api";

export interface PriceBreakdown {
  baseCostInr: number;
  urgencyPercentage: number;
  urgencySurchargeInr: number;
  specialHandlingInr: number;
  afterHoursInr: number;
  additionalServicesInr: number;
  totalCostInr: number;
}

export interface DeliveryQuote {
  id: string;
  tier: "Economy" | "Express" | "Critical";
  carrierName: string;
  carrierLaneId: string;
  transportMode: "ground" | "air_ground";
  reliability: number;
  matchingScore: number;
  estimatedMinutes: number;
  estimatedArrival: string;
  meetsDeadline: boolean;
  minutesBeforeDeadline: number;
  price: PriceBreakdown;
  expiresAt: string;
}

export interface QuoteResponse {
  shipmentId: string;
  urgencyScore: number;
  urgencyLevel: string;
  estimatedOnly: boolean;
  quotes: DeliveryQuote[];
}

export interface Booking {
  id: string;
  shipmentId: string;
  trackingCode?: string;
  carrierName: string;
  tier: string;
  totalCostInr: number;
  estimatedArrival: string;
  status: "confirmed";
  createdAt?: string;
}

export function calculateQuotes(
  shipmentId: string,
  options: {
    specialHandling: boolean;
    afterHours: boolean;
  }
) {
  return apiRequest<QuoteResponse>(
    `/commerce/quotes/${encodeURIComponent(shipmentId)}`,
    {
      method: "POST",
      body: JSON.stringify(options),
      cache: "no-store",
    }
  );
}

export function confirmBooking(quoteId: string) {
  return apiRequest<{
    message: string;
    booking: Booking;
  }>("/commerce/bookings", {
    method: "POST",
    body: JSON.stringify({ quoteId }),
  });
}

export function getBooking(shipmentId: string) {
  return apiRequest<{ booking: Booking }>(
    `/commerce/bookings/${encodeURIComponent(shipmentId)}`,
    { cache: "no-store" }
  );
}
