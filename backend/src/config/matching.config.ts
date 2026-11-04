
/**
 * SwiftChain carrier matching configuration.
 *
 * These are demonstration ranking weights.
 * They are not trained ML parameters.
 */

export const matchingConfig = {
  weights: {
    critical: {
      deadline: 0.40,
      speed: 0.30,
      reliability: 0.20,
      cost: 0.10,
    },

    high: {
      deadline: 0.35,
      speed: 0.30,
      reliability: 0.20,
      cost: 0.15,
    },

    normal: {
      deadline: 0.25,
      speed: 0.25,
      reliability: 0.20,
      cost: 0.30,
    },
  },

  // Minimum remaining time for an option
  // to be regarded as comfortably feasible.
  preferredBufferMinutes: 30,

  // Penalty when the estimated arrival
  // exceeds the required deadline.
  latePenalty: 35,
} as const;
