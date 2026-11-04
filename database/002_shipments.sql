
BEGIN;

-- One workspace per existing user for now.
-- Team membership will be expanded later.

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

-- Backfill an organization for each existing user.
-- Using the user's UUID as the workspace UUID
-- makes the operation repeatable.

INSERT INTO public.organizations (
  id, name, created_by
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

  cargo_description VARCHAR(255) NOT NULL,
  cargo_type VARCHAR(30) NOT NULL,
  weight_kg NUMERIC(12,2) NOT NULL,

  deadline TIMESTAMPTZ NOT NULL,
  delay_cost_per_hour NUMERIC(14,2) NOT NULL DEFAULT 0,

  notes TEXT,

  status VARCHAR(20) NOT NULL DEFAULT 'created',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shipment_weight_positive
    CHECK (weight_kg > 0),

  CONSTRAINT shipment_delay_cost_nonnegative
    CHECK (delay_cost_per_hour >= 0),

  CONSTRAINT shipment_cargo_type_valid
    CHECK (cargo_type IN (
      'medical',
      'aviation',
      'manufacturing',
      'electronics',
      'events',
      'general'
    )),

  CONSTRAINT shipment_status_valid
    CHECK (status IN ('created', 'cancelled')),

  CONSTRAINT shipment_cities_different
    CHECK (
      LOWER(TRIM(origin_city)) <>
      LOWER(TRIM(destination_city))
    )
);

CREATE INDEX IF NOT EXISTS idx_shipments_organization
ON public.shipments(organization_id);

CREATE INDEX IF NOT EXISTS idx_shipments_creator
ON public.shipments(created_by);

CREATE INDEX IF NOT EXISTS idx_shipments_deadline
ON public.shipments(deadline);

CREATE INDEX IF NOT EXISTS idx_shipments_status
ON public.shipments(status);

COMMIT;
