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
  ActivityLog,
  AiGenerationRecord,
  AssetCategory,
  EntityCategory,
  EntityRelation,
  EntityVersion,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  TrashItem,
  UserProfile,
  VersionTargetType,
  VisualAsset,
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
  const entries = Object.entries(attrs || {}).slice(0, 48);
  for (const [k, v] of entries) {
    if (typeof v === 'string') {
      out[k.slice(0, 64)] = v.slice(0, 4000);
    }
  }
  return out;
}

function currentActorName(): string {
  return cleanStr(
    auth.currentUser?.displayName || auth.currentUser?.email || 'Author',
    120,
    'Author'
  );
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
    await recordActivityLog({
      projectId: id,
      actionType: 'Project created',
      targetType: 'project',
      targetName: payload.title,
      details: `Initialized universe in genre "${payload.genre}" (${payload.language})`,
    });
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
    await recordActivityLog({
      projectId,
      actionType: 'Project updated',
      targetType: 'project',
      targetName: updates.title,
      details: `Updated project settings (${updates.status})`,
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
    'entity_versions',
    'project_ai_settings',
    'trash_items',
    'activity_logs',
    'visual_assets',
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
// 3. ENTITIES (With Automatic Version Snapshots & Soft-Delete Trash Support)
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
  id?: string;
  projectId: string;
  category: EntityCategory;
  subCategory: string;
  name: string;
  subtitle: string;
  summary: string;
  parentId?: string;
  attributes: Record<string, string | undefined>;
  skipActivityLog?: boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = input.id && /^[a-zA-Z0-9_-]+$/.test(input.id) ? input.id : makeId('ent');
  const ref = doc(db, 'entities', id);
  const sanitizedAttrs = sanitizeAttributes(input.attributes);
  const payload = {
    ownerId: uid,
    projectId: input.projectId,
    category: input.category,
    subCategory: cleanStr(input.subCategory, 100, ''),
    name: cleanStr(input.name, 200, 'Unnamed Entity'),
    subtitle: cleanStr(input.subtitle, 300, ''),
    summary: cleanStr(input.summary, 4000, ''),
    parentId: cleanStr(input.parentId, 128, ''),
    attributes: sanitizedAttrs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload);
    await createEntityVersionSnapshot({
      projectId: input.projectId,
      targetId: id,
      targetType: 'entity',
      targetName: payload.name,
      changeSummary: `Initial creation (${payload.subCategory || payload.category})`,
      snapshot: {
        category: payload.category,
        subCategory: payload.subCategory,
        name: payload.name,
        subtitle: payload.subtitle,
        summary: payload.summary,
        parentId: payload.parentId,
        ...sanitizedAttrs,
      },
    });
    if (!input.skipActivityLog) {
      await recordActivityLog({
        projectId: input.projectId,
        actionType: 'Entity created',
        targetType: payload.category,
        targetName: payload.name,
        details: `Created ${payload.subCategory || payload.category} "${payload.name}"`,
      });
    }
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
    changeSummary?: string;
    isAutosave?: boolean;
  }
): Promise<void> {
  const ref = doc(db, 'entities', entityId);
  const sanitizedAttrs = sanitizeAttributes(updates.attributes);
  try {
    const existingSnap = await getDoc(ref);
    const existingData = existingSnap.exists()
      ? (existingSnap.data() as WorldEntity)
      : null;

    await updateDoc(ref, {
      category: updates.category,
      subCategory: cleanStr(updates.subCategory, 100, ''),
      name: cleanStr(updates.name, 200, 'Unnamed Entity'),
      subtitle: cleanStr(updates.subtitle, 300, ''),
      summary: cleanStr(updates.summary, 4000, ''),
      parentId: cleanStr(updates.parentId, 128, ''),
      attributes: sanitizedAttrs,
      updatedAt: serverTimestamp(),
    });

    if (existingData?.projectId) {
      await createEntityVersionSnapshot({
        projectId: existingData.projectId,
        targetId: entityId,
        targetType: 'entity',
        targetName: cleanStr(updates.name, 200, 'Unnamed Entity'),
        changeSummary:
          updates.changeSummary ||
          (updates.isAutosave ? 'Autosaved dossier changes' : 'Updated entity dossier'),
        snapshot: {
          category: updates.category,
          subCategory: cleanStr(updates.subCategory, 100, ''),
          name: cleanStr(updates.name, 200, 'Unnamed Entity'),
          subtitle: cleanStr(updates.subtitle, 300, ''),
          summary: cleanStr(updates.summary, 4000, ''),
          parentId: cleanStr(updates.parentId, 128, ''),
          ...sanitizedAttrs,
        },
      });

      if (!updates.isAutosave) {
        await recordActivityLog({
          projectId: existingData.projectId,
          actionType: 'Entity updated',
          targetType: updates.category,
          targetName: cleanStr(updates.name, 200, 'Unnamed Entity'),
          details: updates.changeSummary || `Updated ${updates.subCategory || updates.category}`,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `entities/${entityId}`);
  }
}

export async function deleteEntity(
  entityId: string,
  options?: { permanent?: boolean }
): Promise<void> {
  const ref = doc(db, 'entities', entityId);
  try {
    if (!options?.permanent) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as Omit<WorldEntity, 'id'>;
        await moveRecordToTrash({
          projectId: data.projectId,
          originalId: entityId,
          itemType: 'entity',
          category: data.category,
          subCategory: data.subCategory,
          name: data.name,
          summary: data.summary,
          snapshot: {
            category: data.category,
            subCategory: data.subCategory,
            name: data.name,
            subtitle: data.subtitle,
            summary: data.summary,
            parentId: data.parentId || '',
            ...(data.attributes || {}),
          },
        });
      }
    }
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `entities/${entityId}`);
  }
}

// ============================================================================
// 4. ENTITY RELATIONS (With Edit & Duplicate Guard)
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
  if (input.sourceEntityId === input.targetEntityId) {
    throw new Error('An entity cannot be linked to itself.');
  }
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
    await recordActivityLog({
      projectId: input.projectId,
      actionType: 'Relationship created',
      targetType: 'relation',
      targetName: `${input.sourceEntityName} → ${input.targetEntityName}`,
      details: `Linked as "${input.relationType}"`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `entity_relations/${id}`);
  }
}

export async function updateEntityRelation(
  relationId: string,
  updates: {
    sourceEntityId: string;
    sourceEntityName: string;
    targetEntityId: string;
    targetEntityName: string;
    relationType: string;
    description: string;
    projectId?: string;
  }
): Promise<void> {
  const ref = doc(db, 'entity_relations', relationId);
  try {
    await updateDoc(ref, {
      sourceEntityId: cleanStr(updates.sourceEntityId, 128),
      sourceEntityName: cleanStr(updates.sourceEntityName, 200, 'Source'),
      targetEntityId: cleanStr(updates.targetEntityId, 128),
      targetEntityName: cleanStr(updates.targetEntityName, 200, 'Target'),
      relationType: cleanStr(updates.relationType, 120, 'Connected to'),
      description: cleanStr(updates.description, 2000, ''),
      updatedAt: serverTimestamp(),
    });
    if (updates.projectId) {
      await recordActivityLog({
        projectId: updates.projectId,
        actionType: 'Relationship updated',
        targetType: 'relation',
        targetName: `${updates.sourceEntityName} → ${updates.targetEntityName}`,
        details: `Updated relation to "${updates.relationType}"`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `entity_relations/${relationId}`);
  }
}

export async function deleteEntityRelation(relationId: string): Promise<void> {
  const ref = doc(db, 'entity_relations', relationId);
  try {
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as Omit<EntityRelation, 'id'>) : null;
    await deleteDoc(ref);
    if (data) {
      await recordActivityLog({
        projectId: data.projectId,
        actionType: 'Relationship removed',
        targetType: 'relation',
        targetName: `${data.sourceEntityName} → ${data.targetEntityName}`,
        details: `Removed relation "${data.relationType}"`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `entity_relations/${relationId}`);
  }
}

// ============================================================================
// 5. LORE ENTRIES (With Version Snapshots & Soft-Delete Trash Support)
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
  id?: string;
  projectId: string;
  title: string;
  category: string;
  era: string;
  summary: string;
  content: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = input.id && /^[a-zA-Z0-9_-]+$/.test(input.id) ? input.id : makeId('lore');
  const ref = doc(db, 'lore_entries', id);
  const payload = {
    ownerId: uid,
    projectId: input.projectId,
    title: cleanStr(input.title, 240, 'Untitled Chronicle'),
    category: cleanStr(input.category, 80, 'World History'),
    era: cleanStr(input.era, 120, ''),
    summary: cleanStr(input.summary, 2000, ''),
    content: cleanStr(input.content, 20000, ''),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload);
    await createEntityVersionSnapshot({
      projectId: input.projectId,
      targetId: id,
      targetType: 'lore',
      targetName: payload.title,
      changeSummary: `Created Lore Chronicle (${payload.category})`,
      snapshot: {
        title: payload.title,
        category: payload.category,
        era: payload.era,
        summary: payload.summary,
        content: payload.content.slice(0, 3900),
      },
    });
    await recordActivityLog({
      projectId: input.projectId,
      actionType: 'Entity created',
      targetType: 'lore',
      targetName: payload.title,
      details: `Recorded lore chronicle in "${payload.category}"`,
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
    changeSummary?: string;
    isAutosave?: boolean;
  }
): Promise<void> {
  const ref = doc(db, 'lore_entries', loreId);
  try {
    const existingSnap = await getDoc(ref);
    const existingData = existingSnap.exists()
      ? (existingSnap.data() as LoreEntry)
      : null;

    await updateDoc(ref, {
      title: cleanStr(updates.title, 240, 'Untitled Chronicle'),
      category: cleanStr(updates.category, 80, 'World History'),
      era: cleanStr(updates.era, 120, ''),
      summary: cleanStr(updates.summary, 2000, ''),
      content: cleanStr(updates.content, 20000, ''),
      updatedAt: serverTimestamp(),
    });

    if (existingData?.projectId) {
      await createEntityVersionSnapshot({
        projectId: existingData.projectId,
        targetId: loreId,
        targetType: 'lore',
        targetName: cleanStr(updates.title, 240, 'Untitled Chronicle'),
        changeSummary:
          updates.changeSummary ||
          (updates.isAutosave ? 'Autosaved lore chronicle' : 'Updated lore chronicle'),
        snapshot: {
          title: cleanStr(updates.title, 240, 'Untitled Chronicle'),
          category: cleanStr(updates.category, 80, 'World History'),
          era: cleanStr(updates.era, 120, ''),
          summary: cleanStr(updates.summary, 2000, ''),
          content: cleanStr(updates.content, 3900, ''),
        },
      });
      if (!updates.isAutosave) {
        await recordActivityLog({
          projectId: existingData.projectId,
          actionType: 'Entity updated',
          targetType: 'lore',
          targetName: cleanStr(updates.title, 240, 'Untitled Chronicle'),
          details: `Updated lore chronicle (${updates.category})`,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `lore_entries/${loreId}`);
  }
}

export async function deleteLoreEntry(
  loreId: string,
  options?: { permanent?: boolean }
): Promise<void> {
  const ref = doc(db, 'lore_entries', loreId);
  try {
    if (!options?.permanent) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as Omit<LoreEntry, 'id'>;
        await moveRecordToTrash({
          projectId: data.projectId,
          originalId: loreId,
          itemType: 'lore',
          category: data.category,
          subCategory: data.era || 'Lore Chronicle',
          name: data.title,
          summary: data.summary || data.content.slice(0, 300),
          snapshot: {
            title: data.title,
            category: data.category,
            era: data.era,
            summary: data.summary,
            content: data.content.slice(0, 3900),
          },
        });
      }
    }
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `lore_entries/${loreId}`);
  }
}

// ============================================================================
// 6. TIMELINE EVENTS (With Version Snapshots & Soft-Delete Trash Support)
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
  id?: string;
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
  const id = input.id && /^[a-zA-Z0-9_-]+$/.test(input.id) ? input.id : makeId('evt');
  const ref = doc(db, 'timeline_events', id);
  const payload = {
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
  };
  try {
    await setDoc(ref, payload);
    await createEntityVersionSnapshot({
      projectId: input.projectId,
      targetId: id,
      targetType: 'timeline',
      targetName: payload.title,
      changeSummary: `Created timeline event (${payload.dateLabel})`,
      snapshot: {
        title: payload.title,
        dateLabel: payload.dateLabel,
        sortOrder: String(payload.sortOrder),
        era: payload.era,
        category: payload.category,
        locationName: payload.locationName,
        participants: payload.participants,
        description: payload.description.slice(0, 3900),
      },
    });
    await recordActivityLog({
      projectId: input.projectId,
      actionType: 'Entity created',
      targetType: 'timeline',
      targetName: payload.title,
      details: `Added timeline event at ${payload.dateLabel}`,
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
    changeSummary?: string;
  }
): Promise<void> {
  const ref = doc(db, 'timeline_events', eventId);
  try {
    const existingSnap = await getDoc(ref);
    const existingData = existingSnap.exists()
      ? (existingSnap.data() as TimelineEvent)
      : null;

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

    if (existingData?.projectId) {
      await createEntityVersionSnapshot({
        projectId: existingData.projectId,
        targetId: eventId,
        targetType: 'timeline',
        targetName: cleanStr(updates.title, 240, 'Untitled Event'),
        changeSummary:
          updates.changeSummary || `Updated timeline event (${updates.dateLabel})`,
        snapshot: {
          title: cleanStr(updates.title, 240, 'Untitled Event'),
          dateLabel: cleanStr(updates.dateLabel, 120, 'Year 1'),
          sortOrder: String(
            Number.isFinite(updates.sortOrder) ? updates.sortOrder : 0
          ),
          era: cleanStr(updates.era, 120, ''),
          category: cleanStr(updates.category, 80, 'Historical Event'),
          locationName: cleanStr(updates.locationName, 200, ''),
          participants: cleanStr(updates.participants, 1000, ''),
          description: cleanStr(updates.description, 3900, ''),
        },
      });
      await recordActivityLog({
        projectId: existingData.projectId,
        actionType: 'Entity updated',
        targetType: 'timeline',
        targetName: cleanStr(updates.title, 240, 'Untitled Event'),
        details: `Updated timeline event (${updates.dateLabel})`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `timeline_events/${eventId}`);
  }
}

export async function deleteTimelineEvent(
  eventId: string,
  options?: { permanent?: boolean }
): Promise<void> {
  const ref = doc(db, 'timeline_events', eventId);
  try {
    if (!options?.permanent) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as Omit<TimelineEvent, 'id'>;
        await moveRecordToTrash({
          projectId: data.projectId,
          originalId: eventId,
          itemType: 'timeline',
          category: data.category,
          subCategory: data.dateLabel,
          name: data.title,
          summary: data.description.slice(0, 400),
          snapshot: {
            title: data.title,
            dateLabel: data.dateLabel,
            sortOrder: String(data.sortOrder),
            era: data.era,
            category: data.category,
            locationName: data.locationName,
            participants: data.participants,
            description: data.description.slice(0, 3900),
          },
        });
      }
    }
    await deleteDoc(ref);
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
  cultureOrGroup?: string;
  phoneticPattern?: string;
  prefixSuffixRule?: string;
  structureRule?: string;
  morphologyNotes?: string;
  examples?: string;
  isActive?: boolean;
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
      prefixSuffixRule: cleanStr(
        input.prefixSuffixRule || input.morphologyNotes,
        1000,
        ''
      ),
      structureRule: cleanStr(input.structureRule, 1000, ''),
      examples: cleanStr(input.examples, 1000, ''),
      isActive: Boolean(input.isActive ?? true),
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
      modelUsed: cleanStr(input.modelUsed, 80, 'gemini-3-flash-preview'),
      createdAt: serverTimestamp(),
    });
    await recordActivityLog({
      projectId: input.projectId,
      actionType: 'AI generation saved',
      targetType: input.generationType,
      targetName: input.category,
      details: input.promptSummary.slice(0, 200),
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
// 10. ENTITY VERSIONS (Phase 7.1 — Version History & Restore)
// ============================================================================
const lastSnapshotTimeByTarget = new Map<string, number>();

export function subscribeToProjectVersions(
  uid: string,
  projectId: string,
  onData: (versions: EntityVersion[]) => void
) {
  const q = query(
    collection(db, 'entity_versions'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: EntityVersion[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        const targetId = raw.targetId || raw.entityId || '';
        const targetType = (raw.targetType || 'entity') as VersionTargetType;
        const targetName = raw.targetName || raw.entityName || 'Untitled Record';
        const authorName = raw.authorName || raw.createdByName || 'Author';
        return {
          id: d.id,
          ownerId: raw.ownerId || uid,
          projectId: raw.projectId || projectId,
          targetId,
          entityId: targetId,
          targetType,
          entityType: (raw.entityType || targetType) as EntityVersion['entityType'],
          targetName,
          entityName: targetName,
          versionNumber: Number(raw.versionNumber) || 1,
          changeSummary: raw.changeSummary || '',
          snapshot: raw.snapshot || {},
          authorName,
          createdByName: authorName,
          createdAt: raw.createdAt?.toDate ? raw.createdAt.toDate().toISOString() : raw.createdAt,
        };
      });
      list.sort((a, b) => b.versionNumber - a.versionNumber);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'entity_versions')
  );
}

export async function createEntityVersionSnapshot(input: {
  projectId: string;
  targetId?: string;
  entityId?: string;
  targetType?: VersionTargetType;
  entityType?: string;
  targetName?: string;
  entityName?: string;
  changeSummary: string;
  snapshot: Record<string, string | undefined>;
  force?: boolean;
}): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const resolvedTargetId = input.targetId || input.entityId || '';
  if (!resolvedTargetId) return null;

  const resolvedTargetType: VersionTargetType =
    input.targetType ||
    (input.entityType === 'lore' || input.entityType === 'lore_entry'
      ? 'lore'
      : input.entityType === 'timeline' || input.entityType === 'timeline_event'
      ? 'timeline'
      : 'entity');
  const resolvedTargetName =
    input.targetName || input.entityName || 'Untitled Record';

  // Debounce rapid successive snapshots on the same target (minimum 4 seconds apart unless forced)
  const now = Date.now();
  const prevTime = lastSnapshotTimeByTarget.get(resolvedTargetId) || 0;
  if (!input.force && now - prevTime < 4000) {
    return null;
  }
  lastSnapshotTimeByTarget.set(resolvedTargetId, now);

  const id = makeId('ver');
  const ref = doc(db, 'entity_versions', id);
  const versionNumber = Math.floor(now / 1000);

  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: cleanStr(input.projectId, 128),
      targetId: cleanStr(resolvedTargetId, 128),
      targetType: resolvedTargetType,
      targetName: cleanStr(resolvedTargetName, 240, 'Untitled Record'),
      versionNumber,
      changeSummary: cleanStr(input.changeSummary, 500, 'Snapshot recorded'),
      snapshot: sanitizeAttributes(input.snapshot),
      authorName: currentActorName(),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `entity_versions/${id}`);
  }
}

export async function restoreEntityVersion(version: EntityVersion): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const snap = version.snapshot || {};
  const targetId = version.targetId || version.entityId;
  const targetName = version.targetName || version.entityName;

  if (version.targetType === 'entity') {
    const {
      category = 'character',
      subCategory = 'Character',
      name = targetName,
      subtitle = '',
      summary = '',
      parentId = '',
      ...restAttrs
    } = snap;

    const q = query(
      collection(db, 'entities'),
      where('ownerId', '==', uid),
      where('projectId', '==', version.projectId)
    );
    const listSnap = await getDocs(q);
    const exists = listSnap.docs.some((d) => d.id === targetId);
    if (exists) {
      await updateEntity(targetId, {
        category: category as EntityCategory,
        subCategory,
        name,
        subtitle,
        summary,
        parentId,
        attributes: restAttrs,
        changeSummary: `Restored to version #${version.versionNumber}`,
      });
    } else {
      await createEntity({
        id: targetId,
        projectId: version.projectId,
        category: category as EntityCategory,
        subCategory,
        name,
        subtitle,
        summary,
        parentId,
        attributes: restAttrs,
      });
    }
  } else if (version.targetType === 'lore') {
    const q = query(
      collection(db, 'lore_entries'),
      where('ownerId', '==', uid),
      where('projectId', '==', version.projectId)
    );
    const listSnap = await getDocs(q);
    const exists = listSnap.docs.some((d) => d.id === targetId);
    if (exists) {
      await updateLoreEntry(targetId, {
        title: snap.title || targetName,
        category: snap.category || 'World History',
        era: snap.era || '',
        summary: snap.summary || '',
        content: snap.content || '',
        changeSummary: `Restored to version #${version.versionNumber}`,
      });
    } else {
      await createLoreEntry({
        id: targetId,
        projectId: version.projectId,
        title: snap.title || targetName,
        category: snap.category || 'World History',
        era: snap.era || '',
        summary: snap.summary || '',
        content: snap.content || '',
      });
    }
  } else if (version.targetType === 'timeline') {
    const q = query(
      collection(db, 'timeline_events'),
      where('ownerId', '==', uid),
      where('projectId', '==', version.projectId)
    );
    const listSnap = await getDocs(q);
    const exists = listSnap.docs.some((d) => d.id === targetId);
    if (exists) {
      await updateTimelineEvent(targetId, {
        title: snap.title || targetName,
        dateLabel: snap.dateLabel || 'Year 1',
        sortOrder: Number(snap.sortOrder) || 0,
        era: snap.era || '',
        category: snap.category || 'Historical Event',
        locationName: snap.locationName || '',
        participants: snap.participants || '',
        description: snap.description || '',
        changeSummary: `Restored to version #${version.versionNumber}`,
      });
    } else {
      await createTimelineEvent({
        id: targetId,
        projectId: version.projectId,
        title: snap.title || targetName,
        dateLabel: snap.dateLabel || 'Year 1',
        sortOrder: Number(snap.sortOrder) || 0,
        era: snap.era || '',
        category: snap.category || 'Historical Event',
        locationName: snap.locationName || '',
        participants: snap.participants || '',
        description: snap.description || '',
      });
    }
  }

  await recordActivityLog({
    projectId: version.projectId,
    actionType: 'Version restored',
    targetType: version.targetType,
    targetName,
    details: `Restored "${targetName}" to snapshot #${version.versionNumber}`,
  });
}

// ============================================================================
// 11. PROJECT AI SETTINGS / CUSTOM AI INSTRUCTIONS (Phase 8.4)
// ============================================================================
export function subscribeToProjectAiSettings(
  uid: string,
  projectId: string,
  onData: (setting: ProjectAiSetting | null) => void
) {
  const q = query(
    collection(db, 'project_ai_settings'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(null);
      } else {
        const d = snap.docs[0];
        const raw = d.data() as Record<string, any>;
        const text = raw.instructions || raw.customInstructions || '';
        onData({
          id: d.id,
          ownerId: raw.ownerId || uid,
          projectId: raw.projectId || projectId,
          instructions: text,
          customInstructions: text,
          isEnabled: Boolean(raw.isEnabled ?? true),
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        });
      }
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'project_ai_settings')
  );
}

export async function saveProjectAiSettings(
  projectIdOrInput:
    | string
    | {
        projectId: string;
        instructions?: string;
        customInstructions?: string;
        isEnabled: boolean;
      },
  maybeInput?: {
    instructions?: string;
    customInstructions?: string;
    isEnabled: boolean;
  }
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');

  const projectId =
    typeof projectIdOrInput === 'string'
      ? projectIdOrInput
      : projectIdOrInput.projectId;
  const instructionsText =
    typeof projectIdOrInput === 'string'
      ? maybeInput?.customInstructions ?? maybeInput?.instructions ?? ''
      : projectIdOrInput.customInstructions ?? projectIdOrInput.instructions ?? '';
  const isEnabled =
    typeof projectIdOrInput === 'string'
      ? Boolean(maybeInput?.isEnabled ?? true)
      : Boolean(projectIdOrInput.isEnabled);

  const docId = `aiset_${projectId}`;
  try {
    const q = query(
      collection(db, 'project_ai_settings'),
      where('ownerId', '==', uid),
      where('projectId', '==', projectId)
    );
    const existingSnap = await getDocs(q);
    if (!existingSnap.empty) {
      const existingRef = doc(db, 'project_ai_settings', existingSnap.docs[0].id);
      await updateDoc(existingRef, {
        instructions: cleanStr(instructionsText, 6000, ''),
        isEnabled,
        updatedAt: serverTimestamp(),
      });
    } else {
      const ref = doc(db, 'project_ai_settings', docId);
      await setDoc(ref, {
        ownerId: uid,
        projectId,
        instructions: cleanStr(instructionsText, 6000, ''),
        isEnabled,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordActivityLog({
      projectId,
      actionType: 'AI instructions updated',
      targetType: 'ai_settings',
      targetName: 'Custom AI Instructions',
      details: isEnabled
        ? 'Updated and enabled custom project AI instructions'
        : 'Disabled custom project AI instructions',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `project_ai_settings/${docId}`);
  }
}

// ============================================================================
// 12. TRASH & RESTORE / SOFT DELETION (Phase 10.3)
// ============================================================================
export function subscribeToTrashItems(
  uid: string,
  projectId: string,
  onData: (items: TrashItem[]) => void
) {
  const q = query(
    collection(db, 'trash_items'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: TrashItem[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        const name = raw.name || raw.entityName || 'Deleted Item';
        const itemType = (raw.itemType || 'entity') as VersionTargetType;
        return {
          id: d.id,
          ownerId: raw.ownerId || uid,
          projectId: raw.projectId || projectId,
          originalId: raw.originalId || '',
          itemType,
          entityType: raw.category || itemType,
          category: raw.category || 'general',
          subCategory: raw.subCategory || '',
          name,
          entityName: name,
          summary: raw.summary || '',
          snapshot: raw.snapshot || {},
          deletedAt: raw.deletedAt?.toDate
            ? raw.deletedAt.toDate().toISOString()
            : raw.deletedAt,
        };
      });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'trash_items')
  );
}

async function moveRecordToTrash(input: {
  projectId: string;
  originalId: string;
  itemType: VersionTargetType;
  category: string;
  subCategory: string;
  name: string;
  summary: string;
  snapshot: Record<string, string | undefined>;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = makeId('trash');
  const ref = doc(db, 'trash_items', id);
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: cleanStr(input.projectId, 128),
      originalId: cleanStr(input.originalId, 128),
      itemType: input.itemType,
      category: cleanStr(input.category, 80, 'general'),
      subCategory: cleanStr(input.subCategory, 100, ''),
      name: cleanStr(input.name, 240, 'Deleted Item'),
      summary: cleanStr(input.summary, 2000, ''),
      snapshot: sanitizeAttributes(input.snapshot),
      deletedAt: serverTimestamp(),
    });
    await recordActivityLog({
      projectId: input.projectId,
      actionType: 'Entity deleted',
      targetType: input.itemType,
      targetName: input.name,
      details: `Moved "${input.name}" (${input.subCategory || input.category}) to Trash`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `trash_items/${id}`);
  }
}

export async function restoreTrashItem(item: TrashItem): Promise<void> {
  const snap = item.snapshot || {};
  const itemName = item.name || item.entityName;
  if (item.itemType === 'entity') {
    const {
      category = item.category || 'character',
      subCategory = item.subCategory || 'Character',
      name = itemName,
      subtitle = '',
      summary = item.summary,
      parentId = '',
      ...restAttrs
    } = snap;

    await createEntity({
      id: item.originalId,
      projectId: item.projectId,
      category: category as EntityCategory,
      subCategory,
      name,
      subtitle,
      summary,
      parentId,
      attributes: restAttrs,
      skipActivityLog: true,
    });
  } else if (item.itemType === 'lore') {
    await createLoreEntry({
      id: item.originalId,
      projectId: item.projectId,
      title: snap.title || itemName,
      category: snap.category || item.category || 'World History',
      era: snap.era || item.subCategory || '',
      summary: snap.summary || item.summary || '',
      content: snap.content || item.summary || '',
    });
  } else if (item.itemType === 'timeline') {
    await createTimelineEvent({
      id: item.originalId,
      projectId: item.projectId,
      title: snap.title || itemName,
      dateLabel: snap.dateLabel || item.subCategory || 'Year 1',
      sortOrder: Number(snap.sortOrder) || 0,
      era: snap.era || '',
      category: snap.category || item.category || 'Historical Event',
      locationName: snap.locationName || '',
      participants: snap.participants || '',
      description: snap.description || item.summary || '',
    });
  }

  await deleteDoc(doc(db, 'trash_items', item.id));
  await recordActivityLog({
    projectId: item.projectId,
    actionType: 'Entity restored',
    targetType: item.itemType,
    targetName: itemName,
    details: `Restored "${itemName}" from Trash to active canon`,
  });
}

export async function permanentlyDeleteTrashItem(trashId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trash_items', trashId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `trash_items/${trashId}`);
  }
}

// ============================================================================
// 13. ACTIVITY LOGS (Phase 10.4)
// ============================================================================
export function subscribeToActivityLogs(
  uid: string,
  projectId: string,
  onData: (logs: ActivityLog[]) => void
) {
  const q = query(
    collection(db, 'activity_logs'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ActivityLog[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        const targetType = raw.targetType || raw.entityType || 'entity';
        const targetName = raw.targetName || raw.entityName || 'Record';
        return {
          id: d.id,
          ownerId: raw.ownerId || uid,
          projectId: raw.projectId || projectId,
          actionType: raw.actionType || 'Action',
          targetType,
          entityType: targetType,
          targetName,
          entityName: targetName,
          details: raw.details || '',
          actorName: raw.actorName || 'Author',
          createdAt: raw.createdAt?.toDate
            ? raw.createdAt.toDate().toISOString()
            : raw.createdAt,
        };
      });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'activity_logs')
  );
}

export async function recordActivityLog(input: {
  projectId: string;
  actionType: string;
  targetType?: string;
  entityType?: string;
  targetName?: string;
  entityName?: string;
  details: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !input.projectId) return;
  const id = makeId('act');
  const ref = doc(db, 'activity_logs', id);
  const resolvedTargetType = input.targetType || input.entityType || 'entity';
  const resolvedTargetName = input.targetName || input.entityName || 'Record';
  try {
    await setDoc(ref, {
      ownerId: uid,
      projectId: cleanStr(input.projectId, 128),
      actionType: cleanStr(input.actionType, 80, 'Action'),
      targetType: cleanStr(resolvedTargetType, 80, 'entity'),
      targetName: cleanStr(resolvedTargetName, 240, 'Record'),
      details: cleanStr(input.details, 1000, ''),
      actorName: currentActorName(),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit log write
  }
}

// ============================================================================
// 14. VISUAL ASSETS (Phase 11 — Visual Asset Studio & Image Management)
// ============================================================================
export function subscribeToVisualAssets(
  uid: string,
  projectId: string,
  onData: (assets: VisualAsset[]) => void
) {
  const q = query(
    collection(db, 'visual_assets'),
    where('ownerId', '==', uid),
    where('projectId', '==', projectId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: VisualAsset[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        return {
          id: d.id,
          ownerId: raw.ownerId || uid,
          projectId: raw.projectId || projectId,
          entityId: raw.entityId || '',
          entityType: raw.entityType || '',
          entityName: raw.entityName || '',
          assetCategory: (raw.assetCategory || 'general_reference') as AssetCategory,
          subRole: raw.subRole || 'Main Visual',
          fileName: raw.fileName || 'Untitled Asset',
          mimeType: raw.mimeType || 'image/svg+xml',
          fileSize: Number(raw.fileSize) || 0,
          width: Number(raw.width) || 800,
          height: Number(raw.height) || 1000,
          storagePath: raw.storagePath || '',
          publicUrl: raw.publicUrl || '',
          description: raw.description || '',
          metadataJson: raw.metadataJson || '',
          isPrimary: Boolean(raw.isPrimary),
          createdAt: raw.createdAt?.toDate
            ? raw.createdAt.toDate().toISOString()
            : raw.createdAt,
          updatedAt: raw.updatedAt?.toDate
            ? raw.updatedAt.toDate().toISOString()
            : raw.updatedAt,
        };
      });
      list.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        const ta = typeof a.createdAt === 'string' ? Date.parse(a.createdAt) || 0 : 0;
        const tb = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) || 0 : 0;
        return tb - ta;
      });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'visual_assets')
  );
}

export async function createVisualAsset(input: {
  id?: string;
  projectId: string;
  entityId?: string;
  entityType?: string;
  entityName?: string;
  assetCategory: AssetCategory;
  subRole?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  storagePath: string;
  publicUrl: string;
  description?: string;
  metadataJson?: string;
  isPrimary?: boolean;
  skipActivityLog?: boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  const id = input.id && /^[a-zA-Z0-9_-]+$/.test(input.id) ? input.id : makeId('asset');
  const ref = doc(db, 'visual_assets', id);

  // If setting as primary for an entity or novel_cover, demote existing primary in the same scope
  if (input.isPrimary) {
    try {
      const q = query(
        collection(db, 'visual_assets'),
        where('ownerId', '==', uid),
        where('projectId', '==', input.projectId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data() as Record<string, any>;
        const sameEntity =
          input.entityId && input.entityId.length > 0
            ? data.entityId === input.entityId
            : data.assetCategory === input.assetCategory && !data.entityId;
        if (sameEntity && data.isPrimary) {
          await updateDoc(doc(db, 'visual_assets', d.id), {
            isPrimary: false,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Non-blocking primary demotion
    }
  }

  const payload = {
    ownerId: uid,
    projectId: cleanStr(input.projectId, 128),
    entityId: cleanStr(input.entityId, 128, ''),
    entityType: cleanStr(input.entityType, 80, ''),
    entityName: cleanStr(input.entityName, 240, ''),
    assetCategory: input.assetCategory,
    subRole: cleanStr(input.subRole, 120, 'Main Visual'),
    fileName: cleanStr(input.fileName, 255, 'asset.svg'),
    mimeType: cleanStr(input.mimeType, 80, 'image/svg+xml'),
    fileSize: Math.max(0, Math.min(20971520, Math.floor(Number(input.fileSize) || 0))),
    width: Math.max(0, Math.min(16384, Math.floor(Number(input.width) || 800))),
    height: Math.max(0, Math.min(16384, Math.floor(Number(input.height) || 1000))),
    storagePath: cleanStr(input.storagePath, 500, 'uploads/default.svg'),
    publicUrl: cleanStr(input.publicUrl, 1000, '/api/assets/file/default/default/asset.svg'),
    description: cleanStr(input.description, 4000, ''),
    metadataJson: cleanStr(input.metadataJson, 12000, ''),
    isPrimary: Boolean(input.isPrimary),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
    if (!input.skipActivityLog) {
      await recordActivityLog({
        projectId: input.projectId,
        actionType: 'Visual asset uploaded',
        targetType: input.assetCategory,
        targetName: payload.fileName,
        details: `Added visual asset "${payload.fileName}"${payload.entityName ? ` for ${payload.entityName}` : ''} (${payload.subRole})`,
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `visual_assets/${id}`);
  }
}

export async function updateVisualAsset(
  assetId: string,
  updates: {
    fileName?: string;
    assetCategory?: AssetCategory;
    subRole?: string;
    entityId?: string;
    entityType?: string;
    entityName?: string;
    description?: string;
    metadataJson?: string;
    isPrimary?: boolean;
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    storagePath?: string;
    publicUrl?: string;
  }
): Promise<void> {
  const ref = doc(db, 'visual_assets', assetId);
  try {
    const patch: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.fileName !== undefined) patch.fileName = cleanStr(updates.fileName, 255, 'Asset');
    if (updates.assetCategory !== undefined) patch.assetCategory = updates.assetCategory;
    if (updates.subRole !== undefined) patch.subRole = cleanStr(updates.subRole, 120, 'Main Visual');
    if (updates.entityId !== undefined) patch.entityId = cleanStr(updates.entityId, 128, '');
    if (updates.entityType !== undefined) patch.entityType = cleanStr(updates.entityType, 80, '');
    if (updates.entityName !== undefined) patch.entityName = cleanStr(updates.entityName, 240, '');
    if (updates.description !== undefined) patch.description = cleanStr(updates.description, 4000, '');
    if (updates.metadataJson !== undefined) patch.metadataJson = cleanStr(updates.metadataJson, 12000, '');
    if (updates.isPrimary !== undefined) patch.isPrimary = Boolean(updates.isPrimary);
    if (updates.mimeType !== undefined) patch.mimeType = cleanStr(updates.mimeType, 80, 'image/png');
    if (updates.fileSize !== undefined)
      patch.fileSize = Math.max(0, Math.min(20971520, Math.floor(Number(updates.fileSize) || 0)));
    if (updates.width !== undefined)
      patch.width = Math.max(0, Math.min(16384, Math.floor(Number(updates.width) || 800)));
    if (updates.height !== undefined)
      patch.height = Math.max(0, Math.min(16384, Math.floor(Number(updates.height) || 1000)));
    if (updates.storagePath !== undefined) patch.storagePath = cleanStr(updates.storagePath, 500, '');
    if (updates.publicUrl !== undefined) patch.publicUrl = cleanStr(updates.publicUrl, 1000, '');

    await updateDoc(ref, patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `visual_assets/${assetId}`);
  }
}

export async function setPrimaryVisualAsset(
  projectId: string,
  targetAsset: VisualAsset
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');
  try {
    const q = query(
      collection(db, 'visual_assets'),
      where('ownerId', '==', uid),
      where('projectId', '==', projectId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, any>;
      const sameGroup =
        targetAsset.entityId && targetAsset.entityId.length > 0
          ? raw.entityId === targetAsset.entityId
          : raw.assetCategory === targetAsset.assetCategory && !raw.entityId;
      if (sameGroup) {
        const shouldBePrimary = d.id === targetAsset.id;
        if (Boolean(raw.isPrimary) !== shouldBePrimary) {
          await updateDoc(doc(db, 'visual_assets', d.id), {
            isPrimary: shouldBePrimary,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    await recordActivityLog({
      projectId,
      actionType: 'Primary visual updated',
      targetType: targetAsset.assetCategory,
      targetName: targetAsset.fileName,
      details: `Set "${targetAsset.fileName}" as primary visual${targetAsset.entityName ? ` for ${targetAsset.entityName}` : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `visual_assets/${targetAsset.id}`);
  }
}

export async function deleteVisualAsset(asset: VisualAsset): Promise<void> {
  try {
    await deleteDoc(doc(db, 'visual_assets', asset.id));
    await recordActivityLog({
      projectId: asset.projectId,
      actionType: 'Visual asset deleted',
      targetType: asset.assetCategory,
      targetName: asset.fileName,
      details: `Removed visual asset "${asset.fileName}"${asset.entityName ? ` from ${asset.entityName}` : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `visual_assets/${asset.id}`);
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
      'The oldest surviving monarchy on Continent Neran, renowned for its star-spire observatories and rigid noble houses.',
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
      relationships: 'Estranged rival to Seraphina Morcant; sworn ward of House Vaelor.',
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
      leader: 'Seraphina Morcant',
      headquarters: 'City of Eldoria',
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
      origin: 'Continent Neran',
      powers: 'Reveals unaltered memory imprints within a one-league radius; unlocks Star-Vault seals.',
      limitations: 'Requires the wielder to sacrifice a personal memory for each alignment.',
      currentOwner: 'Caelum Vaelor',
      history: 'Thought lost during the siege of Spirehold; recovered in the ruins beneath Eldoria.',
    },
  });

  // 5. Power System
  const powerId = await createEntity({
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

  // 10. Default Custom AI Instructions
  await saveProjectAiSettings({
    projectId,
    instructions:
      'Maintain a Dark Editorial Fantasy tone. Respect High Aetherian patronymics (-or, -ant, -ryn) for noble characters, ground magic strictly in the Five Chords of Astral Resonance, and never alter established timeline dates without flagging a continuity note.',
    isEnabled: true,
  });

  // 11. Phase 11 Starter Visual Assets (Portraits, Location, Emblem, Artifact, World Map with Pins, and Novel Cover)
  const uid = auth.currentUser?.uid || 'starter';
  const baseFileUrl = `/api/assets/file/${uid}/${projectId}`;

  await createVisualAsset({
    projectId,
    entityId: char1Id,
    entityType: 'character',
    entityName: 'Caelum Vaelor',
    assetCategory: 'character_portrait',
    subRole: 'Main Portrait',
    fileName: 'Caelum_Vaelor_Portrait.jpg',
    mimeType: 'image/jpeg',
    fileSize: 284280,
    width: 900,
    height: 1200,
    storagePath: `src/assets/images/nomen_character_portrait_caelum_1794355386782.jpg`,
    publicUrl: `/src/assets/images/nomen_character_portrait_caelum_1794355386782.jpg`,
    description: 'Official character portrait of Caelum Vaelor wearing his dark traveling cloak and carrying the cracked astrolabe key.',
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: char2Id,
    entityType: 'character',
    entityName: 'Seraphina Morcant',
    assetCategory: 'character_portrait',
    subRole: 'Main Portrait',
    fileName: 'Seraphina_Morcant_Portrait.svg',
    mimeType: 'image/svg+xml',
    fileSize: 4210,
    width: 800,
    height: 1200,
    storagePath: `uploads/${uid}/${projectId}/Seraphina_Morcant_Portrait.svg`,
    publicUrl: `${baseFileUrl}/Seraphina_Morcant_Portrait.svg?category=character_portrait&title=Seraphina+Morcant&subtitle=Arch-Prelate+of+the+Obsidian+Quill&aspect=2:3`,
    description: 'Character portrait of Arch-Prelate Seraphina Morcant in her violet Synod mantle.',
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: cityId,
    entityType: 'location',
    entityName: 'City of Eldoria',
    assetCategory: 'location_illustration',
    subRole: 'Main Location Image',
    fileName: 'City_of_Eldoria_Caldera.jpg',
    mimeType: 'image/jpeg',
    fileSize: 345120,
    width: 1200,
    height: 675,
    storagePath: `src/assets/images/nomen_world_eldoria_caldera_1794355389014.jpg`,
    publicUrl: `/src/assets/images/nomen_world_eldoria_caldera_1794355389014.jpg`,
    description: 'Architectural vista of the concentric stone terraces of Eldoria descending into the Mirror Caldera.',
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: orgId,
    entityType: 'organization',
    entityName: 'Order of the Obsidian Quill',
    assetCategory: 'organization_emblem',
    subRole: 'Organization Logo',
    fileName: 'Obsidian_Quill_Crest.svg',
    mimeType: 'image/svg+xml',
    fileSize: 3980,
    width: 900,
    height: 900,
    storagePath: `uploads/${uid}/${projectId}/Obsidian_Quill_Crest.svg`,
    publicUrl: `${baseFileUrl}/Obsidian_Quill_Crest.svg?category=organization_emblem&title=Order+of+the+Obsidian+Quill&subtitle=Custodians+of+the+Sealed+Archives`,
    description: 'Heraldic crest displaying the split obsidian feather crossed with the silver key of the Silent Vaults.',
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: itemId,
    entityType: 'item',
    entityName: 'The Vesryn Astrolabe',
    assetCategory: 'weapon_artifact',
    subRole: 'Primary Artifact Image',
    fileName: 'Vesryn_Astrolabe_Relic.svg',
    mimeType: 'image/svg+xml',
    fileSize: 4450,
    width: 900,
    height: 900,
    storagePath: `uploads/${uid}/${projectId}/Vesryn_Astrolabe_Relic.svg`,
    publicUrl: `${baseFileUrl}/Vesryn_Astrolabe_Relic.svg?category=weapon_artifact&title=The+Vesryn+Astrolabe&subtitle=Three-Ringed+Star-Iron+Relic`,
    description: 'Detailed artifact study of the three concentric star-iron rings of the Vesryn Astrolabe.',
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: powerId,
    entityType: 'ability',
    entityName: 'Astral Resonance (The Five Chords)',
    assetCategory: 'power_system_illustration',
    subRole: 'Power Rank Diagram',
    fileName: 'Five_Chords_Resonance_Diagram.svg',
    mimeType: 'image/svg+xml',
    fileSize: 4320,
    width: 900,
    height: 900,
    storagePath: `uploads/${uid}/${projectId}/Five_Chords_Resonance_Diagram.svg`,
    publicUrl: `${baseFileUrl}/Five_Chords_Resonance_Diagram.svg?category=power_system_illustration&title=The+Five+Chords&subtitle=Harmonic+Attunement+to+Star-Iron`,
    description: 'Harmonic diagram illustrating the Five Chords of Astral Resonance.',
    isPrimary: true,
    skipActivityLog: true,
  });

  const starterMapPins = [
    {
      id: 'pin_aetheria',
      locationEntityId: kingdomId,
      locationName: 'Kingdom of Aetheria',
      xPercent: 52,
      yPercent: 46,
      note: 'Sovereign Realm of the Silver Astrolabe',
    },
    {
      id: 'pin_northern',
      locationEntityId: provinceId,
      locationName: 'Northern Province',
      xPercent: 44,
      yPercent: 31,
      note: 'The Frost-Watch Marches under House Vaelor',
    },
    {
      id: 'pin_eldoria',
      locationEntityId: cityId,
      locationName: 'City of Eldoria',
      xPercent: 36,
      yPercent: 25,
      note: 'Terraced capital around the Mirror Caldera',
    },
  ];

  await createVisualAsset({
    projectId,
    entityId: continentId,
    entityType: 'location',
    entityName: 'Continent Neran',
    assetCategory: 'world_map',
    subRole: 'Continent Map',
    fileName: 'Continent_Neran_Cartography.svg',
    mimeType: 'image/svg+xml',
    fileSize: 6420,
    width: 1200,
    height: 800,
    storagePath: `uploads/${uid}/${projectId}/Continent_Neran_Cartography.svg`,
    publicUrl: `${baseFileUrl}/Continent_Neran_Cartography.svg?category=world_map&title=Continent+Neran&subtitle=Royal+Cartographic+Survey+of+the+Seven+Realms&aspect=16:9`,
    description: 'High-resolution cartographic survey of Continent Neran showing the Glass Sea, Kingdom of Aetheria, and Northern Marches.',
    metadataJson: JSON.stringify({ pins: starterMapPins }),
    isPrimary: true,
    skipActivityLog: true,
  });

  await createVisualAsset({
    projectId,
    entityId: '',
    entityType: 'project',
    entityName: 'Chronicles of Neran: The Ashen Crown',
    assetCategory: 'novel_cover',
    subRole: 'Novel Cover',
    fileName: 'Chronicles_of_Neran_Cover.jpg',
    mimeType: 'image/jpeg',
    fileSize: 312000,
    width: 900,
    height: 1200,
    storagePath: `src/assets/images/nomen_novel_cover_ashen_crown_1794355389316.jpg`,
    publicUrl: `/src/assets/images/nomen_novel_cover_ashen_crown_1794355389316.jpg`,
    description: 'Official Book I novel cover featuring the Ashen Crown and Vesryn Astrolabe motif.',
    metadataJson: JSON.stringify({
      coverTitle: 'Chronicles of Neran',
      coverSubtitle: 'Book I: The Ashen Crown',
      authorName: currentActorName(),
      showTypographyOverlay: true,
    }),
    isPrimary: true,
    skipActivityLog: true,
  });

  return projectId;
}
