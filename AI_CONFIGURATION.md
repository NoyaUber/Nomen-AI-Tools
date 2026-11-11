# NOMEN — AI Configuration & Prompt Architecture

## 1. Overview & Security Architecture

NOMEN integrates with Google Gemini models exclusively on the server side (`server.ts`) using the official `@google/genai` SDK.

- **Server-Side Isolation**: The `GEMINI_API_KEY` environment variable is accessed strictly inside `server.ts`. No API keys or private credentials are ever exposed to client bundles.
- **Model Configuration**:
  - Primary model: `gemini-3-flash-preview`
  - Fallback chain: `['gemini-3-flash-preview', 'gemini-2.5-flash']` via `generateWithFallback()` in `server.ts` to gracefully handle transient 404/429/503 model availability errors.
- **Validation**: Every AI API endpoint validates incoming request bodies with **Zod** schemas (`src/lib/validation/schemas.ts`) and parses structured JSON outputs using `@google/genai` `responseSchema` (`Type.OBJECT` / `Type.ARRAY`).

---

## 2. AI Endpoints (`server.ts`)

### 2.1 `POST /api/ai/naming`
- **Purpose**: Generates culturally and phonetically cohesive names with etymology, pronunciation, and lore-fit notes.
- **Inputs**: `projectContext` (including `customAiInstructions`), `category`, `cultureInspiration`, `phoneticStyle`, `tone`, `meaningTheme`, `count`, `customConstraints`.
- **Output Schema**: Array of `GeneratedNameCandidate` objects (`name`, `meaning`, `etymology`, `pronunciation`, `cultureOrigin`, `genderOrTone`, `loreFitNotes`, `tags`).

### 2.2 `POST /api/ai/entity-expand`
- **Purpose**: Expands a brief concept or draft into a complete canonical dossier for Characters, Locations, Factions, Items, or Power Systems.
- **Inputs**: `projectContext`, `entityType`, `name`, `currentSummary`, `currentDescription`, `currentAttributes`, `instruction`.
- **Output Schema**: `{ subtitle, summary, description, attributesJson }`.

### 2.3 `POST /api/ai/compare` *(Phase 8.3 — Multi-Candidate Generation Comparison)*
- **Purpose**: Generates 3 distinct stylistic candidates (`Variation A — Mythic & High Canon`, `Variation B — Political & Grounded Intrigue`, `Variation C — Mystery & Subversive Hook`) so authors can compare, edit inline, and choose the strongest direction before saving.
- **Supported Target Types**: `'character' | 'location' | 'faction' | 'item' | 'power_system' | 'lore' | 'timeline'`.
- **Output Schema**: `{ candidates: [{ id, styleLabel, subtitle, summary, description, highlightNotes, attributesJson }] }`.

### 2.4 `POST /api/ai/assistant` *(Phase 8.1 & 8.4 — Smart Context & Custom Instructions)*
- **Purpose**: Context-aware worldbuilding co-author for brainstorming, dialogue, lore expansion, and plot hooks.
- **Smart Context Retrieval (`retrieveSmartContext`)**:
  - Client-side relevance scorer in `src/lib/ai/client.ts` ranks all project entities, family relationships, naming presets, lore entries, and timeline events against the user's prompt and active mode.
  - Injects the top-scoring canonical records into `smartContextDigest` and displays the matched source names in the UI.
- **Custom Project AI Instructions (`project_ai_settings`)**:
  - When enabled for a project, `formatCustomAiInstructions()` injects the project's custom tone, prose style, world rules, naming rules, forbidden tropes, and system prompt into every AI request.

### 2.5 `POST /api/ai/consistency` *(Phase 8.2 — Enhanced Canon Consistency Audit)*
- **Purpose**: Audits all project entities, relationships, lore entries, and timeline events for timeline paradoxes, faction/character contradictions, power rule violations, and orphan lore links.
- **Output Schema**:
  - `overallScore` (`0–100`)
  - `canonHealthSummary` (`string`)
  - `strengths` (`string[]`)
  - `issues`: Array of `{ id, severity: 'critical' | 'warning' | 'information', category, title, description, affectedEntities, supportingEvidence, suggestedFix }`.
