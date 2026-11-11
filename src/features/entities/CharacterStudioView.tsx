import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Columns,
  Copy,
  Edit3,
  History,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  AutosaveStatus,
  EntityRelation,
  EntityVersion,
  NamingRule,
  Project,
  ProjectAiSetting,
  VisualAsset,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createEntityRelation,
  createFavorite,
  deleteEntity,
  deleteEntityRelation,
  recordAiGeneration,
  updateEntity,
  updateEntityRelation,
} from '../../lib/db/firestore-service';
import { generateCharacterProfileApi } from '../../lib/ai/client';
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

interface CharacterStudioViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
  namingRules: NamingRule[];
  versions?: EntityVersion[];
  aiSettings?: ProjectAiSetting | null;
  visualAssets?: VisualAsset[];
  onInspectEntityForAssistant?: (entity: WorldEntity) => void;
}

const STORY_ROLES = [
  'Protagonist',
  'Deuteragonist / Foil',
  'Antagonist',
  'Mentor',
  'Rival',
  'Ally / Confidant',
  'Political Sovereign',
  'Supporting Cast',
  'Historical Figure',
];

const RELATION_PRESETS = [
  'Sworn Ally of',
  'Rival / Nemesis of',
  'Scion / Heir of',
  'Born in / Native of',
  'Sovereign / Ruler of',
  'Member / Agent of',
  'Wields / Guardian of',
  'Practitioner of',
  'Mentor to',
];

export const CharacterStudioView: React.FC<CharacterStudioViewProps> = ({
  project,
  entities,
  relations,
  namingRules,
  versions = [],
  aiSettings = null,
  visualAssets = [],
  onInspectEntityForAssistant,
}) => {
  const characters = entities.filter((e) => e.category === 'character');
  const projectLocations = entities.filter((e) => e.category === 'location');
  const projectOrgsAndHouses = entities.filter(
    (e) => e.category === 'organization' || e.category === 'family'
  );
  const projectPowersAndItems = entities.filter(
    (e) => e.category === 'ability' || e.category === 'item'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    characters[0]?.id || null
  );

  // Copy & Favorite feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [favoritedId, setFavoritedId] = useState<string | null>(null);

  // Editor Modal State (All 24 fields)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeEditorSection, setActiveEditorSection] = useState<
    'identity' | 'psychology' | 'narrative' | 'abilities'
  >('identity');

  const [fullName, setFullName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [aliases, setAliases] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [species, setSpecies] = useState('Human');
  const [race, setRace] = useState('');
  const [socialStatus, setSocialStatus] = useState('');
  const [nobleTitle, setNobleTitle] = useState('');
  const [storyRole, setStoryRole] = useState('Protagonist');
  const [personality, setPersonality] = useState('');
  const [appearance, setAppearance] = useState('');
  const [background, setBackground] = useState('');
  const [origin, setOrigin] = useState('');
  const [motivation, setMotivation] = useState('');
  const [goals, setGoals] = useState('');
  const [fears, setFears] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [abilities, setAbilities] = useState('');
  const [relationships, setRelationships] = useState('');
  const [characterDevelopment, setCharacterDevelopment] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // AI Character Architect State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [dirty, setDirty] = useState(false);

  // Phase 8.3 AI Comparison & Phase 7.1 Version History
  const [comparisonCandidates, setComparisonCandidates] = useState<
    Record<string, string>[]
  >([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);

  // Relationship Creator & Editor State (Phase 9.3)
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('Sworn Ally of');
  const [relDesc, setRelDesc] = useState('');
  const [relCreateInverse, setRelCreateInverse] = useState(false);
  const [relInverseType, setRelInverseType] = useState('Sworn Ally of');
  const [relError, setRelError] = useState<string | null>(null);

  // Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState<WorldEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounced Autosave for existing Character (Phase 7.2)
  useEffect(() => {
    const resolvedFullName =
      fullName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!editorOpen || !editingId || !dirty || !resolvedFullName) return;

    setAutosaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        const subtitleParts = [
          nobleTitle || socialStatus,
          storyRole,
          origin,
        ].filter(Boolean);
        await updateEntity(editingId, {
          category: 'character',
          subCategory: storyRole || 'Character',
          name: resolvedFullName,
          subtitle: subtitleParts.join(' · '),
          summary: background || motivation || personality,
          parentId: '',
          attributes: {
            firstName,
            lastName,
            aliases,
            gender,
            age,
            species,
            race,
            socialStatus,
            nobleTitle,
            storyRole,
            personality,
            appearance,
            background,
            origin,
            motivation,
            goals,
            fears,
            strengths,
            weaknesses,
            abilities,
            relationships,
            characterDevelopment,
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
    editorOpen,
    editingId,
    dirty,
    fullName,
    firstName,
    lastName,
    aliases,
    gender,
    age,
    species,
    race,
    socialStatus,
    nobleTitle,
    storyRole,
    personality,
    appearance,
    background,
    origin,
    motivation,
    goals,
    fears,
    strengths,
    weaknesses,
    abilities,
    relationships,
    characterDevelopment,
    additionalNotes,
  ]);

  const selectedChar =
    characters.find((c) => c.id === selectedCharacterId) || characters[0] || null;

  const openCreateModal = () => {
    setEditingId(null);
    setFullName('');
    setFirstName('');
    setLastName('');
    setAliases('');
    setGender('');
    setAge('');
    setSpecies('Human');
    setRace('');
    setSocialStatus('');
    setNobleTitle('');
    setStoryRole('Protagonist');
    setPersonality('');
    setAppearance('');
    setBackground('');
    setOrigin('');
    setMotivation('');
    setGoals('');
    setFears('');
    setStrengths('');
    setWeaknesses('');
    setAbilities('');
    setRelationships('');
    setCharacterDevelopment('');
    setAdditionalNotes('');
    setAiPrompt('');
    setFormError(null);
    setActiveEditorSection('identity');
    setEditorOpen(true);
  };

  const openEditModal = (char: WorldEntity) => {
    const a = char.attributes || {};
    setEditingId(char.id);
    setFullName(char.name);
    setFirstName(a.firstName || '');
    setLastName(a.lastName || '');
    setAliases(a.aliases || '');
    setGender(a.gender || '');
    setAge(a.age || '');
    setSpecies(a.species || 'Human');
    setRace(a.race || '');
    setSocialStatus(a.socialStatus || '');
    setNobleTitle(a.nobleTitle || '');
    setStoryRole(a.storyRole || char.subCategory || 'Protagonist');
    setPersonality(a.personality || '');
    setAppearance(a.appearance || '');
    setBackground(a.background || char.summary || '');
    setOrigin(a.origin || '');
    setMotivation(a.motivation || '');
    setGoals(a.goals || '');
    setFears(a.fears || '');
    setStrengths(a.strengths || '');
    setWeaknesses(a.weaknesses || '');
    setAbilities(a.abilities || '');
    setRelationships(a.relationships || '');
    setCharacterDevelopment(a.characterDevelopment || '');
    setAdditionalNotes(a.additionalNotes || '');
    setFormError(null);
    setDirty(false);
    setAutosaveStatus('saved');
    setActiveEditorSection('identity');
    setEditorOpen(true);
  };

  const applyCharacterCandidate = (c: Record<string, string>) => {
    setFullName(c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim());
    setFirstName(c.firstName || '');
    setLastName(c.lastName || '');
    setAliases(c.aliases || '');
    setGender(c.gender || '');
    setAge(c.age || '');
    setSpecies(c.species || '');
    setRace(c.race || '');
    setSocialStatus(c.socialStatus || '');
    setNobleTitle(c.nobleTitle || '');
    setStoryRole(c.storyRole || 'Protagonist');
    setPersonality(c.personality || '');
    setAppearance(c.appearance || '');
    setBackground(c.background || '');
    setOrigin(c.origin || '');
    setMotivation(c.motivation || '');
    setGoals(c.goals || '');
    setFears(c.fears || '');
    setStrengths(c.strengths || '');
    setWeaknesses(c.weaknesses || '');
    setAbilities(c.abilities || '');
    setRelationships(c.relationships || '');
    setCharacterDevelopment(c.characterDevelopment || '');
    setAdditionalNotes(c.additionalNotes || '');
    setDirty(true);
  };

  const handleAiSynthesizeCharacter = async (count = 1) => {
    if (!aiPrompt.trim()) {
      setFormError(
        'Enter a concept prompt (e.g., "An exiled astronomer-knight seeking a lost codex") to generate with AI.'
      );
      return;
    }
    setAiGenerating(true);
    setFormError(null);
    try {
      const activeRuleTexts = namingRules
        .filter((r) => r.isActive)
        .map((r) => `${r.title}: ${r.phoneticPattern} (${r.examples})`);

      const res = await generateCharacterProfileApi({
        prompt: aiPrompt,
        count,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
          language: project.language,
          customAiInstructions:
            aiSettings?.isEnabled && aiSettings.customInstructions
              ? aiSettings.customInstructions
              : undefined,
        },
        activeRules: activeRuleTexts,
      });

      if (count > 1 && res.candidates && res.candidates.length > 1) {
        setComparisonCandidates(res.candidates);
        setComparisonOpen(true);
      } else {
        applyCharacterCandidate(res.character);
      }

      const c = res.character;
      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Character Studio',
        category: 'Character Profile',
        promptSummary: aiPrompt,
        resultsSummary: `${c.fullName} — ${c.storyRole} (${c.nobleTitle || c.species})`,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'AI character generation failed'
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedFullName =
      fullName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!resolvedFullName) {
      setFormError('Full name (or first/last name) is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    const attributes = {
      firstName,
      lastName,
      aliases,
      gender,
      age,
      species,
      race,
      socialStatus,
      nobleTitle,
      storyRole,
      personality,
      appearance,
      background,
      origin,
      motivation,
      goals,
      fears,
      strengths,
      weaknesses,
      abilities,
      relationships,
      characterDevelopment,
      additionalNotes,
    };

    const subtitleParts = [nobleTitle || socialStatus, storyRole, origin].filter(
      Boolean
    );

    try {
      if (editingId) {
        await updateEntity(editingId, {
          category: 'character',
          subCategory: storyRole || 'Character',
          name: resolvedFullName,
          subtitle: subtitleParts.join(' · '),
          summary: background || motivation || personality,
          parentId: '',
          attributes,
        });
      } else {
        const newId = await createEntity({
          projectId: project.id,
          category: 'character',
          subCategory: storyRole || 'Character',
          name: resolvedFullName,
          subtitle: subtitleParts.join(' · '),
          summary: background || motivation || personality,
          parentId: '',
          attributes,
        });
        setSelectedCharacterId(newId);
      }
      setEditorOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save character');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyDossier = (char: WorldEntity) => {
    const a = char.attributes || {};
    const md = [
      `# ${char.name}`,
      a.aliases ? `*Aliases:* ${a.aliases}` : '',
      `**Role:** ${a.storyRole || char.subCategory} | **Species/Lineage:** ${a.species || '—'} (${a.race || '—'}) | **Age:** ${a.age || '—'}`,
      `**Title & Status:** ${a.nobleTitle || '—'} (${a.socialStatus || '—'}) | **Origin:** ${a.origin || '—'}`,
      '',
      `## Appearance`,
      a.appearance || 'Not recorded.',
      '',
      `## Personality & Psychology`,
      a.personality || 'Not recorded.',
      `- **Motivation:** ${a.motivation || '—'}`,
      `- **Goals:** ${a.goals || '—'}`,
      `- **Fears:** ${a.fears || '—'}`,
      '',
      `## Background & Character Arc`,
      a.background || char.summary || 'Not recorded.',
      `- **Arc:** ${a.characterDevelopment || '—'}`,
      '',
      `## Strengths, Weaknesses & Abilities`,
      `- **Strengths:** ${a.strengths || '—'}`,
      `- **Weaknesses:** ${a.weaknesses || '—'}`,
      `- **Abilities:** ${a.abilities || '—'}`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(md);
    setCopiedId(char.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBookmarkCharacter = async (char: WorldEntity) => {
    await createFavorite({
      projectId: project.id,
      name: char.name,
      pronunciation: char.attributes?.aliases || '',
      category: `Character · ${char.attributes?.storyRole || char.subCategory}`,
      interpretation: char.summary || char.attributes?.motivation || '',
      inspiration: char.attributes?.origin || '',
      suitability: char.subtitle || '',
      titleOrVariation: char.attributes?.nobleTitle || '',
    });
    setFavoritedId(char.id);
    setTimeout(() => setFavoritedId(null), 2000);
  };

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRelError(null);
    if (!selectedChar || !relTargetId) return;
    const target = entities.find((ent) => ent.id === relTargetId);
    if (!target) return;

    const normalizedType = relType.trim() || 'Connected To';

    // Phase 9.3 Duplicate check
    const duplicate = relations.some(
      (r) =>
        r.id !== editingRelId &&
        r.sourceEntityId === selectedChar.id &&
        r.targetEntityId === target.id &&
        r.relationType.toLowerCase() === normalizedType.toLowerCase()
    );
    if (duplicate) {
      setRelError(
        `A "${normalizedType}" link between ${selectedChar.name} and ${target.name} already exists.`
      );
      return;
    }

    if (editingRelId) {
      await updateEntityRelation(editingRelId, {
        sourceEntityId: selectedChar.id,
        sourceEntityName: selectedChar.name,
        targetEntityId: target.id,
        targetEntityName: target.name,
        relationType: normalizedType,
        description: relDesc,
      });
    } else {
      await createEntityRelation({
        projectId: project.id,
        sourceEntityId: selectedChar.id,
        sourceEntityName: selectedChar.name,
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
            r.targetEntityId === selectedChar.id &&
            r.relationType.toLowerCase() === inv.toLowerCase()
        );
        if (!invDup) {
          await createEntityRelation({
            projectId: project.id,
            sourceEntityId: target.id,
            sourceEntityName: target.name,
            targetEntityId: selectedChar.id,
            targetEntityName: selectedChar.name,
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEntity(deleteTarget.id);
      if (selectedCharacterId === deleteTarget.id) {
        setSelectedCharacterId(null);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const filteredCharacters = characters.filter((c) => {
    if (
      roleFilter !== 'All' &&
      c.subCategory !== roleFilter &&
      c.attributes?.storyRole !== roleFilter
    ) {
      return false;
    }
    if (
      searchQuery.trim() &&
      !c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !c.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(c.attributes?.aliases || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const charRelations = selectedChar
    ? relations.filter(
        (r) =>
          r.sourceEntityId === selectedChar.id ||
          r.targetEntityId === selectedChar.id
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Character Studio & Dramatis Personae
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Develop deep 24-field psychological profiles, lineages, abilities, and cross-entity relationships.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreateModal}>
          <UserPlus className="w-4 h-4" />
          New Character Profile
        </Button>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 border border-[var(--border-subtle)] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search characters by name, title, or alias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Story Role:</span>
          <Select
            className="w-48"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All">All Roles ({characters.length})</option>
            {STORY_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filteredCharacters.length === 0 ? (
        <EmptyState
          title="No Characters in Dramatis Personae"
          description="Create your first character manually or synthesize a complete 24-field character profile using the AI Character Architect."
          actionLabel="Create Character Profile"
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 4 Cols: Character Roster with Main Portrait Cards */}
          <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] overflow-hidden">
            {filteredCharacters.map((char) => {
              const isSelected = selectedChar?.id === char.id;
              const charAssets = visualAssets.filter((a) => a.entityId === char.id);
              const mainPortrait =
                charAssets.find((a) => a.isPrimary) || charAssets[0] || null;

              return (
                <button
                  key={char.id}
                  onClick={() => setSelectedCharacterId(char.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer flex items-center gap-3.5 ${
                    isSelected ? 'bg-[#181E30]' : 'hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  {mainPortrait ? (
                    <img
                      src={mainPortrait.publicUrl}
                      alt={char.name}
                      className="w-12 h-14 rounded-lg object-cover border border-amber-500/40 bg-stone-950 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-14 rounded-lg bg-[var(--border-subtle)] border border-[#283048] flex items-center justify-center text-sm font-serif-display font-bold text-[var(--accent-primary)] shrink-0">
                      {char.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>
                        {char.attributes?.storyRole || char.subCategory || 'Character'}
                      </span>
                      {char.attributes?.species && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{char.attributes.species}</span>
                        </>
                      )}
                      {char.attributes?.age && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Age {char.attributes.age}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-base font-semibold text-[var(--text-primary)] font-serif-display mt-0.5 truncate">
                      {char.name}
                    </p>
                    {char.subtitle && (
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                        {char.subtitle}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right 8 Cols: Complete Character Dossier */}
          {selectedChar && (
            <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
                <div className="flex items-start gap-4">
                  {(() => {
                    const charAssets = visualAssets.filter(
                      (a) => a.entityId === selectedChar.id
                    );
                    const mainPortrait =
                      charAssets.find((a) => a.isPrimary) || charAssets[0] || null;
                    return mainPortrait ? (
                      <img
                        src={mainPortrait.publicUrl}
                        alt={selectedChar.name}
                        className="w-20 h-28 rounded-xl object-cover border border-amber-500/50 bg-stone-950 shadow-lg shrink-0"
                      />
                    ) : null;
                  })()}
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>
                        {selectedChar.attributes?.storyRole ||
                          selectedChar.subCategory}
                      </span>
                      {selectedChar.attributes?.species && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{selectedChar.attributes.species}</span>
                        </>
                      )}
                      {selectedChar.attributes?.race && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{selectedChar.attributes.race}</span>
                        </>
                      )}
                      {selectedChar.attributes?.origin && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{selectedChar.attributes.origin}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-3xl font-semibold text-[var(--text-primary)] font-serif-display mt-1">
                      {selectedChar.name}
                    </h2>
                    {selectedChar.attributes?.aliases && (
                      <p className="text-xs text-[var(--accent-primary)] mt-1">
                        Aliases & Epithets: {selectedChar.attributes.aliases}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {onInspectEntityForAssistant && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectEntityForAssistant(selectedChar)}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      Ask AI
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyDossier(selectedChar)}
                    title="Copy Dossier as Markdown"
                  >
                    {copiedId === selectedChar.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#34D399]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Sheet
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBookmarkCharacter(selectedChar)}
                    title="Save Character to Favorites"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    {favoritedId === selectedChar.id ? 'Favorited' : 'Favorite'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionModalOpen(true)}
                    title="View Version History & Compare"
                  >
                    <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    History
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(selectedChar)}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Dossier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(selectedChar)}
                    className="text-[#F87171]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Identity Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-[var(--border-subtle)] text-xs">
                <div>
                  <p className="text-[var(--text-muted)]">First / Last Name</p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5">
                    {selectedChar.attributes?.firstName || '—'}{' '}
                    {selectedChar.attributes?.lastName || ''}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Gender & Age</p>
                  <p className="text-[var(--text-primary)] font-medium font-mono-tabular mt-0.5">
                    {selectedChar.attributes?.gender || '—'} ·{' '}
                    {selectedChar.attributes?.age || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Social Status</p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5">
                    {selectedChar.attributes?.socialStatus || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Noble Title</p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5">
                    {selectedChar.attributes?.nobleTitle || 'None'}
                  </p>
                </div>
              </div>

              {/* Narrative & Psychological Dossier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm leading-relaxed">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Appearance & Physical Presence
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.appearance || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Personality & Temperament
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.personality || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Background & Biography
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.background ||
                        selectedChar.summary ||
                        'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Character Arc & Development
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.characterDevelopment ||
                        'Not recorded.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Core Motivation & Goals
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)]">Motivation:</span>{' '}
                      {selectedChar.attributes?.motivation || '—'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      <span className="text-[var(--text-muted)]">Goals:</span>{' '}
                      {selectedChar.attributes?.goals || '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Fears, Strengths & Weaknesses
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)]">Fears:</span>{' '}
                      {selectedChar.attributes?.fears || '—'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      <span className="text-[var(--text-muted)]">Strengths:</span>{' '}
                      {selectedChar.attributes?.strengths || '—'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      <span className="text-[var(--text-muted)]">Weaknesses:</span>{' '}
                      {selectedChar.attributes?.weaknesses || '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Abilities & Combat / Magic Attunement
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.abilities || 'Not recorded.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Relationship Notes & Additional Notes
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {selectedChar.attributes?.relationships || '—'}
                    </p>
                    {selectedChar.attributes?.additionalNotes && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {selectedChar.attributes.additionalNotes}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase 11 — Character Visual Profile & Reference Gallery */}
              <EntityVisualGallery
                project={project}
                entity={selectedChar}
                assets={visualAssets}
                defaultCategory="character_portrait"
                customVisualNotes={selectedChar.attributes?.customVisualNotes || ''}
                onSaveCustomVisualNotes={async (notes) => {
                  await updateEntity(selectedChar.id, {
                    category: 'character',
                    subCategory: selectedChar.subCategory,
                    name: selectedChar.name,
                    subtitle: selectedChar.subtitle,
                    summary: selectedChar.summary,
                    parentId: selectedChar.parentId || '',
                    attributes: {
                      ...selectedChar.attributes,
                      customVisualNotes: notes,
                    },
                  });
                }}
              />

              {/* Connected Entity Relationships */}
              <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Connected Worldbuilding Entities ({charRelations.length})
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      Explicit links between {selectedChar.name} and other characters, locations, organizations, or artifacts.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const firstOther = entities.find(
                        (e) => e.id !== selectedChar.id
                      );
                      setEditingRelId(null);
                      setRelTargetId(firstOther?.id || '');
                      setRelType('Sworn Ally of');
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

                {charRelations.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No linked entity relationships yet. Click Link Entity to connect this character to a homeland, faction, rival, or artifact.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg">
                    {charRelations.map((rel) => {
                      const isOutgoing =
                        rel.sourceEntityId === selectedChar.id;
                      const otherEntityId = isOutgoing
                        ? rel.targetEntityId
                        : rel.sourceEntityId;
                      const otherEntity = entities.find(
                        (e) => e.id === otherEntityId
                      );

                      return (
                        <div
                          key={rel.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
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
                            {otherEntity && (
                              <span className="text-[var(--text-muted)]">
                                [{otherEntity.subCategory || otherEntity.category}]
                              </span>
                            )}
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

      {/* 24-Field Character Editor Modal with AI Character Architect */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit Character Profile' : 'Create Character Profile'}
        subtitle="Complete all 24 character studio fields manually or synthesize from a concept prompt with AI."
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSaveCharacter} className="space-y-5">
          {/* AI Synthesis Bar */}
          <div className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI Character Architect (Optional)
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Auto-populates all 24 fields while keeping full manual control
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe character concept, e.g., 'A blind archivist-monk of Eldoria who hears star-iron resonance'..."
              />
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleAiSynthesizeCharacter(1)}
                  disabled={aiGenerating}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {aiGenerating ? 'Synthesizing...' : 'Generate with AI'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAiSynthesizeCharacter(3)}
                  disabled={aiGenerating}
                  title="Compare 3 AI character variations side-by-side"
                >
                  <Columns className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Compare 3
                </Button>
              </div>
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-[#3A1820] border border-[#7F1D1D] rounded-lg text-xs text-[#FCA5A5]">
              {formError}
            </div>
          )}

          {/* Section Switcher inside Modal */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
            {(
              [
                { id: 'identity', label: '1. Identity & Status (11 Fields)' },
                { id: 'psychology', label: '2. Appearance & Psychology (6 Fields)' },
                { id: 'narrative', label: '3. Background & Arc (3 Fields)' },
                { id: 'abilities', label: '4. Strengths, Abilities & Notes (4 Fields)' },
              ] as const
            ).map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveEditorSection(sec.id)}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeEditorSection === sec.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>

          {activeEditorSection === 'identity' && (
            <div className="space-y-4">
              {/* Canon Reference Quick-Pickers */}
              {(projectLocations.length > 0 || projectOrgsAndHouses.length > 0) && (
                <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {projectOrgsAndHouses.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Quick-Fill Dynasty / Faction from Project Canon
                      </label>
                      <Select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setLastName(e.target.value);
                          if (!socialStatus) {
                            setSocialStatus(`Affiliated with ${e.target.value}`);
                          }
                        }}
                      >
                        <option value="">-- Choose Noble House or Faction --</option>
                        {projectOrgsAndHouses.map((org) => (
                          <option key={org.id} value={org.name}>
                            {org.name} ({org.subCategory})
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {projectLocations.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Quick-Fill Homeland from World Builder
                      </label>
                      <Select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setOrigin(e.target.value);
                        }}
                      >
                        <option value="">-- Choose Canonical Location --</option>
                        {projectLocations.map((loc) => (
                          <option key={loc.id} value={loc.name}>
                            {loc.name} ({loc.subCategory})
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel label="Full Name" required />
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Caelum Vaelor"
                  />
                </div>
                <div>
                  <FieldLabel label="First Name" />
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Caelum"
                  />
                </div>
                <div>
                  <FieldLabel label="Last Name / House" />
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Vaelor"
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel label="Aliases & Epithets" />
                  <Input
                    value={aliases}
                    onChange={(e) => setAliases(e.target.value)}
                    placeholder="The Ashen Chronicler, Crow of Eldoria"
                  />
                </div>
                <div>
                  <FieldLabel label="Story Role" />
                  <Select
                    value={storyRole}
                    onChange={(e) => setStoryRole(e.target.value)}
                  >
                    {STORY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel label="Gender" />
                  <Input
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    placeholder="Male / Female / Non-binary"
                  />
                </div>
                <div>
                  <FieldLabel label="Age" />
                  <Input
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="29"
                  />
                </div>
                <div>
                  <FieldLabel label="Species" />
                  <Input
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    placeholder="Human"
                  />
                </div>
                <div>
                  <FieldLabel label="Race / Cultural Lineage" />
                  <Input
                    value={race}
                    onChange={(e) => setRace(e.target.value)}
                    placeholder="High Aetherian"
                  />
                </div>
                <div>
                  <FieldLabel label="Social Status" />
                  <Input
                    value={socialStatus}
                    onChange={(e) => setSocialStatus(e.target.value)}
                    placeholder="Exiled Noble"
                  />
                </div>
                <div>
                  <FieldLabel label="Noble Title / Rank" />
                  <Input
                    value={nobleTitle}
                    onChange={(e) => setNobleTitle(e.target.value)}
                    placeholder="Warden of the Pale Seal"
                  />
                </div>
                <div className="sm:col-span-3">
                  <FieldLabel label="Origin / Homeland" />
                  <Input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="City of Eldoria, Northern Province"
                  />
                </div>
              </div>
            </div>
          )}

          {activeEditorSection === 'psychology' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Personality" />
                <Textarea
                  rows={3}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="Temperament, virtues, habits..."
                />
              </div>
              <div>
                <FieldLabel label="Physical Appearance" />
                <Textarea
                  rows={3}
                  value={appearance}
                  onChange={(e) => setAppearance(e.target.value)}
                  placeholder="Build, eyes, attire, distinguishing scars..."
                />
              </div>
              <div>
                <FieldLabel label="Core Motivation" />
                <Textarea
                  rows={2}
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  placeholder="Why they act..."
                />
              </div>
              <div>
                <FieldLabel label="Concrete Goals" />
                <Textarea
                  rows={2}
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="Short-term and long-term ambitions..."
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel label="Deepest Fears" />
                <Textarea
                  rows={2}
                  value={fears}
                  onChange={(e) => setFears(e.target.value)}
                  placeholder="What they dread above all else..."
                />
              </div>
            </div>
          )}

          {activeEditorSection === 'narrative' && (
            <div className="space-y-4">
              <div>
                <FieldLabel label="Background & History" />
                <Textarea
                  rows={4}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="Formative events, upbringing, turning points..."
                />
              </div>
              <div>
                <FieldLabel label="Character Development & Arc" />
                <Textarea
                  rows={3}
                  value={characterDevelopment}
                  onChange={(e) => setCharacterDevelopment(e.target.value)}
                  placeholder="How the character transforms across the narrative..."
                />
              </div>
              <div>
                <FieldLabel label="Interpersonal Relationships Summary" />
                <Textarea
                  rows={2}
                  value={relationships}
                  onChange={(e) => setRelationships(e.target.value)}
                  placeholder="Key bonds, rivalries, family ties..."
                />
              </div>
            </div>
          )}

          {activeEditorSection === 'abilities' && (
            <div className="space-y-4">
              {projectPowersAndItems.length > 0 && (
                <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Insert Canonical Ability / Power System / Artifact from Project
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setAbilities((prev) =>
                        prev ? `${prev}\n• ${e.target.value}` : `• ${e.target.value}`
                      );
                    }}
                  >
                    <option value="">-- Select Power System or Relic to Append --</option>
                    {projectPowersAndItems.map((pw) => (
                      <option
                        key={pw.id}
                        value={`${pw.name} (${pw.subCategory}): ${pw.summary}`}
                      >
                        [{pw.subCategory}] {pw.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Strengths" />
                  <Textarea
                    rows={3}
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel label="Weaknesses & Flaws" />
                  <Textarea
                    rows={3}
                    value={weaknesses}
                    onChange={(e) => setWeaknesses(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel label="Abilities, Magic & Skills" />
                  <Textarea
                    rows={3}
                    value={abilities}
                    onChange={(e) => setAbilities(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel label="Additional Notes" />
                  <Textarea
                    rows={2}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
            {editingId ? (
              <AutosaveIndicator status={autosaveStatus} />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                All 24 character fields are preserved across tabs before saving.
              </span>
            )}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                <Plus className="w-4 h-4" />
                {saving ? 'Saving Profile...' : 'Save Character Profile'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* AI Side-by-Side Comparison Modal (Phase 8.3) */}
      <AiComparisonModal
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        title="Compare AI Character Variations"
        candidates={comparisonCandidates}
        primaryTitleKey="fullName"
        secondaryKey="nobleTitle"
        summaryKey="background"
        displayFields={[
          { key: 'storyRole', label: 'Story Role' },
          { key: 'personality', label: 'Personality' },
          { key: 'motivation', label: 'Motivation' },
          { key: 'abilities', label: 'Abilities' },
        ]}
        onSelectCandidate={(c) => applyCharacterCandidate(c)}
      />

      {/* Version History Modal (Phase 7.1) */}
      {selectedChar && (
        <VersionHistoryModal
          open={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          projectId={project.id}
          entityId={selectedChar.id}
          entityType="character"
          entityName={selectedChar.name}
          currentSnapshot={{
            name: selectedChar.name,
            category: selectedChar.category,
            subCategory: selectedChar.subCategory,
            subtitle: selectedChar.subtitle,
            summary: selectedChar.summary,
            ...selectedChar.attributes,
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
            ? `Edit Relationship for ${selectedChar?.name || 'Character'}`
            : `Link ${selectedChar?.name || 'Character'} to Entity`
        }
        subtitle="Establish a directed relationship with another character, location, organization, or item."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddRelation} className="space-y-4">
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
                .filter((e) => e.id !== selectedChar?.id)
                .map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    [{ent.subCategory || ent.category}] {ent.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel label="Quick Relationship Preset" />
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) setRelType(e.target.value);
              }}
            >
              <option value="">-- Choose Preset or Type Below --</option>
              {RELATION_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel label="Relationship Type" required />
            <Input
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              placeholder="e.g., Sworn Enemy of, Born in, Wields, Leads..."
              required
            />
          </div>
          <div>
            <FieldLabel label="Context / Description" />
            <Textarea
              rows={2}
              value={relDesc}
              onChange={(e) => setRelDesc(e.target.value)}
              placeholder="Brief explanation of this bond or conflict..."
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
                    placeholder="e.g., Sovereign of, Homeland of..."
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
        onConfirm={handleConfirmDelete}
        title="Delete Character Profile"
        description={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        loading={deleting}
      />
    </div>
  );
};
