-- =============================================================================
-- NOMEN — AI WORLDBUILDING STUDIO
-- Migration: 0002_nomen_phase7_to_10.sql
-- Incremental schema for Phase 7–10: Version History, Custom AI Instructions,
-- Soft-Delete Trash & Restore, and Project Activity Logs.
-- =============================================================================

-- 10. ENTITY VERSIONS (Phase 7.1)
CREATE TABLE IF NOT EXISTS public.entity_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_id VARCHAR(128) NOT NULL,
  target_type VARCHAR(40) NOT NULL CHECK (target_type IN ('entity', 'lore', 'timeline')),
  target_name VARCHAR(240) NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  change_summary VARCHAR(500) NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_name VARCHAR(120) NOT NULL DEFAULT 'Author',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_versions_project_target
  ON public.entity_versions(project_id, target_id, version_number DESC);

-- 11. PROJECT AI SETTINGS / CUSTOM INSTRUCTIONS (Phase 8.4)
CREATE TABLE IF NOT EXISTS public.project_ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  instructions TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_ai_settings_project
  ON public.project_ai_settings(project_id);

-- 12. TRASH ITEMS / SOFT DELETION (Phase 10.3)
CREATE TABLE IF NOT EXISTS public.trash_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  original_id VARCHAR(128) NOT NULL,
  item_type VARCHAR(40) NOT NULL CHECK (item_type IN ('entity', 'lore', 'timeline')),
  category VARCHAR(80) NOT NULL DEFAULT '',
  sub_category VARCHAR(100) NOT NULL DEFAULT '',
  name VARCHAR(240) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trash_items_project
  ON public.trash_items(project_id, deleted_at DESC);

-- 13. ACTIVITY LOGS (Phase 10.4)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action_type VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NOT NULL DEFAULT '',
  target_name VARCHAR(240) NOT NULL DEFAULT '',
  details VARCHAR(1000) NOT NULL DEFAULT '',
  actor_name VARCHAR(120) NOT NULL DEFAULT 'Author',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_project
  ON public.activity_logs(project_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR PHASE 7–10 TABLES
-- =============================================================================

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity versions owner access" ON public.entity_versions
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Project AI settings owner access" ON public.project_ai_settings
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Trash items owner access" ON public.trash_items
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Activity logs owner access" ON public.activity_logs
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
