-- Run after backend/src/scripts/seed.ts creates the demo accounts.

INSERT INTO public.carrier_accounts (
  user_id,
  carrier_id
)
SELECT u.id, c.id
FROM public.users u
CROSS JOIN public.carriers c
WHERE u.email = 'carrier@swiftchain.test'
  AND u.role = 'carrier'
  AND c.name IN (
    'SwiftChain Demo Carrier',
    'SwiftChain Priority Air'
  )
ON CONFLICT DO NOTHING;