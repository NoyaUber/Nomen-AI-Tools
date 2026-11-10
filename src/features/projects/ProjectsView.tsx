import React, { useState } from 'react';
import { Archive, Edit3, FolderPlus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import {
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import {
  createProject,
  deleteProjectWithCascade,
  updateProject,
} from '../../lib/db/firestore-service';
import { ProjectInputSchema } from '../../lib/validation/schemas';
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived'>('all');
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
      setFormError(parsed.error.issues[0]?.message || 'Please check required fields.');
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
      setFormError(err instanceof Error ? err.message : 'Failed to save project.');
    } finally {
      setSaving(false);
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
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            Project Universes
          </h1>
          <p className="text-sm text-[#8E89A6] mt-0.5">
            Each writing project maintains strictly isolated characters, maps, lore, and AI context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={onSeedStarter} disabled={seeding}>
            <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
            {seeding ? 'Seeding Canon...' : 'Load Starter Universe'}
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <FolderPlus className="w-4 h-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Search & Status Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111520] p-4 border border-[#1E2436] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search projects by title or genre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search projects"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-[#0B0D13] border border-[#1E2436] rounded-lg">
          {(['all', 'active', 'archived'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                filterStatus === st
                  ? 'bg-[#1D2336] text-[#F3F1FA]'
                  : 'text-[#8E89A6] hover:text-[#ECEAF2]'
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
                className={`p-6 bg-[#111520] rounded-xl border transition-colors flex flex-col justify-between gap-5 ${
                  isSelected ? 'border-[#8B7EC8]' : 'border-[#1E2436]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#8E89A6]">
                    <div className="flex items-center gap-2">
                      <span>{proj.genre}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.status === 'archived' ? 'Archived' : 'Active'}</span>
                    </div>
                    {isSelected && (
                      <span className="text-[#C4B5FD] font-medium">Current Workspace</span>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">
                    {proj.title}
                  </h2>

                  <p className="text-sm text-[#A39EBA] leading-relaxed line-clamp-3">
                    {proj.description || 'No synopsis recorded yet.'}
                  </p>

                  {proj.worldSettings && (
                    <div className="pt-2 border-t border-[#1A2030]">
                      <p className="text-xs text-[#736E8A] mb-1">World Rules & Setting Premise</p>
                      <p className="text-xs text-[#C5C1D6] line-clamp-2 leading-relaxed">
                        {proj.worldSettings}
                      </p>
                    </div>
                  )}

                  {isSelected && (
                    <div className="pt-3 border-t border-[#1A2030] flex items-center gap-4 text-xs text-[#9D97B8] font-mono-tabular">
                      <span>{entities.length} Entities</span>
                      <span aria-hidden="true">·</span>
                      <span>{loreEntries.length} Lore Chronicles</span>
                      <span aria-hidden="true">·</span>
                      <span>{timelineEvents.length} Timeline Events</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#1A2030]">
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onSelectProject(proj.id)}
                  >
                    {isSelected ? 'Selected Universe' : 'Switch to Project'}
                  </Button>

                  <div className="flex items-center gap-1.5">
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
                      title={proj.status === 'archived' ? 'Restore Project' : 'Archive Project'}
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

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProject ? 'Edit Writing Project' : 'Create New Writing Project'}
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
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E2436]">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
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
