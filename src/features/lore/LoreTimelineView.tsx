import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  Check,
  Copy,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  LORE_CATEGORIES,
  LoreEntry,
  Project,
  TimelineEvent,
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

interface LoreTimelineViewProps {
  project: Project;
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  entities?: WorldEntity[];
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

export const LoreTimelineView: React.FC<LoreTimelineViewProps> = ({
  project,
  loreEntries,
  timelineEvents,
  entities = [],
}) => {
  const [subTab, setSubTab] = useState<'lore' | 'timeline'>('lore');
  const [searchQuery, setSearchQuery] = useState('');
  const [loreCategoryFilter, setLoreCategoryFilter] = useState<string>('All');
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

  const [deleteLoreTarget, setDeleteLoreTarget] = useState<LoreEntry | null>(
    null
  );
  const [deleteEvtTarget, setDeleteEvtTarget] =
    useState<TimelineEvent | null>(null);

  const openCreateLore = () => {
    setEditingLoreId(null);
    setLoreTitle('');
    setLoreCategory(LORE_CATEGORIES[0]);
    setLoreEra('');
    setLoreSummary('');
    setLoreContent('');
    setAiPrompt('');
    setLoreModalOpen(true);
  };

  const openEditLore = (entry: LoreEntry) => {
    setEditingLoreId(entry.id);
    setLoreTitle(entry.title);
    setLoreCategory(entry.category);
    setLoreEra(entry.era);
    setLoreSummary(entry.summary);
    setLoreContent(entry.content);
    setLoreModalOpen(true);
  };

  const handleAiWeaveLore = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'lore',
        subCategory: loreCategory,
        prompt: aiPrompt,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      const r = res.result;
      setLoreTitle(r.title || r.name || loreTitle);
      setLoreEra(r.era || loreEra);
      setLoreSummary(r.summary || loreSummary);
      setLoreContent(r.content || r.history || loreContent);

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Lore Studio',
        category: loreCategory,
        promptSummary: aiPrompt,
        resultsSummary: r.title || r.name || 'Lore Chronicle',
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
    setEvtModalOpen(true);
  };

  const handleAiDraftTimelineEvent = async () => {
    if (!evtAiPrompt.trim()) return;
    setEvtAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'lore',
        subCategory: `Timeline Event (${evtCategory})`,
        prompt: `${evtAiPrompt}. Return title, era, summary (use for dateLabel or short hook), and content (use for event description and consequences).`,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      const r = res.result;
      setEvtTitle(r.title || r.name || evtTitle);
      if (r.era) setEvtEra(r.era);
      setEvtDesc(r.content || r.summary || evtDesc);

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Timeline Architect',
        category: evtCategory,
        promptSummary: evtAiPrompt,
        resultsSummary: r.title || r.name || 'Timeline Event',
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

  const filteredEvents = timelineEvents.filter((ev) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            Lore Archives & Chronological Timeline
          </h1>
          <p className="text-sm text-[#8E89A6] mt-0.5">
            Record myths, wars, treaties, and sacred texts alongside an epoch-sorted timeline connected to your world entities.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#111520] border border-[#1E2436] rounded-lg self-start">
          <button
            onClick={() => setSubTab('lore')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              subTab === 'lore'
                ? 'bg-[#7C6CC4] text-[#F8F7FC]'
                : 'text-[#8E89A6] hover:text-[#ECEAF2]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Lore Chronicles ({loreEntries.length})
          </button>
          <button
            onClick={() => setSubTab('timeline')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              subTab === 'timeline'
                ? 'bg-[#7C6CC4] text-[#F8F7FC]'
                : 'text-[#8E89A6] hover:text-[#ECEAF2]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Chronological Timeline ({timelineEvents.length})
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111520] p-4 border border-[#1E2436] rounded-xl">
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
          {subTab === 'lore' && (
            <Select
              className="sm:w-52"
              value={loreCategoryFilter}
              onChange={(e) => setLoreCategoryFilter(e.target.value)}
            >
              <option value="All">All Lore Categories ({loreEntries.length})</option>
              {LORE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
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
                className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
                      <span>{entry.category}</span>
                      {entry.era && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.era}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display mt-1">
                      {entry.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
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
                  <p className="text-xs text-[#C4B5FD] italic">
                    {entry.summary}
                  </p>
                )}
                <p className="text-sm text-[#D0CCE0] leading-relaxed whitespace-pre-line">
                  {entry.content}
                </p>
              </article>
            ))
          )}
        </div>
      )}

      {/* TIMELINE MANAGER */}
      {subTab === 'timeline' && (
        <div className="space-y-4">
          {filteredEvents.length === 0 ? (
            <EmptyState
              title="No Chronological Events Recorded"
              description="Map out eras, treaties, cataclysms, and births in chronological order."
              actionLabel="Add First Timeline Event"
              onAction={openCreateEvt}
            />
          ) : (
            <div className="divide-y divide-[#1E2436] bg-[#111520] border border-[#1E2436] rounded-xl overflow-hidden">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-[#151A28] transition-colors"
                >
                  <div className="md:w-52 shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-[#C4B5FD] font-mono-tabular">
                      {evt.dateLabel}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[#736E8A] font-mono-tabular">
                      <span>Epoch Index: {evt.sortOrder}</span>
                      <button
                        onClick={() => handleShiftEventOrder(evt, -5)}
                        className="p-0.5 hover:text-[#ECEAF2] cursor-pointer"
                        title="Move earlier in chronology (-5)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleShiftEventOrder(evt, 5)}
                        className="p-0.5 hover:text-[#ECEAF2] cursor-pointer"
                        title="Move later in chronology (+5)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    {evt.era && (
                      <p className="text-xs text-[#9D97B8]">{evt.era}</p>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#8E89A6]">
                      <span>{evt.category}</span>
                      {evt.locationName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Location: {evt.locationName}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">
                      {evt.title}
                    </h3>
                    <p className="text-xs text-[#D0CCE0] leading-relaxed">
                      {evt.description}
                    </p>
                    {evt.participants && (
                      <p className="text-xs text-[#8E89A6]">
                        Key Figures / Factions: {evt.participants}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
          <div className="p-3 bg-[#0D1018] border border-[#23293B] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Lore Weaver: e.g., 'Write a treaty chronicle that secretly erased the Seventh House'..."
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAiWeaveLore}
              disabled={aiLoading}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
              {aiLoading ? 'Weaving...' : 'Draft with AI'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel label="Chronicle Title" required />
              <Input
                value={loreTitle}
                onChange={(e) => setLoreTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" />
              <Select
                value={loreCategory}
                onChange={(e) => setLoreCategory(e.target.value)}
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
                onChange={(e) => setLoreEra(e.target.value)}
                placeholder="e.g., First Astral Era (Year 1 AE)"
              />
            </div>
            <div>
              <FieldLabel label="Brief Synopsis" />
              <Input
                value={loreSummary}
                onChange={(e) => setLoreSummary(e.target.value)}
                placeholder="One-line summary..."
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Full Lore Text / Document" required />
            <Textarea
              rows={7}
              value={loreContent}
              onChange={(e) => setLoreContent(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
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
          <div className="p-3 bg-[#0D1018] border border-[#23293B] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={evtAiPrompt}
              onChange={(e) => setEvtAiPrompt(e.target.value)}
              placeholder="AI Event Architect: e.g., 'A three-day solar eclipse that shattered the northern passes'..."
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAiDraftTimelineEvent}
              disabled={evtAiLoading}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
              {evtAiLoading ? 'Drafting...' : 'Draft with AI'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel label="Event Title" required />
              <Input
                value={evtTitle}
                onChange={(e) => setEvtTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" />
              <Select
                value={evtCategory}
                onChange={(e) => setEvtCategory(e.target.value)}
              >
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel label="In-Universe Date Label" required />
              <Input
                value={evtDateLabel}
                onChange={(e) => setEvtDateLabel(e.target.value)}
                placeholder="e.g., Year 412 AE"
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
                onChange={(e) => setEvtSortOrder(Number(e.target.value))}
              />
            </div>
            <div>
              <FieldLabel label="Era Name" />
              <Input
                value={evtEra}
                onChange={(e) => setEvtEra(e.target.value)}
                placeholder="Late Monarchy"
              />
            </div>
          </div>

          {(locations.length > 0 || charactersAndFactions.length > 0) && (
            <div className="p-3 bg-[#0D1018] border border-[#1E2436] rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[#9D97B8] mb-1">
                    Quick-Select Location from World Builder
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setEvtLocation(e.target.value);
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
                  <label className="block text-[11px] text-[#9D97B8] mb-1">
                    Append Participant / Faction from Project
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setEvtParticipants((prev) =>
                        prev ? `${prev}, ${e.target.value}` : e.target.value
                      );
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
                onChange={(e) => setEvtLocation(e.target.value)}
                placeholder="City of Eldoria"
              />
            </div>
            <div>
              <FieldLabel label="Key Participants / Factions" />
              <Input
                value={evtParticipants}
                onChange={(e) => setEvtParticipants(e.target.value)}
                placeholder="Caelum Vaelor, House Vaelor"
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Event Description & Consequences" />
            <Textarea
              rows={3}
              value={evtDesc}
              onChange={(e) => setEvtDesc(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
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
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleteLoreTarget)}
        onClose={() => setDeleteLoreTarget(null)}
        onConfirm={async () => {
          if (!deleteLoreTarget) return;
          await deleteLoreEntry(deleteLoreTarget.id);
          setDeleteLoreTarget(null);
        }}
        title="Delete Lore Chronicle"
        description={`Delete "${deleteLoreTarget?.title}"?`}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteEvtTarget)}
        onClose={() => setDeleteEvtTarget(null)}
        onConfirm={async () => {
          if (!deleteEvtTarget) return;
          await deleteTimelineEvent(deleteEvtTarget.id);
          setDeleteEvtTarget(null);
        }}
        title="Delete Timeline Event"
        description={`Delete "${deleteEvtTarget?.title}"?`}
      />
    </div>
  );
};
