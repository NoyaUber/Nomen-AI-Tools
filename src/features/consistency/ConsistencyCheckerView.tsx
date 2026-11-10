import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  EyeOff,
  HelpCircle,
  Lightbulb,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ConsistencyFinding,
  ConsistencyFindingType,
  EntityRelation,
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import { runConsistencyCheckApi } from '../../lib/ai/client';
import {
  createEntity,
  recordAiGeneration,
} from '../../lib/db/firestore-service';
import { Button, EmptyState } from '../../components/ui/primitives';

interface ConsistencyCheckerViewProps {
  project: Project;
  entities: WorldEntity[];
  relations: EntityRelation[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
}

interface ExtendedFinding extends ConsistencyFinding {
  missingEntitySuggestion?: {
    name: string;
    category: 'location' | 'character';
    subCategory: string;
    summary: string;
  };
}

const FINDING_META: Record<
  ConsistencyFindingType,
  { label: string; colorClass: string; icon: React.ReactNode }
> = {
  confirmed_conflict: {
    label: 'Confirmed Data Conflict',
    colorClass: 'text-[#F87171]',
    icon: <AlertCircle className="w-4 h-4 text-[#F87171] shrink-0" />,
  },
  potential_inconsistency: {
    label: 'Potential Inconsistency',
    colorClass: 'text-[#FBBF24]',
    icon: <AlertTriangle className="w-4 h-4 text-[#FBBF24] shrink-0" />,
  },
  missing_information: {
    label: 'Missing Information',
    colorClass: 'text-[#93C5FD]',
    icon: <HelpCircle className="w-4 h-4 text-[#93C5FD] shrink-0" />,
  },
  creative_possibility: {
    label: 'Creative Possibility (Author Confirmation)',
    colorClass: 'text-[#C4B5FD]',
    icon: <Lightbulb className="w-4 h-4 text-[#C4B5FD] shrink-0" />,
  },
};

export const ConsistencyCheckerView: React.FC<ConsistencyCheckerViewProps> = ({
  project,
  entities,
  relations,
  loreEntries,
  timelineEvents,
}) => {
  const [aiFindings, setAiFindings] = useState<ConsistencyFinding[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<
    'all' | ConsistencyFindingType
  >('all');
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  // Instant Structural & Relational Rule Checks
  const localFindings = useMemo<ExtendedFinding[]>(() => {
    const list: ExtendedFinding[] = [];
    const entityNamesLower = new Set(entities.map((e) => e.name.toLowerCase()));
    const entityIds = new Set(entities.map((e) => e.id));

    // 1. Check characters referencing origins that don't exist in locations
    entities
      .filter((e) => e.category === 'character')
      .forEach((char) => {
        const origin = char.attributes?.origin?.trim();
        if (origin && !entityNamesLower.has(origin.toLowerCase())) {
          list.push({
            id: `local_origin_${char.id}`,
            type: 'missing_information',
            title: `Unmapped Character Origin: "${origin}"`,
            involvedEntities: [char.name, origin],
            explanation: `Character "${char.name}" lists "${origin}" as their origin, but no Location entity with that exact name exists in the World Builder yet.`,
            recommendation: `Create "${origin}" in the World Builder or link it to an existing settlement if intentional.`,
            missingEntitySuggestion: {
              name: origin,
              category: 'location',
              subCategory: 'City',
              summary: `Homeland / origin of ${char.name}.`,
            },
          });
        }
      });

    // 2. Check locations with orphaned parentId
    entities
      .filter((e) => e.category === 'location' && e.parentId)
      .forEach((loc) => {
        if (!entityIds.has(loc.parentId)) {
          list.push({
            id: `local_parent_${loc.id}`,
            type: 'confirmed_conflict',
            title: `Orphaned Parent Location Reference on "${loc.name}"`,
            involvedEntities: [loc.name],
            explanation: `"${loc.name}" references a parent location ID that no longer exists in this project.`,
            recommendation: `Open "${loc.name}" in World Builder and assign a valid parent continent or kingdom.`,
          });
        }
      });

    // 3. Check timeline events referencing locations not in World Builder
    timelineEvents.forEach((evt) => {
      const loc = evt.locationName?.trim();
      if (loc && !entityNamesLower.has(loc.toLowerCase())) {
        list.push({
          id: `local_evt_loc_${evt.id}`,
          type: 'missing_information',
          title: `Timeline Event References Unregistered Location "${loc}"`,
          involvedEntities: [evt.title, loc],
          explanation: `Historical event "${evt.title}" (${evt.dateLabel}) takes place at "${loc}", which has no dedicated entry in the World Builder.`,
          recommendation: `Add "${loc}" to the World Builder if it is a significant setting.`,
          missingEntitySuggestion: {
            name: loc,
            category: 'location',
            subCategory: 'Region',
            summary: `Site of the historical event "${evt.title}" (${evt.dateLabel}).`,
          },
        });
      }
    });

    // 4. Check items with owners not in Character/Organization roster
    entities
      .filter((e) => e.category === 'item')
      .forEach((item) => {
        const owner = item.attributes?.currentOwner?.trim();
        if (owner && !entityNamesLower.has(owner.toLowerCase())) {
          list.push({
            id: `local_item_owner_${item.id}`,
            type: 'potential_inconsistency',
            title: `Artifact Owner "${owner}" Not Found in Character Roster`,
            involvedEntities: [item.name, owner],
            explanation: `Artifact "${item.name}" records "${owner}" as its current owner, which does not match any existing Character or Organization entity.`,
            recommendation: `Verify the spelling of "${owner}" or create a Character profile for them.`,
            missingEntitySuggestion: {
              name: owner,
              category: 'character',
              subCategory: 'Supporting Cast',
              summary: `Recorded wielder / custodian of the artifact "${item.name}".`,
            },
          });
        }
      });

    // 5. Check organizations with leaders not in Character roster
    entities
      .filter((e) => e.category === 'organization' || e.category === 'family')
      .forEach((org) => {
        const leader = org.attributes?.leader?.trim();
        if (
          leader &&
          !entityNamesLower.has(leader.toLowerCase()) &&
          !Array.from(entityNamesLower).some((n) =>
            leader.toLowerCase().includes(n)
          )
        ) {
          list.push({
            id: `local_org_leader_${org.id}`,
            type: 'missing_information',
            title: `Faction Leader "${leader}" Has No Character Profile`,
            involvedEntities: [org.name, leader],
            explanation: `"${org.name}" lists "${leader}" as its current leader, but no matching profile exists in the Character Studio.`,
            recommendation: `Create a Character Studio profile for "${leader}" if they appear in the narrative.`,
            missingEntitySuggestion: {
              name: leader,
              category: 'character',
              subCategory: 'Political Sovereign',
              summary: `Current leader of ${org.name}.`,
            },
          });
        }
      });

    // 6. Check timeline epoch index collisions with different date labels
    const sortMap = new Map<number, TimelineEvent>();
    timelineEvents.forEach((evt) => {
      const existing = sortMap.get(evt.sortOrder);
      if (existing && existing.dateLabel !== evt.dateLabel) {
        list.push({
          id: `local_epoch_collision_${existing.id}_${evt.id}`,
          type: 'potential_inconsistency',
          title: `Chronological Epoch Index Collision (${evt.sortOrder})`,
          involvedEntities: [existing.title, evt.title],
          explanation: `Timeline events "${existing.title}" (${existing.dateLabel}) and "${evt.title}" (${evt.dateLabel}) share the exact same numeric Sort Order (${evt.sortOrder}) despite having different date labels.`,
          recommendation: `Adjust the Epoch Index in the Chronological Timeline if one event occurred before the other.`,
        });
      } else {
        sortMap.set(evt.sortOrder, evt);
      }
    });

    return list;
  }, [entities, timelineEvents]);

  const handleRunDeepAiAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runConsistencyCheckApi({
        projectTitle: project.title,
        worldSettings: project.worldSettings,
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
          sourceEntityName: r.sourceEntityName,
          targetEntityName: r.targetEntityName,
          relationType: r.relationType,
          description: r.description,
        })),
        loreEntries: loreEntries.map((l) => ({
          title: l.title,
          category: l.category,
          era: l.era,
          summary: l.summary || l.content.slice(0, 400),
        })),
        timelineEvents: timelineEvents.map((t) => ({
          title: t.title,
          dateLabel: t.dateLabel,
          sortOrder: t.sortOrder,
          era: t.era,
          locationName: t.locationName,
          participants: t.participants,
          description: t.description,
        })),
      });

      setAiFindings(res.findings);
      setAiSummary(res.summary);

      await recordAiGeneration({
        projectId: project.id,
        generationType: 'Consistency Audit',
        category: 'Continuity Analysis',
        promptSummary: `Full canon audit across ${entities.length} entities, ${loreEntries.length} lore chronicles, and ${timelineEvents.length} timeline events`,
        resultsSummary: res.summary,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Consistency audit failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuggestedEntity = async (
    finding: ExtendedFinding
  ) => {
    const sug = finding.missingEntitySuggestion;
    if (!sug) return;

    await createEntity({
      projectId: project.id,
      category: sug.category,
      subCategory: sug.subCategory,
      name: sug.name,
      subtitle: `${sug.subCategory} · Registered from Continuity Audit`,
      summary: sug.summary,
      parentId: '',
      attributes:
        sug.category === 'character'
          ? { storyRole: sug.subCategory, background: sug.summary }
          : { history: sug.summary },
    });

    setCreatedNotice(
      `Created "${sug.name}" (${sug.subCategory}) in project canon.`
    );
    setTimeout(() => setCreatedNotice(null), 3500);
  };

  const allFindings: ExtendedFinding[] = [
    ...aiFindings,
    ...localFindings,
  ].filter((f) => !dismissedIds.includes(f.id));

  const visibleFindings =
    filterType === 'all'
      ? allFindings
      : allFindings.filter((f) => f.type === filterType);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            Worldbuilding Consistency & Continuity Checker
          </h1>
          <p className="text-sm text-[#8E89A6] mt-0.5">
            Identify timeline contradictions, conflicting family allegiances, orphaned locations, and narrative possibilities. NOMEN never overwrites your canon automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dismissedIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissedIds([])}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Dismissed ({dismissedIds.length})
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleRunDeepAiAudit}
            disabled={loading}
          >
            <Sparkles className="w-4 h-4" />
            {loading
              ? 'Analyzing Project Canon...'
              : 'Run Deep AI Continuity Audit'}
          </Button>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111520] p-4 border border-[#1E2436] rounded-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `All Findings (${allFindings.length})` },
              {
                id: 'confirmed_conflict',
                label: `Confirmed Conflicts (${
                  allFindings.filter((f) => f.type === 'confirmed_conflict')
                    .length
                })`,
              },
              {
                id: 'potential_inconsistency',
                label: `Potential Inconsistencies (${
                  allFindings.filter(
                    (f) => f.type === 'potential_inconsistency'
                  ).length
                })`,
              },
              {
                id: 'missing_information',
                label: `Missing Information (${
                  allFindings.filter((f) => f.type === 'missing_information')
                    .length
                })`,
              },
              {
                id: 'creative_possibility',
                label: `Creative Possibilities (${
                  allFindings.filter((f) => f.type === 'creative_possibility')
                    .length
                })`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filterType === tab.id
                  ? 'bg-[#1D2336] text-[#F3F1FA]'
                  : 'text-[#8E89A6] hover:text-[#ECEAF2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-[#736E8A] flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#8B7EC8]" />
          Author-controlled continuity diagnostics
        </span>
      </div>

      {createdNotice && (
        <div className="p-3.5 bg-[#132A20] border border-[#10B981]/40 rounded-xl text-xs text-[#6EE7B7] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{createdNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#3A1820] border border-[#7F1D1D] rounded-xl text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {aiSummary && (
        <div className="p-5 bg-[#111520] border border-[#262D42] rounded-xl space-y-1.5">
          <p className="text-xs font-semibold text-[#C4B5FD]">
            AI Continuity Auditor Summary
          </p>
          <p className="text-sm text-[#E4E1EE] leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {visibleFindings.length === 0 ? (
        <EmptyState
          title="No Continuity Conflicts Detected in Current Filter"
          description="Your structural references are clean. Click 'Run Deep AI Continuity Audit' above to analyze timeline dates, character ages, artifact ownership, and lore chronicles with AI."
          actionLabel="Run Deep AI Continuity Audit"
          onAction={handleRunDeepAiAudit}
        />
      ) : (
        <div className="space-y-4">
          {visibleFindings.map((f) => {
            const meta =
              FINDING_META[f.type] || FINDING_META.potential_inconsistency;
            return (
              <div
                key={f.id}
                className="p-5 bg-[#111520] border border-[#1E2436] rounded-xl space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{meta.icon}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`font-semibold ${meta.colorClass}`}>
                          {meta.label}
                        </span>
                        {f.involvedEntities.length > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-[#68647D]"
                            >
                              ·
                            </span>
                            <span className="text-[#9D97B8]">
                              Involved: {f.involvedEntities.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-[#F3F1FA] font-serif-display mt-1">
                        {f.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {f.missingEntitySuggestion && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCreateSuggestedEntity(f)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create &ldquo;{f.missingEntitySuggestion.name}&rdquo;
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDismissedIds((prev) => [...prev, f.id])
                      }
                      title="Mark as intentional creative choice"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Mark Intentional
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#1A2030] text-xs leading-relaxed">
                  <div>
                    <p className="text-[#736E8A] font-medium mb-1">
                      Analysis & Context
                    </p>
                    <p className="text-[#D0CCE0]">{f.explanation}</p>
                  </div>
                  <div>
                    <p className="text-[#736E8A] font-medium mb-1">
                      Editorial Recommendation (Author Decision)
                    </p>
                    <p className="text-[#E4E1EE]">{f.recommendation}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
