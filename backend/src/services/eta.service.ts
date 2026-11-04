import { z } from "zod";

const predictionSchema = z.object({
  shipment_id: z.string(),
  calculated_at: z.string().datetime({ offset: true }),
  estimated_arrival: z.string().datetime({ offset: true }),
  remaining_minutes: z.number().finite().nonnegative(),
  slack_minutes: z.number().finite(),
  predicted_late_by_minutes: z.number().finite().nonnegative(),
  risk_status: z.enum([
    "On Track",
    "At Risk",
    "Critical Risk",
    "Delayed",
  ]),
  explanation: z.string(),
  model_version: z.string(),
});

export function distanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
) {
  const radians = (degrees: number) =>
    degrees * Math.PI / 180;

  const latitudeDifference = radians(latitude2 - latitude1);
  const longitudeDifference = radians(longitude2 - longitude1);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitude1)) *
      Math.cos(radians(latitude2)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 6371 * 2 * Math.asin(
    Math.sqrt(Math.min(1, Math.max(0, a)))
  );
}

export async function predictETA(input: {
  shipment_id: string;
  deadline: string;
  remaining_distance_km: number;
  average_speed_kmh: number;
  pickup_minutes: number;
}) {
  const baseUrl =
    process.env.INTELLIGENCE_SERVICE_URL ??
    "http://127.0.0.1:8000";

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/predict/eta`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Intelligence service returned ${response.status}`
    );
  }

  return predictionSchema.parse(await response.json());
}