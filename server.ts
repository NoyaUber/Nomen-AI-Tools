import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  AssistantRequestSchema,
  CharacterGenerationRequestSchema,
  CharacterGenerationResponseSchema,
  ConsistencyRequestSchema,
  ConsistencyResponseSchema,
  EntityGenerationRequestSchema,
  NamingRequestSchema,
  NamingResponseSchema,
} from './src/lib/validation/schemas.ts';
import {
  generateStructuredOrText,
  getAiProviderStatus,
} from './src/lib/ai/server-provider.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. AI Configuration Status
  app.get('/api/ai/status', (_req, res) => {
    const status = getAiProviderStatus();
    res.json(status);
  });

  // 2. Contextual Naming Engine
  app.post('/api/ai/naming', async (req, res) => {
    try {
      const parsed = NamingRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: `Invalid naming request: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        });
      }

      const { category, count, projectContext, parameters, activeRules } = parsed.data;

      const paramLines = Object.entries(parameters)
        .filter(([_, v]) => v && v.trim().length > 0)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');

      const rulesBlock =
        activeRules && activeRules.length > 0
          ? `\nACTIVE PROJECT NAMING CONVENTIONS (MUST RESPECT WHERE APPLICABLE):\n` +
            activeRules
              .map(
                (r) =>
                  `* ${r.title} (${r.cultureOrGroup}): Phonetics: ${r.phoneticPattern} | Affixes: ${r.prefixSuffixRule} | Structure: ${r.structureRule} | Examples: ${r.examples}`
              )
              .join('\n')
          : '';

      const prompt = `Generate ${count} distinctive, evocative fictional names for the category: "${category}".

PROJECT CONTEXT:
- Project Title: ${projectContext?.title || 'Unspecified'}
- Genre: ${projectContext?.genre || 'Dark Fantasy / Speculative Fiction'}
- World Settings: ${projectContext?.worldSettings || 'Unspecified'}
- Language: ${projectContext?.language || 'English'}

REQUESTED PARAMETERS:
${paramLines || '- Standard contextual generation for this category'}
${rulesBlock}

CRITICAL LINGUISTIC HONESTY RULE:
Do NOT present invented fictional etymologies as verified real-world historical facts. Clearly distinguish between in-universe/fictional meaning ("In the fictional tongue...") and real-world linguistic inspiration ("Inspired by Old Norse / Latin / Celtic phonetics...").`;

      const { text, modelUsed } = await generateStructuredOrText({
        prompt,
        systemInstruction:
          'You are NOMEN, a master philologist and worldbuilding naming architect for novelists. Return strictly valid JSON matching the requested schema.',
        jsonMode: true,
        jsonInstruction: `{
  "candidates": [
    {
      "name": "string",
      "pronunciation": "string (e.g. KAY-lum VAY-lor)",
      "interpretation": "string (fictional / in-universe meaning)",
      "inspiration": "string (distinction between real-world linguistic inspiration and fictional construction)",
      "suitability": "string (why it fits the role, geography, tone, and rules)",
      "titleOrVariation": "string (optional epithet, title, or 2 stylistic variations)"
    }
  ],
  "etymologyNote": "string (note clarifying how real-world roots were adapted into fictional worldbuilding phonetics)"
}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'The suggested name.' },
                  pronunciation: {
                    type: Type.STRING,
                    description: 'Clear phonetic pronunciation guide (e.g. KAY-lum VAY-lor).',
                  },
                  interpretation: {
                    type: Type.STRING,
                    description: 'Fictional / in-universe meaning and symbolic resonance.',
                  },
                  inspiration: {
                    type: Type.STRING,
                    description:
                      'Explicit distinction between real-world linguistic/cultural inspiration and fictional construction.',
                  },
                  suitability: {
                    type: Type.STRING,
                    description:
                      'Why this name fits the requested role, geography, tone, and project rules.',
                  },
                  titleOrVariation: {
                    type: Type.STRING,
                    description: 'Optional epithet, formal title, or 2 stylistic variations.',
                  },
                },
                required: [
                  'name',
                  'pronunciation',
                  'interpretation',
                  'inspiration',
                  'suitability',
                  'titleOrVariation',
                ],
              },
            },
            etymologyNote: {
              type: Type.STRING,
              description:
                'A brief note clarifying how real-world roots were adapted into fictional worldbuilding phonetics.',
            },
          },
          required: ['candidates', 'etymologyNote'],
        },
      });

      const jsonData = JSON.parse(text);
      const validated = NamingResponseSchema.parse(jsonData);

      const candidatesWithIds = validated.candidates.map((c, idx) => ({
        id: `cand_${Date.now()}_${idx}`,
        ...c,
      }));

      return res.json({
        candidates: candidatesWithIds,
        etymologyNote: validated.etymologyNote,
        modelUsed,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to generate names';
      console.error('Naming API Error:', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 3. Name Variations Endpoint
  app.post('/api/ai/naming/variations', async (req, res) => {
    try {
      const { baseName, category, inspiration, projectGenre } = req.body || {};
      if (!baseName || typeof baseName !== 'string') {
        return res.status(400).json({ error: 'baseName is required' });
      }

      const { text, modelUsed } = await generateStructuredOrText({
        prompt: `Create 3 distinct phonetic, archaic, or regional dialect variations of the name "${baseName}" (Category: ${category || 'General'}, Genre: ${projectGenre || 'Fantasy'}, Original Inspiration: ${inspiration || 'Fictional'}). Clearly distinguish fictional inspiration from real-world etymology.`,
        systemInstruction:
          'You are NOMEN, a master philologist. Return strictly valid JSON with a "candidates" array.',
        jsonMode: true,
        jsonInstruction: `{
  "candidates": [
    {
      "name": "string",
      "pronunciation": "string",
      "interpretation": "string",
      "inspiration": "string",
      "suitability": "string",
      "titleOrVariation": "string"
    }
  ]
}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  pronunciation: { type: Type.STRING },
                  interpretation: { type: Type.STRING },
                  inspiration: { type: Type.STRING },
                  suitability: { type: Type.STRING },
                  titleOrVariation: { type: Type.STRING },
                },
                required: [
                  'name',
                  'pronunciation',
                  'interpretation',
                  'inspiration',
                  'suitability',
                  'titleOrVariation',
                ],
              },
            },
          },
          required: ['candidates'],
        },
      });

      const jsonData = JSON.parse(text);
      const candidates = (jsonData.candidates || []).map(
        (c: Record<string, string>, idx: number) => ({
          id: `var_${Date.now()}_${idx}`,
          ...c,
        })
      );

      return res.json({ candidates, modelUsed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to generate variations';
      return res.status(500).json({ error: msg });
    }
  });

  // 4. AI Character Profile Generator
  app.post('/api/ai/character', async (req, res) => {
    try {
      const parsed = CharacterGenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      }

      const { prompt, projectContext, activeRules } = parsed.data;

      const fullPrompt = `Create a deeply realized, literary character profile based on this prompt:
"${prompt}"

Project Context:
- Universe: ${projectContext?.title || 'Untitled'}
- Genre: ${projectContext?.genre || 'Dark Fantasy'}
- World Settings: ${projectContext?.worldSettings || 'Not specified'}
- Naming Rules: ${(activeRules || []).join('; ') || 'Standard genre-authentic naming'}

Populate all 24 character fields with cohesive, non-cliché narrative detail.`;

      const requiredFields = [
        'fullName',
        'firstName',
        'lastName',
        'aliases',
        'gender',
        'age',
        'species',
        'race',
        'socialStatus',
        'nobleTitle',
        'storyRole',
        'personality',
        'appearance',
        'background',
        'origin',
        'motivation',
        'goals',
        'fears',
        'strengths',
        'weaknesses',
        'abilities',
        'relationships',
        'characterDevelopment',
        'additionalNotes',
      ];

      const { text, modelUsed } = await generateStructuredOrText({
        prompt: fullPrompt,
        systemInstruction:
          'You are NOMEN Character Architect. Generate rich, internally consistent character profiles for novelists.',
        jsonMode: true,
        jsonInstruction: `JSON object containing string fields: ${requiredFields.join(', ')}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: Object.fromEntries(
            requiredFields.map((k) => [k, { type: Type.STRING }])
          ),
          required: requiredFields,
        },
      });

      const jsonData = JSON.parse(text);
      const validated = CharacterGenerationResponseSchema.parse(jsonData);
      return res.json({ character: validated, modelUsed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Character generation failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 5. Entity Blueprint Generator (Locations, Organizations, Items, Power Systems, Lore)
  app.post('/api/ai/entity-assist', async (req, res) => {
    try {
      const parsed = EntityGenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid entity generation input' });
      }

      const { category, subCategory, prompt, projectContext } = parsed.data;

      let schemaProps: Record<string, { type: Type; description?: string }> = {
        name: { type: Type.STRING },
        subtitle: { type: Type.STRING },
        summary: { type: Type.STRING },
      };

      if (category === 'location') {
        schemaProps = {
          ...schemaProps,
          geography: { type: Type.STRING },
          climate: { type: Type.STRING },
          population: { type: Type.STRING },
          government: { type: Type.STRING },
          culture: { type: Type.STRING },
          history: { type: Type.STRING },
          additionalNotes: { type: Type.STRING },
        };
      } else if (category === 'organization') {
        schemaProps = {
          ...schemaProps,
          founder: { type: Type.STRING },
          leader: { type: Type.STRING },
          headquarters: { type: Type.STRING },
          members: { type: Type.STRING },
          hierarchy: { type: Type.STRING },
          history: { type: Type.STRING },
          goals: { type: Type.STRING },
          reputation: { type: Type.STRING },
          symbols: { type: Type.STRING },
          relations: { type: Type.STRING },
        };
      } else if (category === 'item') {
        schemaProps = {
          ...schemaProps,
          rarity: { type: Type.STRING },
          origin: { type: Type.STRING },
          powers: { type: Type.STRING },
          limitations: { type: Type.STRING },
          currentOwner: { type: Type.STRING },
          history: { type: Type.STRING },
        };
      } else if (category === 'ability') {
        schemaProps = {
          ...schemaProps,
          systemName: { type: Type.STRING },
          sourceOfPower: { type: Type.STRING },
          rankStructure: { type: Type.STRING },
          costOrLimitation: { type: Type.STRING },
          elementsOrBranches: { type: Type.STRING },
          masteryRequirements: { type: Type.STRING },
          notablePractitioners: { type: Type.STRING },
        };
      } else if (category === 'lore') {
        schemaProps = {
          title: { type: Type.STRING },
          era: { type: Type.STRING },
          summary: { type: Type.STRING },
          content: { type: Type.STRING },
        };
      }

      const keys = Object.keys(schemaProps);
      const { text, modelUsed } = await generateStructuredOrText({
        prompt: `Generate a detailed "${subCategory}" (${category}) for the universe "${projectContext?.title || 'Untitled'}" (${projectContext?.genre || 'Fantasy'}).
World Context: ${projectContext?.worldSettings || 'Standard'}
Author Prompt: ${prompt}`,
        systemInstruction:
          'You are NOMEN Worldbuilding Architect. Produce evocative, cohesive editorial fantasy/sci-fi worldbuilding entries.',
        jsonMode: true,
        jsonInstruction: `JSON object with string keys: ${keys.join(', ')}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: schemaProps,
          required: keys,
        },
      });

      const result = JSON.parse(text);
      return res.json({ result, modelUsed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Entity generation failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 6. Contextual AI Writing Assistant
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const parsed = AssistantRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      }

      const { question, contextScope, contextPayload, history } = parsed.data;

      const historyBlock =
        history && history.length > 0
          ? `\nRECENT CONVERSATION HISTORY:\n` +
            history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join('\n\n')
          : '';

      const contextBlock =
        contextScope === 'none' || !contextPayload
          ? 'CONTEXT SCOPE: No existing project context selected (Respond using general storytelling craft and the user prompt only).'
          : `CONTEXT SCOPE (${contextScope}):\n${contextPayload}`;

      const { text, modelUsed } = await generateStructuredOrText({
        prompt: `${contextBlock}${historyBlock}\n\nAUTHOR QUESTION / REQUEST:\n${question}`,
        systemInstruction: `You are NOMEN, a senior developmental editor and worldbuilding consultant.
- Ground your suggestions strictly in the provided Context Scope when present.
- Never invent false historical etymologies as real-world fact.
- Offer concrete, actionable narrative hooks, political tensions, character motivations, or lore refinements while keeping the author in full creative control.`,
        jsonMode: false,
      });

      return res.json({
        reply: text,
        modelUsed,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Assistant request failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 7. Worldbuilding Consistency Checker
  app.post('/api/ai/consistency', async (req, res) => {
    try {
      const parsed = ConsistencyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid consistency analysis payload' });
      }

      const data = parsed.data;

      const prompt = `Analyze the following fictional universe ("${data.projectTitle}") for worldbuilding contradictions, timeline anomalies, missing entity links, and creative possibilities.

WORLD SETTINGS:
${data.worldSettings || 'None specified'}

ENTITIES (${data.entities.length}):
${JSON.stringify(data.entities, null, 2)}

ENTITY RELATIONSHIPS (${data.relations.length}):
${JSON.stringify(data.relations, null, 2)}

LORE CHRONICLES (${data.loreEntries.length}):
${JSON.stringify(data.loreEntries, null, 2)}

CHRONOLOGICAL TIMELINE EVENTS (${data.timelineEvents.length}):
${JSON.stringify(data.timelineEvents, null, 2)}

Look specifically for:
1. Confirmed data conflicts (e.g., a character belonging to two incompatible families, an event occurring before the founding of its kingdom, an artifact with two conflicting current owners, or a character's age conflicting with the timeline).
2. Potential inconsistencies (e.g., ambiguous allegiance, climate/geography mismatches between a child location and parent location).
3. Missing information (e.g., an entity referencing a location, founder, or owner that does not exist as an entity yet).
4. Creative possibilities that require author confirmation (e.g., Dramatic hooks linking existing characters, artifacts, and historical events).

IMPORTANT: Never rewrite user content automatically. Provide clear diagnostic findings and recommendations for the author.`;

      const { text, modelUsed } = await generateStructuredOrText({
        prompt,
        systemInstruction:
          'You are the NOMEN Continuity & Lore Auditor. Return strictly structured JSON categorizing findings into confirmed_conflict, potential_inconsistency, missing_information, and creative_possibility.',
        jsonMode: true,
        jsonInstruction: `{
  "summary": "string",
  "findings": [
    {
      "type": "confirmed_conflict | potential_inconsistency | missing_information | creative_possibility",
      "title": "string",
      "involvedEntities": ["string"],
      "explanation": "string",
      "recommendation": "string"
    }
  ]
}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Executive summary of the continuity audit.',
            },
            findings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description:
                      'Must be one of: confirmed_conflict, potential_inconsistency, missing_information, creative_possibility',
                  },
                  title: { type: Type.STRING },
                  involvedEntities: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  explanation: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                },
                required: [
                  'type',
                  'title',
                  'involvedEntities',
                  'explanation',
                  'recommendation',
                ],
              },
            },
          },
          required: ['summary', 'findings'],
        },
      });

      const jsonData = JSON.parse(text);
      const validated = ConsistencyResponseSchema.parse(jsonData);

      const findingsWithIds = validated.findings.map((f, idx) => ({
        id: `chk_${Date.now()}_${idx}`,
        ...f,
      }));

      return res.json({
        summary: validated.summary,
        findings: findingsWithIds,
        modelUsed,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Consistency analysis failed';
      return res.status(500).json({ error: msg });
    }
  });

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOMEN Studio Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
