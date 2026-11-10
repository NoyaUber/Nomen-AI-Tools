import {
  AssistantContextScope,
  ConsistencyFinding,
  NamingCandidate,
} from '../../types/nomen';

export interface AiStatusResponse {
  configured: boolean;
  provider: string;
  model: string;
  message: string;
}

async function postJson<T>(url: string, body: unknown, retries = 1): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('AI request failed');
}

export async function checkAiStatus(): Promise<AiStatusResponse> {
  const res = await fetch('/api/ai/status');
  if (!res.ok) {
    return {
      configured: false,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      message: 'Unable to reach AI status endpoint.',
    };
  }
  return res.json();
}

export async function generateNamesApi(payload: {
  category: string;
  count: number;
  projectContext?: {
    title?: string;
    genre?: string;
    worldSettings?: string;
    language?: string;
  };
  parameters: Record<string, string>;
  activeRules?: {
    title: string;
    cultureOrGroup: string;
    phoneticPattern: string;
    prefixSuffixRule: string;
    structureRule: string;
    examples: string;
  }[];
}): Promise<{
  candidates: NamingCandidate[];
  etymologyNote: string;
  modelUsed: string;
}> {
  return postJson('/api/ai/naming', payload);
}

export async function generateNameVariationsApi(payload: {
  baseName: string;
  category: string;
  inspiration: string;
  projectGenre?: string;
}): Promise<{
  candidates: NamingCandidate[];
  modelUsed: string;
}> {
  return postJson('/api/ai/naming/variations', payload);
}

export async function generateCharacterProfileApi(payload: {
  prompt: string;
  projectContext?: {
    title?: string;
    genre?: string;
    worldSettings?: string;
    language?: string;
  };
  activeRules?: string[];
}): Promise<{
  character: Record<string, string>;
  modelUsed: string;
}> {
  return postJson('/api/ai/character', payload);
}

export async function generateEntityBlueprintApi(payload: {
  category: 'location' | 'organization' | 'item' | 'ability' | 'lore';
  subCategory: string;
  prompt: string;
  projectContext?: {
    title?: string;
    genre?: string;
    worldSettings?: string;
  };
}): Promise<{
  result: Record<string, string>;
  modelUsed: string;
}> {
  return postJson('/api/ai/entity-assist', payload);
}

export async function askWritingAssistantApi(payload: {
  question: string;
  contextScope: AssistantContextScope;
  contextPayload: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<{
  reply: string;
  modelUsed: string;
}> {
  return postJson('/api/ai/assistant', payload);
}

export async function runConsistencyCheckApi(payload: {
  projectTitle: string;
  worldSettings: string;
  entities: {
    id: string;
    category: string;
    subCategory: string;
    name: string;
    subtitle: string;
    summary: string;
    parentId?: string;
    attributes?: Record<string, string>;
  }[];
  relations: {
    sourceEntityName: string;
    targetEntityName: string;
    relationType: string;
    description: string;
  }[];
  loreEntries: {
    title: string;
    category: string;
    era: string;
    summary: string;
  }[];
  timelineEvents: {
    title: string;
    dateLabel: string;
    sortOrder: number;
    era: string;
    locationName: string;
    participants: string;
    description: string;
  }[];
}): Promise<{
  findings: ConsistencyFinding[];
  summary: string;
  modelUsed: string;
}> {
  return postJson('/api/ai/consistency', payload);
}
