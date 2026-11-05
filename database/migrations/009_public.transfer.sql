BEGIN;

CREATE TABLE IF NOT EXISTS public.transfer_points (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE public.carrier_service_lanes
  ADD COLUMN IF NOT EXISTS transfer_point_id UUID
    REFERENCES public.transfer_points(id),
  ADD COLUMN IF NOT EXISTS route_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS route_points JSONB,
  ADD COLUMN IF NOT EXISTS handoff_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (handoff_minutes >= 0),
  ADD COLUMN IF NOT EXISTS handoff_cost_inr NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (handoff_cost_inr >= 0),
  ADD COLUMN IF NOT EXISTS max_approach_km NUMERIC(8,2) NOT NULL DEFAULT 60
    CHECK (max_approach_km > 0),
  ADD COLUMN IF NOT EXISTS approach_speed_kmh NUMERIC(8,2) NOT NULL DEFAULT 45
    CHECK (approach_speed_kmh > 0 AND approach_speed_kmh <= 150);

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS recovery_route JSONB,
  ADD COLUMN IF NOT EXISTS route_revision INTEGER NOT NULL DEFAULT 0
    CHECK (route_revision >= 0);

INSERT INTO public.transfer_points (
  id, name, latitude, longitude
)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  'Lonavala Transfer Hub',
  18.7557,
  73.4091
)
ON CONFLICT (name) DO NOTHING;

-- Fast transfer service, via Navi Mumbai.
INSERT INTO public.carrier_service_lanes (
  id,
  carrier_id,
  origin_city,
  destination_city,
  transport_mode,
  pickup_minutes,
  transit_minutes,
  base_cost_inr,
  cost_per_kg_inr,
  is_available,
  transfer_point_id,
  route_name,
  route_points,
  handoff_minutes,
  handoff_cost_inr,
  max_approach_km,
  approach_speed_kmh
)
SELECT
  '66666666-6666-4666-8666-666666666666',
  c.id,
  'Lonavala',
  'Mumbai',
  'air_ground',
  5,
  35,
  5000,
  20,
  TRUE,
  h.id,
  'Lonavala → Navi Mumbai → Mumbai',
  '[[73.4091,18.7557],[73.0297,19.0330],[72.8777,19.0760]]'::jsonb,
  12,
  350,
  60,
  45
FROM public.carriers c
CROSS JOIN public.transfer_points h
WHERE c.name = 'SwiftChain Priority Air'
  AND h.name = 'Lonavala Transfer Hub'
ON CONFLICT (
  carrier_id, origin_city, destination_city, transport_mode
) DO NOTHING;

-- Alternative ground route, via Panvel.
INSERT INTO public.carrier_service_lanes (
  id,
  carrier_id,
  origin_city,
  destination_city,
  transport_mode,
  pickup_minutes,
  transit_minutes,
  base_cost_inr,
  cost_per_kg_inr,
  is_available,
  transfer_point_id,
  route_name,
  route_points,
  handoff_minutes,
  handoff_cost_inr,
  max_approach_km,
  approach_speed_kmh
)
SELECT
  '77777777-7777-4777-8777-777777777777',
  c.id,
  'Lonavala',
  'Mumbai',
  'ground',
  5,
  55,
  3000,
  12,
  TRUE,
  h.id,
  'Lonavala → Panvel → Mumbai',
  '[[73.4091,18.7557],[73.1175,18.9894],[72.8777,19.0760]]'::jsonb,
  10,
  200,
  60,
  45
FROM public.carriers c
CROSS JOIN public.transfer_points h
WHERE c.name = 'SwiftChain Priority Air'
  AND h.name = 'Lonavala Transfer Hub'
ON CONFLICT (
  carrier_id, origin_city, destination_city, transport_mode
) DO NOTHING;

COMMIT;