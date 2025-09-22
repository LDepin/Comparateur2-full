-- PostgreSQL schema for user accounts & traveler profiles
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traveler_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,              -- "Moi", "Enfant", "Mamie", "Chien"
  birthdate DATE,                   -- calcule l'âge
  is_unaccompanied_minor BOOLEAN DEFAULT FALSE,
  has_disability BOOLEAN DEFAULT FALSE,
  assistance_needs TEXT,
  pet_type TEXT,                    -- none|dog|cat|other
  pet_in_cabin BOOLEAN,
  loyalty_programs JSONB DEFAULT '[]',
  discount_cards JSONB DEFAULT '[]',
  student BOOLEAN DEFAULT FALSE,
  youth BOOLEAN DEFAULT FALSE,
  senior BOOLEAN DEFAULT FALSE,
  baggage JSONB,                    -- {cabin:1, checked:1}
  seating_prefs JSONB,              -- {aisle:true, quiet:false}
  default_for_search BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES traveler_profiles(id) ON DELETE SET NULL,
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES traveler_profiles(id) ON DELETE SET NULL,
  query JSONB NOT NULL,
  target_price_cents INT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_profiles_user ON traveler_profiles(user_id);