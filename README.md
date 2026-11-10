# NOMEN — AI Worldbuilding Studio

NOMEN is an AI-powered creative workspace and connected worldbuilding platform designed for novelists, webnovel authors, fantasy writers, science-fiction writers, and storytellers.

---

## Core Modules

1. **Dashboard**: Overview of active writing projects, entity metrics (tabular numerals), favorite names, recent AI generations, and quick actions.
2. **Project Management**: Create, edit, archive, and delete isolated writing universes with custom genre, language, and foundational world settings. Includes a 1-click **Chronicles of Neran** starter universe seeder.
3. **Contextual Naming Engine (15 Categories)**:
   - Supports *Character names, Surnames, Noble family names, Kingdom names, Country names, City names, Continent names, Organization names, Guild names, Weapon names, Artifact names, Ability names, Magic names, Titles and epithets,* and *Custom categories*.
   - Dynamically adapts form inputs based on category.
   - Generates multiple candidates with phonetic pronunciation, in-universe interpretation, linguistic/cultural inspiration, suitability analysis, and variations.
   - Explicitly separates fictional constructed meanings from real-world historical etymology.
   - Supports favoriting, copying, inline editing, saving directly as an Entity, generating phonetic variations, and side-by-side comparison.
4. **Custom Naming Rules**: Define phonetic patterns, prefixes/suffixes, and structural conventions per culture or dynasty that are automatically respected by the AI Naming Engine.
5. **Character Studio (24 Fields)**: Complete psychological, physical, lineage, and narrative arc editor with manual entry, AI Character Architect synthesis, and cross-entity relationships.
6. **World Builder & Nested Gazetteer**: Supports 14 location categories and nested location hierarchies (`Continent → Kingdom → Province → City`).
7. **Organization, Artifact & Power System Studios**: Dedicated workspaces for Noble Houses, Guilds, Secret Orders, Mythic Relics, and bespoke Magic/Cultivation rank structures.
8. **Lore & Chronological Timeline Studio**: Author historical chronicles, myths, and treaties alongside a sorted chronological timeline.
9. **Contextual AI Writing Assistant**: Slide-over assistant with strict user-selected context scopes (*Current Entity*, *Selected Entities*, *Entire Project*, or *No Context*).
10. **Consistency & Continuity Checker**: Identifies *Confirmed Data Conflicts*, *Potential Inconsistencies*, *Missing Information*, and *Creative Possibilities* without ever overwriting user content.

---

## Architecture & Database Security

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (`Dark Editorial Fantasy` design system), Lucide React.
- **Validation**: Zod (`src/lib/validation/schemas.ts`) on both client and server.
- **Database & Auth**:
  - Live persistence and authentication powered by **Firebase Firestore** (`firebase-blueprint.json`, `firestore.rules`) and **Firebase Authentication** (Google Sign-In) with zero-trust multi-tenant ownership rules verified via `@firebase/eslint-plugin-security-rules`.
  - Normalized PostgreSQL + RLS reference migration included at `supabase/migrations/0001_nomen_worldbuilding_schema.sql`.
- **AI Service (`server.ts`)**: Server-side `@google/genai` integration (`gemini-3.8-flash`) with structured JSON schemas and Zod validation.

---

## Local Setup & Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (`.env` based on `.env.example`):
   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   AI_PROVIDER="gemini"
   AI_MODEL="gemini-3.8-flash"
   ```
3. Run development server (port 3000):
   ```bash
   npm run dev
   ```
4. Verify TypeScript & Production Build:
   ```bash
   npm run lint
   npm run build
   ```
