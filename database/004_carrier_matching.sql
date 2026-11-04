
BEGIN;

CREATE TABLE IF NOT EXISTS public.carriers (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(30),

  on_time_percentage NUMERIC(5,2) NOT NULL,
  max_weight_kg NUMERIC(12,2) NOT NULL,

  supported_cargo_types TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT carrier_reliability_valid
    CHECK (
      on_time_percentage BETWEEN 0 AND 100
    ),

  CONSTRAINT carrier_weight_valid
    CHECK (max_weight_kg > 0)
);

CREATE TABLE IF NOT EXISTS public.carrier_service_lanes (
  id UUID PRIMARY KEY,

  carrier_id UUID NOT NULL
    REFERENCES public.carriers(id),

  origin_city VARCHAR(120) NOT NULL,
  destination_city VARCHAR(120) NOT NULL,

  transport_mode VARCHAR(30) NOT NULL,

  pickup_minutes INTEGER NOT NULL,
  transit_minutes INTEGER NOT NULL,

  base_cost_inr NUMERIC(12,2) NOT NULL,
  cost_per_kg_inr NUMERIC(12,2) NOT NULL,

  is_available BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT carrier_mode_valid
    CHECK (
      transport_mode IN (
        'ground',
        'air_ground'
      )
    ),

  CONSTRAINT carrier_pickup_valid
    CHECK (pickup_minutes >= 0),

  CONSTRAINT carrier_transit_valid
    CHECK (transit_minutes > 0),

  CONSTRAINT carrier_cost_valid
    CHECK (
      base_cost_inr >= 0
      AND cost_per_kg_inr >= 0
    ),

  CONSTRAINT carrier_lane_unique
    UNIQUE (
      carrier_id,
      origin_city,
      destination_city,
      transport_mode
    )
);

CREATE INDEX IF NOT EXISTS idx_carrier_lanes_route
ON public.carrier_service_lanes (
  LOWER(origin_city),
  LOWER(destination_city)
);

CREATE INDEX IF NOT EXISTS idx_carrier_lanes_carrier
ON public.carrier_service_lanes(carrier_id);

COMMIT;
