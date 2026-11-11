import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Columns,
  Compass,
  Edit3,
  GitBranch,
  History,
  Link2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  AutosaveStatus,
  EntityRelation,
  EntityVersion,
  LOCATION_CATEGORIES,
  Project,
  ProjectAiSetting,
  VisualAsset,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createEntityRelation,
  deleteEntity,
  deleteEntityRelation,
  recordAiGeneration,
  updateEntity,
  updateEntityRelation,
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
import { EntityVisualGallery } from '../../components/EntityVisualGallery';

interface WorldBuilderViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
  versions?: EntityVersion[];
  aiSettings?: ProjectAiSetting | null;
  visualAssets?: VisualAsset[];
  onInspectEntityForAssistant?: (entity: WorldEntity) => void;
}

const CHILD_SCALE_SUGGESTION: Record<string, string> = {
  Continent: 'Kingdom',
  Kingdom: 'Province',
  Empire: 'Province',
  Province: 'City',
  City: 'Temple',
  Town: 'Village',
  Island: 'City',
  Mountain: 'Ruins',
  Forest: 'Ruins',
};

export const WorldBuilderView: React.FC<WorldBuilderViewProps> = ({
  project,
  entities,
  relations,
  versions = [],
  aiSettings = null,
  visualAssets = [],
  onInspectEntityForAssistant,
}) => {
  const locations = entities.filter((e) => e.category === 'location');
  const charactersAndOrgs = entities.filter(
    (e) =>
      e.category === 'character' ||
      e.category === 'organization' ||
      e.category === 'family'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    locations[0]?.id || null
  );

  // Location Editor State (All 11 Location Fields)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [locCategory, setLocCategory] = useState<string>('Kingdom');
  const [description, setDescription] = useState('');
  const [geography, setGeography] = useState('');
  const [climate, setClimate] = useState('');
  const [population, setPopulation] = useState('');
  const [government, setGovernment] = useState('');
  const [culture, setCulture] = useState('');
  const [history, setHistory] = useState('');
  const [parentId, setParentId] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // AI Architect
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [dirty, setDirty] = useState(false);
  const [comparisonCandidates, setComparisonCandidates] = useState<
    Record<string, string>[]
  >([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorldEntity | null>(null);

  // Relationship Linker Modal (Phase 9.3)
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('Seat of Power for');
  const [relDesc, setRelDesc] = useState('');
  const [relCreateInverse, setRelCreateInverse] = useState(false);
  const [relInverseType, setRelInverseType] = useState('Headquartered in');
  const [relError, setRelError] = useState<string | null>(null);

  const selectedLocation =
    locations.find((l) => l.id === selectedLocationId) || locations[0] || null;

  // Debounced Autosave for existing Location (Phase 7.2)
  useEffect(() => {
    if (!modalOpen || !editingId || !dirty || !name.trim()) return;
    setAutosaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        const parentLoc = locations.find((l) => l.id === parentId);
        const subtitle = parentLoc
          ? `${locCategory} within ${parentLoc.name}`
          : `${locCategory} · Sovereign / Root Realm`;
        await updateEntity(editingId, {
          category: 'location',
          subCategory: locCategory,
          name,
          subtitle,
          summary: description,
          parentId,
          attributes: {
            geography,
            climate,
            population,
            government,
            culture,
            history,
            additionalNotes,
          },
        });
        setDirty(false);
        setAutosaveStatus('saved');
      } catch {
        setAutosaveStatus('failed');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    modalOpen,
    editingId,
    dirty,
    name,
    locCategory,
    description,
    geography,
    climate,
    population,
    government,
    culture,
    history,
    parentId,
    additionalNotes,
    locations,
  ]);

  const openCreateModal = (defaultParentId = '') => {
    const parentEntity = locations.find((l) => l.id === defaultParentId);
    const defaultCategory = parentEntity
      ? CHILD_SCALE_SUGGESTION[parentEntity.subCategory] || 'City'
      : 'Continent';

    setEditingId(null);
    setName('');
    setLocCategory(defaultCategory);
    setDescription('');
    setGeography('');
    setClimate('');
    setPopulation('');
    setGovernment('');
    setCulture('');
    setHistory('');
    setParentId(defaultParentId);
    setAdditionalNotes('');
    setAiPrompt('');
    setDirty(false);
    setAutosaveStatus('idle');
    setModalOpen(true);
  };

  const openEditModal = (loc: WorldEntity) => {
    const a = loc.attributes || {};
    setEditingId(loc.id);
    setName(loc.name);
    setLocCategory(loc.subCategory || 'Kingdom');
    setDescription(loc.summary || '');
    setGeography(a.geography || '');
    setClimate(a.climate || '');
    setPopulation(a.population || '');
    setGovernment(a.government || '');
    setCulture(a.culture || '');
    setHistory(a.history || '');
    setParentId(loc.parentId || '');
    setAdditionalNotes(a.additionalNotes || '');
    setDirty(false);
    setAutosaveStatus('saved');
    setModalOpen(true);
  };

  const applyLocationCandidate = (r: Record<string, string>) => {
    setName(r.name || name);
    setDescription(r.summary || description);
    setGeography(r.geography || geography);
    setClimate(r.climate || climate);
    setPopulation(r.population || population);
    setGovernment(r.government || government);
    setCulture(r.culture || culture);
    setHistory(r.history || history);
    setAdditionalNotes(r.additionalNotes || additionalNotes);
    setDirty(true);
  };

  const handleAiGenerateLocation = async (count = 1) => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'location',
        subCategory: locCategory,
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
        setComparisonOpen(true);
      } else {
        applyLocationCandidate(res.result);
      }

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'World Builder',
        category: locCategory,
        promptSummary: aiPrompt,
        resultsSummary: `${res.result.name} (${locCategory})`,
        modelUsed: res.modelUsed,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const attributes = {
      geography,
      climate,
      population,
      government,
      culture,
      history,
      additionalNotes,
    };

    const parentLoc = locations.find((l) => l.id === parentId);
    const subtitle = parentLoc
      ? `${locCategory} within ${parentLoc.name}`
      : `${locCategory} · Sovereign / Root Realm`;

    try {
      if (editingId) {
        await updateEntity(editingId, {
          category: 'location',
          subCategory: locCategory,
          name,
          subtitle,
          summary: description,
          parentId,
          attributes,
        });
      } else {
        const newId = await createEntity({
          projectId: project.id,
          category: 'location',
          subCategory: locCategory,
          name,
          subtitle,
          summary: description,
          parentId,
          attributes,
        });
        setSelectedLocationId(newId);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocationRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRelError(null);
    if (!selectedLocation || !relTargetId) return;
    const target = entities.find((ent) => ent.id === relTargetId);
    if (!target) return;

    const normalizedType = relType.trim() || 'Connected To';

    const duplicate = relations.some(
      (r) =>
        r.id !== editingRelId &&
        r.sourceEntityId === selectedLocation.id &&
        r.targetEntityId === target.id &&
        r.relationType.toLowerCase() === normalizedType.toLowerCase()
    );
    if (duplicate) {
      setRelError(
        `A "${normalizedType}" link between ${selectedLocation.name} and ${target.name} already exists.`
      );
      return;
    }

    if (editingRelId) {
      await updateEntityRelation(editingRelId, {
        sourceEntityId: selectedLocation.id,
        sourceEntityName: selectedLocation.name,
        targetEntityId: target.id,
        targetEntityName: target.name,
        relationType: normalizedType,
        description: relDesc,
      });
    } else {
      await createEntityRelation({
        projectId: project.id,
        sourceEntityId: selectedLocation.id,
        sourceEntityName: selectedLocation.name,
        targetEntityId: target.id,
        targetEntityName: target.name,
        relationType: normalizedType,
        description: relDesc,
      });

      if (relCreateInverse) {
        const inv = relInverseType.trim() || normalizedType;
        const invDup = relations.some(
          (r) =>
            r.sourceEntityId === target.id &&
            r.targetEntityId === selectedLocation.id &&
            r.relationType.toLowerCase() === inv.toLowerCase()
        );
        if (!invDup) {
          await createEntityRelation({
            projectId: project.id,
            sourceEntityId: target.id,
            sourceEntityName: target.name,
            targetEntityId: selectedLocation.id,
            targetEntityName: selectedLocation.name,
            relationType: inv,
            description: relDesc,
          });
        }
      }
    }
    setEditingRelId(null);
    setRelDesc('');
    setRelCreateInverse(false);
    setRelModalOpen(false);
  };

  // Build Breadcrumb Chain (e.g. Continent Neran -> Kingdom of Aetheria -> Northern Province -> City of Eldoria)
  const getAncestryChain = (loc: WorldEntity): WorldEntity[] => {
    const chain: WorldEntity[] = [loc];
    let current = loc;
    const visited = new Set<string>([loc.id]);
    while (current.parentId) {
      const parent = locations.find((l) => l.id === current.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  };

  const filteredLocations = locations.filter((l) => {
    if (categoryFilter !== 'All' && l.subCategory !== categoryFilter)
      return false;
    if (
      searchQuery.trim() &&
      !l.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !l.summary.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Recursive Tree Renderer
  const renderHierarchyNode = (
    node: WorldEntity,
    depth = 0
  ): React.ReactNode => {
    const children = locations.filter((l) => l.parentId === node.id);
    const isSelected = selectedLocation?.id === node.id;

    return (
      <div key={node.id} className="space-y-1">
        <button
          onClick={() => setSelectedLocationId(node.id)}
          style={{ paddingLeft: `${depth * 18 + 14}px` }}
          className={`w-full text-left pr-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
            isSelected
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          <div className="min-w-0 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
            <span className="text-sm font-medium truncate">{node.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {children.length > 0 && (
              <span className="text-[10px] font-mono-tabular text-[var(--text-secondary)]">
                ({children.length})
              </span>
            )}
            <span className="text-[11px] text-[var(--text-muted)]">{node.subCategory}</span>
          </div>
        </button>
        {children.length > 0 && (
          <div className="space-y-1">
            {children.map((child) => renderHierarchyNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootLocations = filteredLocations.filter(
    (l) => !l.parentId || !locations.some((p) => p.id === l.parentId)
  );

  const selectedLocRelations = selectedLocation
    ? relations.filter(
        (r) =>
          r.sourceEntityId === selectedLocation.id ||
          r.targetEntityId === selectedLocation.id
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            World Builder & Gazetteer
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Construct nested continents, kingdoms, provinces, cities, and dungeons with full geographical and cultural depth.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openCreateModal('')}>
          <Plus className="w-4 h-4" />
          New Location
        </Button>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 border border-[var(--border-subtle)] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search continents, kingdoms, cities, or ruins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Scale / Category:</span>
          <Select
            className="w-48"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Categories ({locations.length})</option>
            {LOCATION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          title="No Locations Mapped Yet"
          description="Create a root Continent or Kingdom, then nest Provinces, Cities, Mountains, and Ruins underneath it."
          actionLabel="Create First Location"
          onAction={() => openCreateModal('')}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 4 Cols: Nested Location Hierarchy Tree */}
          <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <GitBranch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Nested Atlas Hierarchy</span>
              </div>
              <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                {locations.length} Total
              </span>
            </div>

            <div className="space-y-1">
              {searchQuery.trim() || categoryFilter !== 'All'
                ? filteredLocations.map((loc) => renderHierarchyNode(loc, 0))
                : rootLocations.map((root) => renderHierarchyNode(root, 0))}
            </div>
          </div>

          {/* Right 8 Cols: Location Details & Child Locations */}
          {selectedLocation && (
            <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-6 md:p-8 space-y-6">
              {/* Breadcrumb Hierarchy Chain */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                {getAncestryChain(selectedLocation).map((item, idx, arr) => (
                  <React.Fragment key={item.id}>
                    <button
                      onClick={() => setSelectedLocationId(item.id)}
                      className={`hover:text-[var(--text-primary)] cursor-pointer ${
                        idx === arr.length - 1
                          ? 'text-[var(--accent-primary)] font-semibold'
                          : ''
                      }`}
                    >
                      {item.name} ({item.subCategory})
                    </button>
                    {idx < arr.length - 1 && (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{selectedLocation.subCategory}</span>
                    {selectedLocation.attributes?.population && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          Pop: {selectedLocation.attributes.population}
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="text-3xl font-semibold text-[var(--text-primary)] font-serif-display mt-1">
                    {selectedLocation.name}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                    {selectedLocation.summary || 'No description provided.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openCreateModal(selectedLocation.id)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Child Location
                  </Button>
                  {onInspectEntityForAssistant && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectEntityForAssistant(selectedLocation)}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      Ask AI
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionModalOpen(true)}
                  >
                    <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(selectedLocation)}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(selectedLocation)}
                    className="text-[#F87171]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                      Geography & Terrain
                    </h3>
                    <p className="text-[var(--text-secondary)]">
                      {selectedLocation.attributes?.geography || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                      Climate & Atmosphere
                    </h3>
                    <p className="text-[var(--text-secondary)]">
                      {selectedLocation.attributes?.climate || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                      Government & Rulership
                    </h3>
                    <p className="text-[var(--text-secondary)]">
                      {selectedLocation.attributes?.government || 'Not recorded.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                      Culture & Customs
                    </h3>
                    <p className="text-[var(--text-secondary)]">
                      {selectedLocation.attributes?.culture || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                      Historical Chronicle
                    </h3>
                    <p className="text-[var(--text-secondary)]">
                      {selectedLocation.attributes?.history || 'Not recorded.'}
                    </p>
                  </div>
                  {selectedLocation.attributes?.additionalNotes && (
                    <div>
                      <h3 className="font-semibold text-[var(--text-secondary)] mb-1">
                        Additional Notes
                      </h3>
                      <p className="text-[var(--text-secondary)]">
                        {selectedLocation.attributes.additionalNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Phase 11 — Location Visuals & Environmental/Architectural References */}
              <EntityVisualGallery
                project={project}
                entity={selectedLocation}
                assets={visualAssets}
                defaultCategory={
                  selectedLocation.subCategory === 'Kingdom' ||
                  selectedLocation.subCategory === 'Empire'
                    ? 'kingdom_civilization'
                    : 'location_illustration'
                }
              />

              {/* Direct Child Sub-Locations */}
              {locations.filter((l) => l.parentId === selectedLocation.id)
                .length > 0 && (
                <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Nested Sub-Regions & Settlements within{' '}
                    {selectedLocation.name}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {locations
                      .filter((l) => l.parentId === selectedLocation.id)
                      .map((child) => (
                        <button
                          key={child.id}
                          onClick={() => setSelectedLocationId(child.id)}
                          className="p-3.5 bg-[var(--bg-canvas)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-left transition-colors cursor-pointer"
                        >
                          <p className="text-xs text-[var(--text-muted)]">
                            {child.subCategory}
                          </p>
                          <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                            {child.name}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-1">
                            {child.summary}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Connected Entities & Link Action */}
              <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Connected Characters, Factions & Relics (
                      {selectedLocRelations.length})
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      Rulers, native characters, controlling factions, or relics bound to {selectedLocation.name}.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const firstOther = entities.find(
                        (e) => e.id !== selectedLocation.id
                      );
                      setEditingRelId(null);
                      setRelTargetId(firstOther?.id || '');
                      setRelType('Seat of Power for');
                      setRelDesc('');
                      setRelCreateInverse(false);
                      setRelError(null);
                      setRelModalOpen(true);
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Link Entity
                  </Button>
                </div>

                {selectedLocRelations.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No connected entities yet. Link a sovereign character, noble house, or artifact to this location.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg">
                    {selectedLocRelations.map((rel) => {
                      const isOutgoing =
                        rel.sourceEntityId === selectedLocation.id;
                      return (
                        <div
                          key={rel.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs text-[var(--text-secondary)]"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono-tabular uppercase px-1.5 py-0.5 rounded ${
                                isOutgoing
                                  ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)]'
                                  : 'bg-[#132824] text-[#6EE7B7]'
                              }`}
                            >
                              {isOutgoing ? 'Outgoing →' : '← Incoming'}
                            </span>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {rel.sourceEntityName}
                            </span>{' '}
                            <span className="text-[var(--accent-primary)]">
                              → {rel.relationType} →
                            </span>{' '}
                            <span className="font-semibold text-[var(--text-primary)]">
                              {rel.targetEntityName}
                            </span>
                            {rel.description && (
                              <span className="text-[var(--text-muted)]">
                                — {rel.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isOutgoing && (
                              <button
                                onClick={() => {
                                  setEditingRelId(rel.id);
                                  setRelTargetId(rel.targetEntityId);
                                  setRelType(rel.relationType);
                                  setRelDesc(rel.description);
                                  setRelCreateInverse(false);
                                  setRelError(null);
                                  setRelModalOpen(true);
                                }}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                title="Edit relationship"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteEntityRelation(rel.id)}
                              className="text-[var(--text-muted)] hover:text-[#F87171] cursor-pointer"
                              title="Remove link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Location Editor Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Location' : 'Create World Location'}
        subtitle="Support nested location hierarchies (Continent -> Kingdom -> Province -> City)."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveLocation} className="space-y-4">
          {/* AI Location Architect */}
          <div className="p-3.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2">
            <span className="text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              AI Location Architect (Optional)
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe location idea, e.g., 'A terraced observatory-city built inside a meteor crater'..."
              />
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleAiGenerateLocation(1)}
                  disabled={aiLoading}
                >
                  {aiLoading ? 'Drafting...' : 'Draft with AI'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAiGenerateLocation(3)}
                  disabled={aiLoading}
                  title="Compare 3 AI location variations side-by-side"
                >
                  <Columns className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Compare 3
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel label="Location Name" required />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., City of Eldoria"
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" required />
              <Select
                value={locCategory}
                onChange={(e) => setLocCategory(e.target.value)}
              >
                {LOCATION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel label="Parent Location" hint="For nested hierarchy" />
              <Select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">None (Root Continent / Realm)</option>
                {locations
                  .filter((l) => l.id !== editingId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.subCategory})
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel label="Overview Description" />
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-level summary of the location..."
            />
          </div>

          {charactersAndOrgs.length > 0 && (
            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Quick-Fill Ruler / Governing Faction from Project Canon
              </label>
              <Select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setGovernment((prev) =>
                    prev ? `${prev} · ${e.target.value}` : e.target.value
                  );
                }}
              >
                <option value="">-- Choose Sovereign Character or Faction --</option>
                {charactersAndOrgs.map((ent) => (
                  <option
                    key={ent.id}
                    value={`Ruled by ${ent.name} (${ent.subCategory})`}
                  >
                    [{ent.subCategory}] {ent.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Geography & Landmarks" />
              <Textarea
                rows={2}
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Climate & Seasons" />
              <Textarea
                rows={2}
                value={climate}
                onChange={(e) => setClimate(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Population & Demographics" />
              <Input
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
                placeholder="e.g., 340,000 citizens"
              />
            </div>
            <div>
              <FieldLabel label="Government & Sovereignty" />
              <Input
                value={government}
                onChange={(e) => setGovernment(e.target.value)}
                placeholder="e.g., Lord High Archon & Council of Guilds"
              />
            </div>
            <div>
              <FieldLabel label="Culture, Trade & Architecture" />
              <Textarea
                rows={2}
                value={culture}
                onChange={(e) => setCulture(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Founding & History" />
              <Textarea
                rows={2}
                value={history}
                onChange={(e) => setHistory(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Additional Notes" />
            <Input
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
            {editingId ? (
              <AutosaveIndicator status={autosaveStatus} />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Initial save creates Version v1 snapshot
              </span>
            )}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                <Compass className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Location'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* AI Side-by-Side Comparison Modal (Phase 8.3) */}
      <AiComparisonModal
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        title="Compare AI Location Variations"
        candidates={comparisonCandidates}
        primaryTitleKey="name"
        secondaryKey="government"
        summaryKey="summary"
        displayFields={[
          { key: 'geography', label: 'Geography' },
          { key: 'culture', label: 'Culture' },
          { key: 'history', label: 'History' },
        ]}
        onSelectCandidate={(c) => applyLocationCandidate(c)}
      />

      {/* Version History Modal (Phase 7.1) */}
      {selectedLocation && (
        <VersionHistoryModal
          open={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          projectId={project.id}
          entityId={selectedLocation.id}
          entityType="location"
          entityName={selectedLocation.name}
          currentSnapshot={{
            name: selectedLocation.name,
            category: selectedLocation.category,
            subCategory: selectedLocation.subCategory,
            subtitle: selectedLocation.subtitle,
            summary: selectedLocation.summary,
            parentId: selectedLocation.parentId,
            ...selectedLocation.attributes,
          }}
          versions={versions}
        />
      )}

      {/* Link Entity Modal */}
      <Modal
        open={relModalOpen}
        onClose={() => setRelModalOpen(false)}
        title={
          editingRelId
            ? `Edit Relationship for ${selectedLocation?.name || 'Location'}`
            : `Link ${selectedLocation?.name || 'Location'} to Entity`
        }
        subtitle="Connect this location to a ruler, native character, governing faction, or artifact."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddLocationRelation} className="space-y-4">
          {relError && (
            <div className="p-2.5 bg-[#3A1820] border border-[#7F1D1D] rounded-lg text-xs text-[#FCA5A5]">
              {relError}
            </div>
          )}
          <div>
            <FieldLabel label="Target Entity in Project" required />
            <Select
              value={relTargetId}
              onChange={(e) => setRelTargetId(e.target.value)}
              required
            >
              <option value="">-- Select Entity --</option>
              {entities
                .filter((e) => e.id !== selectedLocation?.id)
                .map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    [{ent.subCategory || ent.category}] {ent.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel label="Relationship Type" required />
            <Input
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              placeholder="e.g., Seat of Power for, Homeland of, Vault of..."
              required
            />
          </div>
          <div>
            <FieldLabel label="Context / Description" />
            <Textarea
              rows={2}
              value={relDesc}
              onChange={(e) => setRelDesc(e.target.value)}
              placeholder="Optional historical or political note..."
            />
          </div>
          {!editingRelId && (
            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-2">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={relCreateInverse}
                  onChange={(e) => setRelCreateInverse(e.target.checked)}
                />
                <span>Also create inverse relationship (Target → Source)</span>
              </label>
              {relCreateInverse && (
                <div>
                  <FieldLabel label="Inverse Relationship Type" />
                  <Input
                    value={relInverseType}
                    onChange={(e) => setRelInverseType(e.target.value)}
                    placeholder="e.g., Headquartered in, Born in..."
                  />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRelModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingRelId ? 'Update Relationship' : 'Create Relationship'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteEntity(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete Location"
        description={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />
    </div>
  );
};
