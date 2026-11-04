
BEGIN;

ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS urgency_score INTEGER;

ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20);

ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS urgency_breakdown JSONB;

ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS urgency_calculated_at TIMESTAMPTZ;

ALTER TABLE public.shipments
DROP CONSTRAINT IF EXISTS urgency_score_range;

ALTER TABLE public.shipments
ADD CONSTRAINT urgency_score_range
CHECK (
  urgency_score IS NULL
  OR urgency_score BETWEEN 0 AND 100
);

ALTER TABLE public.shipments
DROP CONSTRAINT IF EXISTS urgency_level_valid;

ALTER TABLE public.shipments
ADD CONSTRAINT urgency_level_valid
CHECK (
  urgency_level IS NULL
  OR urgency_level IN (
    'Critical',
    'High',
    'Medium',
    'Low'
  )
);

CREATE INDEX IF NOT EXISTS idx_shipments_urgency
ON public.shipments(urgency_score DESC);

COMMIT;
