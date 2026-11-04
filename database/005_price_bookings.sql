
BEGIN;

-- Allow a shipment to be internally booked.
ALTER TABLE public.shipments
DROP CONSTRAINT IF EXISTS shipment_status_valid;

ALTER TABLE public.shipments
ADD CONSTRAINT shipment_status_valid
CHECK (
  status IN ('created', 'booked', 'cancelled')
);

-- Saved price quotations.
CREATE TABLE IF NOT EXISTS public.pricing_quotes (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id),

  carrier_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  created_by UUID NOT NULL
    REFERENCES public.users(id),

  service_tier VARCHAR(20) NOT NULL,

  base_cost_inr NUMERIC(12,2) NOT NULL,
  urgency_surcharge_inr NUMERIC(12,2) NOT NULL,
  special_handling_inr NUMERIC(12,2) NOT NULL,
  after_hours_inr NUMERIC(12,2) NOT NULL,
  total_cost_inr NUMERIC(12,2) NOT NULL,

  urgency_score INTEGER NOT NULL,
  urgency_percentage INTEGER NOT NULL,

  estimated_minutes INTEGER NOT NULL,
  estimated_arrival TIMESTAMPTZ NOT NULL,
  meets_deadline BOOLEAN NOT NULL,

  shipment_updated_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT quote_tier_valid
    CHECK (
      service_tier IN (
        'Economy', 'Express', 'Critical'
      )
    ),

  CONSTRAINT quote_urgency_valid
    CHECK (urgency_score BETWEEN 0 AND 100),

  CONSTRAINT quote_percentage_valid
    CHECK (
      urgency_percentage IN (0, 10, 20, 30)
    ),

  CONSTRAINT quote_amounts_valid
    CHECK (
      base_cost_inr >= 0
      AND urgency_surcharge_inr >= 0
      AND special_handling_inr >= 0
      AND after_hours_inr >= 0
      AND total_cost_inr >= 0
    ),

  CONSTRAINT quote_expiry_valid
    CHECK (expires_at > created_at)
);

-- Internal booking records.
CREATE TABLE IF NOT EXISTS public.shipment_bookings (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL UNIQUE
    REFERENCES public.shipments(id),

  quote_id UUID NOT NULL UNIQUE
    REFERENCES public.pricing_quotes(id),

  carrier_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  created_by UUID NOT NULL
    REFERENCES public.users(id),

  total_cost_inr NUMERIC(12,2) NOT NULL,

  estimated_arrival TIMESTAMPTZ NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT booking_status_valid
    CHECK (status IN ('confirmed')),

  CONSTRAINT booking_price_valid
    CHECK (total_cost_inr >= 0)
);

CREATE INDEX IF NOT EXISTS idx_quotes_shipment
ON public.pricing_quotes(shipment_id);

CREATE INDEX IF NOT EXISTS idx_quotes_expiry
ON public.pricing_quotes(expires_at);

CREATE INDEX IF NOT EXISTS idx_bookings_user
ON public.shipment_bookings(created_by);

COMMIT;
