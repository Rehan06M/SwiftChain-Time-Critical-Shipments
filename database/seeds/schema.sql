BEGIN;

-- =========================================================
-- 1. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,

  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  organization_name VARCHAR(160),

  -- NULL is allowed for Google-only accounts.
  password_hash TEXT,
  google_sub TEXT,

  role VARCHAR(20) NOT NULL DEFAULT 'shipper',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  session_version INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_user_role
    CHECK (role IN ('shipper', 'dispatcher', 'carrier'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON public.users(google_sub)
  WHERE google_sub IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users(role);

CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON public.users(created_at DESC);


-- =========================================================
-- 2. ORGANIZATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,

  created_by UUID NOT NULL UNIQUE
    REFERENCES public.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id);

-- Create workspaces for any users already present.
INSERT INTO public.organizations (
  id,
  name,
  created_by
)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.organization_name), ''),
    u.full_name || ' Workspace'
  ),
  u.id
FROM public.users u
ON CONFLICT (created_by) DO NOTHING;

UPDATE public.users u
SET organization_id = o.id
FROM public.organizations o
WHERE o.created_by = u.id
  AND u.organization_id IS NULL;


-- =========================================================
-- 3. SHIPMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY,
  tracking_code VARCHAR(30) NOT NULL UNIQUE,

  organization_id UUID NOT NULL
    REFERENCES public.organizations(id),

  created_by UUID NOT NULL
    REFERENCES public.users(id),

  origin_city VARCHAR(120) NOT NULL,
  origin_address TEXT NOT NULL,

  destination_city VARCHAR(120) NOT NULL,
  destination_address TEXT NOT NULL,

  origin_latitude NUMERIC(9,6),
  origin_longitude NUMERIC(9,6),

  destination_latitude NUMERIC(9,6),
  destination_longitude NUMERIC(9,6),

  cargo_description VARCHAR(255) NOT NULL,
  cargo_type VARCHAR(30) NOT NULL,
  weight_kg NUMERIC(12,2) NOT NULL,

  deadline TIMESTAMPTZ NOT NULL,
  delay_cost_per_hour NUMERIC(14,2) NOT NULL DEFAULT 0,

  notes TEXT,

  -- Delivery milestones are stored separately in tracking events.
  status VARCHAR(20) NOT NULL DEFAULT 'created',

  urgency_score INTEGER,
  urgency_level VARCHAR(20),
  urgency_breakdown JSONB,
  urgency_calculated_at TIMESTAMPTZ,

  -- Approved in-transit recovery plan.
  recovery_route JSONB,
  route_revision INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shipment_weight_positive
    CHECK (weight_kg > 0),

  CONSTRAINT shipment_delay_cost_nonnegative
    CHECK (delay_cost_per_hour >= 0),

  CONSTRAINT shipment_cargo_type_valid
    CHECK (
      cargo_type IN (
        'medical',
        'aviation',
        'manufacturing',
        'electronics',
        'events',
        'general'
      )
    ),

  CONSTRAINT shipment_status_valid
    CHECK (status IN ('created', 'booked', 'cancelled')),

  CONSTRAINT shipment_cities_different
    CHECK (
      LOWER(TRIM(origin_city)) <>
      LOWER(TRIM(destination_city))
    ),

  CONSTRAINT urgency_score_range
    CHECK (urgency_score BETWEEN 0 AND 100),

  CONSTRAINT urgency_level_valid
    CHECK (
      urgency_level IN ('Critical', 'High', 'Medium', 'Low')
    ),

  CONSTRAINT shipment_origin_coordinates_valid
    CHECK (origin_latitude BETWEEN -90 AND 90),

  CONSTRAINT shipment_origin_longitude_valid
    CHECK (origin_longitude BETWEEN -180 AND 180),

  CONSTRAINT shipment_destination_coordinates_valid
    CHECK (destination_latitude BETWEEN -90 AND 90),

  CONSTRAINT shipment_destination_longitude_valid
    CHECK (destination_longitude BETWEEN -180 AND 180),

  CONSTRAINT shipment_route_revision_valid
    CHECK (route_revision >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shipments_organization
  ON public.shipments(organization_id);

CREATE INDEX IF NOT EXISTS idx_shipments_creator
  ON public.shipments(created_by);

CREATE INDEX IF NOT EXISTS idx_shipments_deadline
  ON public.shipments(deadline);

CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON public.shipments(status);

CREATE INDEX IF NOT EXISTS idx_shipments_urgency
  ON public.shipments(urgency_score DESC);


-- =========================================================
-- 4. CARRIERS
-- =========================================================

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
    CHECK (on_time_percentage BETWEEN 0 AND 100),

  CONSTRAINT carrier_weight_valid
    CHECK (max_weight_kg > 0)
);


-- =========================================================
-- 5. TRANSFER POINTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.transfer_points (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,

  latitude NUMERIC(9,6) NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),

  longitude NUMERIC(9,6) NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),

  is_active BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- 6. CARRIER SERVICE LANES
-- =========================================================

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

  -- Optional transfer-service configuration.
  transfer_point_id UUID
    REFERENCES public.transfer_points(id),

  route_name VARCHAR(160),

  -- Array of [longitude, latitude] waypoints.
  route_points JSONB,

  handoff_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (handoff_minutes >= 0),

  handoff_cost_inr NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (handoff_cost_inr >= 0),

  max_approach_km NUMERIC(8,2) NOT NULL DEFAULT 60
    CHECK (max_approach_km > 0),

  approach_speed_kmh NUMERIC(8,2) NOT NULL DEFAULT 45
    CHECK (
      approach_speed_kmh > 0
      AND approach_speed_kmh <= 150
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT carrier_mode_valid
    CHECK (transport_mode IN ('ground', 'air_ground')),

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


-- =========================================================
-- 7. CARRIER LOGIN ACCOUNT MAPPING
-- =========================================================

CREATE TABLE IF NOT EXISTS public.carrier_accounts (
  user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,

  carrier_id UUID NOT NULL
    REFERENCES public.carriers(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, carrier_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_accounts_carrier
  ON public.carrier_accounts(carrier_id);


-- =========================================================
-- 8. PRICING QUOTES
-- =========================================================

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
    CHECK (service_tier IN ('Economy', 'Express', 'Critical')),

  CONSTRAINT quote_urgency_valid
    CHECK (urgency_score BETWEEN 0 AND 100),

  CONSTRAINT quote_percentage_valid
    CHECK (urgency_percentage IN (0, 10, 20, 30)),

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

CREATE INDEX IF NOT EXISTS idx_quotes_shipment
  ON public.pricing_quotes(shipment_id);

CREATE INDEX IF NOT EXISTS idx_quotes_expiry
  ON public.pricing_quotes(expires_at);


-- =========================================================
-- 9. SHIPMENT BOOKINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_bookings (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL UNIQUE
    REFERENCES public.shipments(id),

  quote_id UUID NOT NULL UNIQUE
    REFERENCES public.pricing_quotes(id),

  -- Current active lane, updated after approved recovery.
  carrier_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  created_by UUID NOT NULL
    REFERENCES public.users(id),

  -- Original booking plus approved recovery charges.
  total_cost_inr NUMERIC(12,2) NOT NULL,

  estimated_arrival TIMESTAMPTZ NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT booking_status_valid
    CHECK (status IN ('confirmed')),

  CONSTRAINT booking_price_valid
    CHECK (total_cost_inr >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON public.shipment_bookings(created_by);


-- =========================================================
-- 10. TRACKING EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id) ON DELETE CASCADE,

  event_type VARCHAR(20) NOT NULL,
  milestone VARCHAR(30),

  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),

  message TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'driver',

  created_by UUID REFERENCES public.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tracking_event_type_valid
    CHECK (event_type IN ('milestone', 'location')),

  CONSTRAINT tracking_milestone_valid
    CHECK (
      milestone IN (
        'booked',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'delayed',
        'exception'
      )
    ),

  CONSTRAINT tracking_event_payload_valid
    CHECK (
      (
        event_type = 'milestone'
        AND milestone IS NOT NULL
      )
      OR
      (
        event_type = 'location'
        AND milestone IS NULL
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      )
    ),

  CONSTRAINT tracking_coordinate_pair_valid
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR
      (
        latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
      )
    ),

  CONSTRAINT tracking_source_valid
    CHECK (source IN ('driver', 'simulator', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_time
  ON public.shipment_tracking_events(
    shipment_id,
    occurred_at DESC
  );


-- =========================================================
-- 11. SLA STATE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_sla_state (
  shipment_id UUID PRIMARY KEY
    REFERENCES public.shipments(id) ON DELETE CASCADE,

  risk_status VARCHAR(20) NOT NULL,
  estimated_arrival TIMESTAMPTZ NOT NULL,
  remaining_minutes DOUBLE PRECISION NOT NULL,
  slack_minutes DOUBLE PRECISION NOT NULL,

  location_stale BOOLEAN NOT NULL DEFAULT TRUE,
  transition_version BIGINT NOT NULL DEFAULT 1,

  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sla_risk_status_valid
    CHECK (
      risk_status IN (
        'On Track',
        'At Risk',
        'Critical Risk',
        'Delayed'
      )
    ),

  CONSTRAINT sla_transition_version_valid
    CHECK (transition_version > 0),

  CONSTRAINT sla_remaining_minutes_valid
    CHECK (remaining_minutes >= 0)
);


-- =========================================================
-- 12. SLA ALERTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_alerts (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id) ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,

  risk_status VARCHAR(20) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,

  transition_version BIGINT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,

  CONSTRAINT shipment_alert_risk_valid
    CHECK (
      risk_status IN (
        'On Track',
        'At Risk',
        'Critical Risk',
        'Delayed'
      )
    ),

  CONSTRAINT shipment_alert_transition_valid
    CHECK (transition_version > 0),

  CONSTRAINT shipment_alert_transition_unique
    UNIQUE (shipment_id, transition_version)
);

CREATE INDEX IF NOT EXISTS idx_shipment_alerts_user_time
  ON public.shipment_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipment_alerts_unread
  ON public.shipment_alerts(user_id, created_at DESC)
  WHERE read_at IS NULL;


-- =========================================================
-- 13. DISPATCHER ASSIGNMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_dispatchers (
  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id) ON DELETE CASCADE,

  dispatcher_id UUID NOT NULL
    REFERENCES public.users(id),

  assigned_by UUID NOT NULL
    REFERENCES public.users(id),

  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (shipment_id, dispatcher_id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_dispatchers_user
  ON public.shipment_dispatchers(dispatcher_id);


-- =========================================================
-- 14. RECOVERY PROPOSALS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_recovery_proposals (
  id UUID PRIMARY KEY,

  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id),

  booking_id UUID NOT NULL
    REFERENCES public.shipment_bookings(id),

  original_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  proposed_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  created_by UUID NOT NULL
    REFERENCES public.users(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  baseline_arrival TIMESTAMPTZ NOT NULL,
  proposed_arrival TIMESTAMPTZ NOT NULL,

  estimated_minutes NUMERIC(12,2) NOT NULL,
  time_saved_minutes NUMERIC(12,2) NOT NULL,

  proposed_service_cost_inr NUMERIC(14,2) NOT NULL,
  additional_cost_inr NUMERIC(14,2) NOT NULL,

  meets_deadline BOOLEAN NOT NULL,
  assessment_snapshot JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,

  CONSTRAINT recovery_status_valid
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'expired',
        'superseded'
      )
    ),

  CONSTRAINT recovery_lane_different
    CHECK (original_lane_id <> proposed_lane_id),

  CONSTRAINT recovery_duration_valid
    CHECK (estimated_minutes > 0),

  CONSTRAINT recovery_time_saving_valid
    CHECK (time_saved_minutes > 0),

  CONSTRAINT recovery_costs_valid
    CHECK (
      proposed_service_cost_inr >= 0
      AND additional_cost_inr >= 0
    ),

  CONSTRAINT recovery_expiry_valid
    CHECK (expires_at > created_at),

  CONSTRAINT recovery_snapshot_valid
    CHECK (
      jsonb_typeof(assessment_snapshot) = 'object'
    ),

  CONSTRAINT recovery_review_valid
    CHECK (
      status NOT IN ('approved', 'rejected')
      OR
      (
        reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_recovery_proposals_shipment
  ON public.shipment_recovery_proposals(
    shipment_id,
    created_at DESC
  );


-- =========================================================
-- 15. APPROVED RECOVERY ACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.shipment_recovery_actions (
  id UUID PRIMARY KEY,

  proposal_id UUID NOT NULL UNIQUE
    REFERENCES public.shipment_recovery_proposals(id),

  shipment_id UUID NOT NULL
    REFERENCES public.shipments(id),

  approved_by UUID NOT NULL
    REFERENCES public.users(id),

  previous_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  replacement_lane_id UUID NOT NULL
    REFERENCES public.carrier_service_lanes(id),

  additional_cost_inr NUMERIC(14,2) NOT NULL
    CHECK (additional_cost_inr >= 0),

  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_actions_shipment
  ON public.shipment_recovery_actions(
    shipment_id,
    approved_at DESC
  );

COMMIT;