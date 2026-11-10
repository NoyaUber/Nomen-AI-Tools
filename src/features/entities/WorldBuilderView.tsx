import React, { useState } from 'react';
import {
  ChevronRight,
  Compass,
  Edit3,
  GitBranch,
  Link2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  EntityRelation,
  LOCATION_CATEGORIES,
  Project,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createEntityRelation,
  deleteEntity,
  deleteEntityRelation,
  recordAiGeneration,
  updateEntity,
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

interface WorldBuilderViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
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
  const [deleteTarget, setDeleteTarget] = useState<WorldEntity | null>(null);

  // Relationship Linker Modal
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('Seat of Power for');
  const [relDesc, setRelDesc] = useState('');

  const selectedLocation =
    locations.find((l) => l.id === selectedLocationId) || locations[0] || null;

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
    setModalOpen(true);
  };

  const handleAiGenerateLocation = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category: 'location',
        subCategory: locCategory,
        prompt: aiPrompt,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      const r = res.result;
      setName(r.name || name);
      setDescription(r.summary || description);
      setGeography(r.geography || geography);
      setClimate(r.climate || climate);
      setPopulation(r.population || population);
      setGovernment(r.government || government);
      setCulture(r.culture || culture);
      setHistory(r.history || history);
      setAdditionalNotes(r.additionalNotes || additionalNotes);

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'World Builder',
        category: locCategory,
        promptSummary: aiPrompt,
        resultsSummary: `${r.name} (${locCategory})`,
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
    if (!selectedLocation || !relTargetId) return;
    const target = entities.find((ent) => ent.id === relTargetId);
    if (!target) return;

    await createEntityRelation({
      projectId: project.id,
      sourceEntityId: selectedLocation.id,
      sourceEntityName: selectedLocation.name,
      targetEntityId: target.id,
      targetEntityName: target.name,
      relationType: relType,
      description: relDesc,
    });
    setRelDesc('');
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
              ? 'bg-[#1D2336] text-[#F3F1FA]'
              : 'text-[#C5C1D6] hover:bg-[#151A28]'
          }`}
        >
          <div className="min-w-0 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#8B7EC8] shrink-0" />
            <span className="text-sm font-medium truncate">{node.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {children.length > 0 && (
              <span className="text-[10px] font-mono-tabular text-[#9D97B8]">
                ({children.length})
              </span>
            )}
            <span className="text-[11px] text-[#736E8A]">{node.subCategory}</span>
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
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            World Builder & Gazetteer
          </h1>
          <p className="text-sm text-[#8E89A6] mt-0.5">
            Construct nested continents, kingdoms, provinces, cities, and dungeons with full geographical and cultural depth.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openCreateModal('')}>
          <Plus className="w-4 h-4" />
          New Location
        </Button>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111520] p-4 border border-[#1E2436] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search continents, kingdoms, cities, or ruins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E89A6]">Scale / Category:</span>
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
          <div className="lg:col-span-4 bg-[#111520] border border-[#1E2436] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1A2030]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#E4E1EE]">
                <GitBranch className="w-3.5 h-3.5 text-[#8B7EC8]" />
                <span>Nested Atlas Hierarchy</span>
              </div>
              <span className="text-xs font-mono-tabular text-[#736E8A]">
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
            <div className="lg:col-span-8 bg-[#111520] border border-[#1E2436] rounded-xl p-6 md:p-8 space-y-6">
              {/* Breadcrumb Hierarchy Chain */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#9D97B8]">
                {getAncestryChain(selectedLocation).map((item, idx, arr) => (
                  <React.Fragment key={item.id}>
                    <button
                      onClick={() => setSelectedLocationId(item.id)}
                      className={`hover:text-[#F3F1FA] cursor-pointer ${
                        idx === arr.length - 1
                          ? 'text-[#C4B5FD] font-semibold'
                          : ''
                      }`}
                    >
                      {item.name} ({item.subCategory})
                    </button>
                    {idx < arr.length - 1 && (
                      <ChevronRight className="w-3.5 h-3.5 text-[#68647D]" />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#1E2436] pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
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
                  <h2 className="text-3xl font-semibold text-[#F3F1FA] font-serif-display mt-1">
                    {selectedLocation.name}
                  </h2>
                  <p className="text-sm text-[#A39EBA] mt-2 leading-relaxed">
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
                      <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
                      Ask AI
                    </Button>
                  )}
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
                    <h3 className="font-semibold text-[#9D97B8] mb-1">
                      Geography & Terrain
                    </h3>
                    <p className="text-[#D0CCE0]">
                      {selectedLocation.attributes?.geography || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#9D97B8] mb-1">
                      Climate & Atmosphere
                    </h3>
                    <p className="text-[#D0CCE0]">
                      {selectedLocation.attributes?.climate || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#9D97B8] mb-1">
                      Government & Rulership
                    </h3>
                    <p className="text-[#D0CCE0]">
                      {selectedLocation.attributes?.government || 'Not recorded.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-[#9D97B8] mb-1">
                      Culture & Customs
                    </h3>
                    <p className="text-[#D0CCE0]">
                      {selectedLocation.attributes?.culture || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#9D97B8] mb-1">
                      Historical Chronicle
                    </h3>
                    <p className="text-[#D0CCE0]">
                      {selectedLocation.attributes?.history || 'Not recorded.'}
                    </p>
                  </div>
                  {selectedLocation.attributes?.additionalNotes && (
                    <div>
                      <h3 className="font-semibold text-[#9D97B8] mb-1">
                        Additional Notes
                      </h3>
                      <p className="text-[#D0CCE0]">
                        {selectedLocation.attributes.additionalNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Direct Child Sub-Locations */}
              {locations.filter((l) => l.parentId === selectedLocation.id)
                .length > 0 && (
                <div className="pt-5 border-t border-[#1E2436] space-y-3">
                  <h3 className="text-sm font-semibold text-[#F3F1FA]">
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
                          className="p-3.5 bg-[#0D1018] hover:bg-[#151A28] border border-[#23293B] rounded-lg text-left transition-colors cursor-pointer"
                        >
                          <p className="text-xs text-[#8E89A6]">
                            {child.subCategory}
                          </p>
                          <p className="text-sm font-semibold text-[#F3F1FA] mt-0.5">
                            {child.name}
                          </p>
                          <p className="text-xs text-[#A39EBA] line-clamp-1 mt-1">
                            {child.summary}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Connected Entities & Link Action */}
              <div className="pt-5 border-t border-[#1E2436] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F3F1FA]">
                      Connected Characters, Factions & Relics (
                      {selectedLocRelations.length})
                    </h3>
                    <p className="text-xs text-[#8E89A6]">
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
                      setRelTargetId(firstOther?.id || '');
                      setRelModalOpen(true);
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Link Entity
                  </Button>
                </div>

                {selectedLocRelations.length === 0 ? (
                  <p className="text-xs text-[#736E8A]">
                    No connected entities yet. Link a sovereign character, noble house, or artifact to this location.
                  </p>
                ) : (
                  <div className="divide-y divide-[#1A2030] border border-[#1E2436] rounded-lg">
                    {selectedLocRelations.map((rel) => (
                      <div
                        key={rel.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs text-[#D0CCE0]"
                      >
                        <div>
                          <span className="font-semibold text-[#F3F1FA]">
                            {rel.sourceEntityName}
                          </span>{' '}
                          <span className="text-[#C4B5FD]">
                            → {rel.relationType} →
                          </span>{' '}
                          <span className="font-semibold text-[#F3F1FA]">
                            {rel.targetEntityName}
                          </span>
                          {rel.description && (
                            <span className="text-[#8E89A6] ml-2">
                              — {rel.description}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => deleteEntityRelation(rel.id)}
                          className="text-[#736E8A] hover:text-[#F87171] cursor-pointer"
                          title="Remove link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
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
          <div className="p-3.5 bg-[#0D1018] border border-[#23293B] rounded-xl space-y-2">
            <span className="text-xs font-semibold text-[#C4B5FD] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              AI Location Architect (Optional)
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe location idea, e.g., 'A terraced observatory-city built inside a meteor crater'..."
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAiGenerateLocation}
                disabled={aiLoading}
              >
                {aiLoading ? 'Drafting...' : 'Draft with AI'}
              </Button>
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
            <div className="p-3 bg-[#0D1018] border border-[#1E2436] rounded-lg">
              <label className="block text-[11px] text-[#9D97B8] mb-1">
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

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
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
        </form>
      </Modal>

      {/* Link Entity Modal */}
      <Modal
        open={relModalOpen}
        onClose={() => setRelModalOpen(false)}
        title={`Link ${selectedLocation?.name || 'Location'} to Entity`}
        subtitle="Connect this location to a ruler, native character, governing faction, or artifact."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddLocationRelation} className="space-y-4">
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
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2436]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRelModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Relationship
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
