
import { apiRequest } from "./api";

export type CargoType =
  | "medical"
  | "aviation"
  | "manufacturing"
  | "electronics"
  | "events"
  | "general";

export interface ShipmentInput {
  originCity: string;
  originAddress: string;
  destinationCity: string;
  destinationAddress: string;
  cargoDescription: string;
  cargoType: CargoType;
  weightKg: number;
  deadline: string;
  delayCostPerHour: number;
  notes: string;
}


export type UrgencyLevel =
  | "Critical"
  | "High"
  | "Medium"
  | "Low";

export interface UrgencyResult {
  score: number;
  level: UrgencyLevel;

  breakdown: {
    deadlineScore: number;
    impactScore: number;
    cargoScore: number;

    deadlineContribution: number;
    impactContribution: number;
    cargoContribution: number;

    hoursRemaining: number;
    isOverdue: boolean;
  };

  calculatedAt: string;
}


export interface Shipment extends ShipmentInput {
  id: string;
  trackingCode: string;
  organizationId: string;
  status: "created" | "cancelled";
  createdAt: string;
  updatedAt: string;

  urgency: UrgencyResult;

  storedUrgencyScore: number | null;
  storedUrgencyLevel: UrgencyLevel | null;
  storedUrgencyCalculatedAt: string | null;

}

export function listShipments() {
  return apiRequest<{ shipments: Shipment[] }>(
    "/shipments"
  );
}

export function getShipment(id: string) {
  return apiRequest<{ shipment: Shipment }>(
    `/shipments/${id}`
  );
}

export function createShipment(input: ShipmentInput) {
  return apiRequest<{ shipment: Shipment }>(
    "/shipments",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export function updateShipment(
  id: string,
  input: ShipmentInput
) {
  return apiRequest<{ shipment: Shipment }>(
    `/shipments/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
}

export function cancelShipment(id: string) {
  return apiRequest<{ message: string }>(
    `/shipments/${id}/cancel`,
    {
      method: "PATCH",
    }
  );
}
