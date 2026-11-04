
/**
 * SwiftChain urgency scoring configuration.
 *
 * Initial rule-based demonstration model.
 * Adjust values here without changing
 * the core scoring algorithm.
 */

export const urgencyConfig = {
  weights: {
    deadline: 0.45,
    businessImpact: 0.35,
    cargoCriticality: 0.20,
  },

  // Hours remaining until delivery deadline.
  // Evaluated from smallest threshold upward.
  deadlineBands: [
    { maxHours: 2, score: 100 },
    { maxHours: 6, score: 90 },
    { maxHours: 12, score: 75 },
    { maxHours: 24, score: 60 },
    { maxHours: 48, score: 40 },
    { maxHours: 72, score: 25 },
    { maxHours: Infinity, score: 10 },
  ],

  // Estimated financial loss in INR per hour.
  // Evaluated from highest threshold downward.
  impactBands: [
    { minRupees: 500000, score: 100 },
    { minRupees: 100000, score: 90 },
    { minRupees: 25000, score: 75 },
    { minRupees: 5000, score: 50 },
    { minRupees: 1, score: 25 },
    { minRupees: 0, score: 0 },
  ],

  cargoCriticality: {
    medical: 100,
    aviation: 95,
    manufacturing: 85,
    electronics: 65,
    events: 55,
    general: 30,
  },

  levels: [
    { minimumScore: 80, label: "Critical" },
    { minimumScore: 60, label: "High" },
    { minimumScore: 40, label: "Medium" },
    { minimumScore: 0, label: "Low" },
  ],
} as const;

export type CargoCategory =
  keyof typeof urgencyConfig.cargoCriticality;

export type UrgencyLevel =
  "Critical" | "High" | "Medium" | "Low";
