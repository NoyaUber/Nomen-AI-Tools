/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Compass,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase';
import {
  ensureUserProfile,
  seedStarterProject,
  subscribeToActivityLogs,
  subscribeToAiGenerations,
  subscribeToFavorites,
  subscribeToLoreEntries,
  subscribeToNamingRules,
  subscribeToProjectAiSettings,
  subscribeToProjectEntities,
  subscribeToProjectRelations,
  subscribeToProjects,
  subscribeToProjectVersions,
  subscribeToTimelineEvents,
  subscribeToTrashItems,
  subscribeToVisualAssets,
} from './lib/db/firestore-service';
import { checkAiStatus, AiStatusResponse } from './lib/ai/client';
import {
  ActivityLog,
  AiGenerationRecord,
  EntityRelation,
  EntityVersion,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  TrashItem,
  VisualAsset,
  WorldEntity,
} from './types/nomen';
import { Button } from './components/ui/primitives';
import { DashboardView } from './features/dashboard/DashboardView';
import { ProjectsView } from './features/projects/ProjectsView';
import { NamingEngineView } from './features/naming/NamingEngineView';
import { CharacterStudioView } from './features/entities/CharacterStudioView';
import { WorldBuilderView } from './features/entities/WorldBuilderView';
import { WorldStudiosView } from './features/entities/WorldStudiosView';
import { LoreTimelineView } from './features/lore/LoreTimelineView';
import { ConsistencyCheckerView } from './features/consistency/ConsistencyCheckerView';
import { CanonGraphView } from './features/constellation/CanonGraphView';
import { EncyclopediaView } from './features/encyclopedia/EncyclopediaView';
import { VisualAssetStudioView } from './features/assets/VisualAssetStudioView';
import { AiAssistantPanel } from './features/assistant/AiAssistantPanel';
import { OmniSearchModal } from './components/OmniSearchModal';

export type NavTab =
  | 'dashboard'
  | 'projects'
  | 'naming'
  | 'characters'
  | 'world'
  | 'studios'
  | 'assets'
  | 'constellation'
  | 'lore'
  | 'encyclopedia'
  | 'consistency';

export type StudioTheme = 'gilded' | 'celestial' | 'crimson';

const STUDIO_THEMES: { id: StudioTheme; label: string; swatch: string }[] = [
  { id: 'gilded', label: 'Gilded Gold', swatch: '#D4AF37' },
  { id: 'celestial', label: 'Celestial Teal', swatch: '#2DD4BF' },
  { id: 'crimson', label: 'Royal Amber', swatch: '#F59E0B' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);

  // Studio Atmosphere Theme State
  const [studioTheme, setStudioTheme] = useState<StudioTheme>(() => {
    const saved = localStorage.getItem('nomen_studio_theme');
    if (saved === 'gilded' || saved === 'celestial' || saved === 'crimson') {
      return saved;
    }
    return 'gilded';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-studio-theme', studioTheme);
    localStorage.setItem('nomen_studio_theme', studioTheme);
  }, [studioTheme]);

  // Landing page interactive specimen tab
  const [heroSpecimenTab, setHeroSpecimenTab] = useState<
    'scriptorium' | 'character' | 'gazetteer' | 'cover'
  >('scriptorium');

  // Navigation & UI Layout State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [omniSearchOpen, setOmniSearchOpen] = useState(false);
  const [focusedEntity, setFocusedEntity] = useState<WorldEntity | null>(null);

  // Global Cmd+K / Ctrl+K shortcut for Codex Omni-Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOmniSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOmniSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Project & Worldbuilding Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [relations, setRelations] = useState<EntityRelation[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [namingRules, setNamingRules] = useState<NamingRule[]>([]);
  const [aiGenerations, setAiGenerations] = useState<AiGenerationRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [versions, setVersions] = useState<EntityVersion[]>([]);
  const [aiSettings, setAiSettings] = useState<ProjectAiSetting | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    checkAiStatus().then(setAiStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        try {
          await ensureUserProfile(
            currentUser.uid,
            currentUser.displayName || 'Author',
            currentUser.email || 'author@nomen.studio'
          );
        } catch (err) {
          console.error('Profile sync error:', err);
        }
      } else {
        setProjects([]);
        setActiveProjectId(null);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user's projects
  useEffect(() => {
    if (!authReady || !user) return;
    const unsub = subscribeToProjects(user.uid, (list) => {
      setProjects(list);
      setActiveProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id || null;
      });
    });
    return () => unsub();
  }, [authReady, user]);

  // Subscribe to active project's isolated collections (Phase 1–11)
  useEffect(() => {
    if (!authReady || !user || !activeProjectId) {
      setEntities([]);
      setRelations([]);
      setLoreEntries([]);
      setTimelineEvents([]);
      setNamingRules([]);
      setAiGenerations([]);
      setFavorites([]);
      setVersions([]);
      setAiSettings(null);
      setTrashItems([]);
      setActivityLogs([]);
      setVisualAssets([]);
      return;
    }

    const u1 = subscribeToProjectEntities(user.uid, activeProjectId, setEntities);
    const u2 = subscribeToProjectRelations(user.uid, activeProjectId, setRelations);
    const u3 = subscribeToLoreEntries(user.uid, activeProjectId, setLoreEntries);
    const u4 = subscribeToTimelineEvents(user.uid, activeProjectId, setTimelineEvents);
    const u5 = subscribeToNamingRules(user.uid, activeProjectId, setNamingRules);
    const u6 = subscribeToAiGenerations(user.uid, activeProjectId, setAiGenerations);
    const u7 = subscribeToFavorites(user.uid, activeProjectId, setFavorites);
    const u8 = subscribeToProjectVersions(user.uid, activeProjectId, setVersions);
    const u9 = subscribeToProjectAiSettings(user.uid, activeProjectId, setAiSettings);
    const u10 = subscribeToTrashItems(user.uid, activeProjectId, setTrashItems);
    const u11 = subscribeToActivityLogs(user.uid, activeProjectId, setActivityLogs);
    const u12 = subscribeToVisualAssets(user.uid, activeProjectId, setVisualAssets);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
      u10();
      u11();
      u12();
    };
  }, [authReady, user, activeProjectId]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Authentication failed. Please try again.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSeedStarterUniverse = async () => {
    setSeeding(true);
    try {
      const newProjId = await seedStarterProject();
      setActiveProjectId(newProjId);
      setActiveTab('dashboard');
    } finally {
      setSeeding(false);
    }
  };

  const handleInspectEntityInAssistant = (entity: WorldEntity) => {
    setFocusedEntity(entity);
    setAssistantOpen(true);
  };

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || null;

  const charCount = entities.filter((e) => e.category === 'character').length;
  const locCount = entities.filter((e) => e.category === 'location').length;
  const studioCount = entities.filter(
    (e) =>
      e.category === 'organization' ||
      e.category === 'family' ||
      e.category === 'item' ||
      e.category === 'ability'
  ).length;

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    { id: 'dashboard', label: 'Command Deck', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'projects',
      label: 'Universes',
      icon: <FolderKanban className="w-4 h-4" />,
      count: projects.length,
    },
    {
      id: 'naming',
      label: 'Naming Engine',
      icon: <Sparkles className="w-4 h-4" />,
      count: favorites.length,
    },
    {
      id: 'characters',
      label: 'Character Studio',
      icon: <Users className="w-4 h-4" />,
      count: charCount,
    },
    {
      id: 'world',
      label: 'World Builder',
      icon: <Compass className="w-4 h-4" />,
      count: locCount,
    },
    {
      id: 'studios',
      label: 'Orgs, Items & Power',
      icon: <Shield className="w-4 h-4" />,
      count: studioCount,
    },
    {
      id: 'assets',
      label: 'Visual Asset Studio',
      icon: <ImageIcon className="w-4 h-4" />,
      count: visualAssets.length,
    },
    {
      id: 'constellation',
      label: 'Relationship Web',
      icon: <Network className="w-4 h-4" />,
      count: relations.length,
    },
    {
      id: 'lore',
      label: 'Lore & Timeline',
      icon: <BookOpen className="w-4 h-4" />,
      count: loreEntries.length + timelineEvents.length,
    },
    {
      id: 'encyclopedia',
      label: 'Encyclopedia & Vault',
      icon: <BookMarked className="w-4 h-4" />,
    },
    {
      id: 'consistency',
      label: 'Continuity Audit',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
  ];

  // Loading state while checking Firebase Auth
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#12100E] text-[#F7F2E9] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-3xl font-serif-display text-[#D4AF37] tracking-widest">NOMEN</p>
          <p className="text-xs text-[#A89D88]">Opening Curatorial Worldbuilding Studio...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated Editorial Landing & Interactive Specimen Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 px-6 md:px-10 py-4 border-b border-[var(--border-subtle)] bg-[#12100E]/90 backdrop-blur-md sticky top-0 z-30">
          <a
            href="#top"
            className="text-xl font-semibold tracking-wider text-[#F7F2E9] font-serif-display whitespace-nowrap shrink-0"
          >
            NOMEN
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#C8BFA8]">
            <a
              href="#capabilities"
              className="hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#naming-engine"
              className="hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
            >
              Naming Engine
            </a>
            <a
              href="#world-builder"
              className="hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
            >
              World Builder
            </a>
            <a
              href="#visual-studio"
              className="hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
            >
              Visual Studio
            </a>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="primary" size="sm" onClick={handleGoogleSignIn} disabled={signingIn}>
              {signingIn ? 'Signing In...' : 'Sign In with Google'}
            </Button>
          </div>
        </header>

        {/* Main Editorial Hero with Interactive Specimen Showcase */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 md:px-10 py-12 md:py-16 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left 6 Cols: Editorial Pitch & Interactive Specimen Selector */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
                  <span>Gilded Scriptorium & Worldbuilding Atlas</span>
                  <span aria-hidden="true">·</span>
                  <span>Contextual Philology</span>
                  <span aria-hidden="true">·</span>
                  <span>Visual Asset Studio</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold text-[#F7F2E9] font-serif-display leading-[1.08]">
                  Architect Living Fictional Universes with Curatorial Craft.
                </h1>

                <p className="text-base text-[#C8BFA8] leading-relaxed max-w-xl">
                  NOMEN is a tactile worldbuilding studio for novelists, webnovel authors, and
                  speculative storytellers. Synthesize culturally grounded names across 15
                  categories, curate illustrated 24-field character dossiers, pin interactive
                  world maps, and audit your canon for continuity conflicts.
                </p>

                {authError && (
                  <div className="p-3.5 bg-[#3A1818] border border-[#991B1B] rounded-lg text-xs text-[#FECACA]">
                    {authError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleGoogleSignIn}
                    disabled={signingIn}
                  >
                    <Sparkles className="w-4 h-4" />
                    {signingIn ? 'Authenticating...' : 'Enter NOMEN Studio with Google'}
                  </Button>
                </div>
              </div>

              {/* Interactive Specimen Switcher */}
              <div className="pt-6 border-t border-[#2E2720] space-y-3">
                <p className="text-xs text-[#948975]">
                  Interactive Preview — Explore live modules from the Chronicles of Neran canon:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'scriptorium', label: '01. Scriptorium' },
                      { id: 'character', label: '02. Protagonist' },
                      { id: 'gazetteer', label: '03. World Atlas' },
                      { id: 'cover', label: '04. Book Cover' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setHeroSpecimenTab(tab.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all cursor-pointer border whitespace-nowrap shrink-0 ${
                        heroSpecimenTab === tab.id
                          ? 'bg-[#26201A] text-[#D4AF37] border-[#D4AF37]/60 shadow-sm'
                          : 'bg-[#171411] text-[#A89D88] border-[#2B241D] hover:text-[#F7F2E9] hover:border-[#3E3429]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 6 Cols: Interactive Visual Specimen Stage */}
            <div className="lg:col-span-6 bg-[#1A1612] border border-[#362D23] rounded-2xl overflow-hidden flex flex-col justify-between shadow-2xl">
              {heroSpecimenTab === 'scriptorium' && (
                <div className="flex flex-col h-full">
                  <div className="relative h-72 sm:h-80 overflow-hidden bg-[#12100E]">
                    <img
                      src="/src/assets/images/nomen_editorial_hero_atlas_1794355385476.jpg"
                      alt="Royal Cartographer Scriptorium overlooking Eldoria"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1A1612] via-[#1A1612]/30 to-transparent" />
                    <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#D4AF37] font-medium">
                          Royal Astrolabe Observatory · Spirehold
                        </p>
                        <h2 className="text-2xl font-serif-display font-semibold text-[#F7F2E9]">
                          The Chronicles of Neran
                        </h2>
                      </div>
                      <span className="text-xs font-mono-tabular text-[#E6DEC8] bg-[#12100E]/85 px-2.5 py-1 rounded border border-[#D4AF37]/30">
                        Year 412 AE
                      </span>
                    </div>
                  </div>
                  <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-[#C8BFA8] leading-relaxed">
                      Every universe in NOMEN combines philological naming rules, multi-field
                      entity studios, interactive cartography pins, and an AI consultant that
                      distinguishes established canon from creative suggestions.
                    </p>
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#2E2720] text-xs">
                      <div>
                        <p className="text-[#948975]">Naming Categories</p>
                        <p className="text-lg font-semibold text-[#F7F2E9] font-mono-tabular">15</p>
                      </div>
                      <div>
                        <p className="text-[#948975]">Character Fields</p>
                        <p className="text-lg font-semibold text-[#D4AF37] font-mono-tabular">24</p>
                      </div>
                      <div>
                        <p className="text-[#948975]">Visual Categories</p>
                        <p className="text-lg font-semibold text-[#2DD4BF] font-mono-tabular">12</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {heroSpecimenTab === 'character' && (
                <div className="grid grid-cols-1 sm:grid-cols-12 h-full">
                  <div className="sm:col-span-5 relative min-h-[260px] bg-[#12100E]">
                    <img
                      src="/src/assets/images/nomen_character_portrait_caelum_1794355386782.jpg"
                      alt="Caelum Vaelor Portrait"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="sm:col-span-7 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#D4AF37]">
                        <span>Protagonist Dossier</span>
                        <span className="font-mono-tabular">/KAY-lum VAY-lor/</span>
                      </div>
                      <h2 className="text-2xl font-serif-display font-semibold text-[#F7F2E9]">
                        Caelum Vaelor
                      </h2>
                      <p className="text-xs text-[#A89D88]">
                        Exiled Heir of House Vaelor · Warden of the Pale Seal
                      </p>
                      <p className="text-xs text-[#E6DEC8] leading-relaxed">
                        A disgraced cartographer-knight who discovered that the royal succession
                        chronicles of Aetheria were forged during the First Eclipse.
                      </p>
                      <div className="pt-2 border-t border-[#2E2720] space-y-1.5 text-xs">
                        <p className="text-[#C8BFA8]">
                          <strong className="text-[#D4AF37]">Ability:</strong> Third-Chord Astral
                          Resonance (Void Step, Echo Sight)
                        </p>
                        <p className="text-[#C8BFA8]">
                          <strong className="text-[#D4AF37]">Relic:</strong> The Vesryn Astrolabe
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#948975] pt-3 border-t border-[#2E2720]">
                      Supports Main Portrait, Full-Body Art, Attire, Weapon & Expression Galleries
                    </p>
                  </div>
                </div>
              )}

              {heroSpecimenTab === 'gazetteer' && (
                <div className="flex flex-col h-full">
                  <div className="relative h-64 overflow-hidden bg-[#12100E]">
                    <img
                      src="/src/assets/images/nomen_world_eldoria_caldera_1794355389014.jpg"
                      alt="City of Eldoria Caldera"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1A1612] via-transparent to-transparent" />
                  </div>
                  <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <p className="text-xs text-[#2DD4BF] font-mono-tabular">
                        Continent Neran → Kingdom of Aetheria → Northern Province → City of Eldoria
                      </p>
                      <h2 className="text-2xl font-serif-display font-semibold text-[#F7F2E9]">
                        City of Eldoria — The Mirror Caldera
                      </h2>
                      <p className="text-xs text-[#C8BFA8] leading-relaxed">
                        Concentric stone terraces descending into an ancient celestial crater,
                        warmed by subterranean star-iron conduits and governed by the Council of
                        Twelve Guilds.
                      </p>
                    </div>
                    <div className="pt-3 border-t border-[#2E2720] flex items-center justify-between text-xs text-[#948975]">
                      <span>Interactive Map Pins & Nested Locations</span>
                      <span className="font-mono-tabular text-[#D4AF37]">Pop. 340,000</span>
                    </div>
                  </div>
                </div>
              )}

              {heroSpecimenTab === 'cover' && (
                <div className="grid grid-cols-1 sm:grid-cols-12 h-full">
                  <div className="sm:col-span-5 relative min-h-[260px] bg-[#12100E] flex items-center justify-center p-4">
                    <img
                      src="/src/assets/images/nomen_novel_cover_ashen_crown_1794355389316.jpg"
                      alt="Chronicles of Neran Novel Cover"
                      referrerPolicy="no-referrer"
                      className="w-44 aspect-[2/3] object-cover rounded-lg border border-[#D4AF37]/50 shadow-2xl"
                    />
                  </div>
                  <div className="sm:col-span-7 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs text-[#D4AF37]">Novel Cover Studio · 2:3 Portrait</p>
                      <h2 className="text-2xl font-serif-display font-semibold text-[#F7F2E9]">
                        Chronicles of Neran: The Ashen Crown
                      </h2>
                      <p className="text-xs text-[#C8BFA8] leading-relaxed">
                        Upload custom frontispiece artwork or generate editorial concept plates with
                        live customizable Title, Subtitle, and Author typography overlays.
                      </p>
                    </div>
                    <div className="pt-3 border-t border-[#2E2720] text-xs text-[#948975]">
                      Displayed on Project Command Deck & Printable World Bible
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capabilities Grid */}
          <section
            id="capabilities"
            className="grid grid-cols-1 md:grid-cols-4 gap-5 pt-8 border-t border-[#2E2720]"
          >
            <div
              id="naming-engine"
              className="nomen-card-interactive p-6 bg-[#1C1814] border border-[#2E2720] rounded-xl space-y-2"
            >
              <p className="text-xs font-mono-tabular text-[#D4AF37]">01 · PHILOLOGY</p>
              <h3 className="text-xl font-semibold text-[#F7F2E9] font-serif-display">
                Contextual Naming Engine
              </h3>
              <p className="text-xs text-[#C8BFA8] leading-relaxed">
                Synthesize characters, noble dynasties, kingdoms, relics, and magic abilities with
                pronunciation guides and strict separation between in-world meaning and real-world
                etymology.
              </p>
            </div>

            <div
              id="world-builder"
              className="nomen-card-interactive p-6 bg-[#1C1814] border border-[#2E2720] rounded-xl space-y-2"
            >
              <p className="text-xs font-mono-tabular text-[#2DD4BF]">02 · ATLAS & CAST</p>
              <h3 className="text-xl font-semibold text-[#F7F2E9] font-serif-display">
                Connected Entity Studios
              </h3>
              <p className="text-xs text-[#C8BFA8] leading-relaxed">
                Build 24-field character dossiers, nested location trees, secret orders, mythic
                artifacts, and power systems linked through an interactive relationship web.
              </p>
            </div>

            <div
              id="visual-studio"
              className="nomen-card-interactive p-6 bg-[#1C1814] border border-[#2E2720] rounded-xl space-y-2"
            >
              <p className="text-xs font-mono-tabular text-[#F59E0B]">03 · CARTOGRAPHY & ART</p>
              <h3 className="text-xl font-semibold text-[#F7F2E9] font-serif-display">
                Visual Asset & Map Studio
              </h3>
              <p className="text-xs text-[#C8BFA8] leading-relaxed">
                Manage portraits, emblems, zoomable world maps with clickable location pins, 2:3
                novel covers, and art-director AI visual prompts across 12 categories.
              </p>
            </div>

            <div
              id="continuity"
              className="nomen-card-interactive p-6 bg-[#1C1814] border border-[#2E2720] rounded-xl space-y-2"
            >
              <p className="text-xs font-mono-tabular text-[#34D399]">04 · CANON INTEGRITY</p>
              <h3 className="text-xl font-semibold text-[#F7F2E9] font-serif-display">
                Continuity Audit & Vault
              </h3>
              <p className="text-xs text-[#C8BFA8] leading-relaxed">
                Detect confirmed canon contradictions, restore version snapshots, and export
                portable Markdown or JSON v2 World Bibles anytime.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Authenticated Workspace Layout
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-[var(--bg-canvas)]/95 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 md:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="text-lg font-semibold tracking-wider text-[var(--accent-primary)] font-serif-display whitespace-nowrap shrink-0"
          >
            NOMEN
          </a>
        </div>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[var(--text-secondary)]">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
              activeTab === 'dashboard'
                ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-transparent'
            }`}
          >
            Command Deck
          </button>
          <button
            onClick={() => setActiveTab('naming')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
              activeTab === 'naming'
                ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-transparent'
            }`}
          >
            Naming Engine
          </button>
          <button
            onClick={() => setActiveTab('characters')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
              activeTab === 'characters'
                ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-transparent'
            }`}
          >
            Characters
          </button>
          <button
            onClick={() => setActiveTab('world')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
              activeTab === 'world'
                ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-transparent'
            }`}
          >
            World Builder
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
              activeTab === 'assets'
                ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-transparent'
            }`}
          >
            Visual Studio
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAssistantOpen((prev) => !prev)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Editorial Assistant
          </Button>
        </div>
      </header>

      {/* AI Provider Missing Warning Banner (if unconfigured) */}
      {aiStatus && !aiStatus.configured && (
        <div className="bg-[#3A1818] border-b border-[#991B1B] px-6 py-2.5 text-xs text-[#FECACA] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{aiStatus.message}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop Collapsible Left Sidebar */}
        <aside
          className={`hidden md:flex flex-col justify-between bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all shrink-0 ${
            sidebarCollapsed ? 'w-16' : 'w-64'
          }`}
        >
          <div className="p-3 space-y-4">
            {/* Active Project Selector & Omni-Search in Sidebar */}
            {!sidebarCollapsed && (
              <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>Active Universe</span>
                  <button
                    onClick={() => setActiveTab('projects')}
                    className="text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    Switch
                  </button>
                </div>
                {projects.length > 0 ? (
                  <select
                    aria-label="Select Active Project"
                    value={activeProject?.id || ''}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="w-full bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">No project created yet</p>
                )}

                <button
                  onClick={() => setOmniSearchOpen(true)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[var(--bg-canvas)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Search Codex...</span>
                  </span>
                  <kbd className="text-[10px] font-mono-tabular text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    ⌘K
                  </kbd>
                </button>
              </div>
            )}

            {/* Sidebar Modules with Live Tabular Counters */}
            <nav className="space-y-1" aria-label="Workspace Modules">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--accent-primary)]/45 shadow-xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span
                        className={
                          isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                        }
                      >
                        {item.icon}
                      </span>
                      {!sidebarCollapsed && (
                        <span className="truncate whitespace-nowrap">{item.label}</span>
                      )}
                    </span>
                    {!sidebarCollapsed && item.count !== undefined && item.count > 0 && (
                      <span
                        className={`text-[11px] font-mono-tabular px-1.5 py-0.5 rounded ${
                          isActive
                            ? 'text-[var(--accent-primary)] bg-[var(--bg-canvas)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer: Interactive Atmosphere Palette Switcher & Account */}
          <div className="p-3 border-t border-[var(--border-subtle)] space-y-3">
            {!sidebarCollapsed && (
              <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <Palette className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Studio Atmosphere</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {STUDIO_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setStudioTheme(t.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shrink-0 ${
                        studioTheme === t.id
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--accent-primary)]/50'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.swatch }}
                      />
                      <span>{t.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!sidebarCollapsed && (
              <div className="px-2 py-1 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text-primary)] truncate">
                    {user.displayName || 'Author'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[#FCA5A5] rounded-md cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors cursor-pointer"
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4" />
                  <span>Collapse Sidebar</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/75"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] p-4 flex flex-col justify-between z-10 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <span className="text-lg font-semibold font-serif-display text-[var(--accent-primary)]">
                    NOMEN Studio
                  </span>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 text-[var(--text-muted)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {projects.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Active Universe</p>
                    <select
                      value={activeProject?.id || ''}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      className="w-full bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md px-2.5 py-2"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        setOmniSearchOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-xs text-[var(--accent-primary)]"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Search Codex...</span>
                    </button>
                  </div>
                )}

                <nav className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-lg ${
                        activeTab === item.id
                          ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.label}</span>
                      </span>
                      {item.count !== undefined && item.count > 0 && (
                        <span className="text-[11px] font-mono-tabular">{item.count}</span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] truncate">{user.email}</span>
                <Button variant="ghost" size="sm" onClick={() => signOut(auth)}>
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-20 md:pb-10 max-w-7xl mx-auto w-full space-y-6">
          {/* Interactive Workspace Utility Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] text-xs">
            <div className="flex items-center gap-2 text-[var(--text-muted)] min-w-0">
              <span className="text-[var(--accent-primary)] font-medium truncate">
                {activeProject ? activeProject.title : 'No Active Project'}
              </span>
              {activeProject && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeProject.genre}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {entities.length} Entities / {visualAssets.length} Visuals
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOmniSearchOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Quick Search</span>
                <kbd className="text-[10px] font-mono-tabular text-[var(--text-muted)] bg-[var(--bg-canvas)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                  ⌘K
                </kbd>
              </button>

              <div className="hidden sm:flex items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                {STUDIO_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setStudioTheme(t.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      studioTheme === t.id
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <DashboardView
              projects={projects}
              activeProject={activeProject}
              onSelectProject={(id) => setActiveProjectId(id)}
              entities={entities}
              relations={relations}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              namingRules={namingRules}
              aiSettings={aiSettings}
              activityLogs={activityLogs}
              aiGenerations={aiGenerations}
              favorites={favorites}
              visualAssets={visualAssets}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
              onOpenCreateProject={() => setActiveTab('projects')}
              onSeedStarterProject={handleSeedStarterUniverse}
              seeding={seeding}
              onOpenAssistant={() => setAssistantOpen(true)}
              onInspectEntity={handleInspectEntityInAssistant}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              activeProjectId={activeProject?.id || null}
              onSelectProject={(id) => setActiveProjectId(id)}
              entities={entities}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              onSeedStarter={handleSeedStarterUniverse}
              seeding={seeding}
            />
          )}

          {activeTab !== 'dashboard' && activeTab !== 'projects' && !activeProject && (
            <div className="p-10 text-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl max-w-xl mx-auto my-8 space-y-4">
              <h2 className="text-2xl font-semibold text-[var(--text-primary)] font-serif-display">
                Create or Load a Writing Project First
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Every module in NOMEN operates within an isolated project universe. Create a
                new project or initialize our starter universe to begin.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="primary" onClick={() => setActiveTab('projects')}>
                  Open Project Manager
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSeedStarterUniverse}
                  disabled={seeding}
                >
                  {seeding ? 'Loading...' : 'Load Starter Universe'}
                </Button>
              </div>
            </div>
          )}

          {activeProject && activeTab === 'naming' && (
            <NamingEngineView
              project={activeProject}
              namingRules={namingRules}
              favorites={favorites}
              aiGenerations={aiGenerations}
              entities={entities}
              aiSettings={aiSettings}
            />
          )}

          {activeProject && activeTab === 'characters' && (
            <CharacterStudioView
              project={activeProject}
              entities={entities}
              relations={relations}
              namingRules={namingRules}
              versions={versions}
              aiSettings={aiSettings}
              visualAssets={visualAssets}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'world' && (
            <WorldBuilderView
              project={activeProject}
              entities={entities}
              relations={relations}
              versions={versions}
              aiSettings={aiSettings}
              visualAssets={visualAssets}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'studios' && (
            <WorldStudiosView
              project={activeProject}
              entities={entities}
              relations={relations}
              versions={versions}
              aiSettings={aiSettings}
              visualAssets={visualAssets}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'assets' && (
            <VisualAssetStudioView
              project={activeProject}
              entities={entities}
              visualAssets={visualAssets}
            />
          )}

          {activeProject && activeTab === 'constellation' && (
            <CanonGraphView
              project={activeProject}
              entities={entities}
              relations={relations}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
              onNavigateToStudio={(tab) => setActiveTab(tab as NavTab)}
            />
          )}

          {activeProject && activeTab === 'lore' && (
            <LoreTimelineView
              project={activeProject}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              entities={entities}
              versions={versions}
              aiSettings={aiSettings}
            />
          )}

          {activeProject && activeTab === 'encyclopedia' && (
            <EncyclopediaView
              project={activeProject}
              entities={entities}
              relations={relations}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              namingRules={namingRules}
              favorites={favorites}
              aiSettings={aiSettings}
              versions={versions}
              trashItems={trashItems}
              activityLogs={activityLogs}
              onSelectProject={(id) => setActiveProjectId(id)}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
              onNavigateToStudio={(tab) => setActiveTab(tab as NavTab)}
            />
          )}

          {activeProject && activeTab === 'consistency' && (
            <ConsistencyCheckerView
              project={activeProject}
              entities={entities}
              relations={relations}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              aiSettings={aiSettings}
            />
          )}
        </main>

        {/* Contextual AI Writing Assistant Slide-Over Panel */}
        <AiAssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          project={activeProject}
          entities={entities}
          relations={relations}
          loreEntries={loreEntries}
          timelineEvents={timelineEvents}
          namingRules={namingRules}
          aiSettings={aiSettings}
          focusedEntity={focusedEntity}
        />

        {/* Global Codex Omni-Search Modal (Cmd+K / Ctrl+K) */}
        <OmniSearchModal
          open={omniSearchOpen}
          onClose={() => setOmniSearchOpen(false)}
          project={activeProject}
          entities={entities}
          loreEntries={loreEntries}
          timelineEvents={timelineEvents}
          favorites={favorites}
          onNavigateTab={(tab) => setActiveTab(tab as NavTab)}
          onInspectEntityInAssistant={handleInspectEntityInAssistant}
        />
      </div>

      {/* Compact Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-12 bg-[var(--bg-sidebar)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] grid grid-cols-5 items-center px-2"
      >
        {(
          [
            { id: 'dashboard', label: 'Deck', icon: <LayoutDashboard className="w-4 h-4" /> },
            { id: 'naming', label: 'Naming', icon: <Sparkles className="w-4 h-4" /> },
            { id: 'characters', label: 'Cast', icon: <Users className="w-4 h-4" /> },
            { id: 'world', label: 'World', icon: <Compass className="w-4 h-4" /> },
            { id: 'assets', label: 'Visuals', icon: <ImageIcon className="w-4 h-4" /> },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveTab(m.id)}
            className={`flex flex-col items-center justify-center py-1 text-[10px] font-medium ${
              activeTab === m.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            {m.icon}
            <span className="mt-0.5">{m.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
