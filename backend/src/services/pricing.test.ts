
import assert from "node:assert/strict";

import {
  calculatePrice,
  urgencySurchargePercentage,
} from "./pricing.service.js";

// Check surcharge configuration.
assert.equal(
  urgencySurchargePercentage(20),
  0
);

assert.equal(
  urgencySurchargePercentage(50),
  10
);

assert.equal(
  urgencySurchargePercentage(70),
  20
);

assert.equal(
  urgencySurchargePercentage(93),
  30
);

// Critical shipment, special handling enabled.
const critical = calculatePrice({
  baseCarrierCostInr: 3950,
  urgencyScore: 93,
  specialHandling: true,
  afterHours: false,
});

assert.equal(critical.baseCostInr, 3950);
assert.equal(critical.urgencySurchargeInr, 1185);
assert.equal(critical.specialHandlingInr, 450);
assert.equal(critical.afterHoursInr, 0);
assert.equal(critical.totalCostInr, 5585);

// Routine shipment, no additional services.
const routine = calculatePrice({
  baseCarrierCostInr: 2000,
  urgencyScore: 20,
  specialHandling: false,
  afterHours: false,
});

assert.equal(routine.totalCostInr, 2000);

// High urgency and after-hours delivery.
const high = calculatePrice({
  baseCarrierCostInr: 3000,
  urgencyScore: 70,
  specialHandling: false,
  afterHours: true,
});

assert.equal(high.urgencySurchargeInr, 600);
assert.equal(high.afterHoursInr, 600);
assert.equal(high.totalCostInr, 4200);

// Reject invalid inputs.
assert.throws(() =>
  calculatePrice({
    baseCarrierCostInr: -200,
    urgencyScore: 50,
    specialHandling: false,
    afterHours: false,
  })
);

assert.throws(() =>
  urgencySurchargePercentage(120)
);

console.log("All pricing tests passed.");
console.log({
  critical: critical.totalCostInr,
  routine: routine.totalCostInr,
  high: high.totalCostInr,
});
