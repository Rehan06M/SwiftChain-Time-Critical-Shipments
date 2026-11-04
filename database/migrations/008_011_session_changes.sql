BEGIN;

-- ==========================================
-- AUTHENTICATION FIXES
-- ==========================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

ALTER TABLE public.users
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON public.users(google_sub)
  WHERE google_sub IS NOT NULL;


-- ==========================================
-- SHIPMENT ROUTE COORDINATES
-- ==========================================

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS origin_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS origin_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS destination_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS destination_longitude NUMERIC(9,6);

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipment_origin_coordinates_valid,
  DROP CONSTRAINT IF EXISTS shipment_destination_coordinates_valid,
  DROP CONSTRAINT IF EXISTS shipment_origin_longitude_valid,
  DROP CONSTRAINT IF EXISTS shipment_destination_longitude_valid;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipment_origin_coordinates_valid
    CHECK (origin_latitude BETWEEN -90 AND 90),

  ADD CONSTRAINT shipment_destination_coordinates_valid
    CHECK (destination_latitude BETWEEN -90 AND 90),

  ADD CONSTRAINT shipment_origin_longitude_valid
    CHECK (origin_longitude BETWEEN -180 AND 180),

  ADD CONSTRAINT shipment_destination_longitude_valid
    CHECK (destination_longitude BETWEEN -180 AND 180);


-- ==========================================
-- TRACKING EVENTS
-- ==========================================

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

  CONSTRAINT tracking_source_valid
    CHECK (source IN ('driver', 'simulator', 'system'))
);

-- Corrected coordinate-pair validation.
ALTER TABLE public.shipment_tracking_events
  DROP CONSTRAINT IF EXISTS tracking_coordinate_pair_valid;

ALTER TABLE public.shipment_tracking_events
  ADD CONSTRAINT tracking_coordinate_pair_valid
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR
    (
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  );

CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_time
  ON public.shipment_tracking_events(
    shipment_id,
    occurred_at DESC
  );


-- ==========================================
-- SLA ASSESSMENTS
-- ==========================================

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


-- ==========================================
-- SLA ALERTS
-- ==========================================

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


-- ==========================================
-- DISPATCHER ASSIGNMENTS
-- ==========================================

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


-- ==========================================
-- RECOVERY PROPOSALS
-- ==========================================

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


-- ==========================================
-- APPROVED RECOVERY AUDIT
-- ==========================================

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