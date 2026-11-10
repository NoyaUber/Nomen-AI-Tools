import React, { useState } from 'react';
import {
  BookPlus,
  Check,
  Copy,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AssistantContextScope,
  AssistantMessage,
  LoreEntry,
  Project,
  TimelineEvent,
  WorldEntity,
} from '../../types/nomen';
import { askWritingAssistantApi } from '../../lib/ai/client';
import {
  createLoreEntry,
  recordAiGeneration,
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
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  focusedEntity: WorldEntity | null;
}

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
  loreEntries,
  timelineEvents,
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

  React.useEffect(() => {
    if (focusedEntity) {
      setContextScope('current_entity');
      setCurrentEntityId(focusedEntity.id);
    }
  }, [focusedEntity]);

  if (!open) return null;

  const buildContextPayload = (): string => {
    if (!project || contextScope === 'none') return '';

    if (contextScope === 'current_entity') {
      const target =
        entities.find((e) => e.id === currentEntityId) ||
        focusedEntity ||
        entities[0];
      if (!target) return `Project: ${project.title} (${project.genre})`;
      return JSON.stringify(
        {
          project: { title: project.title, genre: project.genre },
          currentEntity: {
            name: target.name,
            category: target.category,
            subCategory: target.subCategory,
            subtitle: target.subtitle,
            summary: target.summary,
            attributes: target.attributes,
          },
        },
        null,
        2
      );
    }

    if (contextScope === 'selected_entities') {
      const chosen = entities.filter((e) => selectedEntityIds.includes(e.id));
      return JSON.stringify(
        {
          project: { title: project.title, genre: project.genre },
          selectedEntities: chosen.map((e) => ({
            name: e.name,
            category: e.category,
            subCategory: e.subCategory,
            summary: e.summary,
            attributes: e.attributes,
          })),
        },
        null,
        2
      );
    }

    // entire_project
    return JSON.stringify(
      {
        project: {
          title: project.title,
          genre: project.genre,
          description: project.description,
          worldSettings: project.worldSettings,
        },
        entities: entities.slice(0, 30).map((e) => ({
          name: e.name,
          category: e.category,
          subCategory: e.subCategory,
          subtitle: e.subtitle,
          summary: e.summary,
        })),
        loreChronicles: loreEntries.slice(0, 12).map((l) => ({
          title: l.title,
          category: l.category,
          era: l.era,
          summary: l.summary || l.content.slice(0, 300),
        })),
        timeline: timelineEvents.slice(0, 15).map((t) => ({
          date: t.dateLabel,
          title: t.title,
          description: t.description,
        })),
      },
      null,
      2
    );
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
      const payload = buildContextPayload();
      const res = await askWritingAssistantApi({
        question: q,
        contextScope,
        contextPayload: payload,
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

  const toggleSelectEntity = (id: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <aside
      aria-label="Contextual AI Writing Assistant"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[440px] bg-[#111520] border-l border-[#23293B] shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1E2436] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-4 h-4 text-[#C4B5FD]" />
          <div>
            <h2 className="text-base font-semibold text-[#F3F1FA] font-serif-display">
              NOMEN Writing Assistant
            </h2>
            <p className="text-[11px] text-[#8E89A6]">
              Controlled context scope · Author retains full control
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1.5 text-[#8E89A6] hover:text-[#ECEAF2] rounded-lg cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close AI Assistant"
            className="p-1.5 text-[#8E89A6] hover:text-[#ECEAF2] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Scope Selector */}
      <div className="p-4 bg-[#0D1018] border-b border-[#1E2436] space-y-3">
        <div>
          <FieldLabel
            label="AI Reference Context Scope"
            hint="Prevents unrelated data injection"
          />
          <Select
            value={contextScope}
            onChange={(e) =>
              setContextScope(e.target.value as AssistantContextScope)
            }
          >
            <option value="current_entity">Current Entity Only</option>
            <option value="selected_entities">Selected Entities Only</option>
            <option value="entire_project">Entire Active Project</option>
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
          <div className="max-h-28 overflow-y-auto border border-[#23293B] rounded-lg p-2 space-y-1 bg-[#111520]">
            {entities.length === 0 ? (
              <p className="text-xs text-[#736E8A]">
                No entities available to select.
              </p>
            ) : (
              entities.map((ent) => (
                <label
                  key={ent.id}
                  className="flex items-center gap-2 text-xs text-[#D0CCE0] py-1 px-1.5 hover:bg-[#171C2B] rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEntityIds.includes(ent.id)}
                    onChange={() => toggleSelectEntity(ent.id)}
                    className="accent-[#7C6CC4]"
                  />
                  <span className="truncate">
                    {ent.name}{' '}
                    <span className="text-[#736E8A]">({ent.subCategory})</span>
                  </span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-xs text-[#A39EBA] leading-relaxed">
              Ask developmental questions about your worldbuilding, character motivations,
              political intrigue, or power mechanics. Select a starter inquiry below or write your own:
            </p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.prompt}
                  onClick={() => handleSend(qp.prompt)}
                  className="w-full text-left p-3 text-xs text-[#D0CCE0] bg-[#161B28] hover:bg-[#1D2336] border border-[#23293B] rounded-lg transition-colors cursor-pointer space-y-1"
                >
                  <span className="block text-[10px] font-semibold text-[#C4B5FD]">
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
                  ? 'bg-[#1D2336] text-[#F3F1FA] ml-6 border border-[#8B7EC8]/30'
                  : 'bg-[#0D1018] text-[#D0CCE0] mr-2 border border-[#1E2436]'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-[#736E8A]">
                <span>
                  {msg.role === 'user' ? 'Author' : 'NOMEN Editorial AI'}
                </span>
                <span>
                  Scope: {msg.contextScope.replace('_', ' ')} · {msg.timestamp}
                </span>
              </div>
              <div className="whitespace-pre-line">{msg.content}</div>

              {msg.role === 'assistant' && (
                <div className="pt-2 border-t border-[#1A2030] flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleCopyMessage(msg)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#9D97B8] hover:text-[#F3F1FA] rounded hover:bg-[#161B28] cursor-pointer"
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
                    <button
                      onClick={() => handleSaveReplyAsLore(msg)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#C4B5FD] hover:text-[#F3F1FA] rounded hover:bg-[#161B28] cursor-pointer"
                    >
                      {savedLoreMsgId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-[#34D399]" />
                          Saved to Lore Chronicles
                        </>
                      ) : (
                        <>
                          <BookPlus className="w-3 h-3" />
                          Save as Lore Chronicle
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="p-3.5 bg-[#0D1018] border border-[#1E2436] rounded-xl text-xs text-[#9D97B8]">
            Consulting project context and drafting response...
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
        className="p-4 border-t border-[#1E2436] bg-[#0D1018] space-y-2.5"
      >
        <Textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your universe, characters, political conflicts, or lore..."
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#736E8A] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#C4B5FD]" />
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
