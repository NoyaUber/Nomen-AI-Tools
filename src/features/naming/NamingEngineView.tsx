import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Columns,
  Copy,
  Edit3,
  History,
  Info,
  Plus,
  RefreshCw,
  Scale,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  AiGenerationRecord,
  EntityCategory,
  FavoriteItem,
  NAMING_CATEGORIES,
  NamingCandidate,
  NamingCategory,
  NamingRule,
  Project,
  ProjectAiSetting,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createFavorite,
  createNamingRule,
  deleteAiGeneration,
  deleteFavorite,
  deleteNamingRule,
  recordAiGeneration,
  updateNamingRule,
} from '../../lib/db/firestore-service';
import {
  generateNamesApi,
  generateNameVariationsApi,
} from '../../lib/ai/client';
import {
  Button,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui/primitives';

interface NamingEngineViewProps {
  project: Project;
  namingRules: NamingRule[];
  favorites: FavoriteItem[];
  aiGenerations: AiGenerationRecord[];
  entities?: WorldEntity[];
  aiSettings?: ProjectAiSetting | null;
}

export function mapNamingCategoryToEntityCategory(cat: NamingCategory): {
  category: EntityCategory;
  subCategory: string;
} {
  switch (cat) {
    case 'Character names':
    case 'Surnames':
    case 'Titles and epithets':
      return { category: 'character', subCategory: 'Protagonist' };
    case 'Noble family names':
      return { category: 'family', subCategory: 'Noble Family' };
    case 'Kingdom names':
      return { category: 'location', subCategory: 'Kingdom' };
    case 'Country names':
      return { category: 'location', subCategory: 'Country' };
    case 'City names':
      return { category: 'location', subCategory: 'City' };
    case 'Continent names':
      return { category: 'location', subCategory: 'Continent' };
    case 'Organization names':
      return { category: 'organization', subCategory: 'Secret Society' };
    case 'Guild names':
      return { category: 'organization', subCategory: 'Guild' };
    case 'Weapon names':
      return { category: 'item', subCategory: 'Weapon' };
    case 'Artifact names':
      return { category: 'item', subCategory: 'Magical Artifact' };
    case 'Ability names':
      return { category: 'ability', subCategory: 'Ability' };
    case 'Magic names':
      return { category: 'ability', subCategory: 'Magic System' };
    default:
      return { category: 'custom', subCategory: 'Custom' };
  }
}

const CATEGORY_DEFAULTS: Record<
  NamingCategory,
  {
    domainTheme?: string;
    toneAndEra?: string;
    culturalInfluence?: string;
    namingStyle?: string;
    locationType?: string;
    geography?: string;
  }
> = {
  'Character names': {
    culturalInfluence: 'Classical Latin, Old Norse & Celtic',
    namingStyle: 'Melodic, archaic, memorable cadence',
  },
  Surnames: {
    culturalInfluence: 'Anglo-Norman, Old High German & Latinate',
    namingStyle: 'Patronymic or topographical compound surnames',
  },
  'Noble family names': {
    culturalInfluence: 'Byzantine Imperial & High Gothic',
    namingStyle: 'Regal, ancestral house names with strong liquid consonants',
  },
  'Kingdom names': {
    locationType: 'Sovereign High Monarchy',
    geography: 'Silver-veined mountain crags and misty highland valleys',
    culturalInfluence: 'Classical Antiquity & Arthurian',
  },
  'Country names': {
    locationType: 'Merchant Republic / Sovereign Nation',
    geography: 'Coastal archipelagos and fertile river basins',
    culturalInfluence: 'Mediterranean & Old Iberian',
  },
  'City names': {
    locationType: 'Terraced Citadel & Astral Port',
    geography: 'Built inside an ancient celestial crater above a glass sea',
    culturalInfluence: 'Greek, Welsh & Levantine',
  },
  'Continent names': {
    locationType: 'Ancient Shattered Landmass',
    geography: 'Obsidian cordilleras, inland seas, and sub-arctic steppes',
    culturalInfluence: 'Proto-Indo-European & Mythic Archaic',
  },
  'Organization names': {
    domainTheme: 'Monastic intelligence order & forbidden archive custodians',
    toneAndEra: 'Solemn, clandestine, centuries-old',
    culturalInfluence: 'Ecclesiastical Latin & Gothic',
    namingStyle: 'The Order of the [Adjective] [Emblem]',
  },
  'Guild names': {
    domainTheme: 'Astral glassblowers, star-smiths, and relic cartographers',
    toneAndEra: 'Mercantile Renaissance / Arcane Craft',
    culturalInfluence: 'Hanseatic & Venetian',
    namingStyle: 'Guild / Syndicate / Covenant of [Craft]',
  },
  'Weapon names': {
    domainTheme: 'Star-iron longsword that resonates with spoken oaths',
    toneAndEra: 'Relic of the First Eclipse War',
    culturalInfluence: 'Old Norse & High Elven',
    namingStyle: 'Evocative single name + formal epithet',
  },
  'Artifact names': {
    domainTheme: 'Three-ringed celestial astrolabe that reveals erased memories',
    toneAndEra: 'Pre-Sundering Mythic Era',
    culturalInfluence: 'Hermetic & Classical',
    namingStyle: 'The [Ancestral/Celestial] [Vessel]',
  },
  'Ability names': {
    domainTheme: 'Spatial void-stepping and harmonic echo-sight',
    toneAndEra: 'High-tier combat & resonance technique',
    culturalInfluence: 'Poetic Martial / Arcane',
    namingStyle: 'Crisp two-to-three word evocative technique name',
  },
  'Magic names': {
    domainTheme: 'Acoustic star-metal attunement across Five Harmonic Chords',
    toneAndEra: 'Foundational Cosmological Magic System',
    culturalInfluence: 'Musical / Astronomical Latin',
    namingStyle: 'Formal scholarly treatise nomenclature',
  },
  'Titles and epithets': {
    domainTheme: 'Honorifics for disgraced knights, arch-prelates, and sovereigns',
    toneAndEra: 'High Courtly & Chivalric',
    culturalInfluence: 'Late Medieval & Imperial',
    namingStyle: 'Warden of the [Noun] / The [Adjective] [Role]',
  },
  'Custom categories': {
    domainTheme: 'Celestial constellations, airship vessels, and sacred treaties',
    toneAndEra: 'Mythic & Editorial',
    culturalInfluence: 'Classical & Constructed',
    namingStyle: 'Poetic and lore-grounded',
  },
};

export const NamingEngineView: React.FC<NamingEngineViewProps> = ({
  project,
  namingRules,
  favorites,
  aiGenerations,
  entities = [],
  aiSettings = null,
}) => {
  const [subTab, setSubTab] = useState<'generator' | 'rules' | 'favorites' | 'history'>('generator');
  const [selectedCategory, setSelectedCategory] = useState<NamingCategory>('Character names');
  const [candidateCount, setCandidateCount] = useState<number>(4);

  // Character contextual parameters
  const [gender, setGender] = useState('Any');
  const [characterRole, setCharacterRole] = useState('Protagonist / Knight-Scholar');
  const [personality, setPersonality] = useState('Stoic, calculating, quietly honorable');
  const [socialStatus, setSocialStatus] = useState('High Nobility / Exiled House');
  const [species, setSpecies] = useState('Human');
  const [race, setRace] = useState('High Aetherian');
  const [origin, setOrigin] = useState('Northern Province / Eldoria');
  const [culturalInfluence, setCulturalInfluence] = useState('Late Roman / Old Norse / Celtic');
  const [namingStyle, setNamingStyle] = useState('Melodic, archaic, multi-syllabic');
  const [existingFamilyName, setExistingFamilyName] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  // Location contextual parameters
  const [locationType, setLocationType] = useState('Fortress City');
  const [geography, setGeography] = useState('Obsidian mountain caldera and mist fjords');
  const [culture, setCulture] = useState('Scholarly monastic order & star-smiths');
  const [civilization, setCivilization] = useState('Kingdom of Aetheria');
  const [historicalBackground, setHistoricalBackground] = useState(
    'Founded over a pre-Sundering astral crater'
  );
  const [languageInspiration, setLanguageInspiration] = useState('Classical Latin & Welsh');
  const [desiredAtmosphere, setDesiredAtmosphere] = useState('Solemn, ancient, gothic');

  // General / Artifact / Organization / Power parameters
  const [domainTheme, setDomainTheme] = useState('Astral Resonance & Star-Iron');
  const [toneAndEra, setToneAndEra] = useState('Ancient Imperial / Mythic');
  const [customCategoryName, setCustomCategoryName] = useState('Celestial Constellations');

  // Results state
  const [candidates, setCandidates] = useState<NamingCandidate[]>([]);
  const [etymologyNote, setEtymologyNote] = useState<string>('');
  const [lastModelUsed, setLastModelUsed] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [variationLoadingId, setVariationLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Candidate Editing, Comparison & Saving
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NamingCandidate | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Save Candidate as Entity Modal State
  const [entitySaveModalOpen, setEntitySaveModalOpen] = useState(false);
  const [entitySaveCandidate, setEntitySaveCandidate] = useState<NamingCandidate | null>(null);
  const [targetEntityCategory, setTargetEntityCategory] = useState<EntityCategory>('character');
  const [targetEntitySubCategory, setTargetEntitySubCategory] = useState<string>('Protagonist');
  const [targetEntitySummary, setTargetEntitySummary] = useState<string>('');
  const [savingEntity, setSavingEntity] = useState(false);

  // Naming Rules state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NamingRule | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleCategory, setRuleCategory] = useState<string>('Character names');
  const [ruleCulture, setRuleCulture] = useState('');
  const [rulePhonetics, setRulePhonetics] = useState('');
  const [ruleAffixes, setRuleAffixes] = useState('');
  const [ruleStructure, setRuleStructure] = useState('');
  const [ruleExamples, setRuleExamples] = useState('');
  const [ruleActive, setRuleActive] = useState(true);

  const handleSelectCategory = (cat: NamingCategory) => {
    setSelectedCategory(cat);
    const defs = CATEGORY_DEFAULTS[cat];
    if (defs) {
      if (defs.domainTheme) setDomainTheme(defs.domainTheme);
      if (defs.toneAndEra) setToneAndEra(defs.toneAndEra);
      if (defs.culturalInfluence) setCulturalInfluence(defs.culturalInfluence);
      if (defs.namingStyle) setNamingStyle(defs.namingStyle);
      if (defs.locationType) setLocationType(defs.locationType);
      if (defs.geography) setGeography(defs.geography);
    }
  };

  const isCharacterCategory =
    selectedCategory === 'Character names' ||
    selectedCategory === 'Surnames' ||
    selectedCategory === 'Noble family names' ||
    selectedCategory === 'Titles and epithets';

  const isLocationCategory =
    selectedCategory === 'Kingdom names' ||
    selectedCategory === 'Country names' ||
    selectedCategory === 'City names' ||
    selectedCategory === 'Continent names';

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const buildParameters = (): Record<string, string> => {
    const base: Record<string, string> = {
      Genre: project.genre,
    };

    if (selectedCategory === 'Custom categories') {
      base['Custom Category Type'] = customCategoryName;
    }

    if (isCharacterCategory) {
      return {
        ...base,
        Gender: gender,
        'Character Role': characterRole,
        Personality: personality,
        'Social Status': socialStatus,
        Species: species,
        Race: race,
        Origin: origin,
        'Cultural Influence': culturalInfluence,
        'Naming Style': namingStyle,
        'Existing Family Name': existingFamilyName,
        'Additional Context': additionalContext,
      };
    }

    if (isLocationCategory) {
      return {
        ...base,
        'Location Type': locationType || selectedCategory,
        Geography: geography,
        Culture: culture,
        Civilization: civilization,
        'Historical Background': historicalBackground,
        'Language Inspiration': languageInspiration,
        'Desired Atmosphere': desiredAtmosphere,
        'Additional Context': additionalContext,
      };
    }

    return {
      ...base,
      'Domain / Function': domainTheme,
      'Era & Tone': toneAndEra,
      'Cultural / Linguistic Inspiration': culturalInfluence,
      'Naming Style': namingStyle,
      'Additional Context': additionalContext,
    };
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const parameters = buildParameters();
      const activeRules = namingRules
        .filter((r) => r.isActive)
        .map((r) => ({
          title: r.title,
          cultureOrGroup: r.cultureOrGroup,
          phoneticPattern: r.phoneticPattern,
          prefixSuffixRule: r.prefixSuffixRule,
          structureRule: r.structureRule,
          examples: r.examples,
        }));

      // Phase 8.1 — Smart Context: Include matching family/location canon notes if referenced
      const canonReferences: string[] = [];
      if (existingFamilyName.trim()) {
        const matchedFam = entities.find(
          (ent) =>
            ent.name.toLowerCase().includes(existingFamilyName.toLowerCase()) ||
            ent.attributes?.lastName?.toLowerCase() ===
              existingFamilyName.toLowerCase()
        );
        if (matchedFam) {
          canonReferences.push(
            `Existing Canon Family/Member "${matchedFam.name}": ${matchedFam.summary}`
          );
        }
      }
      if (origin.trim()) {
        const matchedLoc = entities.find((ent) =>
          ent.name.toLowerCase().includes(origin.toLowerCase())
        );
        if (matchedLoc) {
          canonReferences.push(
            `Origin Location "${matchedLoc.name}" (${matchedLoc.subCategory}): ${matchedLoc.summary}`
          );
        }
      }
      if (canonReferences.length > 0) {
        parameters['Smart Canon Context'] = canonReferences.join(' | ');
      }

      const res = await generateNamesApi({
        category: selectedCategory,
        count: candidateCount,
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
        parameters,
        activeRules,
      });

      setCandidates(res.candidates);
      setEtymologyNote(res.etymologyNote);
      setLastModelUsed(res.modelUsed);

      const promptSummary = `${selectedCategory} (${Object.values(parameters)
        .filter(Boolean)
        .slice(0, 4)
        .join(' · ')})`;
      const resultsSummary = res.candidates
        .map((c) => `${c.name} [${c.pronunciation}]`)
        .join(', ');

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Naming Engine',
        category: selectedCategory,
        promptSummary,
        resultsSummary,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate names');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVariations = async (cand: NamingCandidate) => {
    setVariationLoadingId(cand.id);
    setError(null);
    try {
      const res = await generateNameVariationsApi({
        baseName: cand.name,
        category: selectedCategory,
        inspiration: cand.inspiration,
        projectGenre: project.genre,
      });
      setCandidates((prev) => [...prev, ...res.candidates]);
      showToast(`Generated ${res.candidates.length} variations of "${cand.name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate variations');
    } finally {
      setVariationLoadingId(null);
    }
  };

  const handleCopy = (cand: NamingCandidate) => {
    navigator.clipboard.writeText(cand.name);
    setCopiedId(cand.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleFavorite = async (cand: NamingCandidate) => {
    await createFavorite({
      projectId: project.id,
      name: cand.name,
      pronunciation: cand.pronunciation,
      category: selectedCategory,
      interpretation: cand.interpretation,
      inspiration: cand.inspiration,
      suitability: cand.suitability,
      titleOrVariation: cand.titleOrVariation,
    });
    showToast(`Saved "${cand.name}" to project favorites`);
  };

  const openSaveEntityModal = (cand: NamingCandidate, catOverride?: NamingCategory) => {
    const mapped = mapNamingCategoryToEntityCategory(catOverride || selectedCategory);
    setEntitySaveCandidate(cand);
    setTargetEntityCategory(mapped.category);
    setTargetEntitySubCategory(mapped.subCategory);
    setTargetEntitySummary(`${cand.interpretation}\n\nSuitability: ${cand.suitability}`);
    setEntitySaveModalOpen(true);
  };

  const handleConfirmSaveAsEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entitySaveCandidate) return;
    setSavingEntity(true);
    try {
      await createEntity({
        projectId: project.id,
        category: targetEntityCategory,
        subCategory: targetEntitySubCategory,
        name: entitySaveCandidate.name,
        subtitle:
          entitySaveCandidate.titleOrVariation ||
          `${entitySaveCandidate.pronunciation} · ${selectedCategory}`,
        summary: targetEntitySummary,
        parentId: '',
        attributes: {
          pronunciation: entitySaveCandidate.pronunciation,
          linguisticInspiration: entitySaveCandidate.inspiration,
          additionalNotes: `Created from Naming Engine (${selectedCategory}).`,
        },
      });
      setEntitySaveModalOpen(false);
      showToast(`Saved "${entitySaveCandidate.name}" into ${targetEntitySubCategory} entities`);
    } finally {
      setSavingEntity(false);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const startEditCandidate = (cand: NamingCandidate) => {
    setEditingCandidateId(cand.id);
    setEditDraft({ ...cand });
  };

  const saveEditCandidate = () => {
    if (!editDraft) return;
    setCandidates((prev) => prev.map((c) => (c.id === editDraft.id ? editDraft : c)));
    setEditingCandidateId(null);
    setEditDraft(null);
    showToast('Updated candidate details');
  };

  // Naming Rules Handlers
  const openCreateRuleModal = () => {
    setEditingRule(null);
    setRuleTitle('');
    setRuleCategory('Character names');
    setRuleCulture('');
    setRulePhonetics('');
    setRuleAffixes('');
    setRuleStructure('');
    setRuleExamples('');
    setRuleActive(true);
    setRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: NamingRule) => {
    setEditingRule(rule);
    setRuleTitle(rule.title);
    setRuleCategory(rule.category);
    setRuleCulture(rule.cultureOrGroup);
    setRulePhonetics(rule.phoneticPattern);
    setRuleAffixes(rule.prefixSuffixRule);
    setRuleStructure(rule.structureRule);
    setRuleExamples(rule.examples);
    setRuleActive(rule.isActive);
    setRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTitle.trim()) return;
    if (editingRule) {
      await updateNamingRule(editingRule.id, {
        title: ruleTitle,
        category: ruleCategory,
        cultureOrGroup: ruleCulture,
        phoneticPattern: rulePhonetics,
        prefixSuffixRule: ruleAffixes,
        structureRule: ruleStructure,
        examples: ruleExamples,
        isActive: ruleActive,
      });
    } else {
      await createNamingRule({
        projectId: project.id,
        title: ruleTitle,
        category: ruleCategory,
        cultureOrGroup: ruleCulture,
        phoneticPattern: rulePhonetics,
        prefixSuffixRule: ruleAffixes,
        structureRule: ruleStructure,
        examples: ruleExamples,
        isActive: ruleActive,
      });
    }
    setRuleModalOpen(false);
    showToast('Saved naming convention');
  };

  const handleToggleRuleActive = async (rule: NamingRule) => {
    await updateNamingRule(rule.id, {
      title: rule.title,
      category: rule.category,
      cultureOrGroup: rule.cultureOrGroup,
      phoneticPattern: rule.phoneticPattern,
      prefixSuffixRule: rule.prefixSuffixRule,
      structureRule: rule.structureRule,
      examples: rule.examples,
      isActive: !rule.isActive,
    });
  };

  const comparedCandidates = candidates.filter((c) => compareIds.includes(c.id));

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Contextual Naming Engine & Philology Studio
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Synthesize culturally grounded names across 15 worldbuilding categories with custom phonetic rules.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg self-start">
          <button
            onClick={() => setSubTab('generator')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              subTab === 'generator'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Naming Studio
          </button>
          <button
            onClick={() => setSubTab('rules')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              subTab === 'rules'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Naming Rules ({namingRules.filter((r) => r.isActive).length} Active)
          </button>
          <button
            onClick={() => setSubTab('favorites')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              subTab === 'favorites'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Favorites ({favorites.length})
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              subTab === 'history'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            History ({aiGenerations.length})
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="px-4 py-2.5 text-xs text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/50 rounded-lg flex items-center justify-between">
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* SUBTAB 1: GENERATOR */}
      {subTab === 'generator' && (
        <div className="space-y-5">
          {/* 15-Category Quick Matrix */}
          <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Select Naming Category (All 15 Supported Categories)</span>
              <span className="font-mono-tabular text-[var(--accent-primary)]">{selectedCategory}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NAMING_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelectCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                        : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Cols: Dynamic Category & Contextual Form */}
            <form
              onSubmit={handleGenerate}
              className="lg:col-span-5 p-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <FieldLabel label="Active Category" required />
                  <Select
                    value={selectedCategory}
                    onChange={(e) => handleSelectCategory(e.target.value as NamingCategory)}
                  >
                    {NAMING_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel label="Candidates" />
                  <Select
                    value={candidateCount}
                    onChange={(e) => setCandidateCount(Number(e.target.value))}
                  >
                    <option value={3}>3 Names</option>
                    <option value={4}>4 Names</option>
                    <option value={6}>6 Names</option>
                  </Select>
                </div>
              </div>

              {selectedCategory === 'Custom categories' && (
                <div>
                  <FieldLabel label="Custom Category Definition" required />
                  <Input
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    placeholder="e.g., Airship Vessels, Star Constellations, Sacred Treaties"
                  />
                </div>
              )}

              {/* Dynamic Inputs for Character / Surname / Family / Title Categories */}
              {isCharacterCategory && (
                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Gender / Presentation" />
                      <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="Any">Any / Neutral</option>
                        <option value="Masculine">Masculine</option>
                        <option value="Feminine">Feminine</option>
                        <option value="Androgynous / Non-binary">Androgynous / Non-binary</option>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel label="Character Role" />
                      <Input
                        value={characterRole}
                        onChange={(e) => setCharacterRole(e.target.value)}
                        placeholder="Protagonist, Antagonist, Mentor..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Species" />
                      <Input
                        value={species}
                        onChange={(e) => setSpecies(e.target.value)}
                        placeholder="Human, Elf, Construct..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Race / Lineage" />
                      <Input
                        value={race}
                        onChange={(e) => setRace(e.target.value)}
                        placeholder="High Aetherian, Lowland..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Social Status" />
                      <Input
                        value={socialStatus}
                        onChange={(e) => setSocialStatus(e.target.value)}
                        placeholder="High Nobility, Commoner, Outcast..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Origin / Homeland" />
                      <Input
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        placeholder="City of Eldoria, Northern Marches..."
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel label="Personality Traits" />
                    <Input
                      value={personality}
                      onChange={(e) => setPersonality(e.target.value)}
                      placeholder="Analytical, ruthless, melancholic..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Cultural / Linguistic Influence" />
                      <Input
                        value={culturalInfluence}
                        onChange={(e) => setCulturalInfluence(e.target.value)}
                        placeholder="Latinate, Old Norse, Welsh, Persian..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Existing Family Name" hint="Optional" />
                      <Input
                        value={existingFamilyName}
                        onChange={(e) => setExistingFamilyName(e.target.value)}
                        placeholder="e.g., Vaelor"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel label="Naming Style" />
                    <Input
                      value={namingStyle}
                      onChange={(e) => setNamingStyle(e.target.value)}
                      placeholder="Archaic, sharp consonants, lyrical..."
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Inputs for Location Categories */}
              {isLocationCategory && (
                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Specific Location Type" />
                      <Input
                        value={locationType}
                        onChange={(e) => setLocationType(e.target.value)}
                        placeholder="Citadel, Harbor City, Highland Realm..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Civilization / Realm" />
                      <Input
                        value={civilization}
                        onChange={(e) => setCivilization(e.target.value)}
                        placeholder="Kingdom of Aetheria..."
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel label="Geography & Terrain" />
                    <Input
                      value={geography}
                      onChange={(e) => setGeography(e.target.value)}
                      placeholder="Obsidian cliffs, subterranean caldera, glass sea..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Dominant Culture" />
                      <Input
                        value={culture}
                        onChange={(e) => setCulture(e.target.value)}
                        placeholder="Astronomer-monks, seafaring guilds..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Language Inspiration" />
                      <Input
                        value={languageInspiration}
                        onChange={(e) => setLanguageInspiration(e.target.value)}
                        placeholder="Byzantine Greek, Old English, Sanskrit..."
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel label="Historical Background" />
                    <Input
                      value={historicalBackground}
                      onChange={(e) => setHistoricalBackground(e.target.value)}
                      placeholder="Site of the First Eclipse treaty..."
                    />
                  </div>

                  <div>
                    <FieldLabel label="Desired Atmosphere" />
                    <Input
                      value={desiredAtmosphere}
                      onChange={(e) => setDesiredAtmosphere(e.target.value)}
                      placeholder="Solemn, mist-shrouded, austere..."
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Inputs for Organization / Item / Magic / Ability */}
              {!isCharacterCategory && !isLocationCategory && (
                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                  <div>
                    <FieldLabel label="Domain, Essence, or Function" />
                    <Input
                      value={domainTheme}
                      onChange={(e) => setDomainTheme(e.target.value)}
                      placeholder="e.g., Time-binding relic, Shadow intelligence order..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Era & Tone" />
                      <Input
                        value={toneAndEra}
                        onChange={(e) => setToneAndEra(e.target.value)}
                        placeholder="First Age, High Gothic, Arcane..."
                      />
                    </div>
                    <div>
                      <FieldLabel label="Linguistic Inspiration" />
                      <Input
                        value={culturalInfluence}
                        onChange={(e) => setCulturalInfluence(e.target.value)}
                        placeholder="Classical Latin, Old Norse, High Elven..."
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel label="Naming Style / Structure" />
                    <Input
                      value={namingStyle}
                      onChange={(e) => setNamingStyle(e.target.value)}
                      placeholder="e.g., [Adjective] + [Abstract Noun], Single compound word..."
                    />
                  </div>
                </div>
              )}

              <div>
                <FieldLabel label="Additional Context or Constraints" hint="Optional" />
                <Textarea
                  rows={2}
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any specific imagery, starting letters, or lore ties..."
                />
              </div>

              {namingRules.filter((r) => r.isActive).length > 0 && (
                <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)]">
                  <span className="text-[var(--accent-primary)] font-medium">
                    {namingRules.filter((r) => r.isActive).length} Project Naming Rule(s) Active:
                  </span>{' '}
                  {namingRules
                    .filter((r) => r.isActive)
                    .map((r) => r.title)
                    .join(' · ')}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                <Sparkles className="w-4 h-4" />
                {loading
                  ? `Synthesizing ${selectedCategory}...`
                  : `Generate ${selectedCategory}`}
              </Button>
            </form>

            {/* Right 7 Cols: Candidates Workspace */}
            <div className="lg:col-span-7 space-y-4">
              {/* Etymology Honesty Banner */}
              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-xs text-[var(--text-secondary)] leading-relaxed">
                  <Info className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">
                      Philological & Etymological Note:
                    </span>{' '}
                    {etymologyNote ||
                      'Fictional interpretations and constructed roots are distinguished from real-world historical etymology so your worldbuilding remains authentic.'}
                  </div>
                </div>

                {compareIds.length >= 2 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCompareModalOpen(true)}
                  >
                    <Columns className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    Compare ({compareIds.length})
                  </Button>
                )}
              </div>

              {error && (
                <div className="p-4 bg-[#3A1820] border border-[#7F1D1D] rounded-xl text-xs text-[#FCA5A5]">
                  {error}
                </div>
              )}

              {candidates.length === 0 && !loading ? (
                <EmptyState
                  title="Ready to Synthesize Names"
                  description="Select any of the 15 categories above, review the contextual parameters on the left, and click Generate to produce tailored candidates with pronunciation, fictional interpretation, real-world linguistic inspiration, and suitability analysis."
                  actionLabel={`Generate ${selectedCategory}`}
                  onAction={() => handleGenerate()}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-tabular">
                      <span>
                        Showing {candidates.length} candidates for {selectedCategory}
                      </span>
                      {lastModelUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Model: {lastModelUsed}</span>
                        </>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleGenerate()}
                      disabled={loading}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate Batch
                    </Button>
                  </div>

                  {candidates.map((cand) => {
                    const isEditing = editingCandidateId === cand.id && editDraft;
                    const isCompared = compareIds.includes(cand.id);

                    return (
                      <div
                        key={cand.id}
                        className={`p-5 bg-[var(--bg-surface)] border rounded-xl transition-colors space-y-4 ${
                          isCompared ? 'border-[var(--accent-primary)]' : 'border-[var(--border-subtle)]'
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <FieldLabel label="Name" />
                                <Input
                                  value={editDraft.name}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, name: e.target.value })
                                  }
                                />
                              </div>
                              <div>
                                <FieldLabel label="Pronunciation" />
                                <Input
                                  value={editDraft.pronunciation}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      pronunciation: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div>
                              <FieldLabel label="Title or Variation" />
                              <Input
                                value={editDraft.titleOrVariation}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    titleOrVariation: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <FieldLabel label="Interpretation" />
                              <Textarea
                                rows={2}
                                value={editDraft.interpretation}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    interpretation: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingCandidateId(null)}
                              >
                                Cancel
                              </Button>
                              <Button variant="primary" size="sm" onClick={saveEditCandidate}>
                                Save Candidate Edits
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                              <div>
                                <div className="flex items-baseline gap-3 flex-wrap">
                                  <h3 className="text-2xl font-semibold text-[var(--text-primary)] font-serif-display">
                                    {cand.name}
                                  </h3>
                                  <span className="text-xs font-mono-tabular text-[var(--accent-primary)]">
                                    /{cand.pronunciation}/
                                  </span>
                                </div>
                                {cand.titleOrVariation && (
                                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    Epithet / Variations: {cand.titleOrVariation}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopy(cand)}
                                  title="Copy Name"
                                >
                                  {copiedId === cand.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  {copiedId === cand.id ? 'Copied' : 'Copy'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleFavorite(cand)}
                                  title="Favorite Candidate"
                                >
                                  <Star className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                  Favorite
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditCandidate(cand)}
                                  title="Edit Candidate"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  Edit
                                </Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed">
                              <div>
                                <p className="text-[var(--text-muted)] font-medium mb-1">
                                  In-Universe Interpretation
                                </p>
                                <p className="text-[var(--text-secondary)]">{cand.interpretation}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)] font-medium mb-1">
                                  Linguistic / Cultural Inspiration
                                </p>
                                <p className="text-[var(--text-secondary)]">{cand.inspiration}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)] font-medium mb-1">
                                  Contextual Suitability
                                </p>
                                <p className="text-[var(--text-secondary)]">{cand.suitability}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openSaveEntityModal(cand)}
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                  Save into Project Entities
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleGenerateVariations(cand)}
                                  disabled={variationLoadingId === cand.id}
                                >
                                  <Wand2 className="w-3.5 h-3.5" />
                                  {variationLoadingId === cand.id
                                    ? 'Generating...'
                                    : 'Generate Variations'}
                                </Button>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleCompare(cand.id)}
                                className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                                  isCompared
                                    ? 'bg-[var(--bg-elevated)] border-[var(--accent-primary)] text-[#EDE9FE]'
                                    : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {isCompared ? 'Selected for Comparison' : 'Select to Compare'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: NAMING RULES */}
      {subTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[var(--bg-surface)] p-5 border border-[var(--border-subtle)] rounded-xl">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                Custom Naming Rules & Linguistic Conventions
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Active conventions are automatically injected into the Naming Engine and Character Architect.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={openCreateRuleModal}>
              <Plus className="w-4 h-4" />
              New Naming Rule
            </Button>
          </div>

          {namingRules.length === 0 ? (
            <EmptyState
              title="No Custom Naming Rules Defined"
              description="Define phonetic patterns, noble house patronymics, or cultural prefixes/suffixes so the AI enforces consistent linguistic structure across your universe."
              actionLabel="Create First Naming Rule"
              onAction={openCreateRuleModal}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {namingRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-5 bg-[var(--bg-surface)] border rounded-xl space-y-3 ${
                    rule.isActive ? 'border-[var(--accent-primary)]/60' : 'border-[var(--border-subtle)] opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{rule.category}</span>
                        {rule.cultureOrGroup && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{rule.cultureOrGroup}</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display mt-0.5">
                        {rule.title}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleToggleRuleActive(rule)}
                      className={`px-2.5 py-1 text-xs rounded border cursor-pointer ${
                        rule.isActive
                          ? 'bg-[var(--bg-elevated)] border-[var(--accent-primary)] text-[#EDE9FE]'
                          : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {rule.isActive ? 'Active in AI' : 'Inactive'}
                    </button>
                  </div>

                  <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    {rule.phoneticPattern && (
                      <p>
                        <span className="text-[var(--text-muted)]">Phonetics:</span> {rule.phoneticPattern}
                      </p>
                    )}
                    {rule.prefixSuffixRule && (
                      <p>
                        <span className="text-[var(--text-muted)]">Prefixes / Suffixes:</span>{' '}
                        {rule.prefixSuffixRule}
                      </p>
                    )}
                    {rule.structureRule && (
                      <p>
                        <span className="text-[var(--text-muted)]">Structure:</span> {rule.structureRule}
                      </p>
                    )}
                    {rule.examples && (
                      <p>
                        <span className="text-[var(--text-muted)]">Canonical Examples:</span>{' '}
                        <span className="text-[var(--text-primary)]">{rule.examples}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                    <Button variant="ghost" size="sm" onClick={() => openEditRuleModal(rule)}>
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteNamingRule(rule.id)}
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

      {/* SUBTAB 3: FAVORITES */}
      {subTab === 'favorites' && (
        <div className="space-y-4">
          {favorites.length === 0 ? (
            <EmptyState
              title="No Favorite Names Saved"
              description="Star any candidate in the Naming Studio to build your curated project lexicon."
              actionLabel="Back to Naming Studio"
              onAction={() => setSubTab('generator')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="p-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                      {fav.name}
                    </h3>
                    <span className="text-xs font-mono-tabular text-[var(--accent-primary)]">
                      /{fav.pronunciation}/
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{fav.category}</span>
                    {fav.titleOrVariation && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{fav.titleOrVariation}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{fav.interpretation}</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{fav.inspiration}</p>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        openSaveEntityModal(
                          {
                            id: fav.id,
                            name: fav.name,
                            pronunciation: fav.pronunciation,
                            interpretation: fav.interpretation,
                            inspiration: fav.inspiration,
                            suitability: fav.suitability,
                            titleOrVariation: fav.titleOrVariation,
                          },
                          fav.category as NamingCategory
                        )
                      }
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      Save as Entity
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(fav.name)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFavorite(fav.id)}
                      className="text-[#F87171]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: NAMING HISTORY */}
      {subTab === 'history' && (
        <div className="space-y-3">
          {aiGenerations.length === 0 ? (
            <EmptyState
              title="No Generation History Yet"
              description="Every naming batch and character synthesis is logged here for easy reference."
            />
          ) : (
            aiGenerations.map((gen) => (
              <div
                key={gen.id}
                className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{gen.generationType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{gen.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{gen.modelUsed}</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{gen.promptSummary}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{gen.resultsSummary}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteAiGeneration(gen.id)}
                  className="text-[#F87171]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Save Candidate into Project Entities Modal */}
      <Modal
        open={entitySaveModalOpen}
        onClose={() => setEntitySaveModalOpen(false)}
        title={`Save "${entitySaveCandidate?.name || ''}" as Project Entity`}
        subtitle="Convert this naming candidate directly into a permanent entity in your universe."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleConfirmSaveAsEntity} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel label="Target Studio / Entity Category" required />
              <Select
                value={targetEntityCategory}
                onChange={(e) => setTargetEntityCategory(e.target.value as EntityCategory)}
              >
                <option value="character">Character Studio</option>
                <option value="location">World Builder (Location)</option>
                <option value="organization">Organization Studio</option>
                <option value="family">Noble Family / Dynasty</option>
                <option value="item">Item & Artifact Studio</option>
                <option value="ability">Power System / Ability</option>
                <option value="custom">Custom Entity</option>
              </Select>
            </div>
            <div>
              <FieldLabel label="Sub-Category / Role" required />
              <Input
                value={targetEntitySubCategory}
                onChange={(e) => setTargetEntitySubCategory(e.target.value)}
                placeholder="e.g., Protagonist, Kingdom, Magical Artifact"
                required
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Initial Entity Summary & Meaning" />
            <Textarea
              rows={4}
              value={targetEntitySummary}
              onChange={(e) => setTargetEntitySummary(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEntitySaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingEntity}>
              <BookmarkPlus className="w-4 h-4" />
              {savingEntity ? 'Saving Entity...' : 'Confirm & Save Entity'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Candidate Comparison Modal */}
      <Modal
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Side-by-Side Candidate Comparison"
        subtitle="Compare phonetics, in-universe interpretation, and cultural suitability."
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {comparedCandidates.map((c) => (
            <div
              key={c.id}
              className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2.5"
            >
              <div className="flex items-baseline justify-between">
                <h4 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                  {c.name}
                </h4>
                <span className="text-xs font-mono-tabular text-[var(--accent-primary)]">
                  /{c.pronunciation}/
                </span>
              </div>
              {c.titleOrVariation && (
                <p className="text-xs text-[var(--text-secondary)]">{c.titleOrVariation}</p>
              )}
              <div className="text-xs space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <p>
                  <span className="text-[var(--text-muted)]">Meaning:</span> {c.interpretation}
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">Linguistic Root:</span> {c.inspiration}
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">Suitability:</span> {c.suitability}
                </p>
              </div>
              <div className="pt-2 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openSaveEntityModal(c)}>
                  Save as Entity
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleFavorite(c)}>
                  Favorite
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Naming Rule Create/Edit Modal */}
      <Modal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        title={editingRule ? 'Edit Naming Convention' : 'Create Custom Naming Convention'}
        subtitle="Define phonetic patterns, patronymics, or structural rules for AI generation."
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel label="Rule Title" required />
              <Input
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder="e.g., High Aetherian Noble Patronymics"
                required
              />
            </div>
            <div>
              <FieldLabel label="Applies to Category" />
              <Select
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
              >
                <option value="All Categories">All Categories</option>
                {NAMING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel label="Civilization, Dynasty, or Cultural Group" />
            <Input
              value={ruleCulture}
              onChange={(e) => setRuleCulture(e.target.value)}
              placeholder="e.g., House Vaelor & Northern Synod Nobility"
            />
          </div>

          <div>
            <FieldLabel label="Phonetic Patterns" />
            <Input
              value={rulePhonetics}
              onChange={(e) => setRulePhonetics(e.target.value)}
              placeholder="e.g., Diphthongs 'ae', 'au', soft 'l', 'v', 's' consonants"
            />
          </div>

          <div>
            <FieldLabel label="Recurring Prefixes or Suffixes" />
            <Input
              value={ruleAffixes}
              onChange={(e) => setRuleAffixes(e.target.value)}
              placeholder="e.g., Male names end in -um/-ius; Surnames end in -or/-ryn"
            />
          </div>

          <div>
            <FieldLabel label="Name Structure" />
            <Input
              value={ruleStructure}
              onChange={(e) => setRuleStructure(e.target.value)}
              placeholder="e.g., [Given Name] [Dynastic Surname] of [Ancestral Hold]"
            />
          </div>

          <div>
            <FieldLabel label="Canonical Examples" />
            <Input
              value={ruleExamples}
              onChange={(e) => setRuleExamples(e.target.value)}
              placeholder="e.g., Caelum Vaelor, Lyraea Vesryn"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="ghost" onClick={() => setRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Scale className="w-4 h-4" />
              Save Naming Rule
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
