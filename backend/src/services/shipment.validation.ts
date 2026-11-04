
import { z } from "zod";

const nonEmpty = (max: number) =>
  z.string().trim().min(2).max(max);

export const shipmentSchema = z
  .object({
    originCity: nonEmpty(120),
    originAddress: nonEmpty(500),
    destinationCity: nonEmpty(120),
    destinationAddress: nonEmpty(500),

    cargoDescription: nonEmpty(255),

    cargoType: z.enum([
      "medical",
      "aviation",
      "manufacturing",
      "electronics",
      "events",
      "general",
    ]),

    weightKg: z.number()
      .positive()
      .max(1000000),

    deadline: z.iso.datetime({
      offset: true,
    }),

    delayCostPerHour: z.number()
      .min(0)
      .max(1000000000),

    notes: z.string().max(2000).default(""),
  })
  .refine(
    (data) =>
      data.originCity.toLowerCase() !==
      data.destinationCity.toLowerCase(),
    {
      message: "Origin and destination must be different",
      path: ["destinationCity"],
    }
  )
  .refine(
    (data) =>
      new Date(data.deadline).getTime() >
      Date.now(),
    {
      message: "Deadline must be in the future",
      path: ["deadline"],
    }
  );

export type ShipmentInput =
  z.infer<typeof shipmentSchema>;
