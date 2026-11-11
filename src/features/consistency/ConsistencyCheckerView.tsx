import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  EyeOff,
  FileText,
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
  ConsistencySeverity,
  EntityRelation,
  LoreEntry,
  Project,
  ProjectAiSetting,
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
  aiSettings?: ProjectAiSetting | null;
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
    label: 'Creative Possibility',
    colorClass: 'text-[var(--accent-primary)]',
    icon: <Lightbulb className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />,
  },
};

const SEVERITY_META: Record<
  ConsistencySeverity,
  { label: string; badgeClass: string }
> = {
  Critical: {
    label: 'Critical',
    badgeClass: 'bg-[#3A1820] text-[#FCA5A5] border-[#7F1D1D]',
  },
  critical: {
    label: 'Critical',
    badgeClass: 'bg-[#3A1820] text-[#FCA5A5] border-[#7F1D1D]',
  },
  Warning: {
    label: 'Warning',
    badgeClass: 'bg-[#2E2312] text-[#FDE68A] border-[#78350F]',
  },
  warning: {
    label: 'Warning',
    badgeClass: 'bg-[#2E2312] text-[#FDE68A] border-[#78350F]',
  },
  Information: {
    label: 'Information',
    badgeClass: 'bg-[#172136] text-[#BFDBFE] border-[#1E3A8A]',
  },
  information: {
    label: 'Information',
    badgeClass: 'bg-[#172136] text-[#BFDBFE] border-[#1E3A8A]',
  },
};

export const ConsistencyCheckerView: React.FC<ConsistencyCheckerViewProps> = ({
  project,
  entities,
  relations,
  loreEntries,
  timelineEvents,
  aiSettings = null,
}) => {
  const [aiFindings, setAiFindings] = useState<ConsistencyFinding[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | ConsistencyFindingType>(
    'all'
  );
  const [filterSeverity, setFilterSeverity] = useState<
    'all' | ConsistencySeverity
  >('all');
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  // Instant Structural & Relational Rule Checks with Severity & Evidence (Phase 8.2)
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
            severity: 'Information',
            title: `Unmapped Character Origin: "${origin}"`,
            involvedEntities: [char.name, origin],
            evidence: `Character Dossier "${char.name}" -> attributes.origin = "${origin}" (0 matching Location records in World Builder)`,
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
            severity: 'Critical',
            title: `Orphaned Parent Location Reference on "${loc.name}"`,
            involvedEntities: [loc.name],
            evidence: `Location "${loc.name}" (${loc.subCategory}) -> parentId="${loc.parentId}" does not match any active entity ID`,
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
          severity: 'Information',
          title: `Timeline Event References Unregistered Location "${loc}"`,
          involvedEntities: [evt.title, loc],
          evidence: `Timeline Event "${evt.title}" (${evt.dateLabel}) -> locationName = "${loc}"`,
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
            severity: 'Warning',
            title: `Artifact Owner "${owner}" Not Found in Character Roster`,
            involvedEntities: [item.name, owner],
            evidence: `Artifact "${item.name}" (${item.subCategory}) -> attributes.currentOwner = "${owner}"`,
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
            severity: 'Information',
            title: `Faction Leader "${leader}" Has No Character Profile`,
            involvedEntities: [org.name, leader],
            evidence: `Organization "${org.name}" (${org.subCategory}) -> attributes.leader = "${leader}"`,
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
          severity: 'Warning',
          title: `Chronological Epoch Index Collision (${evt.sortOrder})`,
          involvedEntities: [existing.title, evt.title],
          evidence: `Event "${existing.title}" (${existing.dateLabel}, sortOrder=${existing.sortOrder}) vs. Event "${evt.title}" (${evt.dateLabel}, sortOrder=${evt.sortOrder})`,
          explanation: `Timeline events "${existing.title}" (${existing.dateLabel}) and "${evt.title}" (${evt.dateLabel}) share the exact same numeric Sort Order (${evt.sortOrder}) despite having different date labels.`,
          recommendation: `Adjust the Epoch Index in the Chronological Timeline if one event occurred before the other.`,
        });
      } else {
        sortMap.set(evt.sortOrder, evt);
      }
    });

    // 7. Check conflicting alliance + enemy relationships between the same pair
    const pairMap = new Map<string, EntityRelation[]>();
    relations.forEach((r) => {
      const pairKey = [r.sourceEntityId, r.targetEntityId].sort().join('__');
      const arr = pairMap.get(pairKey) || [];
      arr.push(r);
      pairMap.set(pairKey, arr);
    });
    pairMap.forEach((rels) => {
      if (rels.length > 1) {
        const hasAlly = rels.some((r) =>
          r.relationType.toLowerCase().includes('allied')
        );
        const hasRival = rels.some(
          (r) =>
            r.relationType.toLowerCase().includes('enemy') ||
            r.relationType.toLowerCase().includes('rival') ||
            r.relationType.toLowerCase().includes('betrayed')
        );
        if (hasAlly && hasRival) {
          list.push({
            id: `local_rel_conflict_${rels[0].id}`,
            type: 'confirmed_conflict',
            severity: 'Critical',
            title: `Contradictory Relationship Ties: ${rels[0].sourceEntityName} & ${rels[0].targetEntityName}`,
            involvedEntities: [
              rels[0].sourceEntityName,
              rels[0].targetEntityName,
            ],
            evidence: rels
              .map(
                (r) =>
                  `${r.sourceEntityName} -> "${r.relationType}" -> ${r.targetEntityName}`
              )
              .join(' AND '),
            explanation: `Both an alliance and a hostile rivalry/betrayal are recorded simultaneously between ${rels[0].sourceEntityName} and ${rels[0].targetEntityName}.`,
            recommendation: `Clarify whether the alliance preceded the betrayal in the relationship notes or remove the outdated relation.`,
          });
        }
      }
    });

    return list;
  }, [entities, timelineEvents, relations]);

  const handleRunDeepAiAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runConsistencyCheckApi({
        projectTitle: project.title,
        worldSettings: project.worldSettings,
        customAiInstructions:
          aiSettings?.isEnabled && aiSettings.customInstructions
            ? aiSettings.customInstructions
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

  const handleCreateSuggestedEntity = async (finding: ExtendedFinding) => {
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

    setResolvedIds((prev) => [...prev, finding.id]);
    setCreatedNotice(
      `Created "${sug.name}" (${sug.subCategory}) in project canon and marked issue resolved.`
    );
    setTimeout(() => setCreatedNotice(null), 3500);
  };

  const allFindings: ExtendedFinding[] = [
    ...aiFindings,
    ...localFindings,
  ].filter(
    (f) => !dismissedIds.includes(f.id) && !resolvedIds.includes(f.id)
  );

  const visibleFindings = allFindings.filter((f) => {
    if (filterType !== 'all' && f.type !== filterType) return false;
    const sev = f.severity || 'Warning';
    if (filterSeverity !== 'all' && sev !== filterSeverity) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] font-serif-display">
            Worldbuilding Consistency & Continuity Checker
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Identify timeline contradictions, conflicting family allegiances, orphaned locations, and narrative possibilities with severity ratings and direct canon evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(dismissedIds.length > 0 || resolvedIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDismissedIds([]);
                setResolvedIds([]);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Dismissed/Resolved (
              {dismissedIds.length + resolvedIds.length})
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

      {/* Category & Severity Filter Bar */}
      <div className="bg-[var(--bg-surface)] p-4 border border-[var(--border-subtle)] rounded-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            Author-controlled continuity diagnostics
          </span>
        </div>

        {/* Severity Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">Severity Filter:</span>
            {(['all', 'Critical', 'Warning', 'Information'] as const).map(
              (sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(sev)}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                    filterSeverity === sev
                      ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {sev === 'all' ? 'All Severities' : sev}
                </button>
              )
            )}
          </div>

          <div className="text-xs text-[var(--text-muted)] font-mono-tabular">
            {resolvedIds.length} Resolved · {dismissedIds.length} Dismissed
          </div>
        </div>
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
        <div className="p-5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl space-y-1.5">
          <p className="text-xs font-semibold text-[var(--accent-primary)]">
            AI Continuity Auditor Summary
          </p>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{aiSummary}</p>
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
            const sev: ConsistencySeverity =
              f.severity ||
              (f.type === 'confirmed_conflict'
                ? 'Critical'
                : f.type === 'potential_inconsistency'
                ? 'Warning'
                : 'Information');
            const sevStyle = SEVERITY_META[sev];

            return (
              <div
                key={f.id}
                className="p-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{meta.icon}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${sevStyle.badgeClass}`}
                        >
                          {sevStyle.label}
                        </span>
                        <span className={`font-semibold ${meta.colorClass}`}>
                          {meta.label}
                        </span>
                        {f.involvedEntities.length > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-[var(--text-muted)]"
                            >
                              ·
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              Involved: {f.involvedEntities.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] font-serif-display mt-1">
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
                      variant="outline"
                      size="sm"
                      onClick={() => setResolvedIds((prev) => [...prev, f.id])}
                      title="Mark issue as resolved"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399]" />
                      Mark Resolved
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDismissedIds((prev) => [...prev, f.id])
                      }
                      title="Dismiss as intentional creative choice"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Supporting Canon Evidence */}
                {f.evidence && (
                  <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg flex items-start gap-2 text-xs font-mono-tabular text-[var(--text-secondary)]">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[var(--text-muted)]">
                        Supporting Canon Evidence:{' '}
                      </span>
                      <span className="text-[var(--text-primary)]">{f.evidence}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)] text-xs leading-relaxed">
                  <div>
                    <p className="text-[var(--text-muted)] font-medium mb-1">
                      Analysis & Context
                    </p>
                    <p className="text-[var(--text-secondary)]">{f.explanation}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)] font-medium mb-1">
                      Suggested Resolution (Author Decision)
                    </p>
                    <p className="text-[var(--text-primary)]">{f.recommendation}</p>
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
