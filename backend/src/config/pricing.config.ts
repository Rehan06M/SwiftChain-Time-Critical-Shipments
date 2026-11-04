
/**
 * SwiftChain dynamic pricing configuration.
 *
 * All amounts are demonstration values in INR.
 * This is not a live carrier tariff engine.
 */

export const pricingConfig = {
  urgencyBands: [
    { minimumScore: 80, percentage: 30 },
    { minimumScore: 60, percentage: 20 },
    { minimumScore: 40, percentage: 10 },
    { minimumScore: 0, percentage: 0 },
  ],

  services: {
    specialHandlingInr: 450,
    afterHoursInr: 600,
  },

  quoteValidityMinutes: 10,
} as const;
