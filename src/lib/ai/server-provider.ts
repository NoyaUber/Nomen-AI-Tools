import { GoogleGenAI, Schema, ThinkingLevel } from '@google/genai';

export interface AiProviderStatus {
  configured: boolean;
  provider: string;
  model: string;
  hasGeminiFallback: boolean;
  message: string;
}

const GEMINI_LITE_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

// Track models that hit a 429 quota limit so we skip them during their cooldown window
const modelCooldownUntil = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms waiting for ${label}`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function isValidKey(key: string | undefined): key is string {
  return Boolean(
    key &&
      key.trim().length > 0 &&
      key !== 'MY_GEMINI_API_KEY' &&
      key !== 'YOUR_API_KEY'
  );
}

function isGeminiModelName(model: string | undefined): boolean {
  if (!model) return false;
  const m = model.trim().toLowerCase();
  return m.startsWith('gemini-') && !m.includes('/');
}

export function formatCleanAiError(rawError: unknown): string {
  const raw = rawError instanceof Error ? rawError.message : String(rawError);
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('"code":429')) {
    return 'Kuota harian gratis (Free Tier 20 request/hari) untuk model Gemini telah habis atau sedang sibuk (503). Anda dapat memilih API key dengan billing aktif di panel Settings > Secrets untuk kuota lebih tinggi.';
  }
  if (raw.includes('UNAVAILABLE') || raw.includes('"code":503')) {
    return 'Server AI sedang mengalami lonjakan trafik sementara (503 High Demand). Silakan coba lagi dalam beberapa saat.';
  }
  return raw.slice(0, 280);
}

export function getAiProviderStatus(): AiProviderStatus {
  const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const aiApiKey = process.env.AI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const aiModel = process.env.AI_MODEL;

  const hasCustomProviderKey = isValidKey(aiApiKey);
  const hasGeminiKey = isValidKey(geminiKey);

  if (
    (aiProvider === 'openrouter' || aiProvider === 'openai' || process.env.AI_BASE_URL) &&
    hasCustomProviderKey
  ) {
    const model = aiModel || 'openrouter/auto';
    return {
      configured: true,
      provider: aiProvider,
      model,
      hasGeminiFallback: hasGeminiKey,
      message: `Connected to ${aiProvider} (${model})${
        hasGeminiKey ? ' with Gemini fallback enabled' : ''
      }`,
    };
  }

  if (hasGeminiKey || hasCustomProviderKey) {
    const resolvedGeminiModel = isGeminiModelName(aiModel)
      ? aiModel!
      : GEMINI_LITE_MODEL;
    return {
      configured: true,
      provider: 'gemini',
      model: resolvedGeminiModel,
      hasGeminiFallback: true,
      message: `Connected to Gemini (${resolvedGeminiModel})`,
    };
  }

  return {
    configured: false,
    provider: aiProvider,
    model: aiModel || GEMINI_LITE_MODEL,
    hasGeminiFallback: false,
    message:
      'AI provider is not configured. Please set GEMINI_API_KEY or AI_API_KEY in Settings > Secrets.',
  };
}

function extractJsonFromText(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function callOpenAiCompatible(params: {
  prompt: string;
  systemInstruction: string;
  jsonMode: boolean;
  jsonInstruction?: string;
}): Promise<{ text: string; modelUsed: string }> {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!isValidKey(apiKey)) {
    throw new Error('Missing AI_API_KEY for custom AI provider.');
  }

  const rawBaseUrl = (
    process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1'
  ).replace(/\/+$/, '');
  const endpoint = rawBaseUrl.endsWith('/chat/completions')
    ? rawBaseUrl
    : `${rawBaseUrl}/chat/completions`;

  const requestedModel = process.env.AI_MODEL || 'openrouter/auto';
  const candidateModels = [
    requestedModel,
    'openrouter/free',
    'openrouter/auto',
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  let lastError: Error | null = null;

  for (const modelName of candidateModels) {
    try {
      const sysContent = params.jsonMode
        ? `${params.systemInstruction}\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object. Do not include markdown explanations outside the JSON.${
            params.jsonInstruction ? `\nRequired JSON structure:\n${params.jsonInstruction}` : ''
          }`
        : params.systemInstruction;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://nomen.studio',
          'X-Title': 'NOMEN AI Worldbuilding Studio',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: sysContent },
            { role: 'user', content: params.prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg =
          data?.error?.message ||
          JSON.stringify(data?.error || data) ||
          `HTTP ${response.status}`;
        throw new Error(`Provider error (${modelName}): ${errMsg}`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error(`Empty response from model ${modelName}`);
      }

      return {
        text: params.jsonMode ? extractJsonFromText(content) : content.trim(),
        modelUsed: data?.model || modelName,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('OpenAI-compatible provider request failed.');
}

async function callGeminiSdk(params: {
  prompt: string;
  systemInstruction: string;
  responseMimeType?: string;
  responseSchema?: Schema;
  jsonInstruction?: string;
}): Promise<{ text: string; modelUsed: string }> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!isValidKey(geminiKey)) {
    throw new Error(
      'AI provider is not configured. Please ensure GEMINI_API_KEY is configured in the AI Studio Secrets panel.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const envModel = process.env.AI_MODEL;
  // Put gemini-3.1-flash-lite first when gemini-3.8-flash is on quota cooldown, and retry 503 spikes
  const allCandidates = [
    ...(isGeminiModelName(envModel) ? [envModel!] : []),
    GEMINI_LITE_MODEL,
    GEMINI_DEFAULT_MODEL,
    GEMINI_FALLBACK_MODEL,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const now = Date.now();
  const activeModels = allCandidates.filter(
    (m) => (modelCooldownUntil.get(m) || 0) < now
  );
  const modelsToTry = activeModels.length > 0 ? activeModels : [GEMINI_LITE_MODEL];

  const errors: string[] = [];
  let lastErr: Error | null = null;

  for (const modelName of modelsToTry) {
    // Up to 2 retries on 503 high-demand spikes
    const maxAttempts = modelName === GEMINI_LITE_MODEL ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const supportsThinkingLevelLow =
          modelName.startsWith('gemini-3.8') || modelName.startsWith('gemini-4');
        const sysInstruction =
          params.responseMimeType === 'application/json' && params.jsonInstruction
            ? `${params.systemInstruction}\n\nRequired JSON structure:\n${params.jsonInstruction}`
            : params.systemInstruction;

        const response = await withTimeout(
          ai.models.generateContent({
            model: modelName,
            contents: params.prompt,
            config: {
              systemInstruction: sysInstruction,
              ...(supportsThinkingLevelLow
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              ...(params.responseMimeType
                ? { responseMimeType: params.responseMimeType }
                : {}),
              ...(params.responseSchema
                ? { responseSchema: params.responseSchema }
                : {}),
            },
          }),
          15000,
          modelName
        );

        const text = (response.text ?? '').trim();
        if (!text) {
          throw new Error(`Empty response from Gemini model ${modelName}`);
        }

        return {
          text:
            params.responseMimeType === 'application/json'
              ? extractJsonFromText(text)
              : text,
          modelUsed: modelName,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message || '';

        // If 429 quota exceeded, put this model (and its alias) on a 30-minute cooldown
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          const cooldownExpiry = Date.now() + 30 * 60 * 1000;
          modelCooldownUntil.set(modelName, cooldownExpiry);
          if (modelName === GEMINI_DEFAULT_MODEL || modelName === GEMINI_FALLBACK_MODEL) {
            modelCooldownUntil.set(GEMINI_DEFAULT_MODEL, cooldownExpiry);
            modelCooldownUntil.set(GEMINI_FALLBACK_MODEL, cooldownExpiry);
          }
          errors.push(`${modelName}: 429 Quota Exceeded`);
          break; // Don't retry 429 on the same model
        }

        // If 503 high demand and we have attempts remaining, wait and retry
        if (
          (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('Timeout')) &&
          attempt < maxAttempts
        ) {
          await sleep(750 * attempt);
          continue;
        }

        errors.push(`${modelName}: ${msg}`);
        break;
      }
    }
  }

  console.warn('Gemini models unavailable or quota reached:', errors.join(' | '));
  throw new Error(formatCleanAiError(errors.join(' | ') || lastErr?.message || 'Gemini API call failed.'));
}

export async function generateStructuredOrText(params: {
  prompt: string;
  systemInstruction: string;
  jsonMode?: boolean;
  jsonInstruction?: string;
  responseSchema?: Schema;
}): Promise<{ text: string; modelUsed: string }> {
  const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const hasCustomKey = isValidKey(process.env.AI_API_KEY);
  const hasGeminiKey = isValidKey(process.env.GEMINI_API_KEY);

  const preferOpenRouterOrOpenAi =
    (aiProvider === 'openrouter' ||
      aiProvider === 'openai' ||
      Boolean(process.env.AI_BASE_URL) ||
      (process.env.AI_MODEL && process.env.AI_MODEL.includes('/'))) &&
    hasCustomKey;

  if (preferOpenRouterOrOpenAi) {
    try {
      return await callOpenAiCompatible({
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
        jsonMode: Boolean(params.jsonMode),
        jsonInstruction: params.jsonInstruction,
      });
    } catch (openRouterError) {
      if (hasGeminiKey) {
        return await callGeminiSdk({
          prompt: params.prompt,
          systemInstruction: params.systemInstruction,
          responseMimeType: params.jsonMode ? 'application/json' : undefined,
          responseSchema: params.responseSchema,
          jsonInstruction: params.jsonInstruction,
        });
      }
      throw openRouterError;
    }
  }

  try {
    return await callGeminiSdk({
      prompt: params.prompt,
      systemInstruction: params.systemInstruction,
      responseMimeType: params.jsonMode ? 'application/json' : undefined,
      responseSchema: params.responseSchema,
      jsonInstruction: params.jsonInstruction,
    });
  } catch (geminiError) {
    if (hasCustomKey) {
      return await callOpenAiCompatible({
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
        jsonMode: Boolean(params.jsonMode),
        jsonInstruction: params.jsonInstruction,
      });
    }
    throw geminiError;
  }
}
