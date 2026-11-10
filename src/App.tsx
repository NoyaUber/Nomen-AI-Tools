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
  BookOpen,
  Compass,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
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
  subscribeToAiGenerations,
  subscribeToFavorites,
  subscribeToLoreEntries,
  subscribeToNamingRules,
  subscribeToProjectEntities,
  subscribeToProjectRelations,
  subscribeToProjects,
  subscribeToTimelineEvents,
} from './lib/db/firestore-service';
import { checkAiStatus, AiStatusResponse } from './lib/ai/client';
import {
  AiGenerationRecord,
  EntityRelation,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  TimelineEvent,
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
import { AiAssistantPanel } from './features/assistant/AiAssistantPanel';

type NavTab =
  | 'dashboard'
  | 'projects'
  | 'naming'
  | 'characters'
  | 'world'
  | 'studios'
  | 'lore'
  | 'consistency';

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
  { id: 'naming', label: 'Naming Engine', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'characters', label: 'Character Studio', icon: <Users className="w-4 h-4" /> },
  { id: 'world', label: 'World Builder', icon: <Compass className="w-4 h-4" /> },
  { id: 'studios', label: 'Orgs, Items & Power', icon: <Shield className="w-4 h-4" /> },
  { id: 'lore', label: 'Lore & Timeline', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'consistency', label: 'Consistency Audit', icon: <ShieldCheck className="w-4 h-4" /> },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);

  // Navigation & UI Layout State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [focusedEntity, setFocusedEntity] = useState<WorldEntity | null>(null);

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

  // Subscribe to active project's isolated collections
  useEffect(() => {
    if (!authReady || !user || !activeProjectId) {
      setEntities([]);
      setRelations([]);
      setLoreEntries([]);
      setTimelineEvents([]);
      setNamingRules([]);
      setAiGenerations([]);
      setFavorites([]);
      return;
    }

    const u1 = subscribeToProjectEntities(user.uid, activeProjectId, setEntities);
    const u2 = subscribeToProjectRelations(user.uid, activeProjectId, setRelations);
    const u3 = subscribeToLoreEntries(user.uid, activeProjectId, setLoreEntries);
    const u4 = subscribeToTimelineEvents(user.uid, activeProjectId, setTimelineEvents);
    const u5 = subscribeToNamingRules(user.uid, activeProjectId, setNamingRules);
    const u6 = subscribeToAiGenerations(user.uid, activeProjectId, setAiGenerations);
    const u7 = subscribeToFavorites(user.uid, activeProjectId, setFavorites);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
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

  // Loading state while checking Firebase Auth
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0B0D13] text-[#ECEAF2] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-2xl font-serif-display text-[#F3F1FA]">NOMEN</p>
          <p className="text-xs text-[#8E89A6]">Initializing Worldbuilding Studio...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated Editorial Landing & Sign-In Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0D13] text-[#ECEAF2] flex flex-col">
        {/* 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 px-6 md:px-10 py-4 border-b border-[#1E2436]">
          <a
            href="#top"
            className="text-xl font-semibold tracking-wider text-[#F3F1FA] font-serif-display whitespace-nowrap shrink-0"
          >
            NOMEN
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A39EBA]">
            <a
              href="#capabilities"
              className="hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#naming-engine"
              className="hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0"
            >
              Naming Engine
            </a>
            <a
              href="#world-builder"
              className="hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0"
            >
              World Builder
            </a>
            <a
              href="#continuity"
              className="hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0"
            >
              Continuity
            </a>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="primary" size="sm" onClick={handleGoogleSignIn} disabled={signingIn}>
              {signingIn ? 'Signing In...' : 'Sign In with Google'}
            </Button>
          </div>
        </header>

        {/* Main Editorial Hero */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 md:px-10 py-14 md:py-20 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div className="flex items-center gap-2 text-xs text-[#9D97B8]">
                <span>Dark Editorial Fantasy Workspace</span>
                <span aria-hidden="true">·</span>
                <span>Contextual Philology</span>
                <span aria-hidden="true">·</span>
                <span>Isolated Project Canons</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-[#F3F1FA] font-serif-display leading-[1.1]">
                Architect Living Fictional Universes with Philological Precision.
              </h1>

              <p className="text-base text-[#A39EBA] leading-relaxed max-w-2xl">
                NOMEN is an AI-powered worldbuilding studio for novelists, webnovel authors,
                and speculative storytellers. Synthesize culturally grounded names across 15
                categories, build 24-field character dossiers, map nested continents and
                kingdoms, and audit your canon for continuity conflicts.
              </p>

              {authError && (
                <div className="p-3.5 bg-[#3A1820] border border-[#7F1D1D] rounded-lg text-xs text-[#FCA5A5]">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-2">
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

            {/* Right 5 Cols: Editorial Preview Specimen */}
            <div className="lg:col-span-5 bg-[#111520] border border-[#23293B] rounded-xl p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#8E89A6] border-b border-[#1E2436] pb-3">
                  <span>Lexicon & Atlas Specimen</span>
                  <span className="font-mono-tabular">Chronicles of Neran</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display">
                      Caelum Vaelor
                    </h2>
                    <span className="text-xs font-mono-tabular text-[#C4B5FD]">
                      /KAY-lum VAY-lor/
                    </span>
                  </div>
                  <p className="text-xs text-[#9D97B8]">
                    Exiled Heir of House Vaelor · Warden of the Pale Seal
                  </p>
                  <p className="text-xs text-[#D0CCE0] pt-2 leading-relaxed">
                    In-Universe Meaning: &ldquo;Sky-Watcher of the Silver Oath.&rdquo; Inspired by
                    Classical Latin vocalic cadence paired with Aetherian patronymic rules.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#1E2436] space-y-2">
                  <p className="text-xs font-semibold text-[#9D97B8]">
                    Nested Gazetteer Hierarchy
                  </p>
                  <div className="text-xs text-[#D0CCE0] space-y-1 font-mono-tabular">
                    <p>Continent Neran</p>
                    <p className="pl-4 text-[#A39EBA]">→ Kingdom of Aetheria</p>
                    <p className="pl-8 text-[#A39EBA]">→ Northern Province</p>
                    <p className="pl-12 text-[#C4B5FD]">→ City of Eldoria</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#1E2436] flex items-center justify-between text-xs text-[#736E8A]">
                <span>Strict Per-Author Firestore Isolation</span>
                <span>15 Naming Categories</span>
              </div>
            </div>
          </div>

          {/* Capabilities Grid */}
          <section
            id="capabilities"
            className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-[#1E2436]"
          >
            <div id="naming-engine" className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-2">
              <h3 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">
                01. Contextual Naming Engine
              </h3>
              <p className="text-xs text-[#A39EBA] leading-relaxed">
                Generate characters, noble houses, kingdoms, cities, guilds, weapons, artifacts,
                and magic abilities with pronunciation guides, custom naming rules, and clear separation between fictional meaning and real-world etymology.
              </p>
            </div>

            <div id="world-builder" className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-2">
              <h3 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">
                02. Connected World & Lore Studios
              </h3>
              <p className="text-xs text-[#A39EBA] leading-relaxed">
                Build 24-field character profiles, nested location hierarchies, organizations,
                bespoke power systems, lore chronicles, and chronological timelines that reference one another.
              </p>
            </div>

            <div id="continuity" className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-2">
              <h3 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">
                03. Continuity Auditor & AI Assistant
              </h3>
              <p className="text-xs text-[#A39EBA] leading-relaxed">
                Detect confirmed data conflicts, timeline anomalies, and missing entity references
                without ever automatically rewriting your prose.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Authenticated Workspace Layout
  return (
    <div className="min-h-screen bg-[#0B0D13] text-[#ECEAF2] flex flex-col">
      {/* Top Bar Contract (3 Zones separated by gap-8) */}
      <header className="sticky top-0 z-30 h-14 bg-[#0B0D13]/95 backdrop-blur-xs border-b border-[#1E2436] px-4 md:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-1.5 text-[#A39EBA] hover:text-[#F3F1FA] rounded-lg"
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
            className="text-lg font-semibold tracking-wider text-[#F3F1FA] font-serif-display whitespace-nowrap shrink-0"
          >
            NOMEN
          </a>
        </div>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[#A39EBA]">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-[#C4B5FD]' : ''
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('naming')}
            className={`hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'naming' ? 'text-[#C4B5FD]' : ''
            }`}
          >
            Naming Engine
          </button>
          <button
            onClick={() => setActiveTab('characters')}
            className={`hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'characters' ? 'text-[#C4B5FD]' : ''
            }`}
          >
            Characters
          </button>
          <button
            onClick={() => setActiveTab('world')}
            className={`hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'world' ? 'text-[#C4B5FD]' : ''
            }`}
          >
            World Builder
          </button>
          <button
            onClick={() => setActiveTab('lore')}
            className={`hover:text-[#F3F1FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'lore' ? 'text-[#C4B5FD]' : ''
            }`}
          >
            Lore & Timeline
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
            AI Assistant
          </Button>
        </div>
      </header>

      {/* AI Provider Missing Warning Banner (if unconfigured) */}
      {aiStatus && !aiStatus.configured && (
        <div className="bg-[#3A1820] border-b border-[#7F1D1D] px-6 py-2.5 text-xs text-[#FCA5A5] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{aiStatus.message}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop Collapsible Left Sidebar */}
        <aside
          className={`hidden md:flex flex-col justify-between bg-[#0E111A] border-r border-[#1E2436] transition-all shrink-0 ${
            sidebarCollapsed ? 'w-16' : 'w-64'
          }`}
        >
          <div className="p-3 space-y-4">
            {/* Active Project Selector in Sidebar */}
            {!sidebarCollapsed && (
              <div className="p-3 bg-[#111520] border border-[#1E2436] rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#736E8A]">
                  <span>Active Universe</span>
                  <button
                    onClick={() => setActiveTab('projects')}
                    className="text-[#C4B5FD] hover:underline cursor-pointer"
                  >
                    Switch
                  </button>
                </div>
                {projects.length > 0 ? (
                  <select
                    aria-label="Select Active Project"
                    value={activeProject?.id || ''}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="w-full bg-[#0B0D13] text-xs font-medium text-[#F3F1FA] border border-[#23293B] rounded-md px-2 py-1.5 focus:outline-none focus:border-[#8B7EC8]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-[#8E89A6]">No project created yet</p>
                )}
              </div>
            )}

            {/* Sidebar Modules */}
            <nav className="space-y-1" aria-label="Workspace Modules">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#1D2336] text-[#F3F1FA] border border-[#8B7EC8]/40'
                        : 'text-[#9D97B8] hover:bg-[#151926] hover:text-[#ECEAF2] border border-transparent'
                    }`}
                  >
                    <span className={isActive ? 'text-[#C4B5FD]' : 'text-[#8E89A6]'}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer: Account & Collapse Toggle */}
          <div className="p-3 border-t border-[#1E2436] space-y-2">
            {!sidebarCollapsed && (
              <div className="px-2 py-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-[#E4E1EE] truncate">
                    {user.displayName || 'Author'}
                  </p>
                  <p className="text-[11px] text-[#736E8A] truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="p-1.5 text-[#8E89A6] hover:text-[#FCA5A5] rounded-md cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-[#736E8A] hover:text-[#ECEAF2] hover:bg-[#151926] rounded-lg transition-colors cursor-pointer"
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
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] bg-[#111520] border-r border-[#23293B] p-4 flex flex-col justify-between z-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#1E2436] pb-3">
                  <span className="text-lg font-semibold font-serif-display text-[#F3F1FA]">
                    NOMEN Studio
                  </span>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 text-[#8E89A6]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {projects.length > 0 && (
                  <div>
                    <p className="text-[11px] text-[#736E8A] mb-1">Active Universe</p>
                    <select
                      value={activeProject?.id || ''}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      className="w-full bg-[#0B0D13] text-xs text-[#F3F1FA] border border-[#23293B] rounded-md px-2.5 py-2"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <nav className="space-y-1">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg ${
                        activeTab === item.id
                          ? 'bg-[#1D2336] text-[#F3F1FA]'
                          : 'text-[#9D97B8]'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="pt-3 border-t border-[#1E2436] flex items-center justify-between text-xs">
                <span className="text-[#8E89A6] truncate">{user.email}</span>
                <Button variant="ghost" size="sm" onClick={() => signOut(auth)}>
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-20 md:pb-10 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardView
              projects={projects}
              activeProject={activeProject}
              onSelectProject={(id) => setActiveProjectId(id)}
              entities={entities}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              aiGenerations={aiGenerations}
              favorites={favorites}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
              onOpenCreateProject={() => setActiveTab('projects')}
              onSeedStarterProject={handleSeedStarterUniverse}
              seeding={seeding}
              onOpenAssistant={() => setAssistantOpen(true)}
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
            <div className="p-10 text-center bg-[#111520] border border-[#1E2436] rounded-xl max-w-xl mx-auto my-8 space-y-4">
              <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display">
                Create or Load a Writing Project First
              </h2>
              <p className="text-sm text-[#8E89A6]">
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
            />
          )}

          {activeProject && activeTab === 'characters' && (
            <CharacterStudioView
              project={activeProject}
              entities={entities}
              relations={relations}
              namingRules={namingRules}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'world' && (
            <WorldBuilderView
              project={activeProject}
              entities={entities}
              relations={relations}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'studios' && (
            <WorldStudiosView
              project={activeProject}
              entities={entities}
              relations={relations}
              onInspectEntityForAssistant={handleInspectEntityInAssistant}
            />
          )}

          {activeProject && activeTab === 'lore' && (
            <LoreTimelineView
              project={activeProject}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
              entities={entities}
            />
          )}

          {activeProject && activeTab === 'consistency' && (
            <ConsistencyCheckerView
              project={activeProject}
              entities={entities}
              relations={relations}
              loreEntries={loreEntries}
              timelineEvents={timelineEvents}
            />
          )}
        </main>

        {/* Contextual AI Writing Assistant Slide-Over Panel */}
        <AiAssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          project={activeProject}
          entities={entities}
          loreEntries={loreEntries}
          timelineEvents={timelineEvents}
          focusedEntity={focusedEntity}
        />
      </div>

      {/* Compact Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-12 bg-[#0E111A]/95 backdrop-blur-xs border-t border-[#1E2436] grid grid-cols-5 items-center px-2"
      >
        {(
          [
            { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="w-4 h-4" /> },
            { id: 'naming', label: 'Naming', icon: <Sparkles className="w-4 h-4" /> },
            { id: 'characters', label: 'Cast', icon: <Users className="w-4 h-4" /> },
            { id: 'world', label: 'World', icon: <Compass className="w-4 h-4" /> },
            { id: 'lore', label: 'Lore', icon: <BookOpen className="w-4 h-4" /> },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveTab(m.id)}
            className={`flex flex-col items-center justify-center py-1 text-[10px] font-medium ${
              activeTab === m.id ? 'text-[#C4B5FD]' : 'text-[#8E89A6]'
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
