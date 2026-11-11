import React, { useEffect, useMemo, useState } from 'react';
import {
  BookPlus,
  Check,
  Copy,
  MessageSquare,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AssistantContextScope,
  AssistantMessage,
  EntityRelation,
  LoreEntry,
  NamingRule,
  Project,
  ProjectAiSetting,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import { askWritingAssistantApi } from '../../lib/ai/client';
import {
  createEntity,
  createLoreEntry,
  recordAiGeneration,
  saveProjectAiSettings,
} from '../../lib/db/firestore-service';
import {
  Button,
  FieldLabel,
  Select,
  Textarea,
} from '../../components/ui/primitives';

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  entities: WorldEntity[];
  relations?: EntityRelation[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  namingRules?: NamingRule[];
  aiSettings?: ProjectAiSetting | null;
  focusedEntity: WorldEntity | null;
}

const DEFAULT_AI_INSTRUCTIONS = `Tone: Literary dark editorial fantasy with philological precision.
Naming Style: Respect active project naming conventions and cultural cadences.
World Rules: Maintain strict internal consistency with established geography, noble houses, and power limitations.
Forbidden Tropes: Avoid generic anachronisms, modern slang, or unrequested comic relief.`;

const QUICK_PROMPTS = [
  {
    category: 'Character Depth',
    prompt:
      'Suggest a compelling secret, hidden lineage twist, or internal contradiction for this character.',
  },
  {
    category: 'Political Intrigue',
    prompt:
      'Create a diplomatic crisis or succession conflict between two factions or realms in my project.',
  },
  {
    category: 'Artifact & Magic Lore',
    prompt:
      'Develop the ancient provenance, sacrificial toll, and forbidden history of a relic or power system.',
  },
  {
    category: 'Plot & Continuity',
    prompt:
      'Generate three dramatic plot hooks and identify any unexplored gaps in my existing lore and timeline.',
  },
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  open,
  onClose,
  project,
  entities,
  relations = [],
  loreEntries,
  timelineEvents,
  namingRules = [],
  aiSettings = null,
  focusedEntity,
}) => {
  const [contextScope, setContextScope] = useState<AssistantContextScope>(
    focusedEntity ? 'current_entity' : 'entire_project'
  );
  const [currentEntityId, setCurrentEntityId] = useState<string>(
    focusedEntity?.id || entities[0]?.id || ''
  );
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedLoreMsgId, setSavedLoreMsgId] = useState<string | null>(null);
  const [savedCharMsgId, setSavedCharMsgId] = useState<string | null>(null);

  // Phase 8.4 — Custom Project AI Instructions State
  const [showInstructionsConfig, setShowInstructionsConfig] = useState(false);
  const [customInstructionsText, setCustomInstructionsText] = useState(
    aiSettings?.customInstructions || DEFAULT_AI_INSTRUCTIONS
  );
  const [customInstructionsEnabled, setCustomInstructionsEnabled] = useState(
    aiSettings ? aiSettings.isEnabled : true
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedNotice, setSettingsSavedNotice] = useState(false);

  useEffect(() => {
    if (aiSettings) {
      setCustomInstructionsText(aiSettings.customInstructions);
      setCustomInstructionsEnabled(aiSettings.isEnabled);
    } else {
      setCustomInstructionsText(DEFAULT_AI_INSTRUCTIONS);
      setCustomInstructionsEnabled(false);
    }
  }, [aiSettings, project?.id]);

  useEffect(() => {
    if (focusedEntity) {
      setContextScope('current_entity');
      setCurrentEntityId(focusedEntity.id);
    }
  }, [focusedEntity]);

  /**
   * Phase 8.1 — Smart AI Context Retrieval
   * Scores and retrieves only the most relevant entities, family members,
   * naming conventions, relationships, lore, and timeline events for the query.
   */
  const computeSmartContextForQuery = (queryText: string) => {
    if (!project || contextScope === 'none') {
      return { payload: '', matchedSummary: 'Blank Slate (No Canon Injected)' };
    }

    const qLower = queryText.toLowerCase();
    const tokens = qLower
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);

    const scoreText = (text: string): number => {
      if (!text) return 0;
      const lower = text.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (lower.includes(tok)) score += 2;
      }
      return score;
    };

    const activeNamingConventions = namingRules
      .filter((r) => r.isActive)
      .map(
        (r) =>
          `${r.title} (${r.category}): ${r.phoneticPattern} — Examples: ${r.examples}`
      );

    if (contextScope === 'current_entity') {
      const target =
        entities.find((e) => e.id === currentEntityId) ||
        focusedEntity ||
        entities[0];
      if (!target) {
        return {
          payload: `Project: ${project.title} (${project.genre})`,
          matchedSummary: project.title,
        };
      }

      // Retrieve direct relationships & family members of the target entity
      const directRels = relations.filter(
        (r) =>
          r.sourceEntityId === target.id || r.targetEntityId === target.id
      );
      const connectedIds = new Set(
        directRels.map((r) =>
          r.sourceEntityId === target.id ? r.targetEntityId : r.sourceEntityId
        )
      );
      const lastName = target.attributes?.lastName?.toLowerCase() || '';
      const familyAndNeighbors = entities.filter(
        (e) =>
          e.id !== target.id &&
          (connectedIds.has(e.id) ||
            (lastName &&
              (e.name.toLowerCase().includes(lastName) ||
                e.attributes?.lastName?.toLowerCase() === lastName)))
      );

      const relatedLore = loreEntries
        .filter((l) =>
          (l.title + ' ' + l.summary + ' ' + l.content)
            .toLowerCase()
            .includes(target.name.toLowerCase())
        )
        .slice(0, 4);

      const relatedEvents = timelineEvents
        .filter((ev) =>
          (ev.title + ' ' + ev.participants + ' ' + ev.locationName)
            .toLowerCase()
            .includes(target.name.toLowerCase())
        )
        .slice(0, 5);

      return {
        payload: JSON.stringify(
          {
            project: {
              title: project.title,
              genre: project.genre,
              language: project.language,
              worldSettings: project.worldSettings,
            },
            focalEntity: {
              name: target.name,
              category: target.category,
              subCategory: target.subCategory,
              subtitle: target.subtitle,
              summary: target.summary,
              attributes: target.attributes,
            },
            relationships: directRels.map((r) => ({
              source: r.sourceEntityName,
              relation: r.relationType,
              target: r.targetEntityName,
              notes: r.description,
            })),
            relatedFamilyAndEntities: familyAndNeighbors.slice(0, 8).map((e) => ({
              name: e.name,
              role: e.subCategory,
              summary: e.summary,
            })),
            relevantLore: relatedLore.map((l) => ({
              title: l.title,
              era: l.era,
              summary: l.summary || l.content.slice(0, 260),
            })),
            relevantTimeline: relatedEvents.map((t) => ({
              date: t.dateLabel,
              title: t.title,
              description: t.description,
            })),
            namingConventions: activeNamingConventions,
          },
          null,
          2
        ),
        matchedSummary: `Focal: ${target.name} + ${directRels.length} links + ${familyAndNeighbors.length} kin/neighbors`,
      };
    }

    if (contextScope === 'selected_entities') {
      const chosen = entities.filter((e) => selectedEntityIds.includes(e.id));
      const chosenIds = new Set(chosen.map((c) => c.id));
      const relevantRels = relations.filter(
        (r) =>
          chosenIds.has(r.sourceEntityId) || chosenIds.has(r.targetEntityId)
      );

      return {
        payload: JSON.stringify(
          {
            project: {
              title: project.title,
              genre: project.genre,
              worldSettings: project.worldSettings,
            },
            selectedEntities: chosen.map((e) => ({
              name: e.name,
              category: e.category,
              subCategory: e.subCategory,
              summary: e.summary,
              attributes: e.attributes,
            })),
            interEntityRelations: relevantRels.map((r) => ({
              source: r.sourceEntityName,
              relation: r.relationType,
              target: r.targetEntityName,
              notes: r.description,
            })),
            namingConventions: activeNamingConventions,
          },
          null,
          2
        ),
        matchedSummary: `${chosen.length} selected entities + ${relevantRels.length} relationships`,
      };
    }

    // entire_project — Relevance-scored retrieval so we prioritize records matching the prompt
    const scoredEntities = [...entities]
      .map((ent) => ({
        ent,
        score:
          (ent.name.toLowerCase() && qLower.includes(ent.name.toLowerCase())
            ? 15
            : 0) +
          scoreText(
            `${ent.name} ${ent.subCategory} ${ent.subtitle} ${ent.summary} ${Object.values(
              ent.attributes || {}
            ).join(' ')}`
          ),
      }))
      .sort((a, b) => b.score - a.score);

    const topEntities = scoredEntities.slice(0, 18).map((x) => x.ent);
    const topIds = new Set(topEntities.map((e) => e.id));

    const scoredLore = [...loreEntries]
      .map((l) => ({
        l,
        score: scoreText(`${l.title} ${l.category} ${l.era} ${l.summary} ${l.content}`),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.l);

    const scoredEvents = [...timelineEvents]
      .map((t) => ({
        t,
        score: scoreText(
          `${t.title} ${t.dateLabel} ${t.era} ${t.locationName} ${t.participants} ${t.description}`
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.t);

    const relevantRelations = relations
      .filter(
        (r) => topIds.has(r.sourceEntityId) || topIds.has(r.targetEntityId)
      )
      .slice(0, 16);

    return {
      payload: JSON.stringify(
        {
          project: {
            title: project.title,
            genre: project.genre,
            language: project.language,
            description: project.description,
            worldSettings: project.worldSettings,
          },
          relevantEntities: topEntities.map((e) => ({
            name: e.name,
            category: e.category,
            subCategory: e.subCategory,
            subtitle: e.subtitle,
            summary: e.summary,
          })),
          relevantRelationships: relevantRelations.map((r) => ({
            source: r.sourceEntityName,
            relation: r.relationType,
            target: r.targetEntityName,
          })),
          relevantLore: scoredLore.map((l) => ({
            title: l.title,
            category: l.category,
            era: l.era,
            summary: l.summary || l.content.slice(0, 260),
          })),
          relevantTimeline: scoredEvents.map((t) => ({
            date: t.dateLabel,
            title: t.title,
            location: t.locationName,
            participants: t.participants,
            description: t.description,
          })),
          namingConventions: activeNamingConventions,
        },
        null,
        2
      ),
      matchedSummary: `Smart Retrieval: ${topEntities.length} entities, ${relevantRelations.length} links, ${scoredLore.length} lore, ${scoredEvents.length} events`,
    };
  };

  const previewContextMeta = useMemo(
    () => computeSmartContextForQuery(question),
    [
      question,
      contextScope,
      currentEntityId,
      selectedEntityIds,
      project,
      entities,
      relations,
      loreEntries,
      timelineEvents,
      namingRules,
    ]
  );

  if (!open) return null;

  const handleSaveCustomInstructions = async () => {
    if (!project) return;
    setSavingSettings(true);
    try {
      await saveProjectAiSettings(project.id, {
        customInstructions: customInstructionsText,
        isEnabled: customInstructionsEnabled,
      });
      setSettingsSavedNotice(true);
      setTimeout(() => setSettingsSavedNotice(false), 2500);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetDefaultInstructions = async () => {
    setCustomInstructionsText(DEFAULT_AI_INSTRUCTIONS);
    setCustomInstructionsEnabled(true);
    if (project) {
      await saveProjectAiSettings(project.id, {
        customInstructions: DEFAULT_AI_INSTRUCTIONS,
        isEnabled: true,
      });
    }
  };

  const handleSend = async (customQuestion?: string) => {
    const q = (customQuestion ?? question).trim();
    if (!q) return;

    const userMsg: AssistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: q,
      contextScope,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customQuestion) setQuestion('');
    setLoading(true);
    setError(null);

    try {
      const { payload } = computeSmartContextForQuery(q);
      const res = await askWritingAssistantApi({
        question: q,
        contextScope,
        contextPayload: payload,
        customAiInstructions:
          customInstructionsEnabled && customInstructionsText.trim()
            ? customInstructionsText.trim()
            : undefined,
        history: messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMsg: AssistantMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: res.reply,
        contextScope,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (project) {
        await recordAiGeneration({
          projectId: project.id,
          generationType: 'AI Assistant',
          category: contextScope,
          promptSummary: q.slice(0, 180),
          resultsSummary: res.reply.slice(0, 320),
          modelUsed: res.modelUsed,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Assistant request failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMessage = (msg: AssistantMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMsgId(msg.id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSaveReplyAsLore = async (msg: AssistantMessage) => {
    if (!project) return;
    const firstLine = msg.content
      .split('\n')[0]
      .replace(/^[#*\-\s]+/, '')
      .slice(0, 80);
    await createLoreEntry({
      projectId: project.id,
      title: firstLine || 'Editorial Assistant Lore Note',
      category: 'World History',
      era: 'Canonical Note',
      summary: `Synthesized via NOMEN Editorial Assistant (${msg.contextScope.replace(
        '_',
        ' '
      )})`,
      content: msg.content,
    });
    setSavedLoreMsgId(msg.id);
    setTimeout(() => setSavedLoreMsgId(null), 2500);
  };

  const handleSaveReplyAsCharacter = async (msg: AssistantMessage) => {
    if (!project) return;
    const nameMatch =
      msg.content.match(/(?:Nama Lengkap|Full Name|Name)\s*:\**\s*([^\n*(]+)/i) ||
      msg.content.match(/^#+\s*([^\n—-]+)/m);
    const extractedName = nameMatch?.[1]?.replace(/[*_]/g, '').trim() || 'New Assistant Character';
    const parts = extractedName.split(/\s+/);
    const firstName = parts[0] || extractedName;
    const lastName = parts.slice(1).join(' ');

    await createEntity({
      projectId: project.id,
      category: 'character',
      subCategory: 'Protagonist',
      name: extractedName.slice(0, 120),
      subtitle: 'Drafted via NOMEN Writing Assistant',
      summary: msg.content.slice(0, 1200),
      parentId: '',
      attributes: {
        firstName,
        lastName,
        storyRole: 'Protagonist',
        background: msg.content.slice(0, 3500),
      },
    });
    setSavedCharMsgId(msg.id);
    setTimeout(() => setSavedCharMsgId(null), 2500);
  };

  const toggleSelectEntity = (id: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <aside
      aria-label="Contextual AI Writing Assistant"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[460px] bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-4 h-4 text-[var(--accent-primary)]" />
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
              NOMEN Writing Assistant
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Smart Canon Retrieval · Custom Project AI Instructions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {project && (
            <button
              onClick={() => setShowInstructionsConfig((prev) => !prev)}
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                showInstructionsConfig || customInstructionsEnabled
                  ? 'text-[var(--accent-primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Configure Custom Project AI Instructions"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close AI Assistant"
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phase 8.4 — Custom Project AI Instructions Drawer */}
      {showInstructionsConfig && project && (
        <div className="p-4 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Custom Project AI Instructions
            </span>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={customInstructionsEnabled}
                onChange={(e) => setCustomInstructionsEnabled(e.target.checked)}
                className="accent-[var(--accent-primary)]"
              />
              <span>
                {customInstructionsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">
            Define tone, naming style, language preferences, world rules, and forbidden tropes for{' '}
            <strong className="text-[var(--text-primary)]">{project.title}</strong>:
          </p>

          <Textarea
            rows={4}
            value={customInstructionsText}
            onChange={(e) => setCustomInstructionsText(e.target.value)}
            placeholder="Define tone, naming style, world rules, forbidden tropes..."
            className="text-xs"
          />

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetDefaultInstructions}
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Default
            </Button>

            <div className="flex items-center gap-2">
              {settingsSavedNotice && (
                <span className="text-[11px] text-[#34D399] flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveCustomInstructions}
                disabled={savingSettings}
              >
                {savingSettings ? 'Saving...' : 'Save AI Instructions'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Context Scope Selector */}
      <div className="p-4 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] space-y-3">
        <div>
          <FieldLabel
            label="AI Reference Context Scope"
            hint="Smart relevance retrieval prevents token waste"
          />
          <Select
            value={contextScope}
            onChange={(e) =>
              setContextScope(e.target.value as AssistantContextScope)
            }
          >
            <option value="current_entity">
              Current Entity + Kin & Direct Links
            </option>
            <option value="selected_entities">Selected Entities Only</option>
            <option value="entire_project">
              Entire Project (Smart Relevance Ranked)
            </option>
            <option value="none">No Existing Context (Blank Slate)</option>
          </Select>
        </div>

        {contextScope === 'current_entity' && (
          <div>
            <FieldLabel label="Target Entity" />
            <Select
              value={currentEntityId}
              onChange={(e) => setCurrentEntityId(e.target.value)}
            >
              {entities.length === 0 && (
                <option value="">No entities in project</option>
              )}
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  [{ent.subCategory || ent.category}] {ent.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {contextScope === 'selected_entities' && (
          <div className="max-h-28 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-2 space-y-1 bg-[var(--bg-surface)]">
            {entities.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                No entities available to select.
              </p>
            ) : (
              entities.map((ent) => (
                <label
                  key={ent.id}
                  className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1 px-1.5 hover:bg-[var(--bg-elevated)] rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEntityIds.includes(ent.id)}
                    onChange={() => toggleSelectEntity(ent.id)}
                    className="accent-[var(--accent-primary)]"
                  />
                  <span className="truncate">
                    {ent.name}{' '}
                    <span className="text-[var(--text-muted)]">({ent.subCategory})</span>
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
          <span className="truncate">{previewContextMeta.matchedSummary}</span>
          {customInstructionsEnabled && (
            <span className="text-[var(--accent-primary)] shrink-0 ml-2">
              Custom Rules On
            </span>
          )}
        </div>
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Ask developmental questions about your worldbuilding, character motivations,
              political intrigue, or power mechanics. NOMEN automatically pulls relevant
              family members, naming rules, lore, and timeline events:
            </p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.prompt}
                  onClick={() => handleSend(qp.prompt)}
                  className="w-full text-left p-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg transition-colors cursor-pointer space-y-1"
                >
                  <span className="block text-[10px] font-semibold text-[var(--accent-primary)]">
                    {qp.category}
                  </span>
                  <span className="block">{qp.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3.5 rounded-xl text-xs leading-relaxed space-y-2 ${
                msg.role === 'user'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] ml-6 border border-[var(--accent-primary)]/30'
                  : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] mr-2 border border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>
                  {msg.role === 'user' ? 'Author' : 'NOMEN Editorial AI'}
                </span>
                <span>
                  Scope: {msg.contextScope.replace('_', ' ')} · {msg.timestamp}
                </span>
              </div>
              <div className="whitespace-pre-line">{msg.content}</div>

              {msg.role === 'assistant' && (
                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleCopyMessage(msg)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-elevated)] cursor-pointer"
                  >
                    {copiedMsgId === msg.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#34D399]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                  {project && (
                    <>
                      <button
                        onClick={() => handleSaveReplyAsCharacter(msg)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--accent-primary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-elevated)] cursor-pointer"
                      >
                        {savedCharMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-[#34D399]" />
                            Saved to Characters
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" />
                            Save as Character
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleSaveReplyAsLore(msg)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--accent-primary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-elevated)] cursor-pointer"
                      >
                        {savedLoreMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-[#34D399]" />
                            Saved to Lore
                          </>
                        ) : (
                          <>
                            <BookPlus className="w-3 h-3" />
                            Save as Lore
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="p-3.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-secondary)]">
            Retrieving relevant canon context and drafting response...
          </div>
        )}

        {error && (
          <div className="p-3 bg-[#3A1820] border border-[#7F1D1D] rounded-lg text-xs text-[#FCA5A5]">
            {error}
          </div>
        )}
      </div>

      {/* Input Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5"
      >
        <Textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your universe, characters, political conflicts, or lore..."
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--accent-primary)]" />
            Context: {contextScope.replace('_', ' ')}
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading || !question.trim()}
          >
            <Send className="w-3.5 h-3.5" />
            Send Inquiry
          </Button>
        </div>
      </form>
    </aside>
  );
};
