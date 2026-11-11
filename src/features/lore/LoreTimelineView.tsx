import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  Check,
  Columns,
  Copy,
  Edit3,
  GitCommitHorizontal,
  History,
  List,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AutosaveStatus,
  EntityVersion,
  LORE_CATEGORIES,
  LoreEntry,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  VersionedEntityType,
  WorldEntity,
} from '../../types/nomen';
import {
  createLoreEntry,
  createTimelineEvent,
  deleteLoreEntry,
  deleteTimelineEvent,
  recordAiGeneration,
  updateLoreEntry,
  updateTimelineEvent,
} from '../../lib/db/firestore-service';
import { generateEntityBlueprintApi } from '../../lib/ai/client';
import {
  Button,
  ConfirmDeleteModal,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui/primitives';
import {
  AiComparisonModal,
  AutosaveIndicator,
  VersionHistoryModal,
} from '../../components/VersionHistoryModal';

interface LoreTimelineViewProps {
  project: Project;
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  entities?: WorldEntity[];
  versions?: EntityVersion[];
  aiSettings?: ProjectAiSetting | null;
}

const EVENT_CATEGORIES = [
  'Historical Event',
  'War / Battle',
  'Political Treaty',
  'Cataclysm / Eclipse',
  'Discovery / Relic',
  'Dynastic Succession',
  'Birth / Awakening',
  'Founding / Settlement',
];

const FICTIONAL_CALENDAR_PRESETS = [
  {
    label: 'Astral Era (AE)',
    sampleDate: 'Year 412 AE',
    era: 'First Astral Era',
  },
  {
    label: 'Before the Fall (BF)',
    sampleDate: 'Year 180 BF',
    era: 'Pre-Cataclysm Epoch',
  },
  {
    label: 'Imperial Reckoning (IR)',
    sampleDate: '3rd Moon, Year 89 IR',
    era: 'High Imperial Age',
  },
  {
    label: 'Cycle of Three Suns',
    sampleDate: 'Seventh Eclipse, 4th Cycle',
    era: 'Solar Concordance',
  },
  {
    label: 'Approximate / Mythic',
    sampleDate: 'circa The Dawn of Star-Iron',
    era: 'Age of Myth',
  },
];

export const LoreTimelineView: React.FC<LoreTimelineViewProps> = ({
  project,
  loreEntries,
  timelineEvents,
  entities = [],
  versions = [],
  aiSettings = null,
}) => {
  const [subTab, setSubTab] = useState<'lore' | 'timeline'>('lore');
  const [timelineLayout, setTimelineLayout] = useState<'visual' | 'list'>(
    'visual'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [loreCategoryFilter, setLoreCategoryFilter] = useState<string>('All');
  const [evtEraFilter, setEvtEraFilter] = useState<string>('All');
  const [evtCategoryFilter, setEvtCategoryFilter] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const locations = entities.filter((e) => e.category === 'location');
  const charactersAndFactions = entities.filter(
    (e) =>
      e.category === 'character' ||
      e.category === 'organization' ||
      e.category === 'family'
  );

  // Lore Modal
  const [loreModalOpen, setLoreModalOpen] = useState(false);
  const [editingLoreId, setEditingLoreId] = useState<string | null>(null);
  const [loreTitle, setLoreTitle] = useState('');
  const [loreCategory, setLoreCategory] = useState<string>(LORE_CATEGORIES[0]);
  const [loreEra, setLoreEra] = useState('');
  const [loreSummary, setLoreSummary] = useState('');
  const [loreContent, setLoreContent] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [loreAutosaveStatus, setLoreAutosaveStatus] =
    useState<AutosaveStatus>('idle');
  const [loreDirty, setLoreDirty] = useState(false);

  // Timeline Modal
  const [evtModalOpen, setEvtModalOpen] = useState(false);
  const [editingEvtId, setEditingEvtId] = useState<string | null>(null);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtDateLabel, setEvtDateLabel] = useState('');
  const [evtSortOrder, setEvtSortOrder] = useState<number>(100);
  const [evtEra, setEvtEra] = useState('');
  const [evtCategory, setEvtCategory] = useState('Historical Event');
  const [evtLocation, setEvtLocation] = useState('');
  const [evtParticipants, setEvtParticipants] = useState('');
  const [evtDesc, setEvtDesc] = useState('');
  const [evtAiPrompt, setEvtAiPrompt] = useState('');
  const [evtAiLoading, setEvtAiLoading] = useState(false);
  const [evtAutosaveStatus, setEvtAutosaveStatus] =
    useState<AutosaveStatus>('idle');
  const [evtDirty, setEvtDirty] = useState(false);

  // Multi-candidate AI Comparison State (Phase 8.3)
  const [comparisonCandidates, setComparisonCandidates] = useState<
    Record<string, string>[]
  >([]);
  const [comparisonMode, setComparisonMode] = useState<
    'lore' | 'timeline' | null
  >(null);

  // Version History Modal State (Phase 7.1)
  const [versionTarget, setVersionTarget] = useState<{
    id: string;
    type: VersionedEntityType;
    name: string;
    snapshot: Record<string, string>;
  } | null>(null);

  const [deleteLoreTarget, setDeleteLoreTarget] = useState<LoreEntry | null>(
    null
  );
  const [deleteEvtTarget, setDeleteEvtTarget] =
    useState<TimelineEvent | null>(null);

  // Debounced Autosave for existing Lore Chronicle (Phase 7.2)
  useEffect(() => {
    if (!loreModalOpen || !editingLoreId || !loreDirty || !loreTitle.trim()) {
      return;
    }
    setLoreAutosaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setLoreAutosaveStatus('saving');
      try {
        await updateLoreEntry(editingLoreId, {
          title: loreTitle,
          category: loreCategory,
          era: loreEra,
          summary: loreSummary,
          content: loreContent,
        });
        setLoreDirty(false);
        setLoreAutosaveStatus('saved');
      } catch {
        setLoreAutosaveStatus('failed');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    loreModalOpen,
    editingLoreId,
    loreDirty,
    loreTitle,
    loreCategory,
    loreEra,
    loreSummary,
    loreContent,
  ]);

  // Debounced Autosave for existing Timeline Event (Phase 7.2)
  useEffect(() => {
    if (!evtModalOpen || !editingEvtId || !evtDirty || !evtTitle.trim()) {
      return;
    }
    setEvtAutosaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setEvtAutosaveStatus('saving');
      try {
        await updateTimelineEvent(editingEvtId, {
          title: evtTitle,
          dateLabel: evtDateLabel,
          sortOrder: Number(evtSortOrder),
          era: evtEra,
          category: evtCategory,
          locationName: evtLocation,
          participants: evtParticipants,
          description: evtDesc,
        });
        setEvtDirty(false);
        setEvtAutosaveStatus('saved');
      } catch {
        setEvtAutosaveStatus('failed');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    evtModalOpen,
    editingEvtId,
    evtDirty,
    evtTitle,
    evtDateLabel,
    evtSortOrder,
    evtEra,
    evtCategory,
    evtLocation,
    evtParticipants,
    evtDesc,
  ]);

  const openCreateLore = () => {
    setEditingLoreId(null);
    setLoreTitle('');
    setLoreCategory(LORE_CATEGORIES[0]);
    setLoreEra('');
    setLoreSummary('');
    setLoreContent('');
    setAiPrompt('');
    setLoreDirty(false);
    setLoreAutosaveStatus('idle');
    setLoreModalOpen(true);
  };

  const openEditLore = (entry: LoreEntry) => {
    setEditingLoreId(entry.id);
    setLoreTitle(entry.title);
    setLoreCategory(entry.category);
    setLoreEra(entry.era);
    setLoreSummary(entry.summary);
    setLoreContent(entry.content);
    setLoreDirty(false);
    setLoreAutosaveStatus('saved');
    setLoreModalOpen(true);
  };

  const handleAiWeaveLore = async (count = 1) => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'lore',
        subCategory: loreCategory,
        prompt: aiPrompt,
        count,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
          customAiInstructions:
            aiSettings?.isEnabled && aiSettings.customInstructions
              ? aiSettings.customInstructions
              : undefined,
        },
      });

      if (count > 1 && res.candidates && res.candidates.length > 1) {
        setComparisonCandidates(res.candidates);
        setComparisonMode('lore');
      } else {
        const r = res.result;
        setLoreTitle(r.title || r.name || loreTitle);
        setLoreEra(r.era || loreEra);
        setLoreSummary(r.summary || loreSummary);
        setLoreContent(r.content || r.history || loreContent);
        setLoreDirty(true);
      }

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Lore Studio',
        category: loreCategory,
        promptSummary: aiPrompt,
        resultsSummary: res.result.title || res.result.name || 'Lore Chronicle',
        modelUsed: res.modelUsed,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveLore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loreTitle.trim()) return;
    if (editingLoreId) {
      await updateLoreEntry(editingLoreId, {
        title: loreTitle,
        category: loreCategory,
        era: loreEra,
        summary: loreSummary,
        content: loreContent,
      });
    } else {
      await createLoreEntry({
        projectId: project.id,
        title: loreTitle,
        category: loreCategory,
        era: loreEra,
        summary: loreSummary,
        content: loreContent,
      });
    }
    setLoreDirty(false);
    setLoreModalOpen(false);
  };

  const handleCopyLore = (entry: LoreEntry) => {
    const md = `# ${entry.title}\n*${entry.category}${
      entry.era ? ` · ${entry.era}` : ''
    }*\n\n${entry.summary ? `> ${entry.summary}\n\n` : ''}${entry.content}`;
    navigator.clipboard.writeText(md);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreateEvt = () => {
    const maxSort =
      timelineEvents.length > 0
        ? Math.max(...timelineEvents.map((e) => e.sortOrder)) + 10
        : 10;
    setEditingEvtId(null);
    setEvtTitle('');
    setEvtDateLabel(`Year ${maxSort} AE`);
    setEvtSortOrder(maxSort);
    setEvtEra('First Astral Era');
    setEvtCategory('Historical Event');
    setEvtLocation('');
    setEvtParticipants('');
    setEvtDesc('');
    setEvtAiPrompt('');
    setEvtDirty(false);
    setEvtAutosaveStatus('idle');
    setEvtModalOpen(true);
  };

  const openEditEvt = (evt: TimelineEvent) => {
    setEditingEvtId(evt.id);
    setEvtTitle(evt.title);
    setEvtDateLabel(evt.dateLabel);
    setEvtSortOrder(evt.sortOrder);
    setEvtEra(evt.era);
    setEvtCategory(evt.category);
    setEvtLocation(evt.locationName);
    setEvtParticipants(evt.participants);
    setEvtDesc(evt.description);
    setEvtAiPrompt('');
    setEvtDirty(false);
    setEvtAutosaveStatus('saved');
    setEvtModalOpen(true);
  };

  const handleAiDraftTimelineEvent = async (count = 1) => {
    if (!evtAiPrompt.trim()) return;
    setEvtAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'lore',
        subCategory: `Timeline Event (${evtCategory})`,
        prompt: `${evtAiPrompt}. Return title, era, summary (use for dateLabel or short hook), and content (use for event description and consequences).`,
        count,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
          customAiInstructions:
            aiSettings?.isEnabled && aiSettings.customInstructions
              ? aiSettings.customInstructions
              : undefined,
        },
      });

      if (count > 1 && res.candidates && res.candidates.length > 1) {
        setComparisonCandidates(res.candidates);
        setComparisonMode('timeline');
      } else {
        const r = res.result;
        setEvtTitle(r.title || r.name || evtTitle);
        if (r.era) setEvtEra(r.era);
        setEvtDesc(r.content || r.summary || evtDesc);
        setEvtDirty(true);
      }

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Timeline Architect',
        category: evtCategory,
        promptSummary: evtAiPrompt,
        resultsSummary:
          res.result.title || res.result.name || 'Timeline Event',
        modelUsed: res.modelUsed,
      });
    } finally {
      setEvtAiLoading(false);
    }
  };

  const handleShiftEventOrder = async (evt: TimelineEvent, delta: number) => {
    await updateTimelineEvent(evt.id, {
      title: evt.title,
      dateLabel: evt.dateLabel,
      sortOrder: evt.sortOrder + delta,
      era: evt.era,
      category: evt.category,
      locationName: evt.locationName,
      participants: evt.participants,
      description: evt.description,
    });
  };

  const handleSaveEvt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle.trim()) return;
    if (editingEvtId) {
      await updateTimelineEvent(editingEvtId, {
        title: evtTitle,
        dateLabel: evtDateLabel,
        sortOrder: Number(evtSortOrder),
        era: evtEra,
        category: evtCategory,
        locationName: evtLocation,
        participants: evtParticipants,
        description: evtDesc,
      });
    } else {
      await createTimelineEvent({
        projectId: project.id,
        title: evtTitle,
        dateLabel: evtDateLabel,
        sortOrder: Number(evtSortOrder),
        era: evtEra,
        category: evtCategory,
        locationName: evtLocation,
        participants: evtParticipants,
        description: evtDesc,
      });
    }
    setEvtDirty(false);
    setEvtModalOpen(false);
  };

  const filteredLore = loreEntries.filter((l) => {
    if (loreCategoryFilter !== 'All' && l.category !== loreCategoryFilter) {
      return false;
    }
    if (
      searchQuery.trim() &&
      !l.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !l.category.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !l.era.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !l.content.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const distinctEras = useMemo(() => {
    const set = new Set<string>();
    timelineEvents.forEach((ev) => {
      if (ev.era.trim()) set.add(ev.era.trim());
    });
    return Array.from(set);
  }, [timelineEvents]);

  const filteredEvents = timelineEvents.filter((ev) => {
    if (evtEraFilter !== 'All' && (ev.era.trim() || 'Uncategorized Epoch') !== evtEraFilter) {
      return false;
    }
    if (evtCategoryFilter !== 'All' && ev.category !== evtCategoryFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ev.title.toLowerCase().includes(q) ||
      ev.dateLabel.toLowerCase().includes(q) ||
      ev.era.toLowerCase().includes(q) ||
      ev.locationName.toLowerCase().includes(q) ||
      ev.participants.toLowerCase().includes(q)
    );
  });

  // Group events by Era for Visual Swimlane Timeline (Phase 9.2)
  const eraSwimlanes = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    filteredEvents.forEach((ev) => {
      const eraKey = ev.era.trim() || 'Uncategorized Epoch';
      const arr = groups.get(eraKey) || [];
      arr.push(ev);
      groups.set(eraKey, arr);
    });
    return Array.from(groups.entries());
  }, [filteredEvents]);

  // Detect chronological index collisions for Visual Timeline warning
  const collidingIndices = useMemo(() => {
    const counts = new Map<number, Set<string>>();
    timelineEvents.forEach((ev) => {
      const set = counts.get(ev.sortOrder) || new Set<string>();
      set.add(ev.dateLabel);
      counts.set(ev.sortOrder, set);
    });
    const bad = new Set<number>();
    counts.forEach((dates, idx) => {
      if (dates.size > 1) bad.add(idx);
    });
    return bad;
  }, [timelineEvents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Lore Archives & Chronological Timeline
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Record myths, wars, treaties, and sacred texts alongside an interactive visual timeline connected to your world entities.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg self-start">
          <button
            onClick={() => setSubTab('lore')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              subTab === 'lore'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Lore Chronicles ({loreEntries.length})
          </button>
          <button
            onClick={() => setSubTab('timeline')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              subTab === 'timeline'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Chronological Timeline ({timelineEvents.length})
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 border border-[var(--border-subtle)] rounded-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="flex-1 max-w-md">
            <Input
              placeholder={
                subTab === 'lore'
                  ? 'Search lore chronicles by title, era, or content...'
                  : 'Search timeline events by year, location, or participants...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {subTab === 'lore' ? (
            <Select
              className="sm:w-52"
              value={loreCategoryFilter}
              onChange={(e) => setLoreCategoryFilter(e.target.value)}
            >
              <option value="All">
                All Lore Categories ({loreEntries.length})
              </option>
              {LORE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="sm:w-44"
                value={evtEraFilter}
                onChange={(e) => setEvtEraFilter(e.target.value)}
              >
                <option value="All">All Eras ({distinctEras.length || 1})</option>
                {distinctEras.map((era) => (
                  <option key={era} value={era}>
                    {era}
                  </option>
                ))}
              </Select>
              <Select
                className="sm:w-44"
                value={evtCategoryFilter}
                onChange={(e) => setEvtCategoryFilter(e.target.value)}
              >
                <option value="All">All Event Types</option>
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
              <div className="inline-flex rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-1 self-start">
                <button
                  type="button"
                  onClick={() => setTimelineLayout('visual')}
                  className={`px-3 py-1 text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
                    timelineLayout === 'visual'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <GitCommitHorizontal className="w-3.5 h-3.5" />
                  Visual Era Track
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineLayout('list')}
                  className={`px-3 py-1 text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
                    timelineLayout === 'list'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Chronicle Table
                </button>
              </div>
            </div>
          )}
        </div>

        {subTab === 'lore' ? (
          <Button variant="primary" size="sm" onClick={openCreateLore}>
            <Plus className="w-4 h-4" />
            New Lore Chronicle
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={openCreateEvt}>
            <Plus className="w-4 h-4" />
            Add Timeline Event
          </Button>
        )}
      </div>

      {/* LORE STUDIO */}
      {subTab === 'lore' && (
        <div className="space-y-4">
          {filteredLore.length === 0 ? (
            <EmptyState
              title="No Lore Chronicles Recorded"
              description="Write historical documents, creation myths, ancient wars, prophecies, and cultural traditions."
              actionLabel="Create First Lore Chronicle"
              onAction={openCreateLore}
            />
          ) : (
            filteredLore.map((entry) => (
              <article
                key={entry.id}
                className="p-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{entry.category}</span>
                      {entry.era && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.era}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-2xl font-semibold text-[var(--text-primary)] font-serif-display mt-1">
                      {entry.title}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setVersionTarget({
                          id: entry.id,
                          type: 'lore',
                          name: entry.title,
                          snapshot: {
                            title: entry.title,
                            category: entry.category,
                            era: entry.era,
                            summary: entry.summary,
                            content: entry.content,
                          },
                        })
                      }
                      title="Inspect Version History"
                    >
                      <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      History
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLore(entry)}
                    >
                      {copiedId === entry.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#34D399]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditLore(entry)}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteLoreTarget(entry)}
                      className="text-[#F87171]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {entry.summary && (
                  <p className="text-xs text-[var(--accent-primary)] italic">
                    {entry.summary}
                  </p>
                )}
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                  {entry.content}
                </p>
              </article>
            ))
          )}
        </div>
      )}

      {/* TIMELINE MANAGER (Phase 9.2 Visual & List Modes) */}
      {subTab === 'timeline' && (
        <div className="space-y-6">
          {filteredEvents.length === 0 ? (
            <EmptyState
              title="No Chronological Events Recorded"
              description="Map out eras, treaties, cataclysms, and births in chronological order."
              actionLabel="Add First Timeline Event"
              onAction={openCreateEvt}
            />
          ) : timelineLayout === 'visual' ? (
            /* VISUAL ERA SWIMLANE TIMELINE (Phase 9.2) */
            <div className="space-y-8">
              {eraSwimlanes.map(([eraName, eventsInEra]) => (
                <section
                  key={eraName}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-6 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-[var(--accent-primary)] font-semibold">
                        Chronological Era Swimlane
                      </span>
                      <h2 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                        {eraName}
                      </h2>
                    </div>
                    <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      {eventsInEra.length}{' '}
                      {eventsInEra.length === 1 ? 'Event' : 'Events'}
                    </span>
                  </div>

                  {/* Connected Vertical Timeline Track */}
                  <div className="relative pl-6 border-l-2 border-[#2A324B] space-y-6">
                    {eventsInEra.map((evt) => {
                      const hasCollision = collidingIndices.has(evt.sortOrder);
                      return (
                        <div key={evt.id} className="relative group">
                          {/* Timeline Node Marker */}
                          <span
                            className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                              hasCollision
                                ? 'bg-[#3A1820] border-[#F87171]'
                                : 'bg-[var(--bg-elevated)] border-[var(--accent-primary)]'
                            }`}
                          />

                          <div className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 rounded-xl space-y-2.5 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                                  {evt.dateLabel}
                                </span>
                                <span className="text-[var(--text-muted)] font-mono-tabular">
                                  (Epoch {evt.sortOrder})
                                </span>
                                <span className="text-[var(--text-muted)]">
                                  · {evt.category}
                                </span>
                                {hasCollision && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-[#FCA5A5]">
                                    <AlertTriangle className="w-3 h-3" />
                                    Epoch Collision
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleShiftEventOrder(evt, -5)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                  title="Move earlier (-5)"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleShiftEventOrder(evt, 5)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                  title="Move later (+5)"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setVersionTarget({
                                      id: evt.id,
                                      type: 'timeline_event',
                                      name: evt.title,
                                      snapshot: {
                                        title: evt.title,
                                        dateLabel: evt.dateLabel,
                                        sortOrder: String(evt.sortOrder),
                                        era: evt.era,
                                        category: evt.category,
                                        locationName: evt.locationName,
                                        participants: evt.participants,
                                        description: evt.description,
                                      },
                                    })
                                  }
                                  title="Version History"
                                >
                                  <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditEvt(evt)}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteEvtTarget(evt)}
                                  className="text-[#F87171]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>

                            <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                              {evt.title}
                            </h3>

                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              {evt.description}
                            </p>

                            {(evt.locationName || evt.participants) && (
                              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                                {evt.locationName && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-[#6EE7B7]" />
                                    <span>{evt.locationName}</span>
                                  </span>
                                )}
                                {evt.participants && (
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                    <span>{evt.participants}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            /* CHRONICLE LIST MODE */
            <div className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="md:w-52 shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-[var(--accent-primary)] font-mono-tabular">
                      {evt.dateLabel}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-tabular">
                      <span>Epoch Index: {evt.sortOrder}</span>
                      <button
                        onClick={() => handleShiftEventOrder(evt, -5)}
                        className="p-0.5 hover:text-[var(--text-primary)] cursor-pointer"
                        title="Move earlier in chronology (-5)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleShiftEventOrder(evt, 5)}
                        className="p-0.5 hover:text-[var(--text-primary)] cursor-pointer"
                        title="Move later in chronology (+5)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    {evt.era && (
                      <p className="text-xs text-[var(--text-secondary)]">{evt.era}</p>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{evt.category}</span>
                      {evt.locationName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Location: {evt.locationName}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                      {evt.title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {evt.description}
                    </p>
                    {evt.participants && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Key Figures / Factions: {evt.participants}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setVersionTarget({
                          id: evt.id,
                          type: 'timeline_event',
                          name: evt.title,
                          snapshot: {
                            title: evt.title,
                            dateLabel: evt.dateLabel,
                            sortOrder: String(evt.sortOrder),
                            era: evt.era,
                            category: evt.category,
                            locationName: evt.locationName,
                            participants: evt.participants,
                            description: evt.description,
                          },
                        })
                      }
                    >
                      <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      History
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditEvt(evt)}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteEvtTarget(evt)}
                      className="text-[#F87171]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lore Editor Modal */}
      <Modal
        open={loreModalOpen}
        onClose={() => setLoreModalOpen(false)}
        title={editingLoreId ? 'Edit Lore Chronicle' : 'Create Lore Chronicle'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveLore} className="space-y-4">
          <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Lore Weaver: e.g., 'Write a treaty chronicle that secretly erased the Seventh House'..."
            />
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleAiWeaveLore(1)}
                disabled={aiLoading}
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {aiLoading ? 'Weaving...' : 'Draft with AI'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAiWeaveLore(3)}
                disabled={aiLoading}
                title="Generate 3 variations side-by-side"
              >
                <Columns className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Compare 3
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel label="Chronicle Title" required />
              <Input
                value={loreTitle}
                onChange={(e) => {
                  setLoreTitle(e.target.value);
                  setLoreDirty(true);
                }}
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" />
              <Select
                value={loreCategory}
                onChange={(e) => {
                  setLoreCategory(e.target.value);
                  setLoreDirty(true);
                }}
              >
                {LORE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Historical Era / Epoch" />
              <Input
                value={loreEra}
                onChange={(e) => {
                  setLoreEra(e.target.value);
                  setLoreDirty(true);
                }}
                placeholder="e.g., First Astral Era (Year 1 AE)"
              />
            </div>
            <div>
              <FieldLabel label="Brief Synopsis" />
              <Input
                value={loreSummary}
                onChange={(e) => {
                  setLoreSummary(e.target.value);
                  setLoreDirty(true);
                }}
                placeholder="One-line summary..."
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Full Lore Text / Document" required />
            <Textarea
              rows={7}
              value={loreContent}
              onChange={(e) => {
                setLoreContent(e.target.value);
                setLoreDirty(true);
              }}
              required
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
            {editingLoreId ? (
              <AutosaveIndicator status={loreAutosaveStatus} />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Initial save creates Version v1 snapshot
              </span>
            )}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLoreModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Lore Chronicle
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Timeline Event Modal */}
      <Modal
        open={evtModalOpen}
        onClose={() => setEvtModalOpen(false)}
        title={
          editingEvtId ? 'Edit Timeline Event' : 'Add Chronological Event'
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveEvt} className="space-y-4">
          <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={evtAiPrompt}
              onChange={(e) => setEvtAiPrompt(e.target.value)}
              placeholder="AI Event Architect: e.g., 'A three-day solar eclipse that shattered the northern passes'..."
            />
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleAiDraftTimelineEvent(1)}
                disabled={evtAiLoading}
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {evtAiLoading ? 'Drafting...' : 'Draft with AI'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAiDraftTimelineEvent(3)}
                disabled={evtAiLoading}
                title="Compare 3 variations side-by-side"
              >
                <Columns className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Compare 3
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel label="Event Title" required />
              <Input
                value={evtTitle}
                onChange={(e) => {
                  setEvtTitle(e.target.value);
                  setEvtDirty(true);
                }}
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" />
              <Select
                value={evtCategory}
                onChange={(e) => {
                  setEvtCategory(e.target.value);
                  setEvtDirty(true);
                }}
              >
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Fictional Calendar & Reckoning Presets (Phase 9.2) */}
          <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Fictional Calendar & Reckoning Presets</span>
              <span className="text-[var(--text-muted)]">
                Supports exact, non-Gregorian, or approximate mythic dates
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FICTIONAL_CALENDAR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setEvtDateLabel(preset.sampleDate);
                    setEvtEra(preset.era);
                    setEvtDirty(true);
                  }}
                  className="px-2 py-1 text-[11px] bg-[var(--bg-elevated)] hover:bg-[#1E2538] text-[var(--accent-primary)] rounded border border-[var(--border-subtle)] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel label="In-Universe Date Label" required />
              <Input
                value={evtDateLabel}
                onChange={(e) => {
                  setEvtDateLabel(e.target.value);
                  setEvtDirty(true);
                }}
                placeholder="e.g., Year 412 AE or 3rd Eclipse"
                required
              />
            </div>
            <div>
              <FieldLabel
                label="Numeric Sort Order"
                hint="Chronological index"
              />
              <Input
                type="number"
                value={evtSortOrder}
                onChange={(e) => {
                  setEvtSortOrder(Number(e.target.value));
                  setEvtDirty(true);
                }}
              />
            </div>
            <div>
              <FieldLabel label="Era Name" />
              <Input
                value={evtEra}
                onChange={(e) => {
                  setEvtEra(e.target.value);
                  setEvtDirty(true);
                }}
                placeholder="Late Monarchy"
              />
            </div>
          </div>

          {(locations.length > 0 || charactersAndFactions.length > 0) && (
            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Quick-Select Location from World Builder
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setEvtLocation(e.target.value);
                        setEvtDirty(true);
                      }
                    }}
                  >
                    <option value="">-- Choose Canonical Location --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.name}>
                        {loc.name} ({loc.subCategory})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {charactersAndFactions.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Append Participant / Faction from Project
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setEvtParticipants((prev) =>
                        prev ? `${prev}, ${e.target.value}` : e.target.value
                      );
                      setEvtDirty(true);
                    }}
                  >
                    <option value="">-- Add Character or Faction --</option>
                    {charactersAndFactions.map((ent) => (
                      <option key={ent.id} value={ent.name}>
                        [{ent.subCategory}] {ent.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Associated Location" />
              <Input
                value={evtLocation}
                onChange={(e) => {
                  setEvtLocation(e.target.value);
                  setEvtDirty(true);
                }}
                placeholder="City of Eldoria"
              />
            </div>
            <div>
              <FieldLabel label="Key Participants / Factions" />
              <Input
                value={evtParticipants}
                onChange={(e) => {
                  setEvtParticipants(e.target.value);
                  setEvtDirty(true);
                }}
                placeholder="Caelum Vaelor, House Vaelor"
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Event Description & Consequences" />
            <Textarea
              rows={3}
              value={evtDesc}
              onChange={(e) => {
                setEvtDesc(e.target.value);
                setEvtDirty(true);
              }}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
            {editingEvtId ? (
              <AutosaveIndicator status={evtAutosaveStatus} />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Initial save creates Version v1 snapshot
              </span>
            )}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEvtModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Timeline Event
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* AI Side-by-Side Comparison Modal (Phase 8.3) */}
      <AiComparisonModal
        open={Boolean(comparisonMode)}
        onClose={() => setComparisonMode(null)}
        title={
          comparisonMode === 'lore'
            ? 'Compare AI Lore Chronicle Variations'
            : 'Compare AI Timeline Event Variations'
        }
        candidates={comparisonCandidates}
        primaryTitleKey="title"
        secondaryKey="era"
        summaryKey="summary"
        displayFields={[{ key: 'content', label: 'Full Text / Description' }]}
        onSelectCandidate={(c) => {
          if (comparisonMode === 'lore') {
            setLoreTitle(c.title || c.name || loreTitle);
            setLoreEra(c.era || loreEra);
            setLoreSummary(c.summary || loreSummary);
            setLoreContent(c.content || c.history || loreContent);
            setLoreDirty(true);
          } else {
            setEvtTitle(c.title || c.name || evtTitle);
            if (c.era) setEvtEra(c.era);
            setEvtDesc(c.content || c.summary || evtDesc);
            setEvtDirty(true);
          }
        }}
      />

      {/* Version History Modal (Phase 7.1) */}
      {versionTarget && (
        <VersionHistoryModal
          open={Boolean(versionTarget)}
          onClose={() => setVersionTarget(null)}
          projectId={project.id}
          entityId={versionTarget.id}
          entityType={versionTarget.type}
          entityName={versionTarget.name}
          currentSnapshot={versionTarget.snapshot}
          versions={versions}
        />
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteLoreTarget)}
        onClose={() => setDeleteLoreTarget(null)}
        onConfirm={async () => {
          if (!deleteLoreTarget) return;
          await deleteLoreEntry(deleteLoreTarget.id);
          setDeleteLoreTarget(null);
        }}
        title="Move Lore Chronicle to Trash"
        description={`Move "${deleteLoreTarget?.title}" to Trash? You can restore it anytime from the Encyclopedia Vault.`}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteEvtTarget)}
        onClose={() => setDeleteEvtTarget(null)}
        onConfirm={async () => {
          if (!deleteEvtTarget) return;
          await deleteTimelineEvent(deleteEvtTarget.id);
          setDeleteEvtTarget(null);
        }}
        title="Move Timeline Event to Trash"
        description={`Move "${deleteEvtTarget?.title}" to Trash? You can restore it anytime from the Encyclopedia Vault.`}
      />
    </div>
  );
};
