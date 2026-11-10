import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AiGenerationRecord,
  EntityCategory,
  EntityRelation,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  TimelineEvent,
  UserProfile,
  WorldEntity,
} from '../../types/nomen';

function cleanStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  return s.slice(0, maxLen);
}

function makeId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function sanitizeAttributes(attrs: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(attrs).slice(0, 48);
  for (const [k, v] of entries) {
    if (typeof v === 'string') {
      out[k.slice(0, 64)] = v.slice(0, 4000);
    }
  }
  return out;
}

// ============================================================================
// 1. PROFILE
// ============================================================================
export async function ensureUserProfile(
  uid: string,
  displayName: string,
  email: string
): Promise<UserProfile> {
  const path = `profiles/${uid}`;
  const ref = doc(db, 'profiles', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<UserProfile, 'id'>) };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const payload = {
    ownerId: uid,
    displayName: cleanStr(displayName, 120, 'Author'),
    email: cleanStr(email, 254, 'author@nomen.studio'),
    defaultGenre: 'Dark Fantasy',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
    return { id: uid, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// 2. PROJECTS
// ============================================================================
export function subscribeToProjects(
  uid: string,
  onData: (projects: Project[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'projects'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: Project[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Project, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'projects');
    }
  );
}

export async function createProject(input: {
  title: string;
  description: string;
  genre: string;
  worldSettings: string;
  language: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in to create a project.');
  const id = makeId('proj');
  const ref = doc(db, 'projects', id);
  const payload = {
    ownerId: uid,
    title: cleanStr(input.title, 160, 'Untitled Universe'),
    description: cleanStr(input.description, 4000, ''),
    genre: cleanStr(input.genre, 100, 'Dark Fantasy'),
    worldSettings: cleanStr(input.worldSettings, 6000, ''),
    language: cleanStr(input.language, 60, 'English'),
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${id}`);
  }
}

export async function updateProject(
  projectId: string,
  updates: {
    title: string;
    description: string;
    genre: string;
    worldSettings: string;
    language: string;
    status: 'active' | 'archived';
  }
): Promise<void> {
  const ref = doc(db, 'projects', projectId);
  try {
    await updateDoc(ref, {
      title: cleanStr(updates.title, 160, 'Untitled Universe'),
      description: cleanStr(updates.description, 4000, ''),
      genre: cleanStr(updates.genre, 100, 'Dark Fantasy'),
      worldSettings: cleanStr(updates.worldSettings, 6000, ''),
      language: cleanStr(updates.language, 60, 'English'),
      status: updates.status === 'archived' ? 'archived' : 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function deleteProjectWithCascade(projectId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const childCollections = [
    'entities',
    'entity_relations',
    'lore_entries',
    'timeline_events',
    'naming_rules',
    'ai_generations',
    'favorites',
  ];

  for (const colName of childCollections) {
    try {
      const q = query(
        collection(db, colName),
        where('ownerId', '==', uid),
        where('projectId', '==', projectId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, colName, d.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colName);
    }
  }

  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
  }
}

// ============================================================================
// 3. ENTITIES
// ============================================================================
export function subscribeToProjectEntities(
  uid: string,
  projectId: string,
  onData: (entities: WorldEntity[]) => void
) {
  const q = query(
    collection(db, 'entities'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: WorldEntity[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WorldEntity, 'id'>),
      }));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'entities')
  );
}

export async function createEntity(input: {
  projectId: string;
  category: EntityCategory;
  subCategory: string;
  name: string;
  subtitle: string;
  summary: string;
  parentId?: string;
  attributes: Record<string, string | undefined>;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('ent');
  const ref = doc(db, 'entities', id);
  const payload = {
    ownerId: uid,
    projectId: input.projectId,
    category: input.category,
    subCategory: cleanStr(input.subCategory, 100, ''),
    name: cleanStr(input.name, 200, 'Unnamed Entity'),
    subtitle: cleanStr(input.subtitle, 300, ''),
    summary: cleanStr(input.summary, 4000, ''),
    parentId: cleanStr(input.parentId, 128, ''),
    attributes: sanitizeAttributes(input.attributes),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `entities/${id}`);
  }
}

export async function updateEntity(
  entityId: string,
  updates: {
    category: EntityCategory;
    subCategory: string;
    name: string;
    subtitle: string;
    summary: string;
    parentId?: string;
    attributes: Record<string, string | undefined>;
  }
): Promise<void> {
  const ref = doc(db, 'entities', entityId);
  try {
    await updateDoc(ref, {
      category: updates.category,
      subCategory: cleanStr(updates.subCategory, 100, ''),
      name: cleanStr(updates.name, 200, 'Unnamed Entity'),
      subtitle: cleanStr(updates.subtitle, 300, ''),
      summary: cleanStr(updates.summary, 4000, ''),
      parentId: cleanStr(updates.parentId, 128, ''),
      attributes: sanitizeAttributes(updates.attributes),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `entities/${entityId}`);
  }
}

export async function deleteEntity(entityId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'entities', entityId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `entities/${entityId}`);
  }
}

// ============================================================================
// 4. ENTITY RELATIONS
// ============================================================================
export function subscribeToProjectRelations(
  uid: string,
  projectId: string,
  onData: (relations: EntityRelation[]) => void
) {
  const q = query(
    collection(db, 'entity_relations'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EntityRelation, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'entity_relations')
  );
}

export async function createEntityRelation(input: {
  projectId: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relationType: string;
  description: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('rel');
  const ref = doc(db, 'entity_relations', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      sourceEntityId: cleanStr(input.sourceEntityId, 128),
      sourceEntityName: cleanStr(input.sourceEntityName, 200, 'Source'),
      targetEntityId: cleanStr(input.targetEntityId, 128),
      targetEntityName: cleanStr(input.targetEntityName, 200, 'Target'),
      relationType: cleanStr(input.relationType, 120, 'Connected to'),
      description: cleanStr(input.description, 2000, ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `entity_relations/${id}`);
  }
}

export async function deleteEntityRelation(relationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'entity_relations', relationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `entity_relations/${relationId}`);
  }
}

// ============================================================================
// 5. LORE ENTRIES
// ============================================================================
export function subscribeToLoreEntries(
  uid: string,
  projectId: string,
  onData: (entries: LoreEntry[]) => void
) {
  const q = query(
    collection(db, 'lore_entries'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LoreEntry, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'lore_entries')
  );
}

export async function createLoreEntry(input: {
  projectId: string;
  title: string;
  category: string;
  era: string;
  summary: string;
  content: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('lore');
  const ref = doc(db, 'lore_entries', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      title: cleanStr(input.title, 240, 'Untitled Chronicle'),
      category: cleanStr(input.category, 80, 'World History'),
      era: cleanStr(input.era, 120, ''),
      summary: cleanStr(input.summary, 2000, ''),
      content: cleanStr(input.content, 20000, ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `lore_entries/${id}`);
  }
}

export async function updateLoreEntry(
  loreId: string,
  updates: {
    title: string;
    category: string;
    era: string;
    summary: string;
    content: string;
  }
): Promise<void> {
  const ref = doc(db, 'lore_entries', loreId);
  try {
    await updateDoc(ref, {
      title: cleanStr(updates.title, 240, 'Untitled Chronicle'),
      category: cleanStr(updates.category, 80, 'World History'),
      era: cleanStr(updates.era, 120, ''),
      summary: cleanStr(updates.summary, 2000, ''),
      content: cleanStr(updates.content, 20000, ''),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `lore_entries/${loreId}`);
  }
}

export async function deleteLoreEntry(loreId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'lore_entries', loreId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `lore_entries/${loreId}`);
  }
}

// ============================================================================
// 6. TIMELINE EVENTS
// ============================================================================
export function subscribeToTimelineEvents(
  uid: string,
  projectId: string,
  onData: (events: TimelineEvent[]) => void
) {
  const q = query(
    collection(db, 'timeline_events'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TimelineEvent, 'id'>),
      }));
      items.sort((a, b) => a.sortOrder - b.sortOrder);
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'timeline_events')
  );
}

export async function createTimelineEvent(input: {
  projectId: string;
  title: string;
  dateLabel: string;
  sortOrder: number;
  era: string;
  category: string;
  locationName: string;
  participants: string;
  description: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('evt');
  const ref = doc(db, 'timeline_events', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      title: cleanStr(input.title, 240, 'Untitled Event'),
      dateLabel: cleanStr(input.dateLabel, 120, 'Year 1'),
      sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
      era: cleanStr(input.era, 120, ''),
      category: cleanStr(input.category, 80, 'Historical Event'),
      locationName: cleanStr(input.locationName, 200, ''),
      participants: cleanStr(input.participants, 1000, ''),
      description: cleanStr(input.description, 6000, ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `timeline_events/${id}`);
  }
}

export async function updateTimelineEvent(
  eventId: string,
  updates: {
    title: string;
    dateLabel: string;
    sortOrder: number;
    era: string;
    category: string;
    locationName: string;
    participants: string;
    description: string;
  }
): Promise<void> {
  const ref = doc(db, 'timeline_events', eventId);
  try {
    await updateDoc(ref, {
      title: cleanStr(updates.title, 240, 'Untitled Event'),
      dateLabel: cleanStr(updates.dateLabel, 120, 'Year 1'),
      sortOrder: Number.isFinite(updates.sortOrder) ? updates.sortOrder : 0,
      era: cleanStr(updates.era, 120, ''),
      category: cleanStr(updates.category, 80, 'Historical Event'),
      locationName: cleanStr(updates.locationName, 200, ''),
      participants: cleanStr(updates.participants, 1000, ''),
      description: cleanStr(updates.description, 6000, ''),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `timeline_events/${eventId}`);
  }
}

export async function deleteTimelineEvent(eventId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'timeline_events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `timeline_events/${eventId}`);
  }
}

// ============================================================================
// 7. NAMING RULES
// ============================================================================
export function subscribeToNamingRules(
  uid: string,
  projectId: string,
  onData: (rules: NamingRule[]) => void
) {
  const q = query(
    collection(db, 'naming_rules'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NamingRule, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'naming_rules')
  );
}

export async function createNamingRule(input: {
  projectId: string;
  title: string;
  category: string;
  cultureOrGroup: string;
  phoneticPattern: string;
  prefixSuffixRule: string;
  structureRule: string;
  examples: string;
  isActive: boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('rule');
  const ref = doc(db, 'naming_rules', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      title: cleanStr(input.title, 160, 'Unnamed Convention'),
      category: cleanStr(input.category, 80, 'Character names'),
      cultureOrGroup: cleanStr(input.cultureOrGroup, 160, ''),
      phoneticPattern: cleanStr(input.phoneticPattern, 1000, ''),
      prefixSuffixRule: cleanStr(input.prefixSuffixRule, 1000, ''),
      structureRule: cleanStr(input.structureRule, 1000, ''),
      examples: cleanStr(input.examples, 1000, ''),
      isActive: Boolean(input.isActive),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `naming_rules/${id}`);
  }
}

export async function updateNamingRule(
  ruleId: string,
  updates: {
    title: string;
    category: string;
    cultureOrGroup: string;
    phoneticPattern: string;
    prefixSuffixRule: string;
    structureRule: string;
    examples: string;
    isActive: boolean;
  }
): Promise<void> {
  const ref = doc(db, 'naming_rules', ruleId);
  try {
    await updateDoc(ref, {
      title: cleanStr(updates.title, 160, 'Unnamed Convention'),
      category: cleanStr(updates.category, 80, 'Character names'),
      cultureOrGroup: cleanStr(updates.cultureOrGroup, 160, ''),
      phoneticPattern: cleanStr(updates.phoneticPattern, 1000, ''),
      prefixSuffixRule: cleanStr(updates.prefixSuffixRule, 1000, ''),
      structureRule: cleanStr(updates.structureRule, 1000, ''),
      examples: cleanStr(updates.examples, 1000, ''),
      isActive: Boolean(updates.isActive),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `naming_rules/${ruleId}`);
  }
}

export async function deleteNamingRule(ruleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'naming_rules', ruleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `naming_rules/${ruleId}`);
  }
}

// ============================================================================
// 8. AI GENERATIONS & 9. FAVORITES
// ============================================================================
export function subscribeToAiGenerations(
  uid: string,
  projectId: string,
  onData: (records: AiGenerationRecord[]) => void
) {
  const q = query(
    collection(db, 'ai_generations'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AiGenerationRecord, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'ai_generations')
  );
}

export async function recordAiGeneration(input: {
  projectId: string;
  generationType: string;
  category: string;
  promptSummary: string;
  resultsSummary: string;
  modelUsed: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('gen');
  const ref = doc(db, 'ai_generations', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      generationType: cleanStr(input.generationType, 60, 'Naming'),
      category: cleanStr(input.category, 80, 'Character names'),
      promptSummary: cleanStr(input.promptSummary, 2000, ''),
      resultsSummary: cleanStr(input.resultsSummary, 8000, ''),
      modelUsed: cleanStr(input.modelUsed, 80, 'gemini-3.8-flash'),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `ai_generations/${id}`);
  }
}

export async function deleteAiGeneration(generationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'ai_generations', generationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ai_generations/${generationId}`);
  }
}

export function subscribeToFavorites(
  uid: string,
  projectId: string,
  onData: (favorites: FavoriteItem[]) => void
) {
  const q = query(
    collection(db, 'favorites'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FavoriteItem, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'favorites')
  );
}

export async function createFavorite(input: {
  projectId: string;
  name: string;
  pronunciation: string;
  category: string;
  interpretation: string;
  inspiration: string;
  suitability: string;
  titleOrVariation: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('fav');
  const ref = doc(db, 'favorites', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: input.projectId,
      name: cleanStr(input.name, 200, 'Favorite'),
      pronunciation: cleanStr(input.pronunciation, 200, ''),
      category: cleanStr(input.category, 80, 'Character names'),
      interpretation: cleanStr(input.interpretation, 2000, ''),
      inspiration: cleanStr(input.inspiration, 2000, ''),
      suitability: cleanStr(input.suitability, 2000, ''),
      titleOrVariation: cleanStr(input.titleOrVariation, 500, ''),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `favorites/${id}`);
  }
}

export async function deleteFavorite(favoriteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'favorites', favoriteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `favorites/${favoriteId}`);
  }
}

// ============================================================================
// STARTER UNIVERSE SEEDER (Chronicles of Neran)
// ============================================================================
export async function seedStarterProject(): Promise<string> {
  const projectId = await createProject({
    title: 'Chronicles of Neran: The Ashen Crown',
    description:
      'A dark editorial high-fantasy epic set across the fractured continent of Neran, where ancient astral resonance powers noble dynasties and forbidden relics.',
    genre: 'Dark Editorial Fantasy',
    worldSettings:
      'Magic stems from Astral Resonance harvested from fallen star-veins. Society is stratified under Royal Dynasties and Scholarly Orders. Ancient ruins beneath Eldoria hold remnants of the First Eclipse.',
    language: 'English',
  });

  // 1. Nested Location Hierarchy: Continent Neran -> Kingdom of Aetheria -> Northern Province -> City of Eldoria
  const continentId = await createEntity({
    projectId,
    category: 'location',
    subCategory: 'Continent',
    name: 'Continent Neran',
    subtitle: 'The Fractured Cradle of Star-Veins',
    summary:
      'A vast landmass split by the Glass Sea and bordered by obsidian mountain ranges where star-iron fell in the First Age.',
    parentId: '',
    attributes: {
      geography: 'Obsidian cordilleras, inland glass seas, and mist-veiled northern steppes.',
      climate: 'Temperate coastal basins shifting to sub-arctic high plateaus in the north.',
      population: 'Approx. 42 million across seven sovereign realms',
      government: 'Divided among feudal monarchies, covenant citadels, and free merchant leagues',
      culture: 'Veneration of astronomical cycles, lineage chronicles, and star-forged oaths.',
      history: 'Shattered during the Sundering of the Third Astral Conjunction.',
      additionalNotes: 'Root continent of the campaign setting.',
    },
  });

  const kingdomId = await createEntity({
    projectId,
    category: 'location',
    subCategory: 'Kingdom',
    name: 'Kingdom of Aetheria',
    subtitle: 'Sovereign Realm of the Silver Astrolabe',
    summary:
      'The oldest surviving monarchy on Continent Neran,renowned for its star-spire observatories and rigid noble houses.',
    parentId: continentId,
    attributes: {
      geography: 'Highland valleys, deep fjords, and silver-veined crags.',
      climate: 'Cool, mist-laden autumns and long, aurora-lit winters.',
      population: '11.4 million citizens',
      government: 'Constitutional High Monarchy advised by the Synod of Houses',
      culture: 'High gothic scholarship, dueling codes, and strict patronymic naming.',
      history: 'Founded in Year 1 AE by King Valerius Vaelor after the Concord of Spirehold.',
      additionalNotes: 'Primary setting of Book I.',
    },
  });

  const provinceId = await createEntity({
    projectId,
    category: 'location',
    subCategory: 'Region',
    name: 'Northern Province',
    subtitle: 'The Frost-Watch Marches',
    summary:
      'A rugged frontier region of the Kingdom of Aetheria guarding the passes toward the Sunken Ruins.',
    parentId: kingdomId,
    attributes: {
      geography: 'Basalt cliffs, pine barrens, and thermal rift valleys.',
      climate: 'Biting northern gales moderated by geothermal vents.',
      population: '1.8 million',
      government: 'Warden-Marcher military governance under House Vaelor',
      culture: 'Stoic borderlanders, oath-keepers, and relic prospectors.',
      history: 'Fortified after the Second Eclipse War.',
      additionalNotes: 'Contains the fortress-city of Eldoria.',
    },
  });

  const cityId = await createEntity({
    projectId,
    category: 'location',
    subCategory: 'City',
    name: 'City of Eldoria',
    subtitle: 'City of Lanterns and Star-Glass',
    summary:
      'The terraced capital of the Northern Province, built around an ancient celestial crater.',
    parentId: provinceId,
    attributes: {
      geography: 'Concentric stone terraces descending into the Mirror Caldera.',
      climate: 'Crisp mountain air warmed by subterranean conduits.',
      population: '340,000',
      government: 'Lord High Archon and the Council of Twelve Guilds',
      culture: 'Nocturnal markets, bell-tower choirs, and alchemical glassblowing.',
      history: 'Raised atop pre-Sundering vaults.',
      additionalNotes: 'Seat of the Order of the Obsidian Quill.',
    },
  });

  // 2. Characters
  const char1Id = await createEntity({
    projectId,
    category: 'character',
    subCategory: 'Protagonist',
    name: 'Caelum Vaelor',
    subtitle: 'Exiled Heir of House Vaelor · Warden of the Pale Seal',
    summary:
      'A disgraced cartographer-knight who discovered that the royal succession chronicles of Aetheria were forged.',
    parentId: '',
    attributes: {
      firstName: 'Caelum',
      lastName: 'Vaelor',
      aliases: 'The Ashen Chronicler, Crow of Eldoria',
      gender: 'Male',
      age: '29',
      species: 'Human',
      race: 'High Aetherian',
      socialStatus: 'Attainted Noble / Former Heir Apparent',
      nobleTitle: 'Lord of the Sunken March (Revoked)',
      storyRole: 'Protagonist',
      personality: 'Analytical, quietly defiant, burdened by precision and old loyalties.',
      appearance: 'Tall, slate-gray eyes, silver-threaded scar across the left collarbone, dark wool cloak.',
      background: 'Trained at the Royal Astrolabe before uncovering the erased dynasty in the vaults of Eldoria.',
      origin: 'City of Eldoria',
      motivation: 'Restore historical truth before the Fifth Eclipse triggers the Crown Pact.',
      goals: 'Decode the Vesryn Codex and reclaim the Choir Blade.',
      fears: 'Becoming the tyrant his bloodline was prophesied to birth.',
      strengths: 'Tactical swordsmanship, ancient cipher decryption, High Resonance attunement.',
      weaknesses: 'Chronic insomnia caused by resonance burn; distrusts political allies.',
      abilities: 'Third-Chord Astral Resonance (Void Step, Echo Sight)',
      relationships: 'Estranged rival to Seraphina Thorne; sworn ward of House Vaelor.',
      characterDevelopment: 'Moves from solitary archivist to reluctant leader of the Northern Covenant.',
      additionalNotes: 'Carries a cracked astrolabe key.',
    },
  });

  const char2Id = await createEntity({
    projectId,
    category: 'character',
    subCategory: 'Deuteragonist',
    name: 'Seraphina Morcant',
    subtitle: 'Grand Inquisitor of the Obsidian Quill',
    summary:
      'A brilliant, conflicted scholar-magistrate tasked with hunting forbidden chronicles across Eldoria.',
    parentId: '',
    attributes: {
      firstName: 'Seraphina',
      lastName: 'Morcant',
      aliases: 'The Ink-Weaver',
      gender: 'Female',
      age: '31',
      species: 'Human',
      race: 'Lowland Nerani',
      socialStatus: 'High Magistrate',
      nobleTitle: 'Arch-Prelate of the Seal',
      storyRole: 'Deuteragonist / Foil',
      personality: 'Disciplined, razor-sharp, torn between institutional order and conscience.',
      appearance: 'Raven hair pinned with silver nibs, deep violet mantle, ink-stained fingertips.',
      background: 'Rose from orphan scribe to youngest Arch-Prelate in the Order of the Obsidian Quill.',
      origin: 'Kingdom of Aetheria',
      motivation: 'Prevent another Sundering war at any cost.',
      goals: 'Secure the Vesryn Relics before rogue factions weaponize them.',
      fears: 'That the Order she serves caused the First Eclipse.',
      strengths: 'Edict magic, political strategy, photographic memory.',
      weaknesses: 'Over-reliance on institutional doctrine.',
      abilities: 'Fourth-Chord Binding Script, Silence Ward',
      relationships: 'Complex hunter-ally dynamic with Caelum Vaelor.',
      characterDevelopment: 'Gradually questions the Synod mandates.',
      additionalNotes: '',
    },
  });

  // 3. Organization
  const orgId = await createEntity({
    projectId,
    category: 'organization',
    subCategory: 'Secret Society',
    name: 'Order of the Obsidian Quill',
    subtitle: 'Custodians of the Sealed Archives',
    summary:
      'An ancient monastic and intelligence order that regulates historical records and Astral Resonance treatises.',
    parentId: '',
    attributes: {
      founder: 'Arch-Chronicler Malakor the Blind',
      leader: 'Arch-Prelate Seraphina Morcant',
      headquarters: 'The Silent Vaults beneath the City of Eldoria',
      members: '300 sworn Prelates, Cipher-Monks, and Relic Retrievers',
      hierarchy: 'Novice Scribe -> Cipher-Brother -> Inquisitor -> Arch-Prelate',
      history: 'Established immediately after the Concord of Spirehold to quarantine dangerous pre-Sundering knowledge.',
      goals: 'Preserve stability by curating what history is remembered.',
      reputation: 'Feared by nobles and revered by scholars.',
      symbols: 'A split obsidian feather crossed with a silver key.',
      relations: 'Allied with the Crown of Aetheria; suspicious of frontier houses.',
    },
  });

  // 4. Item / Artifact
  const itemId = await createEntity({
    projectId,
    category: 'item',
    subCategory: 'Magical Artifact',
    name: 'The Vesryn Astrolabe',
    subtitle: 'Relic of the First Eclipse',
    summary:
      'A three-ringed celestial sphere of star-iron that projects true historical echoes when aligned with northern auroras.',
    parentId: '',
    attributes: {
      rarity: 'Mythic / Singular',
      origin: 'Forged in the pre-Sundering observatories of Neran',
      powers: 'Reveals unaltered memory imprints within a one-league radius; unlocks Star-Vault seals.',
      limitations: 'Requires the wielder to sacrifice a personal memory for each alignment.',
      currentOwner: 'Caelum Vaelor',
      history: 'Thought lost during the siege of Spirehold; recovered in the ruins beneath Eldoria.',
    },
  });

  // 5. Power System
  await createEntity({
    projectId,
    category: 'ability',
    subCategory: 'Magic System',
    name: 'Astral Resonance (The Five Chords)',
    subtitle: 'Harmonic Attunement to Fallen Star-Iron',
    summary:
      'Practitioners attune their nervous system to the acoustic frequencies of meteoric star-veins, ascending through Five Chords of mastery.',
    parentId: '',
    attributes: {
      systemName: 'The Five Chords of Astral Resonance',
      sourceOfPower: 'Subterranean star-iron veins and celestial alignments',
      rankStructure: '1st Chord (Listener) -> 2nd Chord (Cantor) -> 3rd Chord (Resonant) -> 4th Chord (Sovereign) -> 5th Chord (Eclipse)',
      costOrLimitation: 'Prolonged channeling causes Resonance Burn — sensory numbness and eventual crystallization of the vocal cords.',
      elementsOrBranches: 'Luminance (Light/Refraction), Gravitas (Weight/Force), Script (Binding Glyphs), Void (Spatial Step)',
      masteryRequirements: 'Harmonic breath discipline and a tuned star-glass focus.',
      notablePractitioners: 'Caelum Vaelor, Seraphina Morcant',
    },
  });

  // 6. Entity Relations
  await createEntityRelation({
    projectId,
    sourceEntityId: char1Id,
    sourceEntityName: 'Caelum Vaelor',
    targetEntityId: cityId,
    targetEntityName: 'City of Eldoria',
    relationType: 'Born and Exiled From',
    description: 'Caelum was raised in Eldoria before his title was stripped.',
  });

  await createEntityRelation({
    projectId,
    sourceEntityId: char2Id,
    sourceEntityName: 'Seraphina Morcant',
    targetEntityId: orgId,
    targetEntityName: 'Order of the Obsidian Quill',
    relationType: 'Leads as Arch-Prelate',
    description: 'Directs the Order from the Silent Vaults of Eldoria.',
  });

  await createEntityRelation({
    projectId,
    sourceEntityId: char1Id,
    sourceEntityName: 'Caelum Vaelor',
    targetEntityId: itemId,
    targetEntityName: 'The Vesryn Astrolabe',
    relationType: 'Current Wielder',
    description: 'Carries the Astrolabe in secret while evading Synod inquisitors.',
  });

  // 7. Lore Entry
  await createLoreEntry({
    projectId,
    title: 'The Concord of Spirehold & The Erased Dynasty',
    category: 'World History',
    era: 'First Astral Era (Year 1 AE)',
    summary: 'The founding treaty that united the Kingdom of Aetheria while secretly expunging the Seventh Royal House.',
    content:
      'When the sky cleared after the First Eclipse, the six surviving High Houses gathered at Spirehold. Official chronicles state that King Valerius Vaelor united the realm unopposed. However, fragments preserved in star-glass prove a seventh signatory—House Vesryn—refused to surrender their astral conduits and was systematically erased from every monument and genealogy.',
  });

  // 8. Timeline Events
  await createTimelineEvent({
    projectId,
    title: 'The First Eclipse & Fall of the Star-Veins',
    dateLabel: 'Year 0 AE',
    sortOrder: 0,
    era: 'Dawn of Resonance',
    category: 'Cataclysm',
    locationName: 'Continent Neran',
    participants: 'Ancient Civilizations of Neran',
    description: 'A three-day solar eclipse accompanied by a meteoric shower of star-iron that reshaped the geography of Neran.',
  });

  await createTimelineEvent({
    projectId,
    title: 'Signing of the Concord of Spirehold',
    dateLabel: 'Year 1 AE',
    sortOrder: 1,
    era: 'First Astral Era',
    category: 'Political Event',
    locationName: 'Kingdom of Aetheria',
    participants: 'King Valerius Vaelor, The Six High Houses',
    description: 'Formal founding of the Kingdom of Aetheria and creation of the Order of the Obsidian Quill.',
  });

  await createTimelineEvent({
    projectId,
    title: 'Discovery of the Vesryn Vault beneath Eldoria',
    dateLabel: 'Year 412 AE',
    sortOrder: 412,
    era: 'Late Monarchy',
    category: 'Discovery',
    locationName: 'City of Eldoria',
    participants: 'Caelum Vaelor, Seraphina Morcant',
    description: 'Caelum Vaelor unearths the Vesryn Astrolabe beneath the Mirror Caldera, igniting a succession crisis.',
  });

  // 9. Naming Rules
  await createNamingRule({
    projectId,
    title: 'High Aetherian Noble Patronymics',
    category: 'Character names',
    cultureOrGroup: 'Aetherian Nobility',
    phoneticPattern: 'Melodic Latinate vowels (ae, iu, ea) paired with liquid consonants (l, r, v, s).',
    prefixSuffixRule: 'Given names often end in -um, -ius, -ina, or -ael; Noble house surnames end in -or, -ant, or -ryn.',
    structureRule: '[Given Name] [House Surname], optionally followed by "of the [Order/Seat]".',
    examples: 'Caelum Vaelor, Valerius Vaelor, Lyraea Vesryn, Cassian Morcant',
    isActive: true,
  });

  return projectId;
}
