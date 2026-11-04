-- Development/demo data.
-- Existing records are left unchanged.

BEGIN;

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
    'medical',
    'aviation',
    'manufacturing',
    'electronics',
    'events',
    'general'
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
    'medical',
    'aviation',
    'manufacturing',
    'electronics',
    'events',
    'general'
  ]::TEXT[],
  TRUE
)
ON CONFLICT (name) DO NOTHING;


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
  c.id,
  'Pune',
  'Mumbai',
  'ground',
  30,
  180,
  1500,
  12,
  TRUE
FROM public.carriers c
WHERE c.name = 'SwiftChain Demo Carrier'
ON CONFLICT (
  carrier_id,
  origin_city,
  destination_city,
  transport_mode
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
  c.id,
  'Pune',
  'Mumbai',
  'air_ground',
  15,
  60,
  8000,
  25,
  TRUE
FROM public.carriers c
WHERE c.name = 'SwiftChain Priority Air'
ON CONFLICT (
  carrier_id,
  origin_city,
  destination_city,
  transport_mode
) DO NOTHING;

COMMIT;