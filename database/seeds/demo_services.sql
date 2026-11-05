BEGIN;

-- =========================================================
-- DEMO CARRIERS
-- =========================================================

INSERT INTO public.carriers (
  id,
  name,
  contact_email,
  on_time_percentage,
  max_weight_kg,
  supported_cargo_types,
  is_active
)
VALUES
(
  '11111111-1111-4111-8111-111111111111',
  'SwiftChain Demo Carrier',
  'demo-carrier@swiftchain.test',
  97.50,
  10000,
  ARRAY[
    'medical', 'aviation', 'manufacturing',
    'electronics', 'events', 'general'
  ]::TEXT[],
  TRUE
),
(
  '33333333-3333-4333-8333-333333333333',
  'SwiftChain Priority Air',
  'priority@swiftchain.test',
  99,
  10000,
  ARRAY[
    'medical', 'aviation', 'manufacturing',
    'electronics', 'events', 'general'
  ]::TEXT[],
  TRUE
)
ON CONFLICT (name) DO NOTHING;


-- =========================================================
-- ORIGINAL PUNE → MUMBAI LANES
-- =========================================================

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
  is_available
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  id,
  'Pune',
  'Mumbai',
  'ground',
  30,
  180,
  1500,
  12,
  TRUE
FROM public.carriers
WHERE name = 'SwiftChain Demo Carrier'
ON CONFLICT (
  carrier_id, origin_city, destination_city, transport_mode
) DO NOTHING;

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
  is_available
)
SELECT
  '44444444-4444-4444-8444-444444444444',
  id,
  'Pune',
  'Mumbai',
  'air_ground',
  15,
  60,
  8000,
  25,
  TRUE
FROM public.carriers
WHERE name = 'SwiftChain Priority Air'
ON CONFLICT (
  carrier_id, origin_city, destination_city, transport_mode
) DO NOTHING;


-- =========================================================
-- TRANSFER HUB
-- =========================================================

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


-- =========================================================
-- TRANSFER ROUTE VIA NAVI MUMBAI
-- =========================================================

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
  '[
    [73.4091,18.7557],
    [73.0297,19.0330],
    [72.8777,19.0760]
  ]'::jsonb,
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


-- =========================================================
-- TRANSFER ROUTE VIA PANVEL
-- =========================================================

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
  '[
    [73.4091,18.7557],
    [73.1175,18.9894],
    [72.8777,19.0760]
  ]'::jsonb,
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