-- API keys table for public API authentication
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  key_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for O(1) prefix lookup (critical for key validation performance)
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- Index for user's keys listing (used in settings UI)
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys (for UI listing)
CREATE POLICY "Users can view own keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own keys
CREATE POLICY "Users can create own keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own keys (for revocation)
CREATE POLICY "Users can update own keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);
