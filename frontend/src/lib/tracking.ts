import { apiRequest } from "./api";

export type TrackingMilestone =
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "delayed"
  | "exception";

export interface TrackingEvent {
  id: string;
  eventType: "milestone" | "location";
  milestone: TrackingMilestone | null;
  latitude: number | null;
  longitude: number | null;
  message: string | null;
  source: "driver" | "simulator" | "system";
  occurredAt: string;
}

export interface RecoveryRoute {
  label: string;
  points: [number, number][];
  travelMinutes: number[];
  handoffMinutes: number;
}

export interface TrackingData {
  shipment: {
    id: string;
    trackingCode: string;
    status: "created" | "booked" | "cancelled";
    originCity: string;
    destinationCity: string;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
    routeRevision: number;
recoveryRoute: RecoveryRoute | null;
  };
  trackingStatus: string;
  latestLocation: {
    latitude: number;
    longitude: number;
    occurredAt: string;
    source: string;
  } | null;
  events: TrackingEvent[];
}

export type TrackingUpdate =
  | {
      eventType: "location";
      latitude: number;
      longitude: number;
      message?: string;
    }
  | {
      eventType: "milestone";
      milestone:
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered";
      message?: string;
    };

export function getTracking(shipmentId: string) {
  return apiRequest<TrackingData>(
    `/tracking/${encodeURIComponent(shipmentId)}`
  );
}

export function saveTrackingUpdate(
  shipmentId: string,
  update: TrackingUpdate
) {
  return apiRequest<{
    message: string;
    eventId: string;
  }>(
    `/tracking/${encodeURIComponent(shipmentId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(update),
    }
  );
}

export function saveTrackingRoute(
  shipmentId: string,
  coordinates: {
    originLatitude: number;
    originLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
  }
) {
  return apiRequest<{ message: string }>(
    `/tracking/${encodeURIComponent(shipmentId)}/route`,
    {
      method: "PUT",
      body: JSON.stringify(coordinates),
    }
  );
}