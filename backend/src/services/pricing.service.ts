
import { pricingConfig } from "../config/pricing.config.js";

export interface PricingInput {
  baseCarrierCostInr: number;
  urgencyScore: number;
  specialHandling: boolean;
  afterHours: boolean;
}

export interface PricingBreakdown {
  baseCostInr: number;
  urgencyPercentage: number;
  urgencySurchargeInr: number;
  specialHandlingInr: number;
  afterHoursInr: number;
  additionalServicesInr: number;
  totalCostInr: number;
}

function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error("Invalid monetary amount");
  }

  return Math.round(rupees * 100);
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function urgencySurchargePercentage(
  score: number
): number {
  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new Error("Invalid urgency score");
  }

  const band = pricingConfig.urgencyBands.find(
    (item) => score >= item.minimumScore
  );

  return band?.percentage ?? 0;
}

export function calculatePrice(
  input: PricingInput
): PricingBreakdown {
  const basePaise = toPaise(
    input.baseCarrierCostInr
  );

  const percentage = urgencySurchargePercentage(
    input.urgencyScore
  );

  const urgencyPaise = Math.round(
    basePaise * percentage / 100
  );

  const handlingPaise = input.specialHandling
    ? toPaise(pricingConfig.services.specialHandlingInr)
    : 0;

  const afterHoursPaise = input.afterHours
    ? toPaise(pricingConfig.services.afterHoursInr)
    : 0;

  const additionalPaise =
    handlingPaise + afterHoursPaise;

  const totalPaise =
    basePaise + urgencyPaise + additionalPaise;

  return {
    baseCostInr: toRupees(basePaise),
    urgencyPercentage: percentage,
    urgencySurchargeInr: toRupees(urgencyPaise),
    specialHandlingInr: toRupees(handlingPaise),
    afterHoursInr: toRupees(afterHoursPaise),
    additionalServicesInr: toRupees(additionalPaise),
    totalCostInr: toRupees(totalPaise),
  };
}
