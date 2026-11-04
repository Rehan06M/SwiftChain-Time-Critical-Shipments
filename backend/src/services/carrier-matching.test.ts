
import assert from "node:assert/strict";

import {
  matchCarriers,
  type CarrierService,
  type MatchingShipment,
} from "./carrier-matching.service.js";

const fixedNow = new Date(
  "2026-11-04T10:00:00.000Z"
);

const services: CarrierService[] = [
  {
    laneId: "fast-lane",
    carrierId: "fast-carrier",
    carrierName: "Fast Express",
    contactEmail: null,
    onTimePercentage: 98,
    maxWeightKg: 150,
    supportedCargoTypes: ["manufacturing"],
    carrierActive: true,
    laneAvailable: true,
    originCity: "Pune",
    destinationCity: "Mumbai",
    transportMode: "air_ground",
    pickupMinutes: 20,
    transitMinutes: 100,
    baseCostInr: 8000,
    costPerKgInr: 0,
  },
  {
    laneId: "cheap-lane",
    carrierId: "cheap-carrier",
    carrierName: "Economy Road",
    contactEmail: null,
    onTimePercentage: 85,
    maxWeightKg: 1000,
    supportedCargoTypes: ["manufacturing"],
    carrierActive: true,
    laneAvailable: true,
    originCity: "Pune",
    destinationCity: "Mumbai",
    transportMode: "ground",
    pickupMinutes: 60,
    transitMinutes: 300,
    baseCostInr: 2000,
    costPerKgInr: 0,
  },
];

const urgentShipment: MatchingShipment = {
  id: "test-shipment",
  originCity: "Pune",
  destinationCity: "Mumbai",
  cargoType: "manufacturing",
  weightKg: 25,
  deadline: "2026-11-04T14:00:00.000Z",
  urgencyScore: 93,
};

// Test urgent carrier matching.
const urgent = matchCarriers(
  urgentShipment,
  services,
  fixedNow
);

assert.equal(urgent.length, 2);

assert.equal(
  urgent[0].carrierName,
  "Fast Express"
);

assert.equal(
  urgent[0].meetsDeadline,
  true
);

assert.equal(
  urgent[1].meetsDeadline,
  false
);

assert.equal(
  urgent[0].rank,
  1
);

// Test routine shipment where cost matters more.
const routine = matchCarriers(
  {
    ...urgentShipment,
    urgencyScore: 20,
    deadline: "2026-11-05T10:00:00.000Z",
  },
  services,
  fixedNow
);

assert.equal(
  routine[0].carrierName,
  "Economy Road"
);

// Test unavailable carriers.
const unavailable = matchCarriers(
  urgentShipment,
  services.map((service) => ({
    ...service,
    laneAvailable: false,
  })),
  fixedNow
);

assert.equal(unavailable.length, 0);

// Test cargo restrictions.
const unsupportedCargo = matchCarriers(
  {
    ...urgentShipment,
    cargoType: "medical",
  },
  services,
  fixedNow
);

assert.equal(unsupportedCargo.length, 0);

// Test maximum weight.
const heavy = matchCarriers(
  {
    ...urgentShipment,
    weightKg: 500,
  },
  services,
  fixedNow
);

assert.equal(heavy.length, 1);
assert.equal(
  heavy[0].carrierName,
  "Economy Road"
);

// Test reversed route.
const reversedRoute = matchCarriers(
  {
    ...urgentShipment,
    originCity: "Mumbai",
    destinationCity: "Pune",
  },
  services,
  fixedNow
);

assert.equal(reversedRoute.length, 0);

console.log(
  "All carrier matching tests passed."
);

console.log({
  urgentBest: urgent[0].carrierName,
  routineBest: routine[0].carrierName,
  unavailableCount: unavailable.length,
});
