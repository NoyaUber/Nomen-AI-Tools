import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BookMarked,
  CheckCircle2,
  Clock,
  Compass,
  Database,
  Download,
  FileJson,
  FileText,
  Flame,
  History,
  MessageSquare,
  Printer,
  RotateCcw,
  Search,
  Shield,
  Sword,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  ActivityLog,
  EntityRelation,
  EntityVersion,
  FavoriteItem,
  LoreEntry,
  NamingRule,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  TrashItem,
  VersionedEntityType,
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
  permanentlyDeleteTrashItem,
  recordActivityLog,
  restoreTrashItem,
  saveProjectAiSettings,
  updateEntity,
} from '../../lib/db/firestore-service';
import { NomenProjectExportSchema } from '../../lib/validation/schemas';
import {
  Button,
  ConfirmDeleteModal,
  EmptyState,
  Input,
  Modal,
  Select,
} from '../../components/ui/primitives';
import { VersionHistoryModal } from '../../components/VersionHistoryModal';

interface EncyclopediaViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  namingRules: NamingRule[];
  favorites: FavoriteItem[];
  aiSettings: ProjectAiSetting | null;
  versions: EntityVersion[];
  trashItems: TrashItem[];
  activityLogs: ActivityLog[];
  onSelectProject: (id: string) => void;
  onInspectEntityForAssistant: (entity: WorldEntity) => void;
  onNavigateToStudio: (tab: string) => void;
}

type CodexCategory =
  | 'all'
  | 'character'
  | 'location'
  | 'organization'
  | 'item'
  | 'ability'
  | 'lore'
  | 'timeline';

interface UnifiedCodexEntry {
  id: string;
  category: Exclude<CodexCategory, 'all'>;
  categoryLabel: string;
  subCategory: string;
  title: string;
  subtitle: string;
  summary: string;
  updatedAt: string;
  relatedEntities: string[];
  versionEntityType: VersionedEntityType;
  snapshot: Record<string, string>;
  rawEntity?: WorldEntity;
}

interface ParsedVaultImportPreview {
  schemaVersion: string;
  projectTitle: string;
  genre: string;
  language: string;
  description: string;
  entitiesCount: number;
  relationsCount: number;
  loreCount: number;
  timelineCount: number;
  namingRulesCount: number;
  favoritesCount: number;
  duplicateIdsResolved: number;
  rawPayload: ReturnType<typeof NomenProjectExportSchema.parse>;
}

const PAGE_SIZE = 12;

export const EncyclopediaView: React.FC<EncyclopediaViewProps> = ({
  project,
  entities,
  relations,
  loreEntries,
  timelineEvents,
  namingRules,
  favorites,
  aiSettings,
  versions,
  trashItems,
  activityLogs,
  onSelectProject,
  onInspectEntityForAssistant,
  onNavigateToStudio,
}) => {
  const [vaultTab, setVaultTab] = useState<
    'encyclopedia' | 'versions' | 'trash' | 'activity' | 'data'
  >('encyclopedia');

  // Encyclopedia State
  const [categoryFilter, setCategoryFilter] = useState<CodexCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'alpha' | 'recent' | 'category'>(
    'alpha'
  );
  const [page, setPage] = useState(1);

  // Version History Inspection Modal State
  const [versionTarget, setVersionTarget] = useState<{
    id: string;
    type: VersionedEntityType;
    name: string;
    snapshot: Record<string, string>;
  } | null>(null);

  // Trash & Activity State (Phase 10.3 & 10.4)
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [trashSearch, setTrashSearch] = useState('');
  const [trashTypeFilter, setTrashTypeFilter] = useState<string>('all');
  const [permanentDeleteTarget, setPermanentDeleteTarget] =
    useState<TrashItem | null>(null);
  const [purgeAllModalOpen, setPurgeAllModalOpen] = useState(false);
  const [purgingAll, setPurgingAll] = useState(false);

  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityPage, setActivityPage] = useState(1);

  // Data & Portability State (Phase 10.1 & 10.2)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] =
    useState<ParsedVaultImportPreview | null>(null);
  const [importingMode, setImportingMode] = useState<'merge' | 'new' | null>(
    null
  );
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  // Build Unified Encyclopedia Entries across all 7 required categories
  const unifiedEntries = useMemo<UnifiedCodexEntry[]>(() => {
    const items: UnifiedCodexEntry[] = [];

    for (const ent of entities) {
      const cat: Exclude<CodexCategory, 'all'> =
        ent.category === 'character'
          ? 'character'
          : ent.category === 'location'
          ? 'location'
          : ent.category === 'item'
          ? 'item'
          : ent.category === 'ability'
          ? 'ability'
          : 'organization';

      const catLabel =
        cat === 'character'
          ? 'Characters'
          : cat === 'location'
          ? 'Locations'
          : cat === 'organization'
          ? 'Organizations'
          : cat === 'item'
          ? 'Artifacts'
          : 'Power Systems';

      const relNames = relations
        .filter(
          (r) => r.sourceEntityId === ent.id || r.targetEntityId === ent.id
        )
        .map((r) =>
          r.sourceEntityId === ent.id
            ? `${r.relationType}: ${r.targetEntityName}`
            : `${r.sourceEntityName} (${r.relationType})`
        );

      items.push({
        id: ent.id,
        category: cat,
        categoryLabel: catLabel,
        subCategory: ent.subCategory || ent.category,
        title: ent.name,
        subtitle: ent.subtitle,
        summary: ent.summary,
        updatedAt: ent.updatedAt,
        relatedEntities: relNames,
        versionEntityType:
          ent.category === 'family'
            ? 'organization'
            : (ent.category as VersionedEntityType),
        snapshot: {
          name: ent.name,
          category: ent.category,
          subCategory: ent.subCategory,
          subtitle: ent.subtitle,
          summary: ent.summary,
          parentId: ent.parentId,
          ...ent.attributes,
        },
        rawEntity: ent,
      });
    }

    for (const lore of loreEntries) {
      const mentioned = entities
        .filter(
          (e) =>
            lore.content.toLowerCase().includes(e.name.toLowerCase()) ||
            lore.summary.toLowerCase().includes(e.name.toLowerCase())
        )
        .map((e) => e.name);

      items.push({
        id: lore.id,
        category: 'lore',
        categoryLabel: 'Lore',
        subCategory: lore.category,
        title: lore.title,
        subtitle: lore.era || 'Canonical Lore Chronicle',
        summary: lore.summary || lore.content.slice(0, 260),
        updatedAt: lore.updatedAt,
        relatedEntities: mentioned,
        versionEntityType: 'lore',
        snapshot: {
          title: lore.title,
          category: lore.category,
          era: lore.era,
          summary: lore.summary,
          content: lore.content,
        },
      });
    }

    for (const evt of timelineEvents) {
      const linked = [
        evt.locationName ? `Location: ${evt.locationName}` : '',
        evt.participants ? `Participants: ${evt.participants}` : '',
      ].filter(Boolean);

      items.push({
        id: evt.id,
        category: 'timeline',
        categoryLabel: 'Timeline Events',
        subCategory: evt.category,
        title: evt.title,
        subtitle: `${evt.dateLabel} (Epoch ${evt.sortOrder})${
          evt.era ? ` · ${evt.era}` : ''
        }`,
        summary: evt.description,
        updatedAt: evt.updatedAt,
        relatedEntities: linked,
        versionEntityType: 'timeline_event',
        snapshot: {
          title: evt.title,
          dateLabel: evt.dateLabel,
          sortOrder: String(evt.sortOrder),
          era: evt.era,
          category: evt.category,
          locationName: evt.locationName,
          participants: evt.participants,
          description: evt.description,
        },
      });
    }

    return items;
  }, [entities, relations, loreEntries, timelineEvents]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = unifiedEntries.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.subCategory.toLowerCase().includes(q) ||
        item.relatedEntities.some((r) => r.toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      if (sortBy === 'alpha') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'category') {
        return (
          a.categoryLabel.localeCompare(b.categoryLabel) ||
          a.title.localeCompare(b.title)
        );
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [unifiedEntries, categoryFilter, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const paginatedEntries = filteredEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Filtered Trash Items
  const filteredTrash = useMemo(() => {
    const q = trashSearch.trim().toLowerCase();
    return trashItems.filter((item) => {
      if (trashTypeFilter !== 'all' && item.entityType !== trashTypeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.entityName.toLowerCase().includes(q) ||
        item.subCategory.toLowerCase().includes(q) ||
        (item.snapshot?.summary || '').toLowerCase().includes(q)
      );
    });
  }, [trashItems, trashSearch, trashTypeFilter]);

  // Filtered Activity Logs
  const filteredActivity = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return activityLogs.filter((a) => {
      if (activityFilter !== 'all' && a.actionType !== activityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        a.entityName.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.entityType.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, activityFilter, activitySearch]);

  const totalActivityPages = Math.max(
    1,
    Math.ceil(filteredActivity.length / 15)
  );
  const paginatedActivity = filteredActivity.slice(
    (activityPage - 1) * 15,
    activityPage * 15
  );

  const handleRestoreTrash = async (item: TrashItem) => {
    setRestoringId(item.id);
    try {
      await restoreTrashItem(item);
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreAllFilteredTrash = async () => {
    if (filteredTrash.length === 0) return;
    setBulkRestoring(true);
    try {
      for (const item of filteredTrash) {
        await restoreTrashItem(item);
      }
    } finally {
      setBulkRestoring(false);
    }
  };

  const handlePurgeAllTrash = async () => {
    setPurgingAll(true);
    try {
      for (const item of trashItems) {
        await permanentlyDeleteTrashItem(item.id);
      }
      setPurgeAllModalOpen(false);
    } finally {
      setPurgingAll(false);
    }
  };

  // Phase 10.1 — Export Structured JSON v2.0.0
  const handleExportJson = async () => {
    const payload = {
      schemaVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      project: {
        title: project.title,
        description: project.description,
        genre: project.genre,
        worldSettings: project.worldSettings,
        language: project.language,
      },
      aiSettings: aiSettings
        ? {
            customInstructions: aiSettings.customInstructions,
            isEnabled: aiSettings.isEnabled,
          }
        : undefined,
      entities: entities.map((e) => ({
        id: e.id,
        category: e.category,
        subCategory: e.subCategory,
        name: e.name,
        subtitle: e.subtitle,
        summary: e.summary,
        parentId: e.parentId,
        attributes: e.attributes,
      })),
      relations: relations.map((r) => ({
        sourceEntityId: r.sourceEntityId,
        sourceEntityName: r.sourceEntityName,
        targetEntityId: r.targetEntityId,
        targetEntityName: r.targetEntityName,
        relationType: r.relationType,
        description: r.description,
      })),
      loreEntries: loreEntries.map((l) => ({
        title: l.title,
        category: l.category,
        era: l.era,
        summary: l.summary,
        content: l.content,
      })),
      timelineEvents: timelineEvents.map((t) => ({
        title: t.title,
        dateLabel: t.dateLabel,
        sortOrder: t.sortOrder,
        era: t.era,
        category: t.category,
        locationName: t.locationName,
        participants: t.participants,
        description: t.description,
      })),
      namingRules: namingRules.map((n) => ({
        category: n.category,
        title: n.title,
        phoneticPattern: n.phoneticPattern,
        morphologyNotes: n.prefixSuffixRule || n.structureRule || '',
        examples: n.examples,
        isActive: n.isActive,
      })),
      favorites: favorites.map((f) => ({
        name: f.name,
        pronunciation: f.pronunciation,
        category: f.category,
        interpretation: f.interpretation,
        inspiration: f.inspiration,
        suitability: f.suitability,
        titleOrVariation: f.titleOrVariation,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-nomen-export.json`;
    a.click();
    URL.revokeObjectURL(url);

    await recordActivityLog({
      projectId: project.id,
      actionType: 'exported',
      entityType: 'project_json',
      entityName: project.title,
      details: 'Exported full structured JSON v2.0.0 project archive from Canon Vault.',
    });
    setDataNotice(`Exported "${project.title}" as structured JSON v2.0.0 archive.`);
  };

  // Phase 10.1 — Export Markdown World Bible
  const handleExportMarkdown = async () => {
    const chars = entities.filter((e) => e.category === 'character');
    const locs = entities.filter((e) => e.category === 'location');
    const orgs = entities.filter(
      (e) => e.category === 'organization' || e.category === 'family'
    );
    const items = entities.filter((e) => e.category === 'item');
    const powers = entities.filter((e) => e.category === 'ability');

    const lines = [
      `# ${project.title} — Worldbuilding Bible`,
      `**Genre:** ${project.genre} | **Language:** ${project.language}`,
      '',
      `## Project Overview & Premise`,
      project.description || 'No synopsis recorded.',
      '',
      `## World Rules & Cosmology`,
      project.worldSettings || 'No world rules recorded.',
      '',
      `## Characters (${chars.length})`,
      ...chars.map(
        (c) =>
          `### ${c.name} (${c.subCategory || 'Character'})\n*${c.subtitle}*\n\n${c.summary}\n`
      ),
      `## Locations & Atlas (${locs.length})`,
      ...locs.map(
        (l) =>
          `### ${l.name} (${l.subCategory || 'Location'})\n*${l.subtitle}*\n\n${l.summary}\n`
      ),
      `## Organizations & Noble Houses (${orgs.length})`,
      ...orgs.map(
        (o) =>
          `### ${o.name} (${o.subCategory || 'Faction'})\n*${o.subtitle}*\n\n${o.summary}\n`
      ),
      `## Artifacts & Relics (${items.length})`,
      ...items.map(
        (i) =>
          `### ${i.name} (${i.subCategory || 'Artifact'})\n*${i.subtitle}*\n\n${i.summary}\n`
      ),
      `## Power Systems & Abilities (${powers.length})`,
      ...powers.map(
        (p) =>
          `### ${p.name} (${p.subCategory || 'Power System'})\n*${p.subtitle}*\n\n${p.summary}\n`
      ),
      `## Canonical Relationships (${relations.length})`,
      ...relations.map(
        (r) =>
          `- **${r.sourceEntityName}** → *${r.relationType}* → **${r.targetEntityName}**: ${r.description}`
      ),
      '',
      `## Lore & Historical Chronicles (${loreEntries.length})`,
      ...loreEntries.map(
        (l) => `### ${l.title} (${l.category} · ${l.era || 'Timeless'})\n${l.content}\n`
      ),
      `## Master Chronological Timeline (${timelineEvents.length})`,
      ...timelineEvents.map(
        (t) =>
          `- **${t.dateLabel} (Epoch ${t.sortOrder}) — ${t.title} [${t.category}]:** ${t.description}`
      ),
    ];

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-world-bible.md`;
    a.click();
    URL.revokeObjectURL(url);

    await recordActivityLog({
      projectId: project.id,
      actionType: 'exported',
      entityType: 'world_bible_md',
      entityName: project.title,
      details: 'Exported complete Markdown Worldbuilding Bible from Canon Vault.',
    });
    setDataNotice(`Exported "${project.title}" as Markdown Worldbuilding Bible (.md).`);
  };

  // Phase 10.4 — Export Activity Audit CSV
  const handleExportActivityCsv = () => {
    const headers = ['Timestamp', 'ActionType', 'EntityType', 'EntityName', 'Actor', 'Details'];
    const rows = filteredActivity.map((a) => [
      a.createdAt || '',
      a.actionType,
      a.entityType,
      `"${(a.entityName || '').replace(/"/g, '""')}"`,
      `"${(a.actorName || '').replace(/"/g, '""')}"`,
      `"${(a.details || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-activity-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Phase 10.2 — Parse & Validate JSON File
  const handleSelectImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDataError(null);
    setDataNotice(null);

    try {
      const raw = await file.text();
      const json = JSON.parse(raw);
      const parsed = NomenProjectExportSchema.safeParse(json);

      if (!parsed.success) {
        setDataError(
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
        schemaVersion: d.schemaVersion || '2.0.0',
        projectTitle: d.project.title,
        genre: d.project.genre,
        language: d.project.language,
        description: d.project.description,
        entitiesCount: d.entities.length,
        relationsCount: d.relations.length,
        loreCount: d.loreEntries.length,
        timelineCount: d.timelineEvents.length,
        namingRulesCount: d.namingRules.length,
        favoritesCount: d.favorites.length,
        duplicateIdsResolved,
        rawPayload: d,
      });
    } catch (err) {
      setDataError(
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

  // Phase 10.2 — Execute Confirmed Import (Merge into Current Project OR Create New Project)
  const handleExecuteImport = async (mode: 'merge' | 'new') => {
    if (!importPreview) return;
    setImportingMode(mode);
    setDataError(null);
    const d = importPreview.rawPayload;

    try {
      const targetProjectId =
        mode === 'new'
          ? await createProject({
              title: `${d.project.title} (Imported)`,
              description: d.project.description || '',
              genre: d.project.genre || project.genre,
              worldSettings: d.project.worldSettings || '',
              language: d.project.language || 'English',
            })
          : project.id;

      const oldToNewEntityId = new Map<string, string>();
      const pendingParents: {
        newId: string;
        oldParentId: string;
        ent: (typeof d.entities)[0];
      }[] = [];

      for (const ent of d.entities.slice(0, 80)) {
        const createdId = await createEntity({
          projectId: targetProjectId,
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

      for (const item of pendingParents) {
        const mappedParentId = oldToNewEntityId.get(item.oldParentId);
        if (mappedParentId) {
          await updateEntity(item.newId, {
            category:
              (item.ent.category as WorldEntity['category']) || 'location',
            subCategory: item.ent.subCategory || 'Location',
            name: item.ent.name,
            subtitle: item.ent.subtitle || '',
            summary: item.ent.summary || '',
            parentId: mappedParentId,
            attributes: item.ent.attributes || {},
          });
        }
      }

      for (const rel of d.relations.slice(0, 80)) {
        const srcId =
          (rel.sourceEntityId && oldToNewEntityId.get(rel.sourceEntityId)) ||
          '';
        const tgtId =
          (rel.targetEntityId && oldToNewEntityId.get(rel.targetEntityId)) ||
          '';
        if (srcId && tgtId && srcId !== tgtId) {
          await createEntityRelation({
            projectId: targetProjectId,
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
          projectId: targetProjectId,
          title: lore.title,
          category: lore.category || 'World History',
          era: lore.era || '',
          summary: lore.summary || '',
          content: lore.content || '',
        });
      }

      for (const evt of d.timelineEvents.slice(0, 50)) {
        await createTimelineEvent({
          projectId: targetProjectId,
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
          projectId: targetProjectId,
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
          projectId: targetProjectId,
          name: fav.name,
          pronunciation: fav.pronunciation || '',
          category: fav.category || 'Character names',
          interpretation: fav.interpretation || '',
          inspiration: fav.inspiration || '',
          suitability: fav.suitability || '',
          titleOrVariation: fav.titleOrVariation || '',
        });
      }

      if (mode === 'new' && d.aiSettings?.customInstructions) {
        await saveProjectAiSettings(targetProjectId, {
          customInstructions: d.aiSettings.customInstructions,
          isEnabled: d.aiSettings.isEnabled ?? true,
        });
      }

      await recordActivityLog({
        projectId: targetProjectId,
        actionType: 'imported',
        entityType: mode === 'new' ? 'project' : 'project_merge',
        entityName: d.project.title,
        details: `Imported ${d.entities.length} entities, ${d.relations.length} relationships, ${d.loreEntries.length} lore entries, and ${d.timelineEvents.length} timeline events (${
          mode === 'new' ? 'new project' : 'merged into active project'
        }).`,
      });

      if (mode === 'new') {
        onSelectProject(targetProjectId);
      }

      setImportPreview(null);
      setDataNotice(
        mode === 'new'
          ? `Created "${d.project.title} (Imported)" with ${d.entities.length} entities and ${d.relations.length} relationships.`
          : `Merged ${d.entities.length} entities, ${d.relations.length} relationships, ${d.loreEntries.length} lore entries, and ${d.timelineEvents.length} timeline events into "${project.title}".`
      );
    } catch (err) {
      setDataError(
        err instanceof Error ? `Import failed: ${err.message}` : 'Import failed.'
      );
    } finally {
      setImportingMode(null);
    }
  };

  const getStudioTab = (cat: Exclude<CodexCategory, 'all'>): string => {
    if (cat === 'character') return 'characters';
    if (cat === 'location') return 'world';
    if (cat === 'lore' || cat === 'timeline') return 'lore';
    return 'studios';
  };

  return (
    <div className="space-y-6">
      {/* Header & Top Vault Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Project Encyclopedia & Canon Vault
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Browse your unified universe encyclopedia, inspect version history snapshots, restore deleted items from Trash, audit project activity, and export or import project archives.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg self-start">
          <button
            onClick={() => setVaultTab('encyclopedia')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              vaultTab === 'encyclopedia'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            Encyclopedia ({unifiedEntries.length})
          </button>
          <button
            onClick={() => setVaultTab('versions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              vaultTab === 'versions'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Version History ({versions.length})
          </button>
          <button
            onClick={() => setVaultTab('trash')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              vaultTab === 'trash'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
            Trash & Restore ({trashItems.length})
          </button>
          <button
            onClick={() => setVaultTab('activity')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              vaultTab === 'activity'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Activity Log ({activityLogs.length})
          </button>
          <button
            onClick={() => setVaultTab('data')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              vaultTab === 'data'
                ? 'bg-[var(--accent-primary)] text-[#F8F7FC]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Export & Import
          </button>
        </div>
      </div>

      {/* TAB 1: PROJECT ENCYCLOPEDIA (Phase 7.4) */}
      {vaultTab === 'encyclopedia' && (
        <div className="space-y-5">
          {/* Search, Category Filter & Sorting */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-lg">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search encyclopedia by name, title, summary, or related entity..."
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Sort by:</span>
                <Select
                  className="w-48"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as 'alpha' | 'recent' | 'category')
                  }
                >
                  <option value="alpha">Alphabetical (A–Z)</option>
                  <option value="recent">Recently Updated</option>
                  <option value="category">Worldbuilding Category</option>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
              {(
                [
                  {
                    id: 'all',
                    label: `All Canon (${unifiedEntries.length})`,
                    icon: <BookMarked className="w-3 h-3" />,
                  },
                  {
                    id: 'character',
                    label: `Characters (${
                      unifiedEntries.filter((e) => e.category === 'character')
                        .length
                    })`,
                    icon: <Users className="w-3 h-3" />,
                  },
                  {
                    id: 'location',
                    label: `Locations (${
                      unifiedEntries.filter((e) => e.category === 'location')
                        .length
                    })`,
                    icon: <Compass className="w-3 h-3" />,
                  },
                  {
                    id: 'organization',
                    label: `Organizations (${
                      unifiedEntries.filter(
                        (e) => e.category === 'organization'
                      ).length
                    })`,
                    icon: <Shield className="w-3 h-3" />,
                  },
                  {
                    id: 'item',
                    label: `Artifacts (${
                      unifiedEntries.filter((e) => e.category === 'item').length
                    })`,
                    icon: <Sword className="w-3 h-3" />,
                  },
                  {
                    id: 'ability',
                    label: `Power Systems (${
                      unifiedEntries.filter((e) => e.category === 'ability')
                        .length
                    })`,
                    icon: <Flame className="w-3 h-3" />,
                  },
                  {
                    id: 'lore',
                    label: `Lore (${
                      unifiedEntries.filter((e) => e.category === 'lore').length
                    })`,
                    icon: <BookMarked className="w-3 h-3" />,
                  },
                  {
                    id: 'timeline',
                    label: `Timeline Events (${
                      unifiedEntries.filter((e) => e.category === 'timeline')
                        .length
                    })`,
                    icon: <Clock className="w-3 h-3" />,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setCategoryFilter(tab.id);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    categoryFilter === tab.id
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--accent-primary)]/40'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {paginatedEntries.length === 0 ? (
            <EmptyState
              title="No Encyclopedia Entries Match Filter"
              description="Try clearing your search filter or create new characters, locations, organizations, artifacts, power systems, lore entries, or timeline events."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paginatedEntries.map((entry) => {
                  const entryVersionCount = versions.filter(
                    (v) => v.entityId === entry.id
                  ).length;

                  return (
                    <article
                      key={`${entry.category}_${entry.id}`}
                      className="p-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>
                            {entry.categoryLabel} · {entry.subCategory}
                          </span>
                          <button
                            onClick={() =>
                              onNavigateToStudio(getStudioTab(entry.category))
                            }
                            className="text-[var(--accent-primary)] hover:underline cursor-pointer"
                          >
                            Open Studio →
                          </button>
                        </div>

                        <h2 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                          {entry.title}
                        </h2>

                        {entry.subtitle && (
                          <p className="text-xs text-[var(--text-secondary)]">
                            {entry.subtitle}
                          </p>
                        )}

                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                          {entry.summary || 'No summary recorded.'}
                        </p>

                        {entry.relatedEntities.length > 0 && (
                          <div className="pt-2 border-t border-[var(--border-subtle)]">
                            <p className="text-[11px] text-[var(--text-muted)] mb-1">
                              Connected Entities & References:
                            </p>
                            <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                              {entry.relatedEntities.join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                        <button
                          onClick={() =>
                            setVersionTarget({
                              id: entry.id,
                              type: entry.versionEntityType,
                              name: entry.title,
                              snapshot: entry.snapshot,
                            })
                          }
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>
                            Version History ({entryVersionCount})
                          </span>
                        </button>

                        {entry.rawEntity && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onInspectEntityForAssistant(entry.rawEntity!)
                            }
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            Ask AI
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs">
                  <span className="text-[var(--text-muted)] font-mono-tabular">
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, filteredEntries.length)} of{' '}
                    {filteredEntries.length} entries
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="font-mono-tabular text-[var(--text-primary)] px-2">
                      Page {page} / {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: VERSION HISTORY VAULT (Phase 7.1) */}
      {vaultTab === 'versions' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                Project-Wide Version Snapshots ({versions.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Inspect, compare side-by-side, and restore historical versions across Characters, Locations, Organizations, Artifacts, Power Systems, Lore, and Timeline Events.
              </p>
            </div>
          </div>

          {versions.length === 0 ? (
            <EmptyState
              title="No Version Snapshots Recorded Yet"
              description="Whenever you create or edit an entity, lore entry, or timeline event, NOMEN automatically stores a numbered snapshot here."
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {versions.slice(0, 50).map((ver) => {
                const matchingEntry = unifiedEntries.find(
                  (u) => u.id === ver.entityId
                );
                return (
                  <div
                    key={ver.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                          v{ver.versionNumber}
                        </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {ver.entityName}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          ({ver.entityType.replace('_', ' ')})
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {ver.changeSummary} · By {ver.createdByName}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                        {ver.createdAt
                          ? new Date(ver.createdAt).toLocaleString()
                          : 'Just now'}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setVersionTarget({
                            id: ver.entityId,
                            type: ver.entityType,
                            name: ver.entityName,
                            snapshot: matchingEntry?.snapshot || ver.snapshot,
                          })
                        }
                      >
                        <History className="w-3.5 h-3.5" />
                        Compare & Restore
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRASH & RESTORE (Phase 10.3) */}
      {vaultTab === 'trash' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                Trash & Soft-Delete Recovery ({filteredTrash.length} / {trashItems.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Deleted characters, locations, organizations, artifacts, power systems, lore chronicles, and timeline events are safely held here. Restore them to their original canon ID or permanently purge them.
              </p>
            </div>

            {trashItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkRestoring || filteredTrash.length === 0}
                  onClick={handleRestoreAllFilteredTrash}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {bulkRestoring
                    ? 'Restoring All...'
                    : `Restore All (${filteredTrash.length})`}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPurgeAllModalOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Empty Trash
                </Button>
              </div>
            )}
          </div>

          {trashItems.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={trashSearch}
                  onChange={(e) => setTrashSearch(e.target.value)}
                  placeholder="Filter deleted items by name or summary..."
                  className="pl-10"
                />
              </div>
              <Select
                className="sm:w-52"
                value={trashTypeFilter}
                onChange={(e) => setTrashTypeFilter(e.target.value)}
              >
                <option value="all">All Deleted Types ({trashItems.length})</option>
                <option value="character">Characters</option>
                <option value="location">Locations</option>
                <option value="organization">Organizations</option>
                <option value="item">Artifacts</option>
                <option value="ability">Power Systems</option>
                <option value="lore">Lore Chronicles</option>
                <option value="timeline_event">Timeline Events</option>
              </Select>
            </div>
          )}

          {filteredTrash.length === 0 ? (
            <EmptyState
              title={
                trashItems.length === 0
                  ? 'Trash Is Empty'
                  : 'No Deleted Items Match Filter'
              }
              description="Deleted entities, lore, and timeline events appear here for safe recovery."
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {filteredTrash.map((item) => (
                <div
                  key={item.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="uppercase tracking-wider text-[10px] font-semibold text-[var(--accent-primary)]">
                        {item.subCategory || item.entityType}
                      </span>
                      <span>·</span>
                      <span className="font-mono-tabular text-[var(--text-muted)]">
                        Deleted{' '}
                        {item.deletedAt
                          ? new Date(item.deletedAt).toLocaleString()
                          : 'recently'}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
                      {item.entityName}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                      {item.snapshot?.summary ||
                        item.snapshot?.content ||
                        item.snapshot?.description ||
                        'Archived snapshot ready for restoration.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={restoringId === item.id || bulkRestoring}
                      onClick={() => handleRestoreTrash(item)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {restoringId === item.id
                        ? 'Restoring...'
                        : 'Restore to Canon'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setPermanentDeleteTarget(item)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Permanently
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACTIVITY LOG (Phase 10.4) */}
      {vaultTab === 'activity' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                Project Activity Log ({filteredActivity.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Chronological audit trail of created, updated, deleted, restored, relationship, export, import, and AI generation events.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={activitySearch}
                  onChange={(e) => {
                    setActivitySearch(e.target.value);
                    setActivityPage(1);
                  }}
                  placeholder="Search entity or details..."
                  className="pl-9"
                />
              </div>
              <Select
                className="w-full sm:w-48"
                value={activityFilter}
                onChange={(e) => {
                  setActivityFilter(e.target.value);
                  setActivityPage(1);
                }}
              >
                <option value="all">All Activity Types</option>
                <option value="created">Entities Created</option>
                <option value="updated">Entities Updated</option>
                <option value="deleted">Moved to Trash</option>
                <option value="restored">Restored</option>
                <option value="relationship_changed">Relationship Changes</option>
                <option value="ai_saved">AI Generations Saved</option>
                <option value="exported">Project Exports</option>
                <option value="imported">Project Imports</option>
              </Select>
              {filteredActivity.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportActivityCsv}
                  title="Download Activity Audit Log (.csv)"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Export CSV
                </Button>
              )}
            </div>
          </div>

          {paginatedActivity.length === 0 ? (
            <EmptyState
              title="No Activity Recorded in Filter"
              description="Actions across your worldbuilding studios are automatically logged here."
            />
          ) : (
            <div className="space-y-3">
              <div className="divide-y divide-[var(--border-subtle)]">
                {paginatedActivity.map((act) => (
                  <div
                    key={act.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tabular uppercase text-[10px] font-semibold text-[var(--accent-primary)]">
                          {act.actionType.replace('_', ' ')}
                        </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {act.entityName}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          ({act.entityType})
                        </span>
                      </div>
                      <p className="text-[var(--text-secondary)]">{act.details}</p>
                    </div>
                    <div className="text-right font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                      <p>{act.actorName}</p>
                      <p>
                        {act.createdAt
                          ? new Date(act.createdAt).toLocaleString()
                          : 'Just now'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {totalActivityPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-xs">
                  <span className="text-[var(--text-muted)] font-mono-tabular">
                    Page {activityPage} of {totalActivityPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={activityPage <= 1}
                      onClick={() =>
                        setActivityPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={activityPage >= totalActivityPages}
                      onClick={() =>
                        setActivityPage((p) =>
                          Math.min(totalActivityPages, p + 1)
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DATA & PORTABILITY — EXPORT & IMPORT (Phase 10.1 & Phase 10.2) */}
      {vaultTab === 'data' && (
        <div className="space-y-5">
          {dataNotice && (
            <div className="p-3.5 bg-[#132A20] border border-[#10B981]/40 rounded-xl text-xs text-[#6EE7B7] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{dataNotice}</span>
            </div>
          )}

          {dataError && (
            <div className="p-3.5 bg-[#3A1820] border border-[#7F1D1D] rounded-xl text-xs text-[#FCA5A5] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{dataError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Phase 10.1 — Project Export Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="uppercase tracking-wider font-semibold text-[var(--accent-primary)]">
                    Phase 10.1 · Canon Export Suite
                  </span>
                  <span className="font-mono-tabular">Schema v2.0.0</span>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                  Export & Archive "{project.title}"
                </h2>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Download your entire universe as a structured JSON v2.0.0 archive (including all entities, nested hierarchies, directional relationships, lore chronicles, timeline events, naming rules, favorites, and custom AI instructions), a formatted Markdown Worldbuilding Bible, or a print-ready PDF report.
                </p>

                <div className="grid grid-cols-3 gap-2.5 pt-2 text-center text-xs">
                  <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                    <p className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {entities.length}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">Entities</p>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                    <p className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {relations.length}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">Relationships</p>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                    <p className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {loreEntries.length + timelineEvents.length}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">Lore & Epochs</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <Button variant="primary" size="sm" onClick={handleExportJson}>
                  <FileJson className="w-3.5 h-3.5" />
                  Export JSON Archive (.json)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportMarkdown}
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Export World Bible (.md)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrintReportOpen(true)}
                >
                  <Printer className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  Printable Report
                </Button>
              </div>
            </div>

            {/* Phase 10.2 — Project Import with Validation & Preview Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="uppercase tracking-wider font-semibold text-[var(--accent-primary)]">
                    Phase 10.2 · Validated Canon Import
                  </span>
                  <span className="font-mono-tabular">ID Safe-Remapping</span>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                  Import & Validate JSON Archive
                </h2>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Upload any NOMEN JSON export file. Every archive is validated against our strict Zod schema before committing. You can preview the contents and choose to either merge the imported canon into "{project.title}" or create a new isolated project universe.
                </p>

                <ul className="text-xs text-[var(--text-secondary)] space-y-1 pt-2">
                  <li>• Automatic ID remapping prevents overwriting existing records.</li>
                  <li>• Preserves nested parent-child location hierarchies and directional relationships.</li>
                  <li>• Inspect entity, relationship, lore, and timeline counts before confirming.</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleSelectImportFile}
                  className="hidden"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={Boolean(importingMode)}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Select JSON File to Validate & Preview
                </Button>
              </div>
            </div>
          </div>

          {/* Validated Import Preview Panel */}
          {importPreview && (
            <div className="bg-[var(--bg-surface)] border border-[var(--accent-primary)] rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <span className="text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    Schema v{importPreview.schemaVersion} Validated — Ready to Import
                  </span>
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display mt-0.5">
                    {importPreview.projectTitle} ({importPreview.genre} ·{' '}
                    {importPreview.language})
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportPreview(null)}
                  disabled={Boolean(importingMode)}
                >
                  Cancel Preview
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center text-xs">
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
                  <p className="text-[var(--text-muted)]">Saved Names</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(importingMode)}
                  onClick={() => handleExecuteImport('merge')}
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {importingMode === 'merge'
                    ? 'Merging Canon...'
                    : `Merge into "${project.title}"`}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={Boolean(importingMode)}
                  onClick={() => handleExecuteImport('new')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importingMode === 'new'
                    ? 'Creating Project...'
                    : 'Import as New Isolated Project'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Printable Worldbuilding Bible Modal */}
      <Modal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={`${project.title} — Printable Worldbuilding Report`}
        subtitle="Formatted canon report for browser printing or Save-as-PDF."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-5 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center justify-between p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
            <span>
              Use your browser print dialog (Ctrl+P / Cmd+P) to save as PDF.
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </Button>
          </div>

          <div className="p-5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                {project.title}
              </h3>
              <p className="text-[var(--text-secondary)]">
                {project.genre} · {project.language}
              </p>
              <p className="mt-2">{project.description}</p>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3">
              <h4 className="font-semibold text-[var(--text-primary)] mb-2">
                Canonical Entities ({entities.length})
              </h4>
              <div className="space-y-1.5">
                {entities.map((e) => (
                  <p key={e.id}>
                    <strong className="text-[var(--text-primary)]">{e.name}</strong> (
                    {e.subCategory || e.category}): {e.summary}
                  </p>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3">
              <h4 className="font-semibold text-[var(--text-primary)] mb-2">
                Lore Chronicles ({loreEntries.length})
              </h4>
              <div className="space-y-2">
                {loreEntries.map((l) => (
                  <div key={l.id}>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {l.title} ({l.category})
                    </p>
                    <p className="text-[var(--text-secondary)]">{l.summary || l.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3">
              <h4 className="font-semibold text-[var(--text-primary)] mb-2">
                Chronological Timeline ({timelineEvents.length})
              </h4>
              <div className="space-y-1">
                {timelineEvents.map((t) => (
                  <p key={t.id}>
                    <strong className="text-[var(--accent-primary)]">{t.dateLabel}</strong> —{' '}
                    <strong className="text-[var(--text-primary)]">{t.title}</strong>:{' '}
                    {t.description}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Version History Modal */}
      {versionTarget && (
        <VersionHistoryModal
          open={Boolean(versionTarget)}
          onClose={() => setVersionTarget(null)}
          projectId={project.id}
          entityId={versionTarget.id}
          entityType={versionTarget.type}
          entityName={versionTarget.name}
          currentSnapshot={versionTarget.snapshot}
          versions={versions}
        />
      )}

      {/* Confirm Permanent Delete Single Item Modal */}
      <ConfirmDeleteModal
        open={Boolean(permanentDeleteTarget)}
        onClose={() => setPermanentDeleteTarget(null)}
        onConfirm={async () => {
          if (!permanentDeleteTarget) return;
          await permanentlyDeleteTrashItem(permanentDeleteTarget.id);
          setPermanentDeleteTarget(null);
        }}
        title="Permanently Delete Item"
        description={`Are you sure you want to permanently purge "${permanentDeleteTarget?.entityName}" from Trash? This action cannot be undone.`}
      />

      {/* Confirm Purge All Trash Modal */}
      <ConfirmDeleteModal
        open={purgeAllModalOpen}
        onClose={() => setPurgeAllModalOpen(false)}
        onConfirm={handlePurgeAllTrash}
        loading={purgingAll}
        title="Empty Project Trash Permanently"
        description={`Are you sure you want to permanently purge all ${trashItems.length} soft-deleted items from Trash? This action cannot be undone.`}
      />
    </div>
  );
};
