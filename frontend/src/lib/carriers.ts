
import { apiRequest } from "./api";

export interface Carrier {
  id: string;
  name: string;
  onTimePercentage: number;
  maxWeightKg: number;
  supportedCargoTypes: string[];
  isActive: boolean;
}

export interface CarrierMatch {
  rank: number;
  laneId: string;
  carrierId: string;
  carrierName: string;
  contactEmail: string | null;

  transportMode: "ground" | "air_ground";

  reliability: number;
  estimatedMinutes: number;
  estimatedArrival: string;
  estimatedCostInr: number;

  meetsDeadline: boolean;
  minutesBeforeDeadline: number;
  matchingScore: number;

  breakdown: {
    deadline: number;
    speed: number;
    reliability: number;
    cost: number;
  };

  recommendation: string;
}

export interface CarrierMatchingResponse {
  shipmentId: string;
  urgencyScore: number;
  urgencyLevel: string;
  calculatedAt: string;
  estimatedOnly: boolean;
  matches: CarrierMatch[];
}

export function getCarriers() {
  return apiRequest<{ carriers: Carrier[] }>(
    "/carriers"
  );
}

export function getCarrierMatches(shipmentId: string) {
  return apiRequest<CarrierMatchingResponse>(
    `/carriers/match/${encodeURIComponent(shipmentId)}`,
    { cache: "no-store" }
  );
}
