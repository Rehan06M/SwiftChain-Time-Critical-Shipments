import { z } from "zod";
import { distanceKm } from "./eta.service.js";

const pointSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

export const recoveryPlanSchema = z.object({
  label: z.string(),
  points: z.array(pointSchema).min(3).max(20),
  travelMinutes: z.array(z.number().finite().nonnegative()),
  handoffMinutes: z.number().finite().nonnegative(),
}).refine(
  (plan) =>
    plan.travelMinutes.length === plan.points.length - 1,
  "Each route segment needs a travel duration"
);

export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>;
export type RoutePoint = [number, number];

export function measureRecoveryRoute(
  plan: RecoveryPlan,
  current: RoutePoint
) {
  const distances = plan.points.slice(1).map((point, index) =>
    distanceKm(
      plan.points[index]![1],
      plan.points[index]![0],
      point[1],
      point[0]
    )
  );

  let bestIndex = 0;
  let bestFraction = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < plan.points.length - 1; index++) {
    const start = plan.points[index]!;
    const end = plan.points[index + 1]!;

    const scale = Math.cos(current[1] * Math.PI / 180);
    const dx = (end[0] - start[0]) * scale;
    const dy = end[1] - start[1];
    const px = (current[0] - start[0]) * scale;
    const py = current[1] - start[1];

    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
      : 0;

    const projected: RoutePoint = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];

    const distance = distanceKm(
      current[1], current[0],
      projected[1], projected[0]
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
      bestFraction = fraction;
    }
  }

  let remainingDistanceKm = 0;
  let remainingTravelMinutes = 0;

  for (let index = bestIndex; index < distances.length; index++) {
    const fraction = index === bestIndex
      ? 1 - bestFraction
      : 1;

    remainingDistanceKm += distances[index]! * fraction;
    remainingTravelMinutes += plan.travelMinutes[index]! * fraction;
  }

  const progressedKm =
    distances.slice(0, bestIndex).reduce((a, b) => a + b, 0) +
    distances[bestIndex]! * bestFraction;

  // The first segment approaches the transfer hub.
  // Keep the handoff allowance until the location passes the hub.
  const handoffMinutes =
    progressedKm <= distances[0]! + 0.05
      ? plan.handoffMinutes
      : 0;

  return {
    remainingDistanceKm,
    remainingTravelMinutes,
    handoffMinutes,
    offRouteKm: bestDistance,
  };
}