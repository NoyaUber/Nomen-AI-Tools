import React from 'react';
import {
  BookOpen,
  Compass,
  FolderKanban,
  MessageSquare,
  Plus,
  Shield,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import {
  AiGenerationRecord,
  FavoriteItem,
  Project,
  TimelineEvent,
  WorldEntity,
  LoreEntry,
} from '../../types/nomen';
import { Button, EmptyState } from '../../components/ui/primitives';

interface DashboardViewProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (id: string) => void;
  entities: WorldEntity[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  aiGenerations: AiGenerationRecord[];
  favorites: FavoriteItem[];
  onNavigate: (tab: string) => void;
  onOpenCreateProject: () => void;
  onSeedStarterProject: () => void;
  seeding: boolean;
  onOpenAssistant: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  activeProject,
  onSelectProject,
  entities,
  loreEntries,
  timelineEvents,
  aiGenerations,
  favorites,
  onNavigate,
  onOpenCreateProject,
  onSeedStarterProject,
  seeding,
  onOpenAssistant,
}) => {
  const totalCharacters = entities.filter((e) => e.category === 'character').length;
  const totalLocations = entities.filter((e) => e.category === 'location').length;
  const totalOrganizations = entities.filter(
    (e) => e.category === 'organization' || e.category === 'family'
  ).length;
  const totalArtifactsAndPowers = entities.filter(
    (e) => e.category === 'item' || e.category === 'ability'
  ).length;

  if (projects.length === 0) {
    return (
      <div className="space-y-8">
        <div className="p-8 bg-[#111520] border border-[#1E2436] rounded-xl">
          <p className="text-xs text-[#9D97B8] tracking-wide">
            Editorial Worldbuilding & Contextual Naming Studio
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#F3F1FA] font-serif-display mt-2">
            Welcome to NOMEN Studio
          </h1>
          <p className="text-sm text-[#A39EBA] max-w-2xl mt-3 leading-relaxed">
            Create an isolated fictional universe from scratch or initialize our complete
            reference canon — <span className="text-[#E4E1EE]">Chronicles of Neran</span> — featuring
            nested continents and kingdoms, characters, secret orders, astral power systems,
            custom naming rules, and historical timelines.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Button variant="primary" onClick={onOpenCreateProject}>
              <Plus className="w-4 h-4" />
              Create New Project
            </Button>
            <Button
              variant="secondary"
              onClick={onSeedStarterProject}
              disabled={seeding}
            >
              <Sparkles className="w-4 h-4 text-[#C4B5FD]" />
              {seeding ? 'Initializing Canon...' : 'Load Starter Universe (Chronicles of Neran)'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Active Universe Header & Quick Actions */}
      <div className="p-6 md:p-8 bg-[#111520] border border-[#1E2436] rounded-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-[#9D97B8]">
            <span>Active Universe</span>
            <span aria-hidden="true">·</span>
            <span>{activeProject?.genre || 'Speculative Fiction'}</span>
            <span aria-hidden="true">·</span>
            <span>{activeProject?.language || 'English'}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            {activeProject?.title || 'Select a Project'}
          </h1>
          <p className="text-sm text-[#A39EBA] leading-relaxed">
            {activeProject?.description ||
              'Develop characters, nested geography, organizations, naming conventions, and chronological lore.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button variant="primary" size="sm" onClick={() => onNavigate('naming')}>
            <Sparkles className="w-3.5 h-3.5" />
            Naming Engine
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('characters')}>
            <Plus className="w-3.5 h-3.5" />
            New Character
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('world')}>
            <Plus className="w-3.5 h-3.5" />
            New Location
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenAssistant}>
            <MessageSquare className="w-3.5 h-3.5 text-[#C4B5FD]" />
            Ask AI Assistant
          </Button>
        </div>
      </div>

      {/* Key Metrics Strip (Tabular Numerals, Single-Elevation) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('characters')}
          className="p-5 bg-[#111520] hover:bg-[#161B2A] border border-[#1E2436] rounded-xl text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#8E89A6]">
            <span>Total Characters</span>
            <Users className="w-4 h-4 text-[#8B7EC8]" />
          </div>
          <p className="text-3xl font-semibold text-[#F3F1FA] font-mono-tabular mt-3">
            {totalCharacters}
          </p>
          <p className="text-xs text-[#736E8A] mt-1">
            Profiles, psychology & story roles
          </p>
        </button>

        <button
          onClick={() => onNavigate('world')}
          className="p-5 bg-[#111520] hover:bg-[#161B2A] border border-[#1E2436] rounded-xl text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#8E89A6]">
            <span>Total Locations</span>
            <Compass className="w-4 h-4 text-[#8B7EC8]" />
          </div>
          <p className="text-3xl font-semibold text-[#F3F1FA] font-mono-tabular mt-3">
            {totalLocations}
          </p>
          <p className="text-xs text-[#736E8A] mt-1">
            Continents, kingdoms & nested cities
          </p>
        </button>

        <button
          onClick={() => onNavigate('studios')}
          className="p-5 bg-[#111520] hover:bg-[#161B2A] border border-[#1E2436] rounded-xl text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#8E89A6]">
            <span>Organizations & Houses</span>
            <Shield className="w-4 h-4 text-[#8B7EC8]" />
          </div>
          <p className="text-3xl font-semibold text-[#F3F1FA] font-mono-tabular mt-3">
            {totalOrganizations}
          </p>
          <p className="text-xs text-[#736E8A] mt-1">
            {totalArtifactsAndPowers} artifacts & power systems
          </p>
        </button>

        <button
          onClick={() => onNavigate('lore')}
          className="p-5 bg-[#111520] hover:bg-[#161B2A] border border-[#1E2436] rounded-xl text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#8E89A6]">
            <span>Lore & Timeline</span>
            <BookOpen className="w-4 h-4 text-[#8B7EC8]" />
          </div>
          <p className="text-3xl font-semibold text-[#F3F1FA] font-mono-tabular mt-3">
            {loreEntries.length + timelineEvents.length}
          </p>
          <p className="text-xs text-[#736E8A] mt-1">
            {loreEntries.length} chronicles · {timelineEvents.length} dated events
          </p>
        </button>
      </div>

      {/* Main Two-Column Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Recent Projects & Recent Entities */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[#111520] border border-[#1E2436] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2436]">
              <div>
                <h2 className="text-lg font-semibold text-[#F3F1FA] font-serif-display">
                  Writing Projects
                </h2>
                <p className="text-xs text-[#8E89A6]">
                  Switch active universe or manage isolated project settings
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('projects')}>
                <FolderKanban className="w-3.5 h-3.5" />
                Manage All
              </Button>
            </div>
            <div className="divide-y divide-[#1A2030]">
              {projects.slice(0, 5).map((proj) => {
                const isSelected = activeProject?.id === proj.id;
                return (
                  <div
                    key={proj.id}
                    className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-[#151A28] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
                        <span>{proj.genre}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.language}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.status === 'archived' ? 'Archived' : 'Active'}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#F3F1FA] truncate mt-0.5">
                        {proj.title}
                      </p>
                      {proj.description && (
                        <p className="text-xs text-[#8E89A6] truncate mt-0.5">
                          {proj.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant={isSelected ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onSelectProject(proj.id)}
                    >
                      {isSelected ? 'Active Workspace' : 'Open'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Favorite Names & Saved Candidates */}
          <section className="bg-[#111520] border border-[#1E2436] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2436]">
              <div>
                <h2 className="text-lg font-semibold text-[#F3F1FA] font-serif-display">
                  Favorite Names & Lexicon
                </h2>
                <p className="text-xs text-[#8E89A6]">
                  Curated candidates saved from the Naming Engine
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('naming')}>
                <Star className="w-3.5 h-3.5 text-[#C4B5FD]" />
                Open Naming Engine
              </Button>
            </div>
            {favorites.length === 0 ? (
              <div className="p-6 text-sm text-[#8E89A6]">
                No favorite names saved in this project yet. Generate names in the Naming
                Engine and star candidates to keep them handy here.
              </div>
            ) : (
              <div className="divide-y divide-[#1A2030]">
                {favorites.slice(0, 5).map((fav) => (
                  <div key={fav.id} className="px-6 py-3.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-semibold text-[#F3F1FA]">
                        {fav.name}
                      </span>
                      <span className="text-xs font-mono-tabular text-[#9D97B8]">
                        {fav.pronunciation}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#736E8A]">
                      <span>{fav.category}</span>
                      {fav.titleOrVariation && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{fav.titleOrVariation}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-[#A39EBA] line-clamp-2">
                      {fav.interpretation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 columns: Recent AI Generations & Quick Studio Entry */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[#111520] border border-[#1E2436] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2436]">
              <div>
                <h2 className="text-lg font-semibold text-[#F3F1FA] font-serif-display">
                  Recent AI Generations
                </h2>
                <p className="text-xs text-[#8E89A6]">
                  History of contextual naming & worldbuilding requests
                </p>
              </div>
            </div>
            {aiGenerations.length === 0 ? (
              <div className="p-6 text-sm text-[#8E89A6]">
                No AI generations recorded for this project yet. Try generating contextual
                names or character profiles.
              </div>
            ) : (
              <div className="divide-y divide-[#1A2030]">
                {aiGenerations.slice(0, 5).map((gen) => (
                  <div key={gen.id} className="px-6 py-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
                      <span>{gen.generationType}</span>
                      <span aria-hidden="true">·</span>
                      <span>{gen.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{gen.modelUsed}</span>
                    </div>
                    <p className="text-xs text-[#E4E1EE] font-medium line-clamp-1">
                      {gen.promptSummary}
                    </p>
                    <p className="text-xs text-[#8E89A6] line-clamp-2">
                      {gen.resultsSummary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-3">
            <h2 className="text-lg font-semibold text-[#F3F1FA] font-serif-display">
              Worldbuilding Continuity & Assistant
            </h2>
            <p className="text-xs text-[#A39EBA] leading-relaxed">
              Audit your project for timeline contradictions, conflicting artifact owners,
              and orphaned references, or consult the contextual AI Writing Assistant.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <Button variant="secondary" size="sm" onClick={() => onNavigate('consistency')}>
                Run Consistency Checker
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenAssistant}>
                Open AI Writing Assistant
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
