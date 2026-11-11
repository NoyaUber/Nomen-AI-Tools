import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Clock,
  Edit3,
  Filter,
  Link2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Move,
  Network,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  EntityCategory,
  EntityRelation,
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntityRelation,
  deleteEntityRelation,
  updateEntityRelation,
} from '../../lib/db/firestore-service';
import {
  Button,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui/primitives';

interface CanonGraphViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  onInspectEntityForAssistant: (entity: WorldEntity) => void;
  onNavigateToStudio: (tab: string) => void;
}

const CATEGORY_COLORS: Record<
  EntityCategory,
  { stroke: string; fill: string; text: string; label: string }
> = {
  character: {
    stroke: 'var(--accent-primary)',
    fill: '#1E1B38',
    text: '#DDD6FE',
    label: 'Character',
  },
  location: {
    stroke: '#6EE7B7',
    fill: '#112824',
    text: '#A7F3D0',
    label: 'Location',
  },
  organization: {
    stroke: '#FCD34D',
    fill: '#2B2313',
    text: '#FDE68A',
    label: 'Organization',
  },
  family: {
    stroke: '#FCD34D',
    fill: '#2B2313',
    text: '#FDE68A',
    label: 'Noble House',
  },
  item: {
    stroke: '#93C5FD',
    fill: '#152338',
    text: '#BFDBFE',
    label: 'Artifact / Item',
  },
  ability: {
    stroke: '#F9A8D4',
    fill: '#2E1629',
    text: '#FBCFE8',
    label: 'Power System',
  },
  species: {
    stroke: 'var(--accent-secondary)',
    fill: '#191E38',
    text: '#C7D2FE',
    label: 'Species',
  },
  civilization: {
    stroke: '#FCA5A5',
    fill: '#30171B',
    text: '#FECACA',
    label: 'Civilization',
  },
  custom: {
    stroke: 'var(--text-secondary)',
    fill: '#181C2B',
    text: 'var(--text-secondary)',
    label: 'Custom',
  },
};

const RELATION_ARCHETYPES = [
  'Allied With',
  'Rival / Enemy Of',
  'Sworn Member Of',
  'Ruler / Leader Of',
  'Born / Originated In',
  'Headquartered In',
  'Current Wielder Of',
  'Practitioner Of',
  'Blood Relative / Scion Of',
  'Mentor To',
  'Betrayed',
  'Vassal / Tributary Of',
];

export function CanonGraphView({
  project,
  entities,
  relations,
  loreEntries,
  timelineEvents,
  onInspectEntityForAssistant,
  onNavigateToStudio,
}: CanonGraphViewProps) {
  const [viewMode, setViewMode] = useState<
    'constellation' | 'ledger' | 'mentions'
  >('constellation');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [relationTypeFilter, setRelationTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    entities[0]?.id || null
  );

  // Interactive Zoom, Pan, Topology & Draggable Node State (Phase 9.1)
  const [topologyMode, setTopologyMode] = useState<'orbital' | 'clusters'>(
    'orbital'
  );
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [pinnedCoords, setPinnedCoords] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [pathTargetId, setPathTargetId] = useState<string>('');

  // Create / Edit Relation Modal State (Phase 9.3)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingRelationId, setEditingRelationId] = useState<string | null>(
    null
  );
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relationType, setRelationType] = useState('Allied With');
  const [relationDesc, setRelationDesc] = useState('');
  const [createInverse, setCreateInverse] = useState(false);
  const [inverseType, setInverseType] = useState('Allied With');
  const [relationError, setRelationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedEntity = useMemo(
    () =>
      entities.find((e) => e.id === selectedEntityId) ||
      entities[0] ||
      null,
    [entities, selectedEntityId]
  );

  const distinctRelationTypes = useMemo(() => {
    const set = new Set<string>();
    relations.forEach((r) => {
      if (r.relationType) set.add(r.relationType);
    });
    return Array.from(set).sort();
  }, [relations]);

  // Filtered Entities
  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          e.subtitle.toLowerCase().includes(q) ||
          e.subCategory.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entities, categoryFilter, searchQuery]);

  // Combine explicit EntityRelations + hierarchical parentId edges
  const combinedEdges = useMemo(() => {
    const entityIds = new Set(filteredEntities.map((e) => e.id));
    const edges: {
      id: string;
      sourceId: string;
      sourceName: string;
      targetId: string;
      targetName: string;
      label: string;
      description: string;
      isHierarchy: boolean;
    }[] = [];

    for (const rel of relations) {
      if (
        relationTypeFilter !== 'all' &&
        rel.relationType !== relationTypeFilter
      ) {
        continue;
      }
      if (
        entityIds.has(rel.sourceEntityId) &&
        entityIds.has(rel.targetEntityId)
      ) {
        edges.push({
          id: rel.id,
          sourceId: rel.sourceEntityId,
          sourceName: rel.sourceEntityName,
          targetId: rel.targetEntityId,
          targetName: rel.targetEntityName,
          label: rel.relationType,
          description: rel.description,
          isHierarchy: false,
        });
      }
    }

    if (
      relationTypeFilter === 'all' ||
      relationTypeFilter === 'Located Within'
    ) {
      for (const ent of filteredEntities) {
        if (ent.parentId && entityIds.has(ent.parentId)) {
          const parent = entities.find((p) => p.id === ent.parentId);
          if (parent) {
            edges.push({
              id: `hier_${ent.id}_${parent.id}`,
              sourceId: ent.id,
              sourceName: ent.name,
              targetId: parent.id,
              targetName: parent.name,
              label: 'Located Within',
              description: `Geographic hierarchy: ${ent.name} inside ${parent.name}`,
              isHierarchy: true,
            });
          }
        }
      }
    }

    return edges;
  }, [filteredEntities, relations, entities, relationTypeFilter]);

  // Compute Shortest Canon Path between selectedEntity and pathTargetId (Phase 9.1)
  const shortestCanonPath = useMemo(() => {
    if (!selectedEntity || !pathTargetId || selectedEntity.id === pathTargetId) {
      return null;
    }
    const adj = new Map<
      string,
      { neighborId: string; neighborName: string; edgeLabel: string; edgeId: string }[]
    >();
    combinedEdges.forEach((edge) => {
      const listA = adj.get(edge.sourceId) || [];
      listA.push({
        neighborId: edge.targetId,
        neighborName: edge.targetName,
        edgeLabel: `→ ${edge.label} →`,
        edgeId: edge.id,
      });
      adj.set(edge.sourceId, listA);

      const listB = adj.get(edge.targetId) || [];
      listB.push({
        neighborId: edge.sourceId,
        neighborName: edge.sourceName,
        edgeLabel: `← ${edge.label} ←`,
        edgeId: edge.id,
      });
      adj.set(edge.targetId, listB);
    });

    const queue: {
      currentId: string;
      steps: { fromName: string; edgeLabel: string; toName: string; edgeId: string }[];
      visitedIds: Set<string>;
    }[] = [
      {
        currentId: selectedEntity.id,
        steps: [],
        visitedIds: new Set([selectedEntity.id]),
      },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.currentId === pathTargetId) {
        return item;
      }
      if (item.steps.length >= 5) continue;
      const currentEnt = entities.find((e) => e.id === item.currentId);
      const neighbors = adj.get(item.currentId) || [];
      for (const n of neighbors) {
        if (!item.visitedIds.has(n.neighborId)) {
          const nextVisited = new Set(item.visitedIds);
          nextVisited.add(n.neighborId);
          queue.push({
            currentId: n.neighborId,
            steps: [
              ...item.steps,
              {
                fromName: currentEnt?.name || 'Entity',
                edgeLabel: n.edgeLabel,
                toName: n.neighborName,
                edgeId: n.edgeId,
              },
            ],
            visitedIds: nextVisited,
          });
        }
      }
    }
    return { currentId: pathTargetId, steps: [], visitedIds: new Set<string>() };
  }, [selectedEntity, pathTargetId, combinedEdges, entities]);

  const highlightedPathEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (shortestCanonPath && shortestCanonPath.steps.length > 0) {
      shortestCanonPath.steps.forEach((s) => set.add(s.edgeId));
    }
    return set;
  }, [shortestCanonPath]);

  // Compute 2D Constellation Node Coordinates (Focal Orbital OR Domain Clusters + Pinned Overrides)
  const graphLayout = useMemo(() => {
    const width = 860;
    const height = 540;
    const cx = width / 2;
    const cy = height / 2;

    if (filteredEntities.length === 0) {
      return { nodes: [], width, height, sectorCenters: [] };
    }

    const focal =
      filteredEntities.find((e) => e.id === selectedEntity?.id) ||
      filteredEntities[0];

    const neighborIds = new Set<string>();
    for (const edge of combinedEdges) {
      if (edge.sourceId === focal.id) neighborIds.add(edge.targetId);
      if (edge.targetId === focal.id) neighborIds.add(edge.sourceId);
    }

    if (topologyMode === 'clusters') {
      const sectorDefs: {
        key: string;
        label: string;
        cx: number;
        cy: number;
        color: string;
        match: (c: EntityCategory) => boolean;
      }[] = [
        {
          key: 'character',
          label: 'Characters',
          cx: 215,
          cy: 165,
          color: 'var(--accent-primary)',
          match: (c) => c === 'character',
        },
        {
          key: 'location',
          label: 'Locations',
          cx: 645,
          cy: 165,
          color: '#6EE7B7',
          match: (c) => c === 'location',
        },
        {
          key: 'organization',
          label: 'Factions & Houses',
          cx: 215,
          cy: 390,
          color: '#FCD34D',
          match: (c) => c === 'organization' || c === 'family',
        },
        {
          key: 'item',
          label: 'Artifacts & Relics',
          cx: 645,
          cy: 390,
          color: '#93C5FD',
          match: (c) => c === 'item',
        },
        {
          key: 'ability',
          label: 'Power Systems & Lore',
          cx: 430,
          cy: 275,
          color: '#F9A8D4',
          match: (c) =>
            c !== 'character' &&
            c !== 'location' &&
            c !== 'organization' &&
            c !== 'family' &&
            c !== 'item',
        },
      ];

      const nodes: {
        entity: WorldEntity;
        x: number;
        y: number;
        isFocal: boolean;
        isNeighbor: boolean;
        isPinned: boolean;
      }[] = [];

      sectorDefs.forEach((sec) => {
        const group = filteredEntities.filter((e) => sec.match(e.category));
        group.forEach((ent, idx) => {
          const pinned = pinnedCoords[ent.id];
          const radius = group.length === 1 ? 0 : Math.min(82, 34 + group.length * 8);
          const angle =
            (2 * Math.PI * idx) / Math.max(1, group.length) - Math.PI / 2;
          nodes.push({
            entity: ent,
            x: pinned ? pinned.x : sec.cx + radius * Math.cos(angle),
            y: pinned ? pinned.y : sec.cy + radius * Math.sin(angle),
            isFocal: ent.id === focal.id,
            isNeighbor: neighborIds.has(ent.id),
            isPinned: Boolean(pinned),
          });
        });
      });

      return {
        nodes,
        width,
        height,
        sectorCenters: sectorDefs,
      };
    }

    const innerRing = filteredEntities.filter(
      (e) => e.id !== focal.id && neighborIds.has(e.id)
    );
    const outerRing = filteredEntities.filter(
      (e) => e.id !== focal.id && !neighborIds.has(e.id)
    );

    const focalPinned = pinnedCoords[focal.id];
    const nodes: {
      entity: WorldEntity;
      x: number;
      y: number;
      isFocal: boolean;
      isNeighbor: boolean;
      isPinned: boolean;
    }[] = [
      {
        entity: focal,
        x: focalPinned ? focalPinned.x : cx,
        y: focalPinned ? focalPinned.y : cy,
        isFocal: true,
        isNeighbor: false,
        isPinned: Boolean(focalPinned),
      },
    ];

    const r1 = outerRing.length > 0 ? 155 : 195;
    innerRing.forEach((ent, idx) => {
      const pinned = pinnedCoords[ent.id];
      const angle =
        (2 * Math.PI * idx) / Math.max(1, innerRing.length) - Math.PI / 2;
      nodes.push({
        entity: ent,
        x: pinned ? pinned.x : cx + r1 * Math.cos(angle),
        y: pinned ? pinned.y : cy + r1 * Math.sin(angle),
        isFocal: false,
        isNeighbor: true,
        isPinned: Boolean(pinned),
      });
    });

    const r2 = 235;
    outerRing.forEach((ent, idx) => {
      const pinned = pinnedCoords[ent.id];
      const angle =
        (2 * Math.PI * idx) / Math.max(1, outerRing.length) - Math.PI / 4;
      nodes.push({
        entity: ent,
        x: pinned ? pinned.x : cx + r2 * Math.cos(angle),
        y: pinned ? pinned.y : cy + r2 * Math.sin(angle),
        isFocal: false,
        isNeighbor: false,
        isPinned: Boolean(pinned),
      });
    });

    return { nodes, width, height, sectorCenters: [] };
  }, [filteredEntities, selectedEntity, combinedEdges, topologyMode, pinnedCoords]);

  const nodeCoordsMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of graphLayout.nodes) {
      map.set(n.entity.id, { x: n.x, y: n.y });
    }
    return map;
  }, [graphLayout.nodes]);

  // Compute Implicit Canon Mentions for the Selected Entity
  const implicitMentions = useMemo(() => {
    if (!selectedEntity) {
      return { lore: [], events: [], otherEntities: [] };
    }
    const needle = selectedEntity.name.toLowerCase();

    const lore = loreEntries.filter(
      (l) =>
        l.title.toLowerCase().includes(needle) ||
        l.summary.toLowerCase().includes(needle) ||
        l.content.toLowerCase().includes(needle)
    );

    const events = timelineEvents.filter(
      (ev) =>
        ev.title.toLowerCase().includes(needle) ||
        ev.locationName.toLowerCase().includes(needle) ||
        ev.participants.toLowerCase().includes(needle) ||
        ev.description.toLowerCase().includes(needle)
    );

    const otherEntities = entities.filter((e) => {
      if (e.id === selectedEntity.id) return false;
      const inSummary = e.summary.toLowerCase().includes(needle);
      const inSubtitle = e.subtitle.toLowerCase().includes(needle);
      const inAttrs = Object.values(e.attributes || {}).some((val) =>
        String(val).toLowerCase().includes(needle)
      );
      return inSummary || inSubtitle || inAttrs;
    });

    return { lore, events, otherEntities };
  }, [selectedEntity, loreEntries, timelineEvents, entities]);

  const selectedEntityRelations = useMemo(() => {
    if (!selectedEntity) return [];
    return relations.filter(
      (r) =>
        r.sourceEntityId === selectedEntity.id ||
        r.targetEntityId === selectedEntity.id
    );
  }, [selectedEntity, relations]);

  const handleOpenCreateModal = (prefillSourceId?: string) => {
    const defaultSrc =
      prefillSourceId || selectedEntity?.id || entities[0]?.id || '';
    const defaultTgt =
      entities.find((e) => e.id !== defaultSrc)?.id || entities[0]?.id || '';
    setEditingRelationId(null);
    setSourceId(defaultSrc);
    setTargetId(defaultTgt);
    setRelationType('Allied With');
    setRelationDesc('');
    setCreateInverse(false);
    setInverseType('Allied With');
    setRelationError(null);
    setCreateModalOpen(true);
  };

  const handleOpenEditModal = (rel: EntityRelation) => {
    setEditingRelationId(rel.id);
    setSourceId(rel.sourceEntityId);
    setTargetId(rel.targetEntityId);
    setRelationType(rel.relationType);
    setRelationDesc(rel.description);
    setCreateInverse(false);
    setRelationError(null);
    setCreateModalOpen(true);
  };

  const handleSaveRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRelationError(null);
    if (!sourceId || !targetId || sourceId === targetId) {
      setRelationError('Source and Target must be two distinct entities.');
      return;
    }
    const srcEnt = entities.find((ent) => ent.id === sourceId);
    const tgtEnt = entities.find((ent) => ent.id === targetId);
    if (!srcEnt || !tgtEnt) return;

    const normalizedType = relationType.trim() || 'Connected To';

    // Phase 9.3 — Prevent duplicate relationships
    const duplicateExists = relations.some(
      (r) =>
        r.id !== editingRelationId &&
        r.sourceEntityId === srcEnt.id &&
        r.targetEntityId === tgtEnt.id &&
        r.relationType.toLowerCase() === normalizedType.toLowerCase()
    );
    if (duplicateExists) {
      setRelationError(
        `A "${normalizedType}" relationship from ${srcEnt.name} to ${tgtEnt.name} already exists.`
      );
      return;
    }

    setSaving(true);
    try {
      if (editingRelationId) {
        await updateEntityRelation(editingRelationId, {
          sourceEntityId: srcEnt.id,
          sourceEntityName: srcEnt.name,
          targetEntityId: tgtEnt.id,
          targetEntityName: tgtEnt.name,
          relationType: normalizedType,
          description: relationDesc.trim(),
        });
      } else {
        await createEntityRelation({
          projectId: project.id,
          sourceEntityId: srcEnt.id,
          sourceEntityName: srcEnt.name,
          targetEntityId: tgtEnt.id,
          targetEntityName: tgtEnt.name,
          relationType: normalizedType,
          description: relationDesc.trim(),
        });

        if (createInverse) {
          const invType = inverseType.trim() || normalizedType;
          const inverseDup = relations.some(
            (r) =>
              r.sourceEntityId === tgtEnt.id &&
              r.targetEntityId === srcEnt.id &&
              r.relationType.toLowerCase() === invType.toLowerCase()
          );
          if (!inverseDup) {
            await createEntityRelation({
              projectId: project.id,
              sourceEntityId: tgtEnt.id,
              sourceEntityName: tgtEnt.name,
              targetEntityId: srcEnt.id,
              targetEntityName: srcEnt.name,
              relationType: invType,
              description: relationDesc.trim(),
            });
          }
        }
      }

      setCreateModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const getStudioTabForCategory = (cat: EntityCategory): string => {
    if (cat === 'character') return 'characters';
    if (cat === 'location') return 'world';
    return 'studios';
  };

  // SVG Mouse Drag Handlers for Panning & Individual Node Pinning (Phase 9.1)
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNodeId) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNodeId) {
      const svgRect = e.currentTarget.getBoundingClientRect();
      if (svgRect.width > 0 && svgRect.height > 0) {
        const rawX =
          ((e.clientX - svgRect.left) / svgRect.width) * graphLayout.width;
        const rawY =
          ((e.clientY - svgRect.top) / svgRect.height) * graphLayout.height;
        const adjX =
          (rawX - graphLayout.width / 2 - pan.x) / zoom +
          graphLayout.width / 2;
        const adjY =
          (rawY - graphLayout.height / 2 - pan.y) / zoom +
          graphLayout.height / 2;
        setPinnedCoords((prev) => ({
          ...prev,
          [draggingNodeId]: {
            x: Math.max(40, Math.min(graphLayout.width - 40, adjX)),
            y: Math.max(40, Math.min(graphLayout.height - 40, adjY)),
          },
        }));
      }
      return;
    }
    if (!isDragging) return;
    setPan({
      x: Math.max(-280, Math.min(280, e.clientX - dragStart.x)),
      y: Math.max(-220, Math.min(220, e.clientY - dragStart.y)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingNodeId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>{project.title}</span>
            <span>·</span>
            <span>Connected Canon Constellation</span>
          </div>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Relationship Web & Cross-Reference Matrix
          </h1>
          <p className="text-xs text-[var(--text-secondary)] max-w-2xl">
            Visualize interpersonal alliances, feudal hierarchies, artifact ownership, and automatic cross-references across your lore archives and timeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1">
            <button
              onClick={() => setViewMode('constellation')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'constellation'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Constellation Web
            </button>
            <button
              onClick={() => setViewMode('ledger')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'ledger'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Relation Ledger ({relations.length})
            </button>
            <button
              onClick={() => setViewMode('mentions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'mentions'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Canon Cross-References
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenCreateModal()}
            disabled={entities.length < 2}
          >
            <Plus className="w-3.5 h-3.5" />
            Link Entities
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] mr-1" />
          {(
            [
              { id: 'all', label: `All Entities (${entities.length})` },
              { id: 'character', label: 'Characters' },
              { id: 'location', label: 'Locations' },
              { id: 'organization', label: 'Organizations' },
              { id: 'item', label: 'Artifacts' },
              { id: 'ability', label: 'Power Systems' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setCategoryFilter(f.id)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                categoryFilter === f.id
                  ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <Select
            value={relationTypeFilter}
            onChange={(e) => setRelationTypeFilter(e.target.value)}
            className="sm:w-52 text-xs py-1.5"
          >
            <option value="all">All Relationship Types</option>
            <option value="Located Within">Geographic Hierarchy</option>
            {distinctRelationTypes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </Select>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter nodes by name..."
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[#635E78] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>
      </div>

      {entities.length === 0 ? (
        <EmptyState
          title="No Canonical Entities Yet"
          description="Create characters, locations, organizations, or artifacts first to map their relationships."
          actionLabel="Open Character Studio"
          onAction={() => onNavigateToStudio('characters')}
        />
      ) : (
        <>
          {/* MODE 1: INTERACTIVE SVG CONSTELLATION WEB */}
          {viewMode === 'constellation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 8 Cols: Interactive SVG Canvas */}
              <div className="lg:col-span-8 rounded-xl overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                    <Network className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span>
                      Focal:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {selectedEntity?.name || 'None'}
                      </strong>
                    </span>
                    <span className="text-[#635E78] hidden sm:inline">·</span>
                    <div className="inline-flex rounded-md bg-[#141826] border border-[var(--border-subtle)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setTopologyMode('orbital')}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                          topologyMode === 'orbital'
                            ? 'bg-[#232A40] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        Focal Orbit
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopologyMode('clusters')}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                          topologyMode === 'clusters'
                            ? 'bg-[#232A40] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        Domain Clusters
                      </button>
                    </div>
                    <span className="text-[var(--text-muted)] hidden xl:inline">
                      Drag nodes to pin · Drag canvas to pan
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))
                      }
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-md cursor-pointer"
                      title="Zoom Out"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] px-1">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={() =>
                        setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))
                      }
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-md cursor-pointer"
                      title="Zoom In"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    {(zoom !== 1 ||
                      pan.x !== 0 ||
                      pan.y !== 0 ||
                      Object.keys(pinnedCoords).length > 0) && (
                      <button
                        onClick={() => {
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                          setPinnedCoords({});
                        }}
                        className="px-2 py-1 text-[11px] text-[var(--accent-primary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-md inline-flex items-center gap-1 cursor-pointer"
                        title="Reset Zoom, Pan & Pinned Nodes"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Layout
                      </button>
                    )}
                  </div>
                </div>

                {/* Shortest Canon Path Finder Strip (Phase 9.1) */}
                {entities.length >= 2 && selectedEntity && (
                  <div className="px-4 py-2.5 bg-[#101420] border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)]">
                        Trace Canon Path from{' '}
                        <strong className="text-[var(--text-primary)]">
                          {selectedEntity.name}
                        </strong>{' '}
                        to:
                      </span>
                      <select
                        value={pathTargetId}
                        onChange={(e) => setPathTargetId(e.target.value)}
                        className="bg-[#090B10] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      >
                        <option value="">-- Select Target Entity --</option>
                        {entities
                          .filter((e) => e.id !== selectedEntity.id)
                          .map((ent) => (
                            <option key={ent.id} value={ent.id}>
                              {ent.name} ({ent.subCategory || ent.category})
                            </option>
                          ))}
                      </select>
                    </div>

                    {shortestCanonPath && (
                      <div className="text-xs">
                        {shortestCanonPath.steps.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-[#A7F3D0]">
                            <span className="font-mono-tabular text-[11px] text-[#6EE7B7]">
                              {shortestCanonPath.steps.length} deg:
                            </span>
                            {shortestCanonPath.steps.map((step, i) => (
                              <React.Fragment key={step.edgeId}>
                                {i === 0 && (
                                  <span className="font-semibold text-[var(--text-primary)]">
                                    {step.fromName}
                                  </span>
                                )}
                                <span className="text-[var(--accent-primary)]">
                                  {step.edgeLabel}
                                </span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {step.toName}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">
                            No direct or transitive chain found in current filter.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="relative w-full overflow-hidden bg-[#090B10]">
                  <svg
                    viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className={`w-full h-[460px] select-none ${
                      isDragging || draggingNodeId
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                    }`}
                  >
                    <defs>
                      <radialGradient
                        id="constellationGlow"
                        cx="50%"
                        cy="50%"
                        r="50%"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--accent-primary)"
                          stopOpacity="0.14"
                        />
                        <stop
                          offset="100%"
                          stopColor="#090B10"
                          stopOpacity="0"
                        />
                      </radialGradient>
                    </defs>

                    <g
                      transform={`translate(${
                        graphLayout.width / 2 + pan.x
                      }, ${
                        graphLayout.height / 2 + pan.y
                      }) scale(${zoom}) translate(${-graphLayout.width / 2}, ${
                        -graphLayout.height / 2
                      })`}
                    >
                      {topologyMode === 'orbital' ? (
                        <>
                          {/* Subtle Orbital Guide Rings */}
                          <circle
                            cx={graphLayout.width / 2}
                            cy={graphLayout.height / 2}
                            r={220}
                            fill="url(#constellationGlow)"
                          />
                          <circle
                            cx={graphLayout.width / 2}
                            cy={graphLayout.height / 2}
                            r={155}
                            fill="none"
                            stroke="var(--border-subtle)"
                            strokeDasharray="3 6"
                          />
                          <circle
                            cx={graphLayout.width / 2}
                            cy={graphLayout.height / 2}
                            r={235}
                            fill="none"
                            stroke="var(--bg-elevated)"
                            strokeDasharray="2 8"
                          />
                        </>
                      ) : (
                        /* Domain Cluster Sector Rings */
                        graphLayout.sectorCenters.map((sec) => (
                          <g key={sec.key}>
                            <circle
                              cx={sec.cx}
                              cy={sec.cy}
                              r={92}
                              fill="#0D111C"
                              fillOpacity="0.55"
                              stroke={sec.color}
                              strokeOpacity="0.22"
                              strokeDasharray="4 6"
                            />
                            <text
                              x={sec.cx}
                              y={sec.cy - 98}
                              textAnchor="middle"
                              fill={sec.color}
                              fontSize="10"
                              fontWeight="600"
                              opacity="0.8"
                            >
                              {sec.label}
                            </text>
                          </g>
                        ))
                      )}

                      {/* Edges */}
                      {combinedEdges.map((edge) => {
                        const src = nodeCoordsMap.get(edge.sourceId);
                        const tgt = nodeCoordsMap.get(edge.targetId);
                        if (!src || !tgt) return null;

                        const isHighlightedPath = highlightedPathEdgeIds.has(
                          edge.id
                        );
                        const isConnectedToFocal =
                          isHighlightedPath ||
                          (selectedEntity &&
                            (edge.sourceId === selectedEntity.id ||
                              edge.targetId === selectedEntity.id));

                        const midX = (src.x + tgt.x) / 2;
                        const midY = (src.y + tgt.y) / 2;

                        return (
                          <g key={edge.id}>
                            <line
                              x1={src.x}
                              y1={src.y}
                              x2={tgt.x}
                              y2={tgt.y}
                              stroke={
                                isHighlightedPath
                                  ? '#34D399'
                                  : isConnectedToFocal
                                  ? edge.isHierarchy
                                    ? '#6EE7B7'
                                    : '#A78BFA'
                                  : 'var(--border-strong)'
                              }
                              strokeWidth={
                                isHighlightedPath
                                  ? 2.6
                                  : isConnectedToFocal
                                  ? 1.8
                                  : 1
                              }
                              strokeDasharray={
                                edge.isHierarchy ? '4 4' : undefined
                              }
                              opacity={
                                isHighlightedPath
                                  ? 1
                                  : isConnectedToFocal
                                  ? 0.9
                                  : 0.45
                              }
                            />
                            {isConnectedToFocal && (
                              <g transform={`translate(${midX}, ${midY})`}>
                                <rect
                                  x={-52}
                                  y={-9}
                                  width={104}
                                  height={18}
                                  rx={4}
                                  fill="#0E121D"
                                  stroke={
                                    isHighlightedPath ? '#34D399' : '#2A314A'
                                  }
                                />
                                <text
                                  textAnchor="middle"
                                  dy="3"
                                  fill={
                                    isHighlightedPath ? '#A7F3D0' : 'var(--accent-primary)'
                                  }
                                  fontSize="9.5"
                                >
                                  {edge.label.slice(0, 18)}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {/* Nodes */}
                      {graphLayout.nodes.map((node) => {
                        const style =
                          CATEGORY_COLORS[node.entity.category] ||
                          CATEGORY_COLORS.custom;
                        const radius = node.isFocal
                          ? 26
                          : node.isNeighbor
                          ? 19
                          : 15;

                        return (
                          <g
                            key={node.entity.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDraggingNodeId(node.entity.id);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntityId(node.entity.id);
                            }}
                            className="cursor-pointer group"
                          >
                            {node.isFocal && (
                              <circle
                                r={radius + 7}
                                fill="none"
                                stroke={style.stroke}
                                strokeWidth="1.2"
                                strokeDasharray="3 3"
                                opacity="0.65"
                              />
                            )}
                            <circle
                              r={radius}
                              fill={style.fill}
                              stroke={style.stroke}
                              strokeWidth={node.isFocal ? 2.4 : 1.5}
                            />
                            <text
                              textAnchor="middle"
                              dy="4"
                              fill={style.text}
                              fontSize={node.isFocal ? '12' : '10'}
                              fontWeight="600"
                            >
                              {node.entity.name
                                .split(' ')
                                .slice(0, 2)
                                .map((w) => w[0])
                                .join('')
                                .toUpperCase()}
                            </text>
                            <text
                              textAnchor="middle"
                              y={radius + 14}
                              fill={node.isFocal ? 'var(--text-primary)' : '#C5C0D8'}
                              fontSize={node.isFocal ? '11.5' : '10'}
                              fontWeight={node.isFocal ? '600' : '400'}
                            >
                              {node.entity.name.length > 22
                                ? `${node.entity.name.slice(0, 20)}…`
                                : node.entity.name}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>

                {/* Legend Footer */}
                <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
                  <div className="flex flex-wrap items-center gap-4">
                    {(
                      [
                        'character',
                        'location',
                        'organization',
                        'item',
                        'ability',
                      ] as const
                    ).map((cat) => (
                      <div key={cat} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{
                            backgroundColor: CATEGORY_COLORS[cat].fill,
                            border: `1.5px solid ${CATEGORY_COLORS[cat].stroke}`,
                          }}
                        />
                        <span>{CATEGORY_COLORS[cat].label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Solid Line: Explicit Relationship</span>
                    <span>·</span>
                    <span>Dashed Line: Geographic Hierarchy</span>
                  </div>
                </div>
              </div>

              {/* Right 4 Cols: Selected Node Dossier & Outgoing / Incoming Connections */}
              <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-5">
                {selectedEntity ? (
                  <>
                    <div className="space-y-1.5 border-b border-[var(--border-subtle)] pb-4">
                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                        <span>
                          {CATEGORY_COLORS[selectedEntity.category]?.label ||
                            selectedEntity.category}{' '}
                          · {selectedEntity.subCategory}
                        </span>
                        <button
                          onClick={() =>
                            onNavigateToStudio(
                              getStudioTabForCategory(selectedEntity.category)
                            )
                          }
                          className="text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          Open Studio →
                        </button>
                      </div>
                      <h2 className="text-2xl font-semibold text-[var(--text-primary)] font-serif-display">
                        {selectedEntity.name}
                      </h2>
                      {selectedEntity.subtitle && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          {selectedEntity.subtitle}
                        </p>
                      )}
                      {selectedEntity.summary && (
                        <p className="text-xs text-[var(--text-secondary)] pt-1 leading-relaxed">
                          {selectedEntity.summary}
                        </p>
                      )}

                      <div className="pt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleOpenCreateModal(selectedEntity.id)
                          }
                          disabled={entities.length < 2}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          Add Relationship
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onInspectEntityForAssistant(selectedEntity)
                          }
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Ask AI
                        </Button>
                      </div>
                    </div>

                    {/* Outgoing & Incoming Connections (Phase 9.3) */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Outgoing & Incoming Connections (
                        {selectedEntityRelations.length})
                      </h3>
                      {selectedEntityRelations.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No explicit links recorded for {selectedEntity.name}{' '}
                          yet.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {selectedEntityRelations.map((rel) => {
                            const isOutgoing =
                              rel.sourceEntityId === selectedEntity.id;
                            const otherId = isOutgoing
                              ? rel.targetEntityId
                              : rel.sourceEntityId;
                            const otherName = isOutgoing
                              ? rel.targetEntityName
                              : rel.sourceEntityName;

                            return (
                              <div
                                key={rel.id}
                                className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg flex items-start justify-between gap-2 text-xs"
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-[10px] font-mono-tabular uppercase px-1.5 py-0.5 rounded ${
                                        isOutgoing
                                          ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)]'
                                          : 'bg-[#132824] text-[#6EE7B7]'
                                      }`}
                                    >
                                      {isOutgoing ? 'Outgoing →' : '← Incoming'}
                                    </span>
                                    <span className="text-[var(--text-muted)]">
                                      {rel.relationType}:
                                    </span>
                                    <button
                                      onClick={() =>
                                        setSelectedEntityId(otherId)
                                      }
                                      className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-primary)] hover:underline truncate cursor-pointer"
                                    >
                                      {otherName}
                                    </button>
                                  </div>
                                  {rel.description && (
                                    <p className="text-[11px] text-[var(--text-muted)]">
                                      {rel.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleOpenEditModal(rel)}
                                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                    title="Edit relationship"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteEntityRelation(rel.id)}
                                    className="p-1 text-[var(--text-muted)] hover:text-[#FCA5A5] cursor-pointer"
                                    title="Remove relation"
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

                    {/* Implicit Canon Mentions Summary */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                          Automatic Canon Mentions
                        </h3>
                        <button
                          onClick={() => setViewMode('mentions')}
                          className="text-[11px] text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          Inspect All →
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                          <p className="text-sm font-semibold font-mono-tabular text-[var(--text-primary)]">
                            {implicitMentions.otherEntities.length}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">Dossiers</p>
                        </div>
                        <div className="p-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                          <p className="text-sm font-semibold font-mono-tabular text-[var(--text-primary)]">
                            {implicitMentions.lore.length}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            Chronicles
                          </p>
                        </div>
                        <div className="p-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg">
                          <p className="text-sm font-semibold font-mono-tabular text-[var(--text-primary)]">
                            {implicitMentions.events.length}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">Timeline</p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    Select a node on the constellation to inspect its relationships.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* MODE 2: FULL RELATIONSHIP LEDGER */}
          {viewMode === 'ledger' && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                    Canonical Relationship Ledger
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    All explicit directed ties across characters, factions, locations, relics, and abilities.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenCreateModal()}
                  disabled={entities.length < 2}
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Relation
                </Button>
              </div>

              {relations.length === 0 ? (
                <EmptyState
                  title="No Relationships Recorded"
                  description="Link characters to their noble houses, cities of origin, rivals, or signature artifacts."
                  actionLabel="Create First Relationship"
                  onAction={() => handleOpenCreateModal()}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                        <th className="py-2.5 px-3 font-medium">
                          Source Entity
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          Relationship Type
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          Target Entity
                        </th>
                        <th className="py-2.5 px-3 font-medium">Canon Notes</th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {relations.map((rel) => (
                        <tr key={rel.id} className="hover:bg-[var(--bg-elevated)]/60">
                          <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                            <button
                              onClick={() => {
                                setSelectedEntityId(rel.sourceEntityId);
                                setViewMode('constellation');
                              }}
                              className="hover:text-[var(--accent-primary)] hover:underline cursor-pointer"
                            >
                              {rel.sourceEntityName}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-[var(--accent-primary)] font-mono-tabular">
                            {rel.relationType}
                          </td>
                          <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                            <button
                              onClick={() => {
                                setSelectedEntityId(rel.targetEntityId);
                                setViewMode('constellation');
                              }}
                              className="hover:text-[var(--accent-primary)] hover:underline cursor-pointer"
                            >
                              {rel.targetEntityName}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-[var(--text-secondary)] max-w-md">
                            {rel.description || '—'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditModal(rel)}
                                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                title="Edit Relationship"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteEntityRelation(rel.id)}
                                className="p-1.5 text-[var(--text-muted)] hover:text-[#FCA5A5] cursor-pointer"
                                title="Delete Relationship"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MODE 3: AUTOMATIC CANON CROSS-REFERENCE INSPECTOR */}
          {viewMode === 'mentions' && (
            <div className="space-y-6">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display">
                      Canon Cross-Reference Concordance
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Select any entity to automatically scan every Character Dossier, Location Atlas, Lore Chronicle, and Timeline Event where it is referenced by name.
                    </p>
                  </div>

                  <div className="w-full sm:w-72">
                    <FieldLabel label="Inspect Entity" />
                    <Select
                      value={selectedEntity?.id || ''}
                      onChange={(e) => setSelectedEntityId(e.target.value)}
                    >
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.name} ({ent.subCategory || ent.category})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {selectedEntity && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-[var(--accent-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        Referenced in Entity Dossiers (
                        {implicitMentions.otherEntities.length})
                      </h3>
                      {implicitMentions.otherEntities.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No other entity dossiers mention &ldquo;
                          {selectedEntity.name}&rdquo; in their text fields yet.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {implicitMentions.otherEntities.map((ent) => (
                            <div
                              key={ent.id}
                              className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <button
                                  onClick={() => setSelectedEntityId(ent.id)}
                                  className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                                >
                                  {ent.name}
                                </button>
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {ent.subCategory}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                {ent.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-[#6EE7B7] uppercase tracking-wider flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5" />
                        Referenced in Lore Archives (
                        {implicitMentions.lore.length})
                      </h3>
                      {implicitMentions.lore.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No Lore Chronicles explicitly mention &ldquo;
                          {selectedEntity.name}&rdquo; yet.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {implicitMentions.lore.map((l) => (
                            <div
                              key={l.id}
                              className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {l.title}
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {l.category}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                {l.summary || l.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-[#FCD34D] uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Referenced in Timeline (
                        {implicitMentions.events.length})
                      </h3>
                      {implicitMentions.events.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No Timeline Events list &ldquo;
                          {selectedEntity.name}&rdquo; as a location or participant yet.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {implicitMentions.events.map((ev) => (
                            <div
                              key={ev.id}
                              className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {ev.title}
                                </span>
                                <span className="text-[11px] font-mono-tabular text-[var(--accent-primary)]">
                                  {ev.dateLabel}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                {ev.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Create or Edit Canonical Relationship */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={
          editingRelationId
            ? 'Edit Canonical Entity Relationship'
            : 'Establish Canonical Entity Relationship'
        }
      >
        <form onSubmit={handleSaveRelation} className="space-y-4">
          {relationError && (
            <div className="p-3 bg-[#3A1820] border border-[#7F1D1D] rounded-lg text-xs text-[#FCA5A5] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{relationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Source Entity" required />
              <Select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} ({ent.subCategory || ent.category})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <FieldLabel label="Target Entity" required />
              <Select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {entities
                  .filter((ent) => ent.id !== sourceId)
                  .map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.subCategory || ent.category})
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <FieldLabel label="Relationship Type" required />
              <Input
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
                placeholder="e.g., Sworn Vassal Of, Estranged Sibling, Wielder Of..."
                required
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RELATION_ARCHETYPES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRelationType(preset)}
                  className="px-2 py-0.5 text-[11px] bg-[var(--bg-elevated)] hover:bg-[#1E2538] text-[var(--text-secondary)] rounded border border-[var(--border-subtle)] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel label="Canon Context & History" />
            <Textarea
              value={relationDesc}
              onChange={(e) => setRelationDesc(e.target.value)}
              placeholder="Describe how these two entities are connected in your story..."
              rows={3}
            />
          </div>

          {!editingRelationId && (
            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg space-y-2">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={createInverse}
                  onChange={(e) => setCreateInverse(e.target.checked)}
                  className="rounded border-[var(--border-subtle)]"
                />
                <span>Also create inverse relationship (Target → Source)</span>
              </label>
              {createInverse && (
                <div>
                  <FieldLabel label="Inverse Relationship Label" />
                  <Input
                    value={inverseType}
                    onChange={(e) => setInverseType(e.target.value)}
                    placeholder="e.g., Liege Lord Of, Owned By..."
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                saving || !sourceId || !targetId || sourceId === targetId
              }
            >
              {saving
                ? 'Saving...'
                : editingRelationId
                ? 'Update Relationship'
                : 'Save Relationship'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
