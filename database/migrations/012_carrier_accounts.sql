BEGIN;

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

COMMIT;