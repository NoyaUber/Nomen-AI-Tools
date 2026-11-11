export type EntityCategory =
  | 'character'
  | 'location'
  | 'organization'
  | 'family'
  | 'item'
  | 'ability'
  | 'species'
  | 'civilization'
  | 'custom';

export type NamingCategory =
  | 'Character names'
  | 'Surnames'
  | 'Noble family names'
  | 'Kingdom names'
  | 'Country names'
  | 'City names'
  | 'Continent names'
  | 'Organization names'
  | 'Guild names'
  | 'Weapon names'
  | 'Artifact names'
  | 'Ability names'
  | 'Magic names'
  | 'Titles and epithets'
  | 'Custom categories';

export const NAMING_CATEGORIES: NamingCategory[] = [
  'Character names',
  'Surnames',
  'Noble family names',
  'Kingdom names',
  'Country names',
  'City names',
  'Continent names',
  'Organization names',
  'Guild names',
  'Weapon names',
  'Artifact names',
  'Ability names',
  'Magic names',
  'Titles and epithets',
  'Custom categories',
];

export const LOCATION_CATEGORIES = [
  'Continent',
  'Country',
  'Kingdom',
  'Empire',
  'Region',
  'City',
  'Village',
  'Mountain',
  'Forest',
  'River',
  'Ocean',
  'Dungeon',
  'Ruins',
  'Custom Location',
] as const;

export const ORGANIZATION_TYPES = [
  'Noble Family',
  'Royal Dynasty',
  'Guild',
  'Military Organization',
  'Secret Society',
  'Religious Order',
  'Political Faction',
  'Custom Organization',
] as const;

export const ITEM_TYPES = [
  'Weapon',
  'Armor',
  'Magical Artifact',
  'Ancient Relic',
  'Book / Grimoire',
  'Potion / Elixir',
  'Accessory',
  'Custom Item',
] as const;

export const POWER_CATEGORIES = [
  'Magic System',
  'Element',
  'Ability',
  'Skill',
  'Combat Technique',
  'Cultivation System',
  'Power Rank',
  'Special Trait',
] as const;

export const LORE_CATEGORIES = [
  'World History',
  'Ancient Civilization',
  'Mythology',
  'Legend',
  'War & Conflict',
  'Political Event',
  'Cultural Tradition',
  'Historical Document',
  'Important Event',
] as const;

export interface UserProfile {
  id: string;
  ownerId: string;
  displayName: string;
  email: string;
  defaultGenre: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Project {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  genre: string;
  worldSettings: string;
  language: string;
  status: 'active' | 'archived';
  createdAt?: any;
  updatedAt?: any;
}

export interface CharacterAttributes {
  firstName?: string;
  lastName?: string;
  aliases?: string;
  gender?: string;
  age?: string;
  species?: string;
  race?: string;
  socialStatus?: string;
  nobleTitle?: string;
  storyRole?: string;
  personality?: string;
  appearance?: string;
  background?: string;
  origin?: string;
  motivation?: string;
  goals?: string;
  fears?: string;
  strengths?: string;
  weaknesses?: string;
  abilities?: string;
  relationships?: string;
  characterDevelopment?: string;
  additionalNotes?: string;
}

export interface LocationAttributes {
  geography?: string;
  climate?: string;
  population?: string;
  government?: string;
  culture?: string;
  history?: string;
  additionalNotes?: string;
}

export interface OrganizationAttributes {
  founder?: string;
  leader?: string;
  headquarters?: string;
  members?: string;
  hierarchy?: string;
  history?: string;
  goals?: string;
  reputation?: string;
  symbols?: string;
  relations?: string;
}

export interface ItemAttributes {
  rarity?: string;
  origin?: string;
  powers?: string;
  limitations?: string;
  currentOwner?: string;
  history?: string;
}

export interface PowerSystemAttributes {
  systemName?: string;
  sourceOfPower?: string;
  rankStructure?: string;
  costOrLimitation?: string;
  elementsOrBranches?: string;
  masteryRequirements?: string;
  notablePractitioners?: string;
}

export interface WorldEntity {
  id: string;
  ownerId: string;
  projectId: string;
  category: EntityCategory;
  subCategory: string;
  name: string;
  subtitle: string;
  summary: string;
  parentId: string;
  attributes: Record<string, string>;
  createdAt?: any;
  updatedAt?: any;
}

export interface EntityRelation {
  id: string;
  ownerId: string;
  projectId: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relationType: string;
  description: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface LoreEntry {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  category: string;
  era: string;
  summary: string;
  content: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TimelineEvent {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  dateLabel: string;
  sortOrder: number;
  era: string;
  category: string;
  locationName: string;
  participants: string;
  description: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface NamingRule {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  category: string;
  cultureOrGroup: string;
  phoneticPattern: string;
  prefixSuffixRule: string;
  structureRule: string;
  examples: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface NamingCandidate {
  id: string;
  name: string;
  pronunciation: string;
  interpretation: string;
  inspiration: string;
  suitability: string;
  titleOrVariation: string;
}

export interface AiGenerationRecord {
  id: string;
  ownerId: string;
  projectId: string;
  generationType: string;
  category: string;
  promptSummary: string;
  resultsSummary: string;
  modelUsed: string;
  createdAt?: any;
}

export interface FavoriteItem {
  id: string;
  ownerId: string;
  projectId: string;
  name: string;
  pronunciation: string;
  category: string;
  interpretation: string;
  inspiration: string;
  suitability: string;
  titleOrVariation: string;
  createdAt?: any;
}

export type ConsistencyFindingType =
  | 'confirmed_conflict'
  | 'potential_inconsistency'
  | 'missing_information'
  | 'creative_possibility';

export type ConsistencySeverity =
  | 'critical'
  | 'warning'
  | 'information'
  | 'Critical'
  | 'Warning'
  | 'Information';

export interface ConsistencyFinding {
  id: string;
  type: ConsistencyFindingType;
  severity?: ConsistencySeverity;
  title: string;
  involvedEntities: string[];
  explanation: string;
  evidence?: string;
  recommendation: string;
}

export type AssistantContextScope =
  | 'current_entity'
  | 'selected_entities'
  | 'entire_project'
  | 'none';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contextScope: AssistantContextScope;
  timestamp: string;
}

// ============================================================================
// PHASE 7–10 TYPES
// ============================================================================

export type VersionTargetType = 'entity' | 'lore' | 'timeline';

export type VersionedEntityType =
  | EntityCategory
  | VersionTargetType
  | 'timeline_event'
  | 'lore_entry';

export interface EntityVersion {
  id: string;
  ownerId: string;
  projectId: string;
  targetId: string;
  entityId: string;
  targetType: VersionTargetType;
  entityType: VersionedEntityType;
  targetName: string;
  entityName: string;
  versionNumber: number;
  changeSummary: string;
  snapshot: Record<string, string>;
  authorName: string;
  createdByName: string;
  createdAt?: any;
}

export interface ProjectAiSetting {
  id: string;
  ownerId: string;
  projectId: string;
  instructions: string;
  customInstructions: string;
  isEnabled: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface TrashItem {
  id: string;
  ownerId: string;
  projectId: string;
  originalId: string;
  itemType: VersionTargetType;
  entityType: string;
  category: string;
  subCategory: string;
  name: string;
  entityName: string;
  summary: string;
  snapshot: Record<string, string>;
  deletedAt?: any;
}

export interface ActivityLog {
  id: string;
  ownerId: string;
  projectId: string;
  actionType: string;
  targetType: string;
  entityType: string;
  targetName: string;
  entityName: string;
  details: string;
  actorName: string;
  createdAt?: any;
}

export type AutosaveStatus =
  | 'idle'
  | 'unsaved'
  | 'saving'
  | 'saved'
  | 'error'
  | 'failed';

// ============================================================================
// PHASE 11 TYPES — VISUAL ASSET STUDIO & IMAGE MANAGEMENT
// ============================================================================

export type AssetCategory =
  | 'character_portrait'
  | 'character_illustration'
  | 'location_illustration'
  | 'kingdom_civilization'
  | 'kingdom_illustration'
  | 'organization_emblem'
  | 'weapon_artifact'
  | 'armor_equipment'
  | 'magic_ability'
  | 'power_system_illustration'
  | 'power_system'
  | 'world_map'
  | 'novel_cover'
  | 'general_reference'
  | 'visual_reference';

export const ASSET_CATEGORIES: {
  id: AssetCategory;
  label: string;
  description: string;
  targetGroup: 'character' | 'location' | 'organization' | 'item' | 'ability' | 'map' | 'cover' | 'general';
}[] = [
  {
    id: 'character_portrait',
    label: 'Character Portraits',
    description: 'Primary headshots, busts, and identity portraits for characters.',
    targetGroup: 'character',
  },
  {
    id: 'character_illustration',
    label: 'Character Illustrations',
    description: 'Full-body designs, attire, expressions, and scene illustrations.',
    targetGroup: 'character',
  },
  {
    id: 'location_illustration',
    label: 'Location Illustrations',
    description: 'Cities, castles, villages, landscapes, and architectural vistas.',
    targetGroup: 'location',
  },
  {
    id: 'kingdom_civilization',
    label: 'Kingdom & Civilization Illustrations',
    description: 'Realms, empires, cultural panoramas, and sovereign territories.',
    targetGroup: 'location',
  },
  {
    id: 'organization_emblem',
    label: 'Organization Emblems',
    description: 'Noble house crests, guild sigils, flags, and religious symbols.',
    targetGroup: 'organization',
  },
  {
    id: 'weapon_artifact',
    label: 'Weapons & Artifacts',
    description: 'Swords, mythic relics, grimoires, potions, and magical instruments.',
    targetGroup: 'item',
  },
  {
    id: 'armor_equipment',
    label: 'Armor & Equipment',
    description: 'Regalia, plate armor, vestments, and tactical gear references.',
    targetGroup: 'item',
  },
  {
    id: 'magic_ability',
    label: 'Magic & Abilities',
    description: 'Spell manifestations, elemental techniques, and combat arts.',
    targetGroup: 'ability',
  },
  {
    id: 'power_system_illustration',
    label: 'Power System Illustrations',
    description: 'Chords, rank diagrams, elemental matrices, and transformations.',
    targetGroup: 'ability',
  },
  {
    id: 'world_map',
    label: 'World Maps',
    description: 'World, continent, kingdom, and regional cartographic surveys.',
    targetGroup: 'map',
  },
  {
    id: 'novel_cover',
    label: 'Novel Covers',
    description: '2:3 portrait book covers and frontispiece artwork.',
    targetGroup: 'cover',
  },
  {
    id: 'general_reference',
    label: 'General Visual References',
    description: 'Moodboards, historical textures, typography, and miscellaneous lore art.',
    targetGroup: 'general',
  },
];

export const CHARACTER_VISUAL_ROLES = [
  'Main Portrait',
  'Full-Body Illustration',
  'Appearance Reference',
  'Clothing Reference',
  'Weapon Reference',
  'Expression Reference',
  'Additional Gallery Image',
] as const;

export const LOCATION_VISUAL_ROLES = [
  'Main Location Image',
  'Environmental Reference',
  'Architectural Reference',
  'Landscape Reference',
  'Additional Gallery Image',
] as const;

export const ORGANIZATION_EMBLEM_ROLES = [
  'Noble Family Crest',
  'Kingdom Flag',
  'Organization Logo',
  'Guild Emblem',
  'Military Insignia',
  'Religious Symbol',
  'Faction Symbol',
] as const;

export const ITEM_VISUAL_ROLES = [
  'Primary Artifact Image',
  'Weapon',
  'Sword',
  'Armor',
  'Magical Artifact',
  'Legendary Relic',
  'Book / Grimoire',
  'Potion / Elixir',
  'Equipment Reference',
] as const;

export const POWER_VISUAL_ROLES = [
  'Element',
  'Magic Type',
  'Ability',
  'Skill',
  'Combat Technique',
  'Special Transformation',
  'Power Rank',
  'Power Rank Diagram',
] as const;

export const WORLD_MAP_ROLES = [
  'World Map',
  'Continent Map',
  'Kingdom Map',
  'Regional Map',
  'City / Fortress Plan',
] as const;

export interface MapMarkerPin {
  id: string;
  locationEntityId: string;
  locationId?: string;
  locationName: string;
  locationCategory?: string;
  xPercent: number;
  yPercent: number;
  note?: string;
}

export interface VisualAsset {
  id: string;
  ownerId: string;
  projectId: string;
  entityId: string;
  entityType: string;
  entityName: string;
  fileName: string;
  assetName?: string;
  assetCategory: AssetCategory;
  subRole: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  description: string;
  metadataJson?: string;
  isPrimary: boolean;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}



