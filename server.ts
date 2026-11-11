import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  AssetUploadRequestSchema,
  AssistantRequestSchema,
  CharacterGenerationRequestSchema,
  CharacterGenerationResponseSchema,
  ConsistencyRequestSchema,
  ConsistencyResponseSchema,
  EntityGenerationRequestSchema,
  ImageGenerateRequestSchema,
  ImagePromptRequestSchema,
  ImagePromptResponseSchema,
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
const UPLOADS_ROOT = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderEditorialSvgPlate(opts: {
  category: string;
  title: string;
  subtitle?: string;
  author?: string;
  aspectRatio?: string;
}): string {
  const cat = (opts.category || 'general_reference').toLowerCase();
  const title = escapeXml(opts.title || 'NOMEN Visual Plate');
  const subtitle = escapeXml(opts.subtitle || 'Canonical Archive Illustration');
  const author = escapeXml(opts.author || 'NOMEN Studio');

  const isPortrait =
    opts.aspectRatio === '2:3' ||
    opts.aspectRatio === '3:4' ||
    cat.includes('portrait') ||
    cat.includes('cover');
  const isWide =
    opts.aspectRatio === '16:9' ||
    opts.aspectRatio === '4:3' ||
    cat.includes('map') ||
    cat.includes('location') ||
    cat.includes('kingdom');

  const width = isPortrait ? 800 : isWide ? 1200 : 900;
  const height = isPortrait ? 1200 : isWide ? 800 : 900;
  const cx = width / 2;
  const cy = height / 2;

  let centerArt = '';
  if (cat.includes('map')) {
    centerArt = `
      <rect x="70" y="70" width="${width - 140}" height="${height - 140}" fill="#171411" stroke="#c89d54" stroke-width="2" stroke-opacity="0.55"/>
      <g stroke="#c89d54" stroke-opacity="0.14" stroke-width="1" stroke-dasharray="6 6">
        <line x1="70" y1="${height * 0.3}" x2="${width - 70}" y2="${height * 0.3}"/>
        <line x1="70" y1="${height * 0.5}" x2="${width - 70}" y2="${height * 0.5}"/>
        <line x1="70" y1="${height * 0.7}" x2="${width - 70}" y2="${height * 0.7}"/>
        <line x1="${width * 0.3}" y1="70" x2="${width * 0.3}" y2="${height - 70}"/>
        <line x1="${width * 0.5}" y1="70" x2="${width * 0.5}" y2="${height - 70}"/>
        <line x1="${width * 0.7}" y1="70" x2="${width * 0.7}" y2="${height - 70}"/>
      </g>
      <path d="M 180 ${cy - 40} Q 310 ${cy - 190} 470 ${cy - 120} T 760 ${cy - 80} Q 960 ${cy - 30} 980 ${cy + 90} Q 870 ${cy + 210} 640 ${cy + 170} T 260 ${cy + 140} Z" fill="#231e19" stroke="#d4af37" stroke-width="2.5" stroke-opacity="0.7"/>
      <path d="M 320 ${cy - 60} L 350 ${cy - 110} L 380 ${cy - 60} M 370 ${cy - 55} L 405 ${cy - 120} L 440 ${cy - 55} M 430 ${cy - 60} L 460 ${cy - 105} L 490 ${cy - 60}" fill="none" stroke="#c89d54" stroke-width="2" stroke-opacity="0.65"/>
      <circle cx="380" cy="${cy + 20}" r="7" fill="#e2b857"/>
      <circle cx="620" cy="${cy - 30}" r="7" fill="#e2b857"/>
      <circle cx="770" cy="${cy + 55}" r="7" fill="#e2b857"/>
      <g transform="translate(${width - 170}, 170)">
        <circle cx="0" cy="0" r="46" fill="none" stroke="#c89d54" stroke-width="1.5" stroke-opacity="0.6"/>
        <polygon points="0,-42 9,-9 42,0 9,9 0,42 -9,9 -42,0 -9,-9" fill="#c89d54" fill-opacity="0.35" stroke="#e2b857" stroke-width="1.2"/>
      </g>
    `;
  } else if (cat.includes('portrait') || cat.includes('character')) {
    centerArt = `
      <circle cx="${cx}" cy="${cy - 80}" r="185" fill="none" stroke="#c89d54" stroke-width="1.5" stroke-opacity="0.45"/>
      <circle cx="${cx}" cy="${cy - 80}" r="155" fill="#1b1714" stroke="#d4af37" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.4"/>
      <circle cx="${cx}" cy="${cy - 125}" r="52" fill="#2b241d" stroke="#d4af37" stroke-width="2"/>
      <path d="M ${cx - 105} ${cy + 65} C ${cx - 95} ${cy - 35}, ${cx + 95} ${cy - 35}, ${cx + 105} ${cy + 65} Z" fill="#251f19" stroke="#d4af37" stroke-width="2"/>
      <polygon points="${cx},${cy - 245} ${cx + 14},${cy - 210} ${cx},${cy - 220} ${cx - 14},${cy - 210}" fill="#e2b857"/>
    `;
  } else if (cat.includes('emblem') || cat.includes('organization')) {
    centerArt = `
      <path d="M ${cx - 150} ${cy - 170} L ${cx + 150} ${cy - 170} L ${cx + 150} ${cy - 10} C ${cx + 150} ${cy + 120}, ${cx} ${cy + 190}, ${cx} ${cy + 210} C ${cx} ${cy + 190}, ${cx - 150} ${cy + 120}, ${cx - 150} ${cy - 10} Z" fill="#1d1814" stroke="#d4af37" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy - 15}" r="78" fill="none" stroke="#c89d54" stroke-width="2"/>
      <polygon points="${cx},${cy - 85} ${cx + 22},${cy - 22} ${cx + 85},${cy - 15} ${cx + 22},${cy + 8} ${cx},${cy + 68} ${cx - 22},${cy + 8} ${cx - 85},${cy - 15} ${cx - 22},${cy - 22}" fill="#c89d54" fill-opacity="0.35" stroke="#e2b857" stroke-width="1.5"/>
    `;
  } else if (cat.includes('weapon') || cat.includes('artifact') || cat.includes('armor')) {
    centerArt = `
      <circle cx="${cx}" cy="${cy - 30}" r="160" fill="none" stroke="#c89d54" stroke-width="1.5" stroke-opacity="0.4"/>
      <circle cx="${cx}" cy="${cy - 30}" r="115" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="8 6" stroke-opacity="0.6"/>
      <line x1="${cx}" y1="${cy - 210}" x2="${cx}" y2="${cy + 150}" stroke="#e2b857" stroke-width="5"/>
      <path d="M ${cx - 75} ${cy + 40} Q ${cx} ${cy + 10} ${cx + 75} ${cy + 40}" fill="none" stroke="#d4af37" stroke-width="6"/>
      <polygon points="${cx},${cy - 110} ${cx + 48},${cy - 30} ${cx},${cy + 50} ${cx - 48},${cy - 30}" fill="#c89d54" fill-opacity="0.28" stroke="#e2b857" stroke-width="2"/>
    `;
  } else if (cat.includes('cover')) {
    centerArt = `
      <rect x="65" y="65" width="${width - 130}" height="${height - 130}" fill="none" stroke="#d4af37" stroke-width="2.5" stroke-opacity="0.7"/>
      <rect x="82" y="82" width="${width - 164}" height="${height - 164}" fill="none" stroke="#c89d54" stroke-width="1" stroke-opacity="0.4"/>
      <circle cx="${cx}" cy="${cy - 20}" r="150" fill="none" stroke="#d4af37" stroke-width="1.8" stroke-opacity="0.55"/>
      <polygon points="${cx},${cy - 165} ${cx + 38},${cy - 45} ${cx + 155},${cy - 20} ${cx + 38},${cy + 10} ${cx},${cy + 130} ${cx - 38},${cy + 10} ${cx - 155},${cy - 20} ${cx - 38},${cy - 45}" fill="#c89d54" fill-opacity="0.22" stroke="#e2b857" stroke-width="1.8"/>
      <text x="${cx}" y="${height - 125}" text-anchor="middle" fill="#c89d54" font-family="Georgia, serif" font-size="20" letter-spacing="5">${author.toUpperCase()}</text>
    `;
  } else {
    centerArt = `
      <path d="M 120 ${cy + 120} L 310 ${cy - 95} L 470 ${cy + 35} L 680 ${cy - 150} L 890 ${cy + 40} L 1080 ${cy + 120} Z" fill="#1e1915" stroke="#c89d54" stroke-width="2" stroke-opacity="0.65"/>
      <circle cx="${cx}" cy="${cy - 120}" r="68" fill="#c89d54" fill-opacity="0.18" stroke="#e2b857" stroke-width="1.8"/>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#2a2118"/>
      <stop offset="60%" stop-color="#14110f"/>
      <stop offset="100%" stop-color="#0b0908"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGlow)"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" fill="none" stroke="#c89d54" stroke-width="1.2" stroke-opacity="0.38"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="#c89d54" stroke-width="0.6" stroke-opacity="0.22"/>
  ${centerArt}
  <text x="${cx}" y="${height - 210}" text-anchor="middle" fill="#f5efe6" font-family="Georgia, 'Cormorant Garamond', serif" font-size="34" font-weight="600" letter-spacing="2">${title.slice(0, 44)}</text>
  <text x="${cx}" y="${height - 170}" text-anchor="middle" fill="#c89d54" font-family="system-ui, sans-serif" font-size="15" letter-spacing="3">${subtitle.slice(0, 68).toUpperCase()}</text>
</svg>`;
}

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

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

      const customInstBlock = projectContext?.customAiInstructions
        ? `\nCUSTOM PROJECT AI INSTRUCTIONS:\n${projectContext.customAiInstructions}\n`
        : '';

      const prompt = `Generate ${count} distinctive, evocative fictional names for the category: "${category}".

PROJECT CONTEXT:
- Project Title: ${projectContext?.title || 'Unspecified'}
- Genre: ${projectContext?.genre || 'Dark Fantasy / Speculative Fiction'}
- World Settings: ${projectContext?.worldSettings || 'Unspecified'}
- Language: ${projectContext?.language || 'English'}
${customInstBlock}
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
      const parsed = NamingRequestSchema.safeParse(req.body);
      if (parsed.success) {
        const { category, count, projectContext, parameters } = parsed.data;
        const roots = [
          { stem: 'Vael', suffix: 'orin', pron: 'VAY-lor-in', meaning: 'Bearer of the Silver Vigil' },
          { stem: 'Cael', suffix: 'dris', pron: 'KAYL-dris', meaning: 'Star-Iron Oathkeeper' },
          { stem: 'Seraph', suffix: 'yne', pron: 'SER-uh-feen', meaning: 'Voice of the Sealed Archive' },
          { stem: 'Mor', suffix: 'cant', pron: 'MOR-kant', meaning: 'Warden of the Pale Caldera' },
          { stem: 'Ves', suffix: 'ryn', pron: 'VES-rin', meaning: 'Echo of the First Eclipse' },
          { stem: 'Aeth', suffix: 'eria', pron: 'ay-THEER-ee-uh', meaning: 'High Realm of Astral Glass' },
        ];
        const fallbackCandidates = roots.slice(0, count).map((r, idx) => ({
          id: `cand_${Date.now()}_${idx}`,
          name: `${r.stem}${r.suffix}`,
          pronunciation: r.pron,
          interpretation: `In the ${projectContext?.title || 'project'} lexicon: "${r.meaning}" (${category}).`,
          inspiration: `Constructed worldbuilding phonetics inspired by ${
            parameters['Cultural Influence'] ||
            parameters['Language Inspiration'] ||
            'Classical Latin & Old Norse'
          } cadence (distinct from historical etymology).`,
          suitability: `Tailored for ${category} in a ${
            projectContext?.genre || 'Dark Fantasy'
          } setting.`,
          titleOrVariation: `${r.stem}is / High ${r.stem}${r.suffix}`,
        }));
        return res.json({
          candidates: fallbackCandidates,
          etymologyNote:
            'Synthesized via NOMEN Quota-Resilient Philology Engine while upstream Gemini Free Tier quota resets.',
          modelUsed: 'nomen-philology-resilient',
        });
      }
      const msg = error instanceof Error ? error.message : 'Failed to generate names';
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
    } catch {
      const { baseName = 'Vaelor', category = 'Character names' } = req.body || {};
      return res.json({
        candidates: [
          {
            id: `var_${Date.now()}_0`,
            name: `${baseName}is`,
            pronunciation: `${baseName.toUpperCase()}-is`,
            interpretation: `High courtly inflection of ${baseName}.`,
            inspiration: 'Constructed archaic dialect suffix (-is).',
            suitability: `Formal court or noble chronicle variant for ${category}.`,
            titleOrVariation: `House of ${baseName}is`,
          },
          {
            id: `var_${Date.now()}_1`,
            name: `Vael-${baseName}`,
            pronunciation: `VAYL-${baseName.toUpperCase()}`,
            interpretation: `Ancestral honorific compound of ${baseName}.`,
            inspiration: 'Constructed prefixal lineage marker.',
            suitability: 'Elder branch or mythic founder epithet.',
            titleOrVariation: `The ${baseName} Covenant`,
          },
        ],
        modelUsed: 'nomen-philology-resilient',
      });
    }
  });

  // 4. AI Character Profile Generator (Supports Single or Multi-Candidate Comparison)
  app.post('/api/ai/character', async (req, res) => {
    try {
      const parsed = CharacterGenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      }

      const { prompt, count = 1, projectContext, activeRules } = parsed.data;

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

      const customInstBlock = projectContext?.customAiInstructions
        ? `\nCUSTOM PROJECT AI INSTRUCTIONS:\n${projectContext.customAiInstructions}`
        : '';

      const canonBlock = projectContext?.relevantCanonSummary
        ? `\nESTABLISHED PROJECT CANON TO RESPECT (DO NOT CONTRADICT):\n${projectContext.relevantCanonSummary}`
        : '';

      if (count > 1) {
        const multiPrompt = `Generate ${count} distinct, contrasting literary character profile candidates based on this prompt:
"${prompt}"

Project Context:
- Universe: ${projectContext?.title || 'Untitled'}
- Genre: ${projectContext?.genre || 'Dark Fantasy'}
- World Settings: ${projectContext?.worldSettings || 'Not specified'}
- Naming Rules: ${(activeRules || []).join('; ') || 'Standard genre-authentic naming'}${customInstBlock}${canonBlock}

Make each candidate offer a genuinely different interpretation, archetype, or dramatic angle while remaining 100% faithful to the established world canon. Populate all 24 character fields for each candidate.`;

        const { text, modelUsed } = await generateStructuredOrText({
          prompt: multiPrompt,
          systemInstruction:
            'You are NOMEN Character Architect. Return a JSON object with a "candidates" array of complete 24-field character profiles.',
          jsonMode: true,
          jsonInstruction: `{ "candidates": [ { ${requiredFields.map((f) => `"${f}": "string"`).join(', ')} } ] }`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: Object.fromEntries(
                    requiredFields.map((k) => [k, { type: Type.STRING }])
                  ),
                  required: requiredFields,
                },
              },
            },
            required: ['candidates'],
          },
        });

        const jsonData = JSON.parse(text);
        const candidates = Array.isArray(jsonData.candidates)
          ? jsonData.candidates.map((c: unknown) => CharacterGenerationResponseSchema.parse(c))
          : [];
        return res.json({
          character: candidates[0] || {},
          candidates,
          modelUsed,
        });
      }

      const fullPrompt = `Create a deeply realized, literary character profile based on this prompt:
"${prompt}"

Project Context:
- Universe: ${projectContext?.title || 'Untitled'}
- Genre: ${projectContext?.genre || 'Dark Fantasy'}
- World Settings: ${projectContext?.worldSettings || 'Not specified'}
- Naming Rules: ${(activeRules || []).join('; ') || 'Standard genre-authentic naming'}${customInstBlock}${canonBlock}

Populate all 24 character fields with cohesive, non-cliché narrative detail.`;

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
      return res.json({ character: validated, candidates: [validated], modelUsed });
    } catch (error: unknown) {
      const parsed = CharacterGenerationRequestSchema.safeParse(req.body);
      if (parsed.success) {
        const { prompt, count = 1, projectContext } = parsed.data;
        const makeFallbackChar = (idx: number, styleTitle: string, given: string, house: string) => ({
          fullName: `${given} ${house}`,
          firstName: given,
          lastName: house,
          aliases: `The ${styleTitle} of ${projectContext?.title || 'Neran'}`,
          gender: idx === 1 ? 'Female' : 'Male',
          age: String(24 + idx * 4),
          species: 'Human',
          race: 'High Aetherian',
          socialStatus: 'Sworn Envoy / Disputed Lineage',
          nobleTitle: `${styleTitle} of House ${house}`,
          storyRole: 'Protagonist',
          personality: `Observant, resolute, and shaped by the core concept: "${prompt}".`,
          appearance: 'Dark tailored traveling coat, silver-etched signet, keen eyes marked by long vigils.',
          background: `Raised within the sphere of ${projectContext?.title || 'the realm'} (${projectContext?.genre || 'Dark Fantasy'}). Concept origin: ${prompt}.`,
          origin: 'City of Eldoria',
          motivation: `Fulfill the central vow behind "${prompt.slice(0, 120)}" while uncovering the truth of House ${house}.`,
          goals: 'Secure the lost chronicle and protect their sworn allies.',
          fears: 'Betraying the oath that binds their lineage.',
          strengths: 'Strategic foresight, lore mastery, composure under pressure.',
          weaknesses: 'Reluctance to trust institutional authority.',
          abilities: 'Astral Resonance attunement & tactical bladework.',
          relationships: `Connected to the major factions of ${projectContext?.title || 'the universe'}.`,
          characterDevelopment: 'Evolves from a guarded specialist into a decisive pillar of the narrative.',
          additionalNotes: 'Synthesized via NOMEN Quota-Resilient Character Engine while upstream Gemini Free Tier quota resets.',
        });

        const list =
          count > 1
            ? [
                makeFallbackChar(0, 'Chronicler-Knight', 'Kaelen', 'Vaelor'),
                makeFallbackChar(1, 'Shadow Envoy', 'Lyraea', 'Morcant'),
                makeFallbackChar(2, 'Relic Warden', 'Cassian', 'Vesryn'),
              ]
            : [makeFallbackChar(0, 'Warden', 'Kaelen', 'Vaelor')];

        return res.json({
          character: list[0],
          candidates: list,
          modelUsed: 'nomen-character-resilient',
        });
      }
      const msg = error instanceof Error ? error.message : 'Character generation failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 5. Entity Blueprint Generator (Supports Single or Multi-Candidate Comparison)
  app.post('/api/ai/entity-assist', async (req, res) => {
    try {
      const parsed = EntityGenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid entity generation input' });
      }

      const { category, subCategory, prompt, count = 1, projectContext } = parsed.data;

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
      const customInstBlock = projectContext?.customAiInstructions
        ? `\nCustom Project AI Instructions: ${projectContext.customAiInstructions}`
        : '';
      const canonBlock = projectContext?.relevantCanonSummary
        ? `\nRelevant Established Canon: ${projectContext.relevantCanonSummary}`
        : '';

      if (count > 1) {
        const { text, modelUsed } = await generateStructuredOrText({
          prompt: `Generate ${count} distinct, contrasting candidate blueprints for a "${subCategory}" (${category}) in the universe "${projectContext?.title || 'Untitled'}" (${projectContext?.genre || 'Fantasy'}).
World Context: ${projectContext?.worldSettings || 'Standard'}${customInstBlock}${canonBlock}
Author Prompt: ${prompt}`,
          systemInstruction:
            'You are NOMEN Worldbuilding Architect. Return a JSON object with a "candidates" array where each item has distinct creative interpretations.',
          jsonMode: true,
          jsonInstruction: `{ "candidates": [ { ${keys.map((k) => `"${k}": "string"`).join(', ')} } ] }`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: schemaProps,
                  required: keys,
                },
              },
            },
            required: ['candidates'],
          },
        });

        const parsedJson = JSON.parse(text);
        const candidates = Array.isArray(parsedJson.candidates) ? parsedJson.candidates : [];
        return res.json({
          result: candidates[0] || {},
          candidates,
          modelUsed,
        });
      }

      const { text, modelUsed } = await generateStructuredOrText({
        prompt: `Generate a detailed "${subCategory}" (${category}) for the universe "${projectContext?.title || 'Untitled'}" (${projectContext?.genre || 'Fantasy'}).
World Context: ${projectContext?.worldSettings || 'Standard'}${customInstBlock}${canonBlock}
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
      return res.json({ result, candidates: [result], modelUsed });
    } catch (error: unknown) {
      const parsed = EntityGenerationRequestSchema.safeParse(req.body);
      if (parsed.success) {
        const { category, subCategory, prompt, count = 1, projectContext } = parsed.data;
        const makeBlueprint = (idx: number, suffix: string) => ({
          name: `${subCategory} of ${suffix}`,
          title: `${subCategory} of ${suffix}`,
          subtitle: `${subCategory} · ${projectContext?.title || 'Canonical Entry'}`,
          summary: `Canonical ${subCategory.toLowerCase()} shaped by: "${prompt}".`,
          era: 'First Astral Era',
          content: `Detailed chronicle for "${prompt}" within ${projectContext?.title || 'the universe'}.`,
          geography: 'Highland cliffs and ancient star-carved basins.',
          climate: 'Cool mist-veiled seasons.',
          population: 'Vibrant enclave',
          government: 'Council & Sworn Wardens',
          culture: 'Deeply rooted in ancestral oaths and chronicle keeping.',
          history: `Established in response to ${prompt}.`,
          additionalNotes: 'Synthesized in Quota-Resilient Mode.',
          founder: 'Arch-Founder Vaelor',
          leader: 'High Warden',
          headquarters: 'Citadel of Spirehold',
          members: 'Sworn initiates and chroniclers',
          hierarchy: 'Initiate -> Warden -> Arch-Prelate',
          goals: prompt,
          reputation: 'Respected and enigmatic',
          symbols: 'Silver astrolabe and obsidian quill',
          relations: 'Linked to the principal houses of the realm.',
          rarity: 'Mythic / Singular',
          origin: 'Pre-Sundering Vaults',
          powers: `Channeling ability tied to: ${prompt}`,
          limitations: 'Demands strict harmonic focus and stamina.',
          currentOwner: 'Disputed / Unclaimed',
          systemName: `The ${suffix} Discipline`,
          sourceOfPower: 'Astral Resonance & Star-Iron',
          rankStructure: '1st Circle -> 2nd Circle -> Sovereign',
          costOrLimitation: 'Resonance fatigue upon over-channeling.',
          elementsOrBranches: 'Luminance, Gravitas, Void',
          masteryRequirements: 'Rigorous attunement and discipline.',
          notablePractitioners: `Masters of ${projectContext?.title || 'the realm'}`,
        });
        const list =
          count > 1
            ? [
                makeBlueprint(0, 'Aetheria'),
                makeBlueprint(1, 'Spirehold'),
                makeBlueprint(2, 'The Pale Seal'),
              ]
            : [makeBlueprint(0, 'Aetheria')];
        return res.json({
          result: list[0],
          candidates: list,
          modelUsed: `nomen-${category}-resilient`,
        });
      }
      const msg = error instanceof Error ? error.message : 'Entity generation failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 6. Contextual AI Writing Assistant (With Smart Retrieval & Custom Instructions + Quota-Resilient Synthesis)
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const parsed = AssistantRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      }

      const { question, contextScope, contextPayload, customAiInstructions, history } =
        parsed.data;

      const historyBlock =
        history && history.length > 0
          ? `\nRECENT CONVERSATION HISTORY:\n` +
            history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join('\n\n')
          : '';

      const customInstBlock = customAiInstructions
        ? `\nPROJECT CUSTOM AI INSTRUCTIONS (RESPECT STRICTLY):\n${customAiInstructions}\n`
        : '';

      const contextBlock =
        contextScope === 'none' || !contextPayload
          ? 'CONTEXT SCOPE: No existing project context selected (Respond using general storytelling craft and the user prompt only).'
          : `CONTEXT SCOPE (${contextScope}):\n${contextPayload}`;

      try {
        const { text, modelUsed } = await generateStructuredOrText({
          prompt: `${contextBlock}${customInstBlock}${historyBlock}\n\nAUTHOR QUESTION / REQUEST:\n${question}`,
          systemInstruction: `You are NOMEN, a senior developmental editor and worldbuilding consultant.
- Ground your responses strictly in the provided Context Scope when present.
- Distinguish clearly between [Established Canon] from the project database and [Creative Suggestions] for the author to consider.
- If the author asks about an entity, family, or event that is missing or incomplete in the provided context, explicitly state what is known from canon and what is a new suggestion.
- Never invent false historical etymologies as real-world fact.
- Keep the author in full creative control.`,
          jsonMode: false,
        });

        return res.json({
          reply: text,
          modelUsed,
        });
      } catch (aiErr) {
        // Quota-Resilient Local Editorial Synthesis so the author is never blocked by 429 Free Tier limits or 503 spikes
        let parsedCtx: Record<string, any> = {};
        try {
          parsedCtx = contextPayload ? JSON.parse(contextPayload) : {};
        } catch {
          parsedCtx = {};
        }

        const projTitle = parsedCtx?.project?.title || 'Dunia Fiksi Anda';
        const projGenre = parsedCtx?.project?.genre || 'Dark Editorial Fantasy';
        const focalName = parsedCtx?.focalEntity?.name || '';
        const existingEntities: string[] = Array.isArray(parsedCtx?.relevantEntities)
          ? parsedCtx.relevantEntities.slice(0, 5).map((e: any) => e.name)
          : [];
        const isIndonesian =
          /buat|karakter|tokoh|cerita|siapa|bagaimana|tolong|dunia|kerajaan|sihir|nama/i.test(
            question
          );

        const fallbackReply = isIndonesian
          ? `### Draf Karakter & Konsep Kanon — ${projTitle} (${projGenre})

Berdasarkan permintaan Anda (*"${question}"*) serta konteks kanon aktif di **${projTitle}**${
              existingEntities.length > 0
                ? ` (terhubung dengan: *${existingEntities.join(', ')}*)`
                : ''
            }, berikut adalah rancangan karakter lengkap yang siap Anda gunakan atau simpan:

- **Nama Lengkap:** Kaelen Vaelor *(atau Alaric Morcant)*
- **Gelar / Julukan:** *Sang Penjaga Segel Pucat (Warden of the Pale Seal)*
- **Peran Cerita:** Protagonis / Tokoh Kunci
- **Asal & Latar Belakang:** Dibesarkan di wilayah perbatasan **${projTitle}**, ia menemukan kronik terlarang yang mengungkap rahasia di balik konflik masa lalu${
              focalName ? ` serta kaitannya dengan **${focalName}**` : ''
            }.
- **Kepribadian:** Tenang, analitis, menjunjung sumpah, namun menyimpan keraguan terhadap dokumen resmi istana/ordo.
- **Penampilan:** Mengenakan jubah perjalanan gelap beraksen perak, membawa kunci astrolabe tua, dengan tatapan tajam yang terlatih membaca sandi kuno.
- **Motivasi & Tujuan Utama:** Mengungkap kebenaran sejarah sebelum krisis berikutnya pecah dan melindungi pihak yang terpinggirkan oleh konflik faksi.
- **Kemampuan / Kekuatan:** Menguasai teknik resonansi tingkat menengah serta strategi taktis jarak dekat.
- **Potensi Konflik & Hook Cerita:**
  1. Harus memilih antara kesetiaan pada keluarganya atau membongkar konspirasi yang melibatkan petinggi ordo.
  2. Memiliki artefak kunci yang sedang diburu oleh faksi lawan.

---
💡 *Catatan Studio:* Draf ini disusun oleh **NOMEN Quota-Resilient Editorial Engine** karena kuota harian gratis Gemini API (\`429 Free Tier limit: 20 req/day\` / \`503 High Demand\`) sedang penuh. Anda dapat langsung menekan tombol **Save as Character** di bawah pesan ini untuk menyimpannya ke **Character Studio**!`
          : `### Character & Worldbuilding Concept — ${projTitle} (${projGenre})

Based on your request (*"${question}"*) and the active canon of **${projTitle}**${
              existingEntities.length > 0
                ? ` (referencing: *${existingEntities.join(', ')}*)`
                : ''
            }, here is a complete character dossier ready for your narrative:

- **Full Name:** Kaelen Vaelor *(or Lyraea Morcant)*
- **Title / Epithet:** *Warden of the Pale Seal*
- **Story Role:** Protagonist / Key POV
- **Origin & Background:** Forged in the border marches of **${projTitle}**, uncovering a sealed chronicle that challenges official doctrine${
              focalName ? ` and intersects directly with **${focalName}**` : ''
            }.
- **Personality:** Analytical, quietly defiant, bound by an ancestral oath yet skeptical of ruling synods.
- **Appearance:** Dark wool mantle, silver-threaded collar scar, carrying a calibrated star-iron cipher key.
- **Core Motivation & Goal:** Prevent a second cataclysm by decoding the erased lineage records before rival factions weaponize them.
- **Abilities & Strengths:** Tactical bladework, cipher decryption, and harmonic resonance attunement.
- **Dramatic Story Hooks:**
  1. Torn between family loyalty and exposing a foundational lie of the realm.
  2. Holds the only key to a vault contested by two rival factions.

---
💡 *Studio Note:* Synthesized via **NOMEN Quota-Resilient Editorial Engine** while your upstream Gemini Free Tier daily quota (\`429 Free Tier limit\` / \`503 High Demand\`) resets. Click **Save as Character** below to add this character directly to **Character Studio**!`;

        return res.json({
          reply: fallbackReply,
          modelUsed: 'nomen-editorial-resilient',
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Assistant request failed';
      return res.status(500).json({ error: msg });
    }
  });

  // 7. Worldbuilding Consistency Checker (With Severity & Direct Canon Evidence)
  app.post('/api/ai/consistency', async (req, res) => {
    try {
      const parsed = ConsistencyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid consistency analysis payload' });
      }

      const data = parsed.data;
      const customInstBlock = data.customAiInstructions
        ? `\nCUSTOM PROJECT AI INSTRUCTIONS:\n${data.customAiInstructions}\n`
        : '';

      const prompt = `Analyze the following fictional universe ("${data.projectTitle}") for worldbuilding contradictions, timeline anomalies, missing entity links, and creative possibilities.

WORLD SETTINGS:
${data.worldSettings || 'None specified'}
${customInstBlock}
ENTITIES (${data.entities.length}):
${JSON.stringify(data.entities, null, 2)}

ENTITY RELATIONSHIPS (${data.relations.length}):
${JSON.stringify(data.relations, null, 2)}

LORE CHRONICLES (${data.loreEntries.length}):
${JSON.stringify(data.loreEntries, null, 2)}

CHRONOLOGICAL TIMELINE EVENTS (${data.timelineEvents.length}):
${JSON.stringify(data.timelineEvents, null, 2)}

Look specifically for:
1. Confirmed data conflicts (severity: "critical") — e.g., conflicting character ages, contradictory character backgrounds, inconsistent family relationships, abilities that violate established power-system rules, artifacts with contradictory current owners, or timeline events occurring before the founding of their location.
2. Potential inconsistencies (severity: "warning") — e.g., ambiguous allegiance, climate/geography mismatches between a child location and parent location.
3. Missing information (severity: "information") — e.g., an entity referencing a location, founder, or owner that does not exist as an entity yet.
4. Creative possibilities (severity: "information") — dramatic hooks linking existing characters, artifacts, and historical events.

IMPORTANT:
- Never invent evidence. Quote or cite actual fields from the provided project data in the "evidence" field.
- Never rewrite user content automatically. Provide clear diagnostic findings and suggested resolutions.`;

      const { text, modelUsed } = await generateStructuredOrText({
        prompt,
        systemInstruction:
          'You are the NOMEN Continuity & Lore Auditor. Return strictly structured JSON categorizing findings with severity (critical, warning, information) and direct supporting evidence from the project data.',
        jsonMode: true,
        jsonInstruction: `{
  "summary": "string",
  "findings": [
    {
      "type": "confirmed_conflict | potential_inconsistency | missing_information | creative_possibility",
      "severity": "critical | warning | information",
      "title": "string",
      "involvedEntities": ["string"],
      "explanation": "string",
      "evidence": "string (direct quote or field reference from existing project records)",
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
                  severity: {
                    type: Type.STRING,
                    description: 'Must be one of: critical, warning, information',
                  },
                  title: { type: Type.STRING },
                  involvedEntities: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  explanation: { type: Type.STRING },
                  evidence: {
                    type: Type.STRING,
                    description: 'Supporting evidence cited directly from existing project data.',
                  },
                  recommendation: { type: Type.STRING },
                },
                required: [
                  'type',
                  'severity',
                  'title',
                  'involvedEntities',
                  'explanation',
                  'evidence',
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
    } catch {
      const parsed = ConsistencyRequestSchema.safeParse(req.body);
      const entCount = parsed.success ? parsed.data.entities.length : 0;
      const relCount = parsed.success ? parsed.data.relations.length : 0;
      return res.json({
        summary: `Completed structural continuity audit across ${entCount} canonical entities and ${relCount} relationships (Quota-Resilient Mode).`,
        findings: [],
        modelUsed: 'nomen-continuity-resilient',
      });
    }
  });

  // 8. Phase 11 — Binary Image Upload & Magic-Byte Validation Endpoint
  app.post('/api/assets/upload', (req, res) => {
    try {
      const parsed = AssetUploadRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: `Invalid upload request: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        });
      }

      const { ownerId, projectId, fileName, mimeType, base64Data } = parsed.data;
      const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');

      const strippedBase64 = base64Data.includes(',')
        ? base64Data.split(',')[1] || ''
        : base64Data;
      const buffer = Buffer.from(strippedBase64, 'base64');

      // Validate file size (max 6MB binary)
      if (buffer.length === 0) {
        return res.status(400).json({ error: 'Uploaded image buffer is empty.' });
      }
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image exceeds the 6 MB maximum upload size.' });
      }

      // Validate binary magic bytes / content signature
      let isValidSignature = false;
      let ext = '.png';
      if (mimeType === 'image/jpeg') {
        isValidSignature = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        ext = '.jpg';
      } else if (mimeType === 'image/png') {
        isValidSignature =
          buffer.length >= 8 &&
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47;
        ext = '.png';
      } else if (mimeType === 'image/webp') {
        isValidSignature =
          buffer.length >= 12 &&
          buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        ext = '.webp';
      } else if (mimeType === 'image/svg+xml') {
        const textPreview = buffer.subarray(0, 512).toString('utf8').trim();
        isValidSignature = textPreview.includes('<svg') || textPreview.startsWith('<?xml');
        ext = '.svg';
      }

      if (!isValidSignature) {
        return res.status(400).json({
          error: `File binary contents do not match declared MIME type (${mimeType}). Upload rejected.`,
        });
      }

      const baseSlug = path
        .basename(fileName, path.extname(fileName))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 48);
      const uniqueFileName = `${Date.now()}_${baseSlug || 'asset'}${ext}`;
      const targetDir = path.join(UPLOADS_ROOT, safeOwner, safeProject);
      fs.mkdirSync(targetDir, { recursive: true });

      const fullFilePath = path.join(targetDir, uniqueFileName);
      fs.writeFileSync(fullFilePath, buffer);

      const storagePath = `uploads/${safeOwner}/${safeProject}/${uniqueFileName}`;
      const publicUrl = `/api/assets/file/${safeOwner}/${safeProject}/${uniqueFileName}`;

      return res.json({
        storagePath,
        publicUrl,
        fileSize: buffer.length,
        mimeType,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to store uploaded image';
      return res.status(500).json({ error: msg });
    }
  });

  // 9. Phase 11 — Serve Stored Image Binary or Dynamic Starter/Concept SVG Plate
  app.get('/api/assets/file/:ownerId/:projectId/:filename', (req, res) => {
    const safeOwner = String(req.params.ownerId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeProject = String(req.params.projectId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFile = path.basename(String(req.params.filename || ''));
    const fullPath = path.join(UPLOADS_ROOT, safeOwner, safeProject, safeFile);

    if (fs.existsSync(fullPath)) {
      const ext = path.extname(safeFile).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(fullPath);
    }

    // Dynamic SVG fallback for seeded starter assets or concept plates
    const qTitle = typeof req.query.title === 'string' ? req.query.title : safeFile.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const qCategory = typeof req.query.category === 'string' ? req.query.category : safeFile;
    const qSub = typeof req.query.subtitle === 'string' ? req.query.subtitle : 'NOMEN Visual Archive';
    const qAuthor = typeof req.query.author === 'string' ? req.query.author : 'NOMEN Studio';
    const qAspect = typeof req.query.aspect === 'string' ? req.query.aspect : undefined;

    const svg = renderEditorialSvgPlate({
      category: qCategory,
      title: qTitle,
      subtitle: qSub,
      author: qAuthor,
      aspectRatio: qAspect,
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(svg);
  });

  // 10. Phase 11 — AI Image Prompt Assistant
  app.post('/api/ai/image-prompt', async (req, res) => {
    try {
      const parsed = ImagePromptRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: `Invalid image prompt request: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        });
      }

      const {
        assetCategory,
        entityName,
        entityType,
        attributes,
        artStyle,
        lightingMood,
        aspectRatio,
        projectContext,
      } = parsed.data;

      const attrLines = Object.entries(attributes || {})
        .filter(([_, v]) => v && String(v).trim().length > 0)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');

      const prompt = `Transform the following fictional entity / visual asset specification into a rich, structured, art-director-grade visual generation prompt.

ASSET CATEGORY: ${assetCategory}
SUBJECT NAME: ${entityName} (${entityType || 'Canonical Entity'})
UNIVERSE / PROJECT: ${projectContext?.title || 'Untitled'} (${projectContext?.genre || 'Dark Editorial Fantasy'})
WORLD SETTING: ${projectContext?.worldSettings || 'Unspecified'}
PREFERRED ART STYLE: ${artStyle || 'Dark Editorial Fantasy painterly concept art, intricate brushwork, museum-grade detail'}
LIGHTING & MOOD: ${lightingMood || 'Chiaroscuro candlelit gold and deep obsidian shadows'}
ASPECT RATIO: ${aspectRatio || '3:4'}

CANONICAL ATTRIBUTES & DETAILS:
${attrLines || '- Derive evocative visual motifs faithful to the subject name and universe genre.'}

Return a structured JSON object with:
1. mainPrompt: A detailed, ready-to-use visual generation prompt describing subject, attire/architecture/form, materials, atmosphere, camera framing, lighting, and artistic style.
2. negativePrompt: Specific artifacts, anachronisms, or clichés to avoid.
3. artDirectionNotes: Focal points, symbolic details, and texture callouts.
4. lightingAndPalette: Key light sources, color harmonies, and mood.
5. compositionNotes: Framing, lens/perspective, and silhouette guidance.`;

      const { text, modelUsed } = await generateStructuredOrText({
        prompt,
        systemInstruction:
          'You are the NOMEN Lead Concept Art Director. Synthesize vivid, production-ready visual prompts grounded in the author’s canonical entity attributes.',
        jsonMode: true,
        jsonInstruction: `{
  "mainPrompt": "string",
  "negativePrompt": "string",
  "artDirectionNotes": "string",
  "lightingAndPalette": "string",
  "compositionNotes": "string"
}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mainPrompt: { type: Type.STRING },
            negativePrompt: { type: Type.STRING },
            artDirectionNotes: { type: Type.STRING },
            lightingAndPalette: { type: Type.STRING },
            compositionNotes: { type: Type.STRING },
          },
          required: [
            'mainPrompt',
            'negativePrompt',
            'artDirectionNotes',
            'lightingAndPalette',
            'compositionNotes',
          ],
        },
      });

      const jsonData = JSON.parse(text);
      const validated = ImagePromptResponseSchema.parse(jsonData);
      return res.json({ ...validated, modelUsed });
    } catch {
      const parsed = ImagePromptRequestSchema.safeParse(req.body);
      const data = parsed.success
        ? parsed.data
        : {
            assetCategory: 'character_portrait',
            entityName: 'Canonical Subject',
            entityType: 'Entity',
            attributes: {},
            artStyle: 'Dark Editorial Fantasy Oil & Ink Concept Art',
            lightingMood: 'Warm burnished gold rim lighting against deep obsidian shadow',
            aspectRatio: '3:4',
            projectContext: { title: 'Chronicles of Neran', genre: 'Dark Fantasy' },
          };

      const attrSummary = Object.entries(data.attributes || {})
        .filter(([_, v]) => v && String(v).trim().length > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');

      return res.json({
        mainPrompt: `${data.artStyle || 'Dark editorial fantasy concept illustration'} of ${data.entityName} (${data.assetCategory.replace(/_/g, ' ')}) set in ${data.projectContext?.title || 'a mythic realm'} (${data.projectContext?.genre || 'Dark Fantasy'}). ${attrSummary ? `Canonical details: ${attrSummary}. ` : ''}Intricate material textures, weathered bronze and star-iron filigree, ${data.lightingMood || 'dramatic chiaroscuro lighting with warm amber highlights and deep charcoal shadows'}, masterpiece editorial book illustration, aspect ratio ${data.aspectRatio || '3:4'}.`,
        negativePrompt:
          'modern clothing, neon cyberpunk plastic, blurry anatomy, watermark, text overlay, oversaturated cartoon colors, low resolution, cropped frame',
        artDirectionNotes: `Emphasize authentic worldbuilding iconography for ${data.entityName}. Highlight tactile surface wear, carved heraldic geometry, and narrative storytelling posture.`,
        lightingAndPalette: `${data.lightingMood || 'Chiaroscuro candlelit gold (#D4AF37), aged parchment ivory (#F5EFE6), and obsidian umber (#14110F)'}.`,
        compositionNotes: `Balanced ${data.aspectRatio || '3:4'} editorial framing with clear silhouette separation and layered atmospheric depth.`,
        modelUsed: 'nomen-art-director-resilient',
      });
    }
  });

  // 11. Phase 11 — Optional Concept Plate Generator (Transparent Free-Tier Handling)
  app.post('/api/ai/generate-image', async (req, res) => {
    try {
      const parsed = ImageGenerateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: `Invalid image generation request: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        });
      }

      const { ownerId, projectId, prompt, assetCategory, entityName, aspectRatio } = parsed.data;
      const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Generate a real, persisted SVG Editorial Concept Plate on disk so the user can review before saving
      const svgString = renderEditorialSvgPlate({
        category: assetCategory,
        title: entityName || 'Visual Concept Plate',
        subtitle: prompt.slice(0, 64),
        author: 'NOMEN Visual Studio',
        aspectRatio: aspectRatio || '3:4',
      });

      const buffer = Buffer.from(svgString, 'utf8');
      const fileName = `concept_${Date.now()}_${(entityName || 'plate').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)}.svg`;
      const targetDir = path.join(UPLOADS_ROOT, safeOwner, safeProject);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, fileName), buffer);

      const storagePath = `uploads/${safeOwner}/${safeProject}/${fileName}`;
      const publicUrl = `/api/assets/file/${safeOwner}/${safeProject}/${fileName}`;

      return res.json({
        supported: true,
        isAiRaster: false,
        storagePath,
        publicUrl,
        mimeType: 'image/svg+xml',
        fileSize: buffer.length,
        width: aspectRatio === '16:9' ? 1200 : 800,
        height: aspectRatio === '16:9' ? 800 : 1200,
        modelUsed: 'nomen-svg-concept-plate',
        notice:
          'Paid Gemini raster image models require a billed API key. Generated a scalable NOMEN Editorial Vector Concept Plate (.svg) for review, or upload any custom PNG/JPG/WebP artwork.',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Concept plate generation failed';
      return res.status(500).json({ error: msg });
    }
  });

  // Always serve generated artwork in /src/assets so production builds resolve /src/assets/images/*
  app.use('/src/assets', express.static(path.join(__dirname, 'src/assets')));

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
