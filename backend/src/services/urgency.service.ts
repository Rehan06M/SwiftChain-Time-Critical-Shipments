
import {
  urgencyConfig,
  type CargoCategory,
  type UrgencyLevel,
} from "../config/urgency.config.js";

export interface UrgencyInput {
  deadline: string | Date;
  delayCostPerHour: number;
  cargoType: CargoCategory;
}

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

function clamp(
  value: number,
  minimum = 0,
  maximum = 100
) {
  return Math.max(
    minimum,
    Math.min(maximum, value)
  );
}

function validateConfiguration(): void {
  const weights = urgencyConfig.weights;

  const sum =
    weights.deadline +
    weights.businessImpact +
    weights.cargoCriticality;

  if (Math.abs(sum - 1) > 0.000001) {
    throw new Error(
      "Urgency scoring weights must total 1.0"
    );
  }
}

validateConfiguration();

function calculateDeadlineScore(
  hoursRemaining: number
): number {
  // A missed deadline receives maximum
  // deadline pressure.
  if (hoursRemaining <= 0) {
    return 100;
  }

  const band = urgencyConfig.deadlineBands.find(
    (item) => hoursRemaining <= item.maxHours
  );

  return band?.score ?? 10;
}

function calculateImpactScore(
  delayCostPerHour: number
): number {
  const band = urgencyConfig.impactBands.find(
    (item) => delayCostPerHour >= item.minRupees
  );

  return band?.score ?? 0;
}

function calculateCargoScore(
  cargoType: CargoCategory
): number {
  return urgencyConfig.cargoCriticality[cargoType];
}

function getLevel(score: number): UrgencyLevel {
  const level = urgencyConfig.levels.find(
    (item) => score >= item.minimumScore
  );

  return level?.label ?? "Low";
}

export function calculateUrgency(
  input: UrgencyInput,
  now: Date = new Date()
): UrgencyResult {
  const deadline = new Date(input.deadline);

  if (Number.isNaN(deadline.getTime())) {
    throw new Error("Invalid shipment deadline");
  }

  if (
    !Number.isFinite(input.delayCostPerHour) ||
    input.delayCostPerHour < 0
  ) {
    throw new Error("Invalid delay cost");
  }

  const cargoScore = calculateCargoScore(
    input.cargoType
  );

  if (cargoScore === undefined) {
    throw new Error("Unsupported cargo type");
  }

  const millisecondsRemaining =
    deadline.getTime() - now.getTime();

  const hoursRemaining =
    millisecondsRemaining / (1000 * 60 * 60);

  const deadlineScore = calculateDeadlineScore(
    hoursRemaining
  );

  const impactScore = calculateImpactScore(
    input.delayCostPerHour
  );

  const weights = urgencyConfig.weights;

  const deadlineContribution =
    deadlineScore * weights.deadline;

  const impactContribution =
    impactScore * weights.businessImpact;

  const cargoContribution =
    cargoScore * weights.cargoCriticality;

  const score = Math.round(
    clamp(
      deadlineContribution +
      impactContribution +
      cargoContribution
    )
  );

  return {
    score,
    level: getLevel(score),

    breakdown: {
      deadlineScore,
      impactScore,
      cargoScore,

      deadlineContribution,
      impactContribution,
      cargoContribution,

      hoursRemaining: Math.round(
        hoursRemaining * 100
      ) / 100,

      isOverdue: hoursRemaining <= 0,
    },

    calculatedAt: now.toISOString(),
  };
}
