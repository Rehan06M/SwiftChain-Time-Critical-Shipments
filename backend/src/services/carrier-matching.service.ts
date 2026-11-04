
import { matchingConfig } from "../config/matching.config.js";

export type TransportMode = "ground" | "air_ground";

export interface MatchingShipment {
  id: string;
  originCity: string;
  destinationCity: string;
  cargoType: string;
  weightKg: number;
  deadline: string | Date;
  urgencyScore: number;
}

export interface CarrierService {
  laneId: string;
  carrierId: string;
  carrierName: string;
  contactEmail: string | null;

  onTimePercentage: number;
  maxWeightKg: number;
  supportedCargoTypes: string[];

  carrierActive: boolean;
  laneAvailable: boolean;

  originCity: string;
  destinationCity: string;
  transportMode: TransportMode;

  pickupMinutes: number;
  transitMinutes: number;

  baseCostInr: number;
  costPerKgInr: number;
}

export interface CarrierMatch {
  rank: number;
  laneId: string;
  carrierId: string;
  carrierName: string;
  contactEmail: string | null;
  transportMode: TransportMode;

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

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getWeights(urgencyScore: number) {
  if (urgencyScore >= 80) {
    return matchingConfig.weights.critical;
  }

  if (urgencyScore >= 60) {
    return matchingConfig.weights.high;
  }

  return matchingConfig.weights.normal;
}

export function matchCarriers(
  shipment: MatchingShipment,
  services: CarrierService[],
  now: Date = new Date()
): CarrierMatch[] {
  if (
    !Number.isFinite(shipment.weightKg) ||
    shipment.weightKg <= 0
  ) {
    throw new Error("Invalid shipment weight");
  }

  const deadline = new Date(shipment.deadline);

  if (Number.isNaN(deadline.getTime())) {
    throw new Error("Invalid shipment deadline");
  }

  // Eligibility filtering happens BEFORE ranking.
  const eligible = services.filter((service) => {
    const routeMatches =
      normalize(service.originCity) ===
        normalize(shipment.originCity) &&
      normalize(service.destinationCity) ===
        normalize(shipment.destinationCity);

    const cargoSupported =
      service.supportedCargoTypes.includes(
        shipment.cargoType
      );

    return (
      routeMatches &&
      cargoSupported &&
      service.carrierActive &&
      service.laneAvailable &&
      shipment.weightKg <= service.maxWeightKg
    );
  });

  if (eligible.length === 0) {
    return [];
  }

  const estimatedCosts = eligible.map(
    (service) =>
      service.baseCostInr +
      service.costPerKgInr * shipment.weightKg
  );

  const estimatedTimes = eligible.map(
    (service) =>
      service.pickupMinutes +
      service.transitMinutes
  );

  const minCost = Math.min(...estimatedCosts);
  const minTime = Math.min(...estimatedTimes);

  const weights = getWeights(shipment.urgencyScore);
  const nowMs = now.getTime();

  const ranked = eligible.map((service) => {
    const estimatedMinutes =
      service.pickupMinutes +
      service.transitMinutes;

    const estimatedCostInr =
      service.baseCostInr +
      service.costPerKgInr * shipment.weightKg;

    const estimatedArrivalMs =
      nowMs + estimatedMinutes * 60_000;

    const minutesBeforeDeadline =
      Math.round(
        (deadline.getTime() - estimatedArrivalMs) /
          60_000
      );

    const meetsDeadline =
      estimatedArrivalMs <= deadline.getTime();

    // 100 when enough buffer exists.
    // Lower when arrival approaches the deadline.
    // Zero when the option is predicted to be late.
    const deadlineScore = !meetsDeadline
      ? 0
      : clamp(
          60 +
            40 *
              Math.min(
                1,
                minutesBeforeDeadline /
                  matchingConfig.preferredBufferMinutes
              )
        );

    // Fastest eligible service receives 100.
    const speedScore = clamp(
      (minTime / estimatedMinutes) * 100
    );

    // Cost is scored relatively against
    // other eligible services.
    const costScore = clamp(
      estimatedCostInr === 0
        ? 100
        : (minCost / estimatedCostInr) * 100
    );

    const reliabilityScore = clamp(
      service.onTimePercentage
    );

    let score =
      deadlineScore * weights.deadline +
      speedScore * weights.speed +
      reliabilityScore * weights.reliability +
      costScore * weights.cost;

    if (!meetsDeadline) {
      score -= matchingConfig.latePenalty;
    }

    const matchingScore = Math.round(
      clamp(score)
    );

    let recommendation: string;

    if (!meetsDeadline) {
      recommendation = "Estimated to miss deadline";
    } else if (
      minutesBeforeDeadline <
      matchingConfig.preferredBufferMinutes
    ) {
      recommendation = "Meets deadline with tight buffer";
    } else {
      recommendation = "Estimated to meet deadline";
    }

    return {
      rank: 0,
      laneId: service.laneId,
      carrierId: service.carrierId,
      carrierName: service.carrierName,
      contactEmail: service.contactEmail,
      transportMode: service.transportMode,

      reliability: reliabilityScore,
      estimatedMinutes,
      estimatedArrival: new Date(
        estimatedArrivalMs
      ).toISOString(),
      estimatedCostInr: Math.round(
        estimatedCostInr * 100
      ) / 100,

      meetsDeadline,
      minutesBeforeDeadline,

      matchingScore,

      breakdown: {
        deadline: Math.round(deadlineScore),
        speed: Math.round(speedScore),
        reliability: Math.round(reliabilityScore),
        cost: Math.round(costScore),
      },

      recommendation,
    };
  });

  // Deadline feasibility first, then weighted match.
  // This prevents an infeasible cheap option from
  // outranking a feasible option.
  ranked.sort((a, b) => {
    if (a.meetsDeadline !== b.meetsDeadline) {
      return a.meetsDeadline ? -1 : 1;
    }

    return (
      b.matchingScore - a.matchingScore ||
      a.estimatedMinutes - b.estimatedMinutes ||
      a.estimatedCostInr - b.estimatedCostInr
    );
  });

  return ranked.map((match, index) => ({
    ...match,
    rank: index + 1,
  }));
}
