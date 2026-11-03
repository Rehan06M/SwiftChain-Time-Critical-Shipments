
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  organization_name VARCHAR(160),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'shipper',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_user_role
  CHECK (role IN ('shipper', 'dispatcher', 'carrier'))
);

CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_created_at
ON users(created_at DESC);
