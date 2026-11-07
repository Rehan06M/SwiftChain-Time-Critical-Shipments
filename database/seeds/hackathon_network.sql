
BEGIN;

-- SwiftChain hackathon demo carrier network.
-- Target database: neondb
-- Preserves all existing carriers and routes.

WITH cities (city, latitude, longitude) AS (
  VALUES
    ('Pune',       18.5204, 73.8567),
    ('Mumbai',     19.0760, 72.8777),
    ('Chakan',     18.7606, 73.8639),
    ('Nagpur',     21.1458, 79.0882),
    ('Nashik',     19.9975, 73.7898),
    ('Delhi',      28.6139, 77.2090),
    ('Bengaluru',  12.9716, 77.5946),
    ('Hyderabad',  17.3850, 78.4867),
    ('Chennai',    13.0827, 80.2707),
    ('Ahmedabad',  23.0225, 72.5714),
    ('Surat',      21.1702, 72.8311),
    ('Jaipur',     26.9124, 75.7873),
    ('Indore',     22.7196, 75.8577),
    ('Kolkata',    22.5726, 88.3639),
    ('Goa',        15.4909, 73.8278),
    ('Lucknow',    26.8467, 80.9462),
    ('Chandigarh', 30.7333, 76.7794),
    ('Kochi',       9.9312, 76.2673)
),

routes AS (
  SELECT
    a.city AS origin_city,
    b.city AS destination_city,

    6371.0 * ACOS(
      LEAST(1.0, GREATEST(-1.0,
        SIN(RADIANS(a.latitude))
        * SIN(RADIANS(b.latitude))
        +
        COS(RADIANS(a.latitude))
        * COS(RADIANS(b.latitude))
        * COS(RADIANS(b.longitude - a.longitude))
      ))
    ) AS distance_km

  FROM cities a
  CROSS JOIN cities b
  WHERE a.city <> b.city
),

demo_carriers AS (
  SELECT
    id,
    name,
    CASE
      WHEN name = 'SwiftChain Demo Carrier'
        THEN 'ground'
      ELSE 'air_ground'
    END AS mode

  FROM public.carriers
  WHERE name IN (
    'SwiftChain Demo Carrier',
    'SwiftChain Priority Air'
  )
    AND is_active = TRUE
)

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
  route_name
)

SELECT
  gen_random_uuid(),
  carrier.id,
  route.origin_city,
  route.destination_city,
  carrier.mode,

  CASE
    WHEN carrier.mode = 'ground' THEN 30
    ELSE 40
  END,

  CASE
    WHEN carrier.mode = 'ground'
      THEN GREATEST(
        45,
        CEIL(route.distance_km * 1.35 / 55 * 60)::INT
      )
    ELSE GREATEST(
      60,
      CEIL(route.distance_km / 550 * 60 + 55)::INT
    )
  END,

  CASE
    WHEN carrier.mode = 'ground'
      THEN ROUND(
        (900 + route.distance_km * 2.4)::NUMERIC,
        2
      )
    ELSE ROUND(
      (2800 + route.distance_km * 6.5)::NUMERIC,
      2
    )
  END,

  CASE
    WHEN carrier.mode = 'ground' THEN 8.00
    ELSE 22.00
  END,

  TRUE,

  'Demo ' || route.origin_city ||
  ' to ' || route.destination_city

FROM routes route
CROSS JOIN demo_carriers carrier

ON CONFLICT (
  carrier_id,
  origin_city,
  destination_city,
  transport_mode
)
DO NOTHING;

COMMIT;
