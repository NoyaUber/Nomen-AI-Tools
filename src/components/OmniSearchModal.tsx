import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Clock,
  Compass,
  Flame,
  MessageSquare,
  Search,
  Shield,
  Star,
  Sword,
  Users,
  X,
} from 'lucide-react';
import {
  FavoriteItem,
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../types/nomen';

interface OmniSearchModalProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  entities: WorldEntity[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  favorites: FavoriteItem[];
  onNavigateTab: (tab: string) => void;
  onInspectEntityInAssistant: (entity: WorldEntity) => void;
}

type SearchFilterCategory =
  | 'all'
  | 'character'
  | 'location'
  | 'organization'
  | 'item'
  | 'ability'
  | 'lore'
  | 'timeline'
  | 'favorite';

interface SearchHit {
  id: string;
  category: Exclude<SearchFilterCategory, 'all'>;
  title: string;
  subtitle: string;
  snippet: string;
  targetTab: string;
  entityRef?: WorldEntity;
}

const FILTER_TABS: { id: SearchFilterCategory; label: string }[] = [
  { id: 'all', label: 'All Canon' },
  { id: 'character', label: 'Characters' },
  { id: 'location', label: 'Locations' },
  { id: 'organization', label: 'Organizations' },
  { id: 'item', label: 'Artifacts' },
  { id: 'ability', label: 'Power Systems' },
  { id: 'lore', label: 'Lore' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'favorite', label: 'Favorites' },
];

export function OmniSearchModal({
  open,
  onClose,
  project,
  entities,
  loreEntries,
  timelineEvents,
  favorites,
  onNavigateTab,
  onInspectEntityInAssistant,
}: OmniSearchModalProps) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<SearchFilterCategory>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    const results: SearchHit[] = [];

    for (const ent of entities) {
      const targetTab =
        ent.category === 'character'
          ? 'characters'
          : ent.category === 'location'
          ? 'world'
          : 'studios';

      const normalizedCategory: Exclude<SearchFilterCategory, 'all'> =
        ent.category === 'character'
          ? 'character'
          : ent.category === 'location'
          ? 'location'
          : ent.category === 'organization' || ent.category === 'family'
          ? 'organization'
          : ent.category === 'item'
          ? 'item'
          : 'ability';

      const attrText = Object.values(ent.attributes || {})
        .join(' ')
        .toLowerCase();
      const matches =
        !q ||
        ent.name.toLowerCase().includes(q) ||
        ent.subtitle.toLowerCase().includes(q) ||
        ent.summary.toLowerCase().includes(q) ||
        ent.subCategory.toLowerCase().includes(q) ||
        attrText.includes(q);

      if (matches) {
        results.push({
          id: `ent_${ent.id}`,
          category: normalizedCategory,
          title: ent.name,
          subtitle: `${ent.subCategory || ent.category} · ${
            ent.subtitle || 'Canonical Entity'
          }`,
          snippet: ent.summary,
          targetTab,
          entityRef: ent,
        });
      }
    }

    for (const lore of loreEntries) {
      const matches =
        !q ||
        lore.title.toLowerCase().includes(q) ||
        lore.category.toLowerCase().includes(q) ||
        lore.era.toLowerCase().includes(q) ||
        lore.summary.toLowerCase().includes(q) ||
        lore.content.toLowerCase().includes(q);

      if (matches) {
        results.push({
          id: `lore_${lore.id}`,
          category: 'lore',
          title: lore.title,
          subtitle: `Lore Chronicle · ${lore.category}${
            lore.era ? ` · ${lore.era}` : ''
          }`,
          snippet: lore.summary || lore.content.slice(0, 180),
          targetTab: 'lore',
        });
      }
    }

    for (const ev of timelineEvents) {
      const matches =
        !q ||
        ev.title.toLowerCase().includes(q) ||
        ev.dateLabel.toLowerCase().includes(q) ||
        ev.locationName.toLowerCase().includes(q) ||
        ev.participants.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q);

      if (matches) {
        results.push({
          id: `evt_${ev.id}`,
          category: 'timeline',
          title: ev.title,
          subtitle: `Timeline · ${ev.dateLabel}${
            ev.locationName ? ` · ${ev.locationName}` : ''
          }`,
          snippet: ev.description,
          targetTab: 'lore',
        });
      }
    }

    for (const fav of favorites) {
      const matches =
        !q ||
        fav.name.toLowerCase().includes(q) ||
        fav.category.toLowerCase().includes(q) ||
        fav.interpretation.toLowerCase().includes(q);

      if (matches) {
        results.push({
          id: `fav_${fav.id}`,
          category: 'favorite',
          title: fav.name,
          subtitle: `Saved Lexicon Favorite · ${fav.category}${
            fav.pronunciation ? ` · /${fav.pronunciation}/` : ''
          }`,
          snippet: fav.interpretation,
          targetTab: 'naming',
        });
      }
    }

    return results
      .filter((r) => filterType === 'all' || r.category === filterType)
      .slice(0, 35);
  }, [query, filterType, entities, loreEntries, timelineEvents, favorites]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, filterType]);

  if (!open) return null;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (hits.length > 0 ? (prev + 1) % hits.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        hits.length > 0 ? (prev - 1 + hits.length) % hits.length : 0
      );
    } else if (e.key === 'Enter' && hits[activeIndex]) {
      e.preventDefault();
      onNavigateTab(hits[activeIndex].targetTab);
      onClose();
    }
  };

  const renderCategoryIcon = (cat: Exclude<SearchFilterCategory, 'all'>) => {
    switch (cat) {
      case 'character':
        return <Users className="w-3.5 h-3.5" />;
      case 'location':
        return <Compass className="w-3.5 h-3.5" />;
      case 'organization':
        return <Shield className="w-3.5 h-3.5" />;
      case 'item':
        return <Sword className="w-3.5 h-3.5" />;
      case 'ability':
        return <Flame className="w-3.5 h-3.5" />;
      case 'lore':
        return <BookOpen className="w-3.5 h-3.5" />;
      case 'timeline':
        return <Clock className="w-3.5 h-3.5" />;
      case 'favorite':
        return <Star className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 px-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl bg-[var(--bg-surface)] border border-[#2A314A] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Input Header */}
        <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              project
                ? `Search ${project.title} across characters, locations, organizations, artifacts, power systems, lore & timeline...`
                : 'Search canon...'
            }
            aria-label="Global Project Search"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
            aria-label="Close Global Search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs (Phase 7.3) */}
        <div className="px-4 py-2.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            {FILTER_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === t.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/40'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] font-mono-tabular shrink-0">
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] p-2">
          {hits.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No canonical records match &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Try searching by character name, noble house, region, artifact power, magic rank, or historical era.
              </p>
            </div>
          ) : (
            hits.map((hit, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <div
                  key={hit.id}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`p-3 rounded-lg transition-colors flex items-start justify-between gap-3 group ${
                    isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <button
                    onClick={() => {
                      onNavigateTab(hit.targetTab);
                      onClose();
                    }}
                    className="flex-1 text-left min-w-0 space-y-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--accent-primary)] shrink-0">
                        {renderCategoryIcon(hit.category)}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] truncate">
                        {hit.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {hit.subtitle}
                    </p>
                    {hit.snippet && (
                      <p className="text-xs text-[#B4B0C8] line-clamp-2">
                        {hit.snippet}
                      </p>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {hit.entityRef && (
                      <button
                        onClick={() => {
                          onInspectEntityInAssistant(hit.entityRef!);
                          onClose();
                        }}
                        className="px-2 py-1 text-[11px] bg-[#1A2032] hover:bg-[#252D46] text-[var(--accent-primary)] rounded border border-[#2C3552] flex items-center gap-1 cursor-pointer"
                        title="Focus in AI Assistant"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Ask AI</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onNavigateTab('encyclopedia');
                        onClose();
                      }}
                      className="px-2 py-1 text-[11px] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded cursor-pointer"
                      title="View in Project Encyclopedia"
                    >
                      Encyclopedia
                    </button>
                    <button
                      onClick={() => {
                        onNavigateTab(hit.targetTab);
                        onClose();
                      }}
                      className="px-2 py-1 text-[11px] bg-[var(--bg-elevated)] hover:bg-[var(--border-subtle)] text-[var(--accent-primary)] rounded cursor-pointer"
                    >
                      Studio →
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hint */}
        <div className="px-4 py-2.5 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>↑↓ Navigate · Enter to Open Studio · Esc to Close</span>
          <span>Global Search (Ctrl+K / ⌘K)</span>
        </div>
      </div>
    </div>
  );
}
