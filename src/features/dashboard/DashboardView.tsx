import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  Clock,
  Compass,
  Copy,
  Download,
  FileJson,
  Flame,
  FolderKanban,
  Image as ImageIcon,
  MessageSquare,
  Network,
  Plus,
  Printer,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Sword,
  Trash2,
  Users,
} from 'lucide-react';
import {
  ActivityLog,
  AiGenerationRecord,
  EntityRelation,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  VisualAsset,
  WorldEntity,
} from '../../types/nomen';
import {
  createFavorite,
  deleteAiGeneration,
  deleteFavorite,
  recordActivityLog,
} from '../../lib/db/firestore-service';
import { Button, Modal } from '../../components/ui/primitives';

interface DashboardViewProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (id: string) => void;
  entities: WorldEntity[];
  relations?: EntityRelation[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  namingRules?: NamingRule[];
  aiSettings?: ProjectAiSetting | null;
  activityLogs?: ActivityLog[];
  aiGenerations: AiGenerationRecord[];
  favorites: FavoriteItem[];
  visualAssets?: VisualAsset[];
  onNavigate: (tab: string) => void;
  onOpenCreateProject: () => void;
  onSeedStarterProject: () => void;
  seeding: boolean;
  onOpenAssistant: () => void;
  onInspectEntity?: (entity: WorldEntity) => void;
}

const INSTANT_SPARK_POOL = [
  {
    name: 'Aurelius Vaelor',
    pronunciation: '/aw-REE-lee-us VAY-lor/',
    category: 'Character names',
    titleOrVariation: 'Lord Regent of the Silver Astrolabe',
    interpretation: 'In-world meaning: "Golden Watcher of the High Vow." Reserved for firstborn heirs of the Aetherian highland marches.',
    inspiration: 'Classical Latin vocalic cadence paired with Aetherian -or noble suffix.',
  },
  {
    name: 'Citadel of Veridion',
    pronunciation: '/veh-RID-ee-on/',
    category: 'City & village names',
    titleOrVariation: 'The Emerald Spire on the Glass Sea',
    interpretation: 'A cliffside astronomical fortress whose verdigris copper domes channel coastal lightning into star-iron conduits.',
    inspiration: 'Derived from Latin viridis (green/verdigris) and Greekion fortress endings.',
  },
  {
    name: 'The Solitude of Seventh Chord',
    pronunciation: '/SEV-enth KORD/',
    category: 'Magic & ability names',
    titleOrVariation: 'Forbidden Harmonic Resonance Art',
    interpretation: 'Silences all acoustic and magical vibrations within a hundred paces, freezing spell-glyphs mid-incantation.',
    inspiration: 'Musical harmonic theory blended with monastic vow terminology.',
  },
  {
    name: 'Oathbreaker’s Astrolabe',
    pronunciation: '/OHTH-bray-kerz AS-tro-layb/',
    category: 'Weapon & artifact names',
    titleOrVariation: 'Pre-Sundering Star-Iron Compass',
    interpretation: 'Points not toward magnetic north, but toward the nearest bloodline traitor who violated the Concord of Spirehold.',
    inspiration: 'Medieval brass navigational instruments and feudal blood-oath lore.',
  },
  {
    name: 'Synod of the Pale Lantern',
    pronunciation: '/SIN-ud of the PAYL LAN-tern/',
    category: 'Organization & guild names',
    titleOrVariation: 'Nocturnal Order of Relic Archivists',
    interpretation: 'Sworn scholars who patrol the sunken vaults beneath Eldoria carrying cold star-glass lamps.',
    inspiration: 'Ecclesiastical council nomenclature and gothic guild traditions.',
  },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  activeProject,
  onSelectProject,
  entities,
  relations = [],
  loreEntries,
  timelineEvents,
  namingRules = [],
  aiSettings = null,
  activityLogs = [],
  aiGenerations,
  favorites,
  visualAssets = [],
  onNavigate,
  onOpenCreateProject,
  onSeedStarterProject,
  seeding,
  onOpenAssistant,
  onInspectEntity,
}) => {
  const [copiedFavId, setCopiedFavId] = useState<string | null>(null);
  const [printableModalOpen, setPrintableModalOpen] = useState(false);
  const [spotlightTab, setSpotlightTab] = useState<
    'characters' | 'locations' | 'studios' | 'spark'
  >('characters');
  const [sparkIndex, setSparkIndex] = useState(0);
  const [savingSpark, setSavingSpark] = useState(false);
  const [sparkSavedNotice, setSparkSavedNotice] = useState(false);

  const primaryNovelCover =
    visualAssets.find((a) => a.assetCategory === 'novel_cover' && a.isPrimary) ||
    visualAssets.find((a) => a.assetCategory === 'novel_cover') ||
    null;

  const primaryLocationVisual =
    visualAssets.find((a) => a.assetCategory === 'location_illustration' && a.isPrimary) ||
    visualAssets.find((a) => a.assetCategory === 'world_map' && a.isPrimary) ||
    null;

  // Real-Time Project Analytics across all 8 required dimensions
  const characters = entities.filter((e) => e.category === 'character');
  const locations = entities.filter((e) => e.category === 'location');
  const organizations = entities.filter(
    (e) => e.category === 'organization' || e.category === 'family'
  );
  const artifacts = entities.filter((e) => e.category === 'item');
  const powerSystems = entities.filter((e) => e.category === 'ability');

  const totalCharacters = characters.length;
  const totalLocations = locations.length;
  const totalOrganizations = organizations.length;
  const totalArtifacts = artifacts.length;
  const totalPowerSystems = powerSystems.length;
  const totalLoreEntries = loreEntries.length;
  const totalTimelineEvents = timelineEvents.length;
  const totalRelationships = relations.length;

  // Canon Readiness Calculation (8 Pillars)
  const readinessPillars = [
    { label: 'Characters', done: totalCharacters > 0, tab: 'characters' },
    { label: 'Locations', done: totalLocations > 0, tab: 'world' },
    { label: 'Organizations', done: totalOrganizations > 0, tab: 'studios' },
    { label: 'Artifacts & Magic', done: totalArtifacts + totalPowerSystems > 0, tab: 'studios' },
    { label: 'Visual Assets', done: visualAssets.length > 0, tab: 'assets' },
    { label: 'Relationships', done: totalRelationships > 0, tab: 'constellation' },
    { label: 'Lore & Timeline', done: totalLoreEntries + totalTimelineEvents > 0, tab: 'lore' },
    { label: 'Naming Rules', done: namingRules.length > 0, tab: 'naming' },
  ];
  const completedPillars = readinessPillars.filter((p) => p.done).length;
  const readinessPercent = Math.round((completedPillars / readinessPillars.length) * 100);

  const findPrimaryImageForEntity = (entityId: string, fallbackUrl: string) => {
    const found =
      visualAssets.find((a) => a.entityId === entityId && a.isPrimary) ||
      visualAssets.find((a) => a.entityId === entityId);
    return found?.publicUrl || fallbackUrl;
  };

  const handleSaveSparkToFavorites = async () => {
    if (!activeProject) return;
    const currentSpark = INSTANT_SPARK_POOL[sparkIndex % INSTANT_SPARK_POOL.length];
    setSavingSpark(true);
    try {
      await createFavorite({
        projectId: activeProject.id,
        name: currentSpark.name,
        pronunciation: currentSpark.pronunciation,
        category: currentSpark.category,
        interpretation: currentSpark.interpretation,
        inspiration: currentSpark.inspiration,
        suitability: `Curated for ${activeProject.title}`,
        titleOrVariation: currentSpark.titleOrVariation,
      });
      setSparkSavedNotice(true);
      setTimeout(() => setSparkSavedNotice(false), 2000);
    } finally {
      setSavingSpark(false);
    }
  };

  // Phase 10.1 — Export Markdown World Bible
  const handleExportWorldBibleMarkdown = async () => {
    if (!activeProject) return;
    const lines: string[] = [
      `# ${activeProject.title} — NOMEN Worldbuilding Codex`,
      `**Genre:** ${activeProject.genre} | **Language:** ${activeProject.language} | **Status:** ${activeProject.status}`,
      `**Exported:** ${new Date().toISOString()}`,
      '',
      `## 1. Universe Premise & Foundational Rules`,
      activeProject.description || 'No synopsis recorded.',
      '',
      activeProject.worldSettings
        ? `### World Settings\n${activeProject.worldSettings}\n`
        : '',
      aiSettings?.customInstructions
        ? `### Custom AI Editorial Instructions (${
            aiSettings.isEnabled ? 'Enabled' : 'Disabled'
          })\n${aiSettings.customInstructions}\n`
        : '',
      `## 2. Dramatis Personae (${characters.length} Characters)`,
      ...characters.map(
        (c) =>
          `### ${c.name} (${c.subCategory})\n- **Title / Subtitle:** ${
            c.subtitle || '—'
          }\n- **Origin:** ${c.attributes?.origin || '—'}\n- **Summary:** ${
            c.summary || '—'
          }\n`
      ),
      `## 3. Gazetteer & Locations (${locations.length} Locations)`,
      ...locations.map(
        (l) =>
          `### ${l.name} (${l.subCategory})\n- **Hierarchy:** ${
            l.subtitle || '—'
          }\n- **Government:** ${
            l.attributes?.government || '—'
          }\n- **Summary:** ${l.summary || '—'}\n`
      ),
      `## 4. Organizations & Dynasties (${organizations.length})`,
      ...organizations.map(
        (o) =>
          `### ${o.name} (${o.subCategory})\n- **Leader:** ${
            o.attributes?.leader || '—'
          } | **Seat:** ${o.attributes?.headquarters || '—'}\n- **Mandate:** ${
            o.summary || '—'
          }\n`
      ),
      `## 5. Artifacts & Power Systems (${artifacts.length + powerSystems.length})`,
      ...artifacts.map(
        (i) =>
          `### [Artifact] ${i.name} (${i.subCategory})\n- **Owner:** ${
            i.attributes?.currentOwner || '—'
          }\n- **Summary:** ${i.summary || '—'}\n`
      ),
      ...powerSystems.map(
        (p) =>
          `### [Power System] ${p.name} (${p.subCategory})\n- **Ranks:** ${
            p.attributes?.rankStructure || '—'
          }\n- **Summary:** ${p.summary || '—'}\n`
      ),
      `## 6. Canonical Relationships (${relations.length})`,
      ...relations.map(
        (r) =>
          `- **${r.sourceEntityName}** → *${r.relationType}* → **${
            r.targetEntityName
          }**${r.description ? ` (${r.description})` : ''}`
      ),
      '',
      `## 7. Lore Chronicles (${loreEntries.length})`,
      ...loreEntries.map(
        (l) =>
          `### ${l.title} (${l.category}${l.era ? ` · ${l.era}` : ''})\n${
            l.content
          }\n`
      ),
      `## 8. Chronological Timeline (${timelineEvents.length})`,
      ...timelineEvents.map(
        (t) =>
          `- **${t.dateLabel} (Index ${t.sortOrder}) — ${t.title}:** ${t.description}`
      ),
      '',
      `## 9. Cultural Naming Conventions (${namingRules.length})`,
      ...namingRules.map(
        (nr) =>
          `- **${nr.title} (${nr.category}):** ${nr.phoneticPattern} — Examples: ${nr.examples}`
      ),
    ];

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-world-bible.md`;
    a.click();
    URL.revokeObjectURL(url);

    await recordActivityLog({
      projectId: activeProject.id,
      actionType: 'exported',
      entityType: 'project',
      entityName: activeProject.title,
      details: 'Exported complete Markdown World Bible (.md)',
    });
  };

  // Phase 10.1 — Export Complete Structured JSON v2.0.0
  const handleExportCanonJson = async () => {
    if (!activeProject) return;
    const payload = {
      schemaVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      studio: 'NOMEN — AI Worldbuilding Studio',
      project: activeProject,
      entities,
      relations,
      loreEntries,
      timelineEvents,
      namingRules,
      favorites,
      aiSettings: aiSettings
        ? {
            customInstructions: aiSettings.customInstructions,
            isEnabled: aiSettings.isEnabled,
          }
        : undefined,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-canon-v2.json`;
    a.click();
    URL.revokeObjectURL(url);

    await recordActivityLog({
      projectId: activeProject.id,
      actionType: 'exported',
      entityType: 'project',
      entityName: activeProject.title,
      details: 'Exported structured JSON Canon v2.0.0 (.json)',
    });
  };

  if (projects.length === 0) {
    return (
      <div className="space-y-8">
        <div className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl">
          <div className="absolute inset-0 opacity-35">
            <img
              src="/src/assets/images/nomen_editorial_hero_atlas_1794355385476.jpg"
              alt="NOMEN Royal Scriptorium"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#12100E] via-[#12100E]/90 to-transparent" />
          </div>
          <div className="relative p-8 md:p-12 max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-xs text-[var(--accent-primary)]">
              <span>Curatorial Worldbuilding & Contextual Philology</span>
              <span aria-hidden="true">·</span>
              <span>Phase 1–11 Complete</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-semibold text-[var(--text-primary)] font-serif-display leading-tight">
              Welcome to Your Worldbuilding Command Deck
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Create an isolated fictional universe from scratch or initialize our complete
              reference canon —{' '}
              <span className="text-[var(--accent-primary)] font-medium">
                Chronicles of Neran: The Ashen Crown
              </span>{' '}
              — featuring oil-painted character portraits, terraced caldera landscapes, nested
              kingdoms, secret orders, and interactive cartography pins.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variant="primary" size="lg" onClick={onOpenCreateProject}>
                <Plus className="w-4 h-4" />
                Create New Universe
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={onSeedStarterProject}
                disabled={seeding}
              >
                <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
                {seeding
                  ? 'Initializing Chronicles of Neran...'
                  : 'Load Illustrated Starter Universe'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentSpark = INSTANT_SPARK_POOL[sparkIndex % INSTANT_SPARK_POOL.length];

  return (
    <div className="space-y-8">
      {/* Active Universe Command Banner with High-Resolution Backdrop & 2:3 Cover */}
      <div className="relative rounded-2xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
        {/* Atmospheric Panorama Backdrop */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={
              primaryLocationVisual?.publicUrl ||
              '/src/assets/images/nomen_world_eldoria_caldera_1794355389014.jpg'
            }
            alt="Universe Backdrop"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-surface)] via-[var(--bg-surface)]/92 to-[var(--bg-surface)]/75" />
        </div>

        <div className="relative p-6 md:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start gap-5 max-w-3xl">
              {/* Interactive 2:3 Book Cover Showcase */}
              <button
                type="button"
                onClick={() => onNavigate('assets')}
                className="group relative w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden border border-[var(--accent-primary)]/50 bg-[#12100E] shadow-2xl shrink-0 cursor-pointer"
                title="Open Novel Cover & Visual Asset Studio"
              >
                <img
                  src={
                    primaryNovelCover?.publicUrl ||
                    '/src/assets/images/nomen_novel_cover_ashen_crown_1794355389316.jpg'
                  }
                  alt={activeProject?.title || 'Novel Cover'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2">
                  <span className="text-[10px] font-medium text-[#F7F2E9] leading-tight">
                    Edit Cover
                  </span>
                </div>
              </button>

              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--accent-primary)]">
                  <span>Active Universe</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeProject?.genre || 'Speculative Fiction'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeProject?.language || 'English'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent-secondary)] font-mono-tabular">
                    {visualAssets.length} Visual Assets
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-[var(--text-primary)] font-serif-display">
                  {activeProject?.title || 'Select a Project'}
                </h1>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl">
                  {activeProject?.description ||
                    'Develop characters, nested geography, organizations, naming conventions, and chronological lore.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button variant="primary" size="sm" onClick={() => onNavigate('naming')}>
                <Sparkles className="w-3.5 h-3.5" />
                Naming Engine
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('assets')}>
                <ImageIcon className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Visual Studio ({visualAssets.length})
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('characters')}>
                <Plus className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                Character Studio
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenAssistant}>
                <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                AI Consultant
              </Button>
            </div>
          </div>

          {/* Interactive World Readiness & Canon Completeness Bar */}
          <div className="pt-5 border-t border-[var(--border-subtle)]/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)]">
                  Worldbuilding Canon Readiness
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--text-muted)]">
                  Click any pillar below to expand that dimension of your world
                </span>
              </div>
              <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                {completedPillars}/{readinessPillars.length} Pillars Active ({readinessPercent}%)
              </span>
            </div>

            <div className="w-full h-2 bg-[var(--bg-canvas)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
              <div
                className="h-full bg-gradient-to-r from-[#D4AF37] via-[#F59E0B] to-[#2DD4BF] transition-all duration-300"
                style={{ width: `${Math.max(8, readinessPercent)}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
              {readinessPillars.map((pillar) => (
                <button
                  key={pillar.label}
                  type="button"
                  onClick={() => onNavigate(pillar.tab)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
                    pillar.done
                      ? 'bg-[var(--bg-elevated)]/90 text-[var(--text-primary)] border-[var(--accent-primary)]/35 hover:border-[var(--accent-primary)]'
                      : 'bg-[var(--bg-canvas)]/70 text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{pillar.label}</span>
                  <span
                    className={
                      pillar.done ? 'text-[#34D399] font-mono-tabular' : 'text-[var(--text-muted)]'
                    }
                  >
                    {pillar.done ? '✓' : '+'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Codex Export Bar */}
          {activeProject && (
            <div className="pt-4 border-t border-[var(--border-subtle)]/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[var(--text-muted)]">
                Portable Universe Canon — Export your project bible for manuscript reference,
                printable PDF, or full JSON v2 backup:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleExportWorldBibleMarkdown}>
                  <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  World Bible (.md)
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportCanonJson}>
                  <FileJson className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  Structured JSON (.json)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPrintableModalOpen(true)}>
                  <Printer className="w-3.5 h-3.5 text-[#34D399]" />
                  Printable Report / PDF View
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real-Time Project Analytics (All 8 Required Metrics with Interactive Elevation) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          {
            label: 'Characters',
            count: totalCharacters,
            tab: 'characters',
            icon: <Users className="w-4 h-4 text-[#D4AF37]" />,
          },
          {
            label: 'Locations',
            count: totalLocations,
            tab: 'world',
            icon: <Compass className="w-4 h-4 text-[#2DD4BF]" />,
          },
          {
            label: 'Organizations',
            count: totalOrganizations,
            tab: 'studios',
            icon: <Shield className="w-4 h-4 text-[#F59E0B]" />,
          },
          {
            label: 'Artifacts',
            count: totalArtifacts,
            tab: 'studios',
            icon: <Sword className="w-4 h-4 text-[#38BDF8]" />,
          },
          {
            label: 'Power Systems',
            count: totalPowerSystems,
            tab: 'studios',
            icon: <Flame className="w-4 h-4 text-[#FB7185]" />,
          },
          {
            label: 'Lore Entries',
            count: totalLoreEntries,
            tab: 'lore',
            icon: <BookOpen className="w-4 h-4 text-[#E5C158]" />,
          },
          {
            label: 'Timeline',
            count: totalTimelineEvents,
            tab: 'lore',
            icon: <Clock className="w-4 h-4 text-[#34D399]" />,
          },
          {
            label: 'Relationships',
            count: totalRelationships,
            tab: 'constellation',
            icon: <Network className="w-4 h-4 text-[#FBBF24]" />,
          },
        ].map((metric) => (
          <button
            key={metric.label}
            onClick={() => onNavigate(metric.tab)}
            className="nomen-card-interactive p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl text-left cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span className="truncate">{metric.label}</span>
              {metric.icon}
            </div>
            <p className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular mt-2">
              {metric.count}
            </p>
          </button>
        ))}
      </div>

      {/* Interactive Living Canon Spotlight & Instant Name Spark */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
              Interactive Canon Spotlight & Studio Deck
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Browse illustrated entities, inspect characters with the AI Consultant, or spark a
              new canonical concept
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl">
            {(
              [
                { id: 'characters', label: `Cast (${characters.length})` },
                { id: 'locations', label: `Atlas (${locations.length})` },
                {
                  id: 'studios',
                  label: `Factions & Relics (${
                    organizations.length + artifacts.length + powerSystems.length
                  })`,
                },
                { id: 'spark', label: 'Instant Lore Spark' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSpotlightTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  spotlightTab === tab.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {spotlightTab === 'characters' && (
            <div className="space-y-4">
              {characters.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    No characters created yet in this universe.
                  </p>
                  <Button variant="primary" size="sm" onClick={() => onNavigate('characters')}>
                    <Plus className="w-4 h-4" />
                    Open Character Studio
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {characters.slice(0, 6).map((char) => {
                    const imgUrl = findPrimaryImageForEntity(
                      char.id,
                      '/src/assets/images/nomen_character_portrait_caelum_1794355386782.jpg'
                    );
                    return (
                      <div
                        key={char.id}
                        className="nomen-card-interactive bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col justify-between"
                      >
                        <div className="flex gap-4 p-4">
                          <img
                            src={imgUrl}
                            alt={char.name}
                            referrerPolicy="no-referrer"
                            className="w-20 h-28 object-cover rounded-lg border border-[var(--accent-primary)]/40 shrink-0"
                          />
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent-primary)]">
                              <span>{char.subCategory || 'Character'}</span>
                              {char.attributes?.origin && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{char.attributes.origin}</span>
                                </>
                              )}
                            </div>
                            <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display truncate">
                              {char.name}
                            </h3>
                            {char.subtitle && (
                              <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                                {char.subtitle}
                              </p>
                            )}
                            <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                              {char.summary}
                            </p>
                          </div>
                        </div>
                        <div className="px-4 py-2.5 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onNavigate('characters')}
                            className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Dossier</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          {onInspectEntity && (
                            <button
                              type="button"
                              onClick={() => onInspectEntity(char)}
                              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <MessageSquare className="w-3 h-3 text-[var(--accent-secondary)]" />
                              <span>Ask AI</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {spotlightTab === 'locations' && (
            <div className="space-y-4">
              {locations.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    No locations mapped yet in this universe.
                  </p>
                  <Button variant="primary" size="sm" onClick={() => onNavigate('world')}>
                    <Compass className="w-4 h-4" />
                    Open World Builder
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {locations.slice(0, 6).map((loc) => {
                    const imgUrl = findPrimaryImageForEntity(
                      loc.id,
                      '/src/assets/images/nomen_world_eldoria_caldera_1794355389014.jpg'
                    );
                    return (
                      <div
                        key={loc.id}
                        className="nomen-card-interactive bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col justify-between"
                      >
                        <div className="relative h-36 bg-[#12100E]">
                          <img
                            src={imgUrl}
                            alt={loc.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                          <div className="absolute bottom-3 left-4 right-4">
                            <p className="text-[11px] text-[var(--accent-secondary)] font-medium">
                              {loc.subCategory}
                            </p>
                            <h3 className="text-lg font-semibold text-[#F7F2E9] font-serif-display truncate">
                              {loc.name}
                            </h3>
                          </div>
                        </div>
                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                            {loc.summary}
                          </p>
                          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                            <button
                              type="button"
                              onClick={() => onNavigate('world')}
                              className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Explore Gazetteer</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigate('assets')}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              World Map
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {spotlightTab === 'studios' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...organizations, ...artifacts, ...powerSystems].slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="nomen-card-interactive p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[var(--accent-primary)]">
                      <span>{item.subCategory || item.category}</span>
                      <span className="font-mono-tabular uppercase text-[10px] text-[var(--text-muted)]">
                        {item.category}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                      {item.name}
                    </h3>
                    {item.subtitle && (
                      <p className="text-xs text-[var(--text-muted)]">{item.subtitle}</p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => onNavigate('studios')}
                      className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Studio</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    {onInspectEntity && (
                      <button
                        type="button"
                        onClick={() => onInspectEntity(item)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Consult AI
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {spotlightTab === 'spark' && (
            <div className="p-5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 space-y-2">
                <div className="flex items-center gap-2 text-xs text-[var(--accent-primary)]">
                  <span>Instant Philological & Lore Spark</span>
                  <span aria-hidden="true">·</span>
                  <span>{currentSpark.category}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h3 className="text-2xl font-semibold text-[var(--text-primary)] font-serif-display">
                    {currentSpark.name}
                  </h3>
                  <span className="text-xs font-mono-tabular text-[var(--accent-secondary)]">
                    {currentSpark.pronunciation}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {currentSpark.titleOrVariation}
                </p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed pt-1">
                  {currentSpark.interpretation}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Real-World Linguistic Note: {currentSpark.inspiration}
                </p>
              </div>
              <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-2.5 justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSparkIndex((i) => i + 1)}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Roll Another Concept
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveSparkToFavorites}
                  disabled={savingSpark}
                >
                  <Star className="w-3.5 h-3.5" />
                  {sparkSavedNotice
                    ? 'Saved to Favorites!'
                    : savingSpark
                    ? 'Saving...'
                    : 'Save to Project Favorites'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onNavigate('naming')}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Open Full Naming Engine
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Two-Column Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Recent Projects & Favorite Lexicon */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                  Writing Universes ({projects.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Switch active universe or manage isolated project settings
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('projects')}>
                <FolderKanban className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Manage All
              </Button>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {projects.slice(0, 5).map((proj) => {
                const isSelected = activeProject?.id === proj.id;
                return (
                  <div
                    key={proj.id}
                    className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-[var(--bg-elevated)]/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="text-[var(--accent-primary)]">{proj.genre}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.language}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.status === 'archived' ? 'Archived' : 'Active'}</span>
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate mt-0.5">
                        {proj.title}
                      </p>
                      {proj.description && (
                        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                          {proj.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant={isSelected ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onSelectProject(proj.id)}
                    >
                      {isSelected ? 'Active Universe' : 'Switch'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Favorite Names & Saved Candidates */}
          <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                  Favorite Names & Lexicon ({favorites.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Curated candidates saved from the Naming Engine & Studios
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('naming')}>
                <Star className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Open Naming Engine
              </Button>
            </div>
            {favorites.length === 0 ? (
              <div className="p-6 text-sm text-[var(--text-muted)]">
                No favorite names saved in this project yet. Generate names in the Naming
                Engine or use the Instant Lore Spark above to save candidates here.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {favorites.slice(0, 6).map((fav) => (
                  <div
                    key={fav.id}
                    className="px-6 py-3.5 flex items-start justify-between gap-4 hover:bg-[var(--bg-elevated)]/40 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {fav.name}
                        </span>
                        {fav.pronunciation && (
                          <span className="text-xs font-mono-tabular text-[var(--accent-primary)]">
                            {fav.pronunciation}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{fav.category}</span>
                        {fav.titleOrVariation && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{fav.titleOrVariation}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                        {fav.interpretation}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fav.name);
                          setCopiedFavId(fav.id);
                          setTimeout(() => setCopiedFavId(null), 1500);
                        }}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded cursor-pointer"
                        title="Copy Name"
                      >
                        {copiedFavId === fav.id ? (
                          <Check className="w-3.5 h-3.5 text-[#34D399]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteFavorite(fav.id)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[#F87171] rounded cursor-pointer"
                        title="Remove from Favorites"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 columns: Recent Activity Stream & Recent AI Generations */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recent Project Activity Stream */}
          <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                  Recent Project Activity ({activityLogs.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Live audit stream of worldbuilding edits & creations
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('encyclopedia')}>
                <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Full Log
              </Button>
            </div>
            {activityLogs.length === 0 ? (
              <div className="p-6 text-xs text-[var(--text-muted)]">
                Activity logs will appear here automatically as you create, update, link, or export
                canon records.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {activityLogs.slice(0, 5).map((act) => (
                  <div key={act.id} className="px-6 py-3 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">
                        <span className="text-[var(--accent-primary)] uppercase text-[10px] font-mono-tabular mr-1.5">
                          [{act.actionType.replace('_', ' ')}]
                        </span>
                        {act.entityName}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                        {act.createdAt
                          ? new Date(act.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Just now'}
                      </span>
                    </div>
                    <p className="text-[var(--text-secondary)] line-clamp-1">{act.details}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                  Recent AI Generations ({aiGenerations.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  History of contextual naming & worldbuilding requests
                </p>
              </div>
            </div>
            {aiGenerations.length === 0 ? (
              <div className="p-6 text-sm text-[var(--text-muted)]">
                No AI generations recorded for this project yet. Try generating contextual
                names or character profiles.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {aiGenerations.slice(0, 5).map((gen) => (
                  <div
                    key={gen.id}
                    className="px-6 py-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="text-[var(--accent-primary)]">{gen.generationType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{gen.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{gen.modelUsed}</span>
                      </div>
                      <p className="text-xs text-[var(--text-primary)] font-medium line-clamp-1">
                        {gen.promptSummary}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                        {gen.resultsSummary}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAiGeneration(gen.id)}
                      className="p-1 text-[var(--text-muted)] hover:text-[#F87171] rounded cursor-pointer shrink-0"
                      title="Delete generation log"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Printable World Bible / PDF Report View Modal */}
      {activeProject && (
        <Modal
          open={printableModalOpen}
          onClose={() => setPrintableModalOpen(false)}
          title={`${activeProject.title} — Printable World Bible Report`}
          subtitle="Formatted editorial codex view ready for browser Print / Save as PDF."
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6 text-xs leading-relaxed">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <p className="text-[var(--accent-primary)] font-semibold">
                  {activeProject.genre} · {activeProject.language}
                </p>
                <p className="text-[var(--text-muted)] mt-0.5">
                  {entities.length} Entities · {relations.length} Relationships ·{' '}
                  {loreEntries.length} Lore Chronicles · {timelineEvents.length}{' '}
                  Timeline Events
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                Print / Save as PDF
              </Button>
            </div>

            <div className="p-5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-5 max-h-[60vh] overflow-y-auto">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
                  1. Universe Synopsis & World Rules
                </h3>
                <p className="text-[var(--text-secondary)] mt-1">
                  {activeProject.description || '—'}
                </p>
                {activeProject.worldSettings && (
                  <p className="text-[var(--text-muted)] mt-2 whitespace-pre-line">
                    {activeProject.worldSettings}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
                  2. Canonical Entities ({entities.length})
                </h3>
                {entities.map((e) => (
                  <div key={e.id} className="py-1.5 border-b border-[var(--border-subtle)]">
                    <p className="font-semibold text-[var(--text-primary)]">
                      [{e.subCategory || e.category}] {e.name}{' '}
                      {e.subtitle ? `— ${e.subtitle}` : ''}
                    </p>
                    <p className="text-[var(--text-secondary)]">{e.summary}</p>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
                  3. Lore Chronicles ({loreEntries.length})
                </h3>
                {loreEntries.map((l) => (
                  <div key={l.id} className="py-1.5 border-b border-[var(--border-subtle)]">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {l.title} ({l.category}
                      {l.era ? ` · ${l.era}` : ''})
                    </p>
                    <p className="text-[var(--text-secondary)] whitespace-pre-line">
                      {l.content}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
                  4. Chronological Timeline ({timelineEvents.length})
                </h3>
                {timelineEvents.map((t) => (
                  <div key={t.id} className="py-1">
                    <span className="font-mono-tabular text-[var(--accent-primary)] font-semibold">
                      {t.dateLabel}:
                    </span>{' '}
                    <strong className="text-[var(--text-primary)]">{t.title}</strong> —{' '}
                    <span className="text-[var(--text-secondary)]">{t.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
