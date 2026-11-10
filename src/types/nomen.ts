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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
  updatedAt?: unknown;
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
  createdAt?: unknown;
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
  createdAt?: unknown;
}

export type ConsistencyFindingType =
  | 'confirmed_conflict'
  | 'potential_inconsistency'
  | 'missing_information'
  | 'creative_possibility';

export interface ConsistencyFinding {
  id: string;
  type: ConsistencyFindingType;
  title: string;
  involvedEntities: string[];
  explanation: string;
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
