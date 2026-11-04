
import assert from "node:assert/strict";

import {
  calculateUrgency,
} from "./urgency.service.js";

const fixedNow = new Date(
  "2026-11-04T10:00:00.000Z"
);

// Critical manufacturing shipment:
// 4 hours remaining, ₹5 lakh/hour loss.
const critical = calculateUrgency(
  {
    deadline: "2026-11-04T14:00:00.000Z",
    delayCostPerHour: 500000,
    cargoType: "manufacturing",
  },
  fixedNow
);

assert.equal(critical.score, 93);
assert.equal(critical.level, "Critical");
assert.equal(
  critical.breakdown.deadlineScore,
  90
);

// Less urgent general shipment.
const routine = calculateUrgency(
  {
    deadline: "2026-11-09T10:00:00.000Z",
    delayCostPerHour: 0,
    cargoType: "general",
  },
  fixedNow
);

assert.equal(routine.score, 11);
assert.equal(routine.level, "Low");

// The same shipment becomes more urgent
// when it gets closer to its deadline.
const approaching = calculateUrgency(
  {
    deadline: "2026-11-04T14:00:00.000Z",
    delayCostPerHour: 500000,
    cargoType: "manufacturing",
  },
  new Date("2026-11-04T13:00:00.000Z")
);

assert.ok(
  approaching.score > critical.score
);

assert.equal(approaching.score, 97);

// Overdue shipments have maximum
// deadline pressure.
const overdue = calculateUrgency(
  {
    deadline: "2026-11-04T09:00:00.000Z",
    delayCostPerHour: 500000,
    cargoType: "manufacturing",
  },
  fixedNow
);

assert.equal(
  overdue.breakdown.isOverdue,
  true
);

assert.equal(
  overdue.breakdown.deadlineScore,
  100
);

// Invalid input must be rejected.
assert.throws(() =>
  calculateUrgency(
    {
      deadline: "invalid-date",
      delayCostPerHour: 1000,
      cargoType: "general",
    },
    fixedNow
  )
);

console.log("All urgency scoring tests passed.");
console.log({
  critical: critical.score,
  routine: routine.score,
  approaching: approaching.score,
});
