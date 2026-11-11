import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Edit3,
  FileJson,
  FolderPlus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createEntityRelation,
  createFavorite,
  createLoreEntry,
  createNamingRule,
  createProject,
  createTimelineEvent,
  deleteProjectWithCascade,
  recordActivityLog,
  saveProjectAiSettings,
  updateEntity,
  updateProject,
} from '../../lib/db/firestore-service';
import {
  NomenProjectExportSchema,
  ProjectInputSchema,
} from '../../lib/validation/schemas';
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

interface ProjectsViewProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  entities: WorldEntity[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  onSeedStarter: () => Promise<void>;
  seeding: boolean;
}

const GENRE_OPTIONS = [
  'Dark Editorial Fantasy',
  'High Fantasy',
  'Epic Progression / Cultivation',
  'Grimdark Fantasy',
  'Space Opera / Sci-Fi',
  'Arcane Steampunk / Gaslamp',
  'Mythic Historical Fiction',
  'Urban Occult / Noir',
  'Custom Speculative Genre',
];

const LANGUAGE_OPTIONS = [
  'English',
  'Indonesian',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Portuguese',
];

interface ParsedImportPreview {
  schemaVersion: string;
  projectTitle: string;
  genre: string;
  language: string;
  description: string;
  worldSettings: string;
  entitiesCount: number;
  relationsCount: number;
  loreCount: number;
  timelineCount: number;
  namingRulesCount: number;
  favoritesCount: number;
  hasCustomAiInstructions: boolean;
  duplicateIdsResolved: number;
  rawPayload: ReturnType<typeof NomenProjectExportSchema.parse>;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  entities,
  loreEntries,
  timelineEvents,
  onSeedStarter,
  seeding,
}) => {
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'archived'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState(GENRE_OPTIONS[0]);
  const [worldSettings, setWorldSettings] = useState('');
  const [language, setLanguage] = useState('English');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Phase 10.2 — Validated Import Preview State
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] =
    useState<ParsedImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreateModal = () => {
    setEditingProject(null);
    setTitle('');
    setDescription('');
    setGenre(GENRE_OPTIONS[0]);
    setWorldSettings('');
    setLanguage('English');
    setStatus('active');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (proj: Project) => {
    setEditingProject(proj);
    setTitle(proj.title);
    setDescription(proj.description);
    setGenre(proj.genre);
    setWorldSettings(proj.worldSettings);
    setLanguage(proj.language);
    setStatus(proj.status);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = ProjectInputSchema.safeParse({
      title,
      description,
      genre,
      worldSettings,
      language,
      status,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message || 'Please check required fields.'
      );
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        await updateProject(editingProject.id, parsed.data);
      } else {
        const newId = await createProject(parsed.data);
        onSelectProject(newId);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save project.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Phase 10.2 Step 1 — Parse & Validate JSON File Before Committing
  const handleSelectImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportNotice(null);

    try {
      const raw = await file.text();
      const json = JSON.parse(raw);
      const parsed = NomenProjectExportSchema.safeParse(json);

      if (!parsed.success) {
        setImportError(
          `Invalid NOMEN JSON Schema: ${
            parsed.error.issues[0]?.message || 'Unrecognized structure'
          }`
        );
        return;
      }

      const d = parsed.data;
      const seenIds = new Set<string>();
      let duplicateIdsResolved = 0;
      for (const ent of d.entities) {
        if (ent.id) {
          if (seenIds.has(ent.id)) duplicateIdsResolved++;
          seenIds.add(ent.id);
        }
      }

      setImportPreview({
        schemaVersion: d.schemaVersion || '1.0.0',
        projectTitle: d.project.title,
        genre: d.project.genre,
        language: d.project.language,
        description: d.project.description,
        worldSettings: d.project.worldSettings,
        entitiesCount: d.entities.length,
        relationsCount: d.relations.length,
        loreCount: d.loreEntries.length,
        timelineCount: d.timelineEvents.length,
        namingRulesCount: d.namingRules.length,
        favoritesCount: d.favorites.length,
        hasCustomAiInstructions: Boolean(d.aiSettings?.customInstructions),
        duplicateIdsResolved,
        rawPayload: d,
      });
    } catch (err) {
      setImportError(
        err instanceof Error
          ? `Malformed JSON file: ${err.message}`
          : 'Could not parse JSON file.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Phase 10.2 Step 2 — Execute Confirmed Import with ID Remapping & Hierarchy Preservation
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    const d = importPreview.rawPayload;

    try {
      const newProjectId = await createProject({
        title: `${d.project.title} (Imported)`,
        description: d.project.description || '',
        genre: d.project.genre || GENRE_OPTIONS[0],
        worldSettings: d.project.worldSettings || '',
        language: d.project.language || 'English',
      });

      // Map old entity IDs to newly created Firestore IDs so parentId and relations stay intact
      const oldToNewEntityId = new Map<string, string>();
      const pendingParents: { newId: string; oldParentId: string; ent: typeof d.entities[0] }[] = [];

      for (const ent of d.entities.slice(0, 80)) {
        const createdId = await createEntity({
          projectId: newProjectId,
          category: (ent.category as WorldEntity['category']) || 'character',
          subCategory: ent.subCategory || 'Character',
          name: ent.name || 'Unnamed Entity',
          subtitle: ent.subtitle || '',
          summary: ent.summary || '',
          parentId: '',
          attributes: ent.attributes || {},
        });
        if (ent.id) {
          oldToNewEntityId.set(ent.id, createdId);
        }
        if (ent.parentId) {
          pendingParents.push({
            newId: createdId,
            oldParentId: ent.parentId,
            ent,
          });
        }
      }

      // Restore nested location parentId references using remapped IDs
      for (const item of pendingParents) {
        const mappedParentId = oldToNewEntityId.get(item.oldParentId);
        if (mappedParentId) {
          await updateEntity(item.newId, {
            category: (item.ent.category as WorldEntity['category']) || 'location',
            subCategory: item.ent.subCategory || 'Location',
            name: item.ent.name,
            subtitle: item.ent.subtitle || '',
            summary: item.ent.summary || '',
            parentId: mappedParentId,
            attributes: item.ent.attributes || {},
          });
        }
      }

      // Import Entity Relationships using remapped IDs
      for (const rel of d.relations.slice(0, 80)) {
        const srcId =
          (rel.sourceEntityId && oldToNewEntityId.get(rel.sourceEntityId)) || '';
        const tgtId =
          (rel.targetEntityId && oldToNewEntityId.get(rel.targetEntityId)) || '';
        if (srcId && tgtId && srcId !== tgtId) {
          await createEntityRelation({
            projectId: newProjectId,
            sourceEntityId: srcId,
            sourceEntityName: rel.sourceEntityName,
            targetEntityId: tgtId,
            targetEntityName: rel.targetEntityName,
            relationType: rel.relationType,
            description: rel.description || '',
          });
        }
      }

      for (const lore of d.loreEntries.slice(0, 40)) {
        await createLoreEntry({
          projectId: newProjectId,
          title: lore.title,
          category: lore.category || 'World History',
          era: lore.era || '',
          summary: lore.summary || '',
          content: lore.content || '',
        });
      }

      for (const evt of d.timelineEvents.slice(0, 50)) {
        await createTimelineEvent({
          projectId: newProjectId,
          title: evt.title,
          dateLabel: evt.dateLabel || 'Year 1',
          sortOrder: Number(evt.sortOrder) || 0,
          era: evt.era || '',
          category: evt.category || 'Historical Event',
          locationName: evt.locationName || '',
          participants: evt.participants || '',
          description: evt.description || '',
        });
      }

      for (const rule of d.namingRules.slice(0, 30)) {
        await createNamingRule({
          projectId: newProjectId,
          category: rule.category,
          title: rule.title,
          phoneticPattern: rule.phoneticPattern || '',
          morphologyNotes: rule.morphologyNotes || '',
          examples: rule.examples || '',
          isActive: rule.isActive ?? true,
        });
      }

      for (const fav of d.favorites.slice(0, 30)) {
        await createFavorite({
          projectId: newProjectId,
          name: fav.name,
          pronunciation: fav.pronunciation || '',
          category: fav.category || 'Character names',
          interpretation: fav.interpretation || '',
          inspiration: fav.inspiration || '',
          suitability: fav.suitability || '',
          titleOrVariation: fav.titleOrVariation || '',
        });
      }

      if (d.aiSettings?.customInstructions) {
        await saveProjectAiSettings(newProjectId, {
          customInstructions: d.aiSettings.customInstructions,
          isEnabled: d.aiSettings.isEnabled ?? true,
        });
      }

      await recordActivityLog({
        projectId: newProjectId,
        actionType: 'imported',
        entityType: 'project',
        entityName: d.project.title,
        details: `Imported ${d.entities.length} entities, ${d.relations.length} relationships, ${d.loreEntries.length} lore entries, and ${d.timelineEvents.length} timeline events.`,
      });

      onSelectProject(newProjectId);
      setImportPreview(null);
      setImportNotice(
        `Import Report: Created "${d.project.title} (Imported)" with ${d.entities.length} entities, ${d.relations.length} relationships, ${d.loreEntries.length} lore entries, and ${d.timelineEvents.length} timeline events.`
      );
      setTimeout(() => setImportNotice(null), 6000);
    } catch (err) {
      setImportError(
        err instanceof Error ? `Import failed: ${err.message}` : 'Import failed.'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleToggleArchive = async (proj: Project) => {
    const nextStatus = proj.status === 'archived' ? 'active' : 'archived';
    await updateProject(proj.id, {
      title: proj.title,
      description: proj.description,
      genre: proj.genre,
      worldSettings: proj.worldSettings,
      language: proj.language,
      status: nextStatus,
    });
  };

  const handleExportActiveProjectBible = (proj: Project) => {
    const lines = [
      `# ${proj.title}`,
      `**Genre:** ${proj.genre} | **Language:** ${proj.language}`,
      '',
      `## Synopsis`,
      proj.description || '—',
      '',
      `## World Settings & Rules`,
      proj.worldSettings || '—',
      '',
      `## Entities (${entities.length})`,
      ...entities.map(
        (e) => `- **[${e.subCategory || e.category}] ${e.name}:** ${e.summary}`
      ),
      '',
      `## Lore Chronicles (${loreEntries.length})`,
      ...loreEntries.map((l) => `### ${l.title} (${l.category})\n${l.content}`),
      '',
      `## Chronological Timeline (${timelineEvents.length})`,
      ...timelineEvents.map(
        (t) => `- **${t.dateLabel} — ${t.title}:** ${t.description}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-codex.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProjectWithCascade(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (
      searchQuery.trim() &&
      !p.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !p.genre.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Project Universes
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Each writing project maintains strictly isolated characters, maps, lore, and AI context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleSelectImportFile}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            Import Canon (.json)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSeedStarter}
            disabled={seeding}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            {seeding ? 'Seeding Canon...' : 'Load Starter Universe'}
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <FolderPlus className="w-4 h-4" />
            New Project
          </Button>
        </div>
      </div>

      {importNotice && (
        <div className="p-3.5 bg-[#132A20] border border-[#10B981]/40 rounded-xl text-xs text-[#6EE7B7] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{importNotice}</span>
        </div>
      )}

      {importError && (
        <div className="p-3.5 bg-[#3A1820] border border-[#7F1D1D] rounded-xl text-xs text-[#FCA5A5] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Search & Status Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 border border-[var(--border-subtle)] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search projects by title or genre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search projects"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
          {(['all', 'active', 'archived'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                filterStatus === st
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <EmptyState
          title="No Matching Writing Projects"
          description="Create a new worldbuilding project or load our Chronicles of Neran starter universe."
          actionLabel="Create Project"
          onAction={openCreateModal}
          secondaryActionLabel="Load Starter Universe"
          onSecondaryAction={onSeedStarter}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredProjects.map((proj) => {
            const isSelected = proj.id === activeProjectId;
            return (
              <div
                key={proj.id}
                className={`p-6 bg-[var(--bg-surface)] rounded-xl border transition-colors flex flex-col justify-between gap-5 ${
                  isSelected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-subtle)]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-2">
                      <span>{proj.genre}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {proj.status === 'archived' ? 'Archived' : 'Active'}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-[var(--accent-primary)] font-medium">
                        Current Workspace
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                    {proj.title}
                  </h2>

                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {proj.description || 'No synopsis recorded yet.'}
                  </p>

                  {proj.worldSettings && (
                    <div className="pt-2 border-t border-[var(--border-subtle)]">
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        World Rules & Setting Premise
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                        {proj.worldSettings}
                      </p>
                    </div>
                  )}

                  {isSelected && (
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] font-mono-tabular">
                      <span>{entities.length} Entities</span>
                      <span aria-hidden="true">·</span>
                      <span>{loreEntries.length} Lore Chronicles</span>
                      <span aria-hidden="true">·</span>
                      <span>{timelineEvents.length} Timeline Events</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onSelectProject(proj.id)}
                  >
                    {isSelected ? 'Selected Universe' : 'Switch to Project'}
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {isSelected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportActiveProjectBible(proj)}
                        title="Export World Bible (.md)"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        Export
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(proj)}
                      title="Edit Project"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleArchive(proj)}
                      title={
                        proj.status === 'archived'
                          ? 'Restore Project'
                          : 'Archive Project'
                      }
                    >
                      {proj.status === 'archived' ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </>
                      ) : (
                        <>
                          <Archive className="w-3.5 h-3.5" />
                          Archive
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(proj)}
                      className="text-[#F87171] hover:text-[#FCA5A5]"
                      title="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase 10.2 — Import Validation & Content Preview Modal */}
      {importPreview && (
        <Modal
          open={Boolean(importPreview)}
          onClose={() => setImportPreview(null)}
          title="Validate & Preview Canon Import"
          subtitle="Inspect the validated worldbuilding archive before creating an isolated project."
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--accent-primary)]">
                  <FileJson className="w-4 h-4" />
                  Schema v{importPreview.schemaVersion} Validated
                </span>
                <span>
                  {importPreview.genre} · {importPreview.language}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                {importPreview.projectTitle}
              </h3>
              {importPreview.description && (
                <p className="text-[var(--text-secondary)]">{importPreview.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.entitiesCount}
                </p>
                <p className="text-[var(--text-muted)]">Entities</p>
              </div>
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.relationsCount}
                </p>
                <p className="text-[var(--text-muted)]">Relationships</p>
              </div>
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.loreCount}
                </p>
                <p className="text-[var(--text-muted)]">Lore Chronicles</p>
              </div>
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.timelineCount}
                </p>
                <p className="text-[var(--text-muted)]">Timeline Events</p>
              </div>
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.namingRulesCount}
                </p>
                <p className="text-[var(--text-muted)]">Naming Rules</p>
              </div>
              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                <p className="text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
                  {importPreview.favoritesCount}
                </p>
                <p className="text-[var(--text-muted)]">Favorites</p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] space-y-1">
              <p>
                • All entity IDs will be safely remapped into a new isolated project so existing universes are never overwritten.
              </p>
              <p>
                • Nested location hierarchies and inter-entity relationships will be automatically re-linked.
              </p>
              {importPreview.duplicateIdsResolved > 0 && (
                <p className="text-[#FBBF24]">
                  • Detected {importPreview.duplicateIdsResolved} duplicate source IDs; automatic de-duplication will be applied.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImportPreview(null)}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                <Upload className="w-3.5 h-3.5" />
                {importing ? 'Importing Universe...' : 'Confirm & Import Project'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingProject
            ? 'Edit Writing Project'
            : 'Create New Writing Project'
        }
        subtitle="Configure genre, language, and foundational world settings for contextual AI generation."
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs text-[#FCA5A5] bg-[#3A1820] border border-[#7F1D1D] rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <FieldLabel label="Project Title" required />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Chronicles of Neran: The Ashen Crown"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Primary Genre" required />
              <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel label="Project Language" required />
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel label="Project Synopsis / Description" hint="Optional" />
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-level premise, central conflict, or narrative tone..."
            />
          </div>

          <div>
            <FieldLabel
              label="World Settings & Foundational Rules"
              hint="Used by AI Naming & Assistant"
            />
            <Textarea
              rows={4}
              value={worldSettings}
              onChange={(e) => setWorldSettings(e.target.value)}
              placeholder="Describe technological era, magic/power rules, dominant cultures, or linguistic tone..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving
                ? 'Saving...'
                : editingProject
                  ? 'Save Changes'
                  : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Writing Project"
        description={`Are you sure you want to permanently delete "${deleteTarget?.title}" and all of its isolated characters, locations, lore entries, timelines, and naming rules? This action cannot be undone.`}
        loading={deleting}
      />
    </div>
  );
};
