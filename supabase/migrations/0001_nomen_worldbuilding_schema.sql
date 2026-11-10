-- =============================================================================
-- NOMEN — AI WORLDBUILDING STUDIO
-- Migration: 0001_nomen_worldbuilding_schema.sql
-- Normalized PostgreSQL schema + Row Level Security (RLS) reference migration
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  default_genre VARCHAR(80) NOT NULL DEFAULT 'High Fantasy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  genre VARCHAR(100) NOT NULL DEFAULT 'Dark Fantasy',
  world_settings TEXT NOT NULL DEFAULT '',
  language VARCHAR(60) NOT NULL DEFAULT 'English',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(owner_id, status);

-- 3. ENTITIES
CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL CHECK (category IN ('character', 'location', 'organization', 'family', 'item', 'ability', 'species', 'civilization', 'custom')),
  sub_category VARCHAR(100) NOT NULL DEFAULT '',
  name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300) NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  parent_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_project_category ON public.entities(project_id, category);
CREATE INDEX IF NOT EXISTS idx_entities_parent_id ON public.entities(parent_id);
CREATE INDEX IF NOT EXISTS idx_entities_owner_id ON public.entities(owner_id);

-- 4. ENTITY RELATIONS
CREATE TABLE IF NOT EXISTS public.entity_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  source_entity_name VARCHAR(200) NOT NULL,
  target_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_name VARCHAR(200) NOT NULL,
  relation_type VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entity_relation UNIQUE (project_id, source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_relations_project ON public.entity_relations(project_id);

-- 5. LORE ENTRIES
CREATE TABLE IF NOT EXISTS public.lore_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  category VARCHAR(80) NOT NULL,
  era VARCHAR(120) NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lore_entries_project ON public.lore_entries(project_id, category);

-- 6. TIMELINE EVENTS
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  date_label VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  era VARCHAR(120) NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT 'Historical Event',
  location_name VARCHAR(200) NOT NULL DEFAULT '',
  participants TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_project_order ON public.timeline_events(project_id, sort_order ASC);

-- 7. NAMING RULES
CREATE TABLE IF NOT EXISTS public.naming_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  culture_or_group VARCHAR(160) NOT NULL DEFAULT '',
  phonetic_pattern TEXT NOT NULL DEFAULT '',
  prefix_suffix_rule TEXT NOT NULL DEFAULT '',
  structure_rule TEXT NOT NULL DEFAULT '',
  examples TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_naming_rules_project ON public.naming_rules(project_id, is_active);

-- 8. AI GENERATIONS
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generation_type VARCHAR(60) NOT NULL,
  category VARCHAR(80) NOT NULL,
  prompt_summary TEXT NOT NULL,
  results_summary TEXT NOT NULL,
  model_used VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_generations_project ON public.ai_generations(project_id, created_at DESC);

-- 9. FAVORITES
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  pronunciation VARCHAR(200) NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL,
  interpretation TEXT NOT NULL DEFAULT '',
  inspiration TEXT NOT NULL DEFAULT '',
  suitability TEXT NOT NULL DEFAULT '',
  title_or_variation VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_favorites_project ON public.favorites(project_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naming_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles owner access" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Projects owner access" ON public.projects
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Entities owner access" ON public.entities
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Entity relations owner access" ON public.entity_relations
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Lore entries owner access" ON public.lore_entries
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Timeline events owner access" ON public.timeline_events
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Naming rules owner access" ON public.naming_rules
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "AI generations owner access" ON public.ai_generations
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Favorites owner access" ON public.favorites
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
