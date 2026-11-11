# NOMEN — AI Worldbuilding Studio: Implementation Roadmap (Phases 1–11 Complete)

## 1. Executive Audit Summary
- **Application**: NOMEN — AI Worldbuilding Studio
- **Runtime Stack**: Vite + React 19 + TypeScript + Tailwind CSS v4 + Express (`server.ts`)
- **Database & Auth**: Firebase Authentication (Google Sign-In) + Cloud Firestore (`ai-studio-95eff9ce-a53c-45ec-b0a2-a924b0829840`) with strict per-user `ownerId` security rules (`firestore.rules`)
- **AI Engine**: Server-side `@google/genai` SDK (`gemini-3-flash-preview` / `gemini-2.5-flash` with Quota-Resilient Editorial Fallback Engine)
- **Asset Storage**: Server-side binary storage (`/uploads/<ownerId>/<projectId>/<filename>`) with magic-byte validation (`POST /api/assets/upload`) and dynamic SVG plate delivery (`GET /api/assets/file/:ownerId/:projectId/:filename`), paired with lightweight Firestore metadata documents (`visual_assets`).

---

## 2. Completed Phases Overview

### Phases 1–6: Foundation & Core Studios (Preserved)
- [x] **Authentication & User Profiles**: Google OAuth + `profiles/{userId}`.
- [x] **Project Management**: Isolated universes (`projects/{projectId}`) + Starter Universe Seeder (*Chronicles of Neran: The Ashen Crown*).
- [x] **Contextual Naming Engine**: 15 categories, custom naming rules, phonetic pronunciation guides, linguistic honesty guardrails.
- [x] **Character Studio**: 24-field character profiles, AI Character Architect, and cross-entity relationships.
- [x] **World Builder**: Nested geographical hierarchy (`Continent -> Kingdom -> Region -> City`) with breadcrumb navigation.
- [x] **Organizations, Artifacts & Power Systems**: Dedicated studios for factions, relics, and custom power rank structures.
- [x] **Lore & Chronological Timeline**: Historical chronicles and sortable timeline events (`sortOrder` + `dateLabel`).
- [x] **Contextual AI Writing Assistant & Continuity Auditor**: Grounded editorial assistant and consistency checker.

### Phase 7: Advanced Writing Experience (Completed)
- [x] **7.1 Version History & Snapshot Restore**: Automatic version snapshots (`entity_versions`) on Character, Location, Organization, Item, Power System, Lore, and Timeline edits, with side-by-side diff comparison and one-click restore.
- [x] **7.2 Reliable Debounced Autosave**: Unsaved/Saving/Saved/Offline/Failed indicators across all editors without spamming version snapshots.
- [x] **7.3 Global Codex Omni-Search (`Ctrl+K` / `⌘K`)**: Instant search across all project entities, lore, timeline events, naming rules, and favorites.
- [x] **7.4 Project Encyclopedia / World Wiki**: Structured Wiki reader with `@Entity` cross-link resolution.

### Phase 8: Advanced AI Intelligence (Completed)
- [x] **8.1 Smart Context Retrieval**: Token-aware relevance ranking for the AI Assistant (`Focused Entity`, `Smart Relevant Canon`, `Full Summary`, `Prompt Only`).
- [x] **8.2 Upgraded Consistency Audit**: Severity classification (`critical`, `warning`, `information`) with direct canon evidence citations.
- [x] **8.3 Multi-Candidate AI Comparison**: Side-by-side comparison of 3 distinct AI candidates in Character Studio, World Builder, and World Studios.
- [x] **8.4 Custom Project AI Instructions**: Per-project persistent editorial directives (`project_ai_settings`).
- [x] **8.5 Save Assistant Output as Canon Entity**: One-click conversion of AI Assistant drafts into Character, Location, Lore, Item, Organization, or Power System records.

### Phase 9: Visual Worldbuilding (Completed)
- [x] **9.1 Interactive Relationship Graph**: Pan/zoom SVG force-arranged constellation (`CanonGraphView.tsx`) with category & relation filters.
- [x] **9.2 Interactive Visual Timeline**: Era Swimlanes, Compact Chronicle Table, and Horizontal Scroller with entity badges.
- [x] **9.3 Bidirectional & Validated Relationship Management**: Duplicate link prevention, inline relationship editing, and optional inverse link creation.

### Phase 10: Data Management, Safety & Analytics (Completed)
- [x] **10.1 Portable Project Export**: Structured JSON v2.0.0, Markdown World Bible (`.md`), and Printable HTML/PDF Report.
- [x] **10.2 Validated Project Import**: Zod schema validation (`NomenProjectExportSchema`) with import into a New Project or Merge into Active Project.
- [x] **10.3 Soft Deletion & Trash Recovery**: Soft-delete to `trash_items` with search, filter, Restore, Restore All, and Empty Trash.
- [x] **10.4 Project Activity Log**: Real-time audit stream (`activity_logs`) with search, action filter, and CSV export.
- [x] **10.5 Real-Time Project Analytics**: Live dashboard metrics across all entity and canon dimensions.

### Phase 11: Visual Asset Studio & Image Management (Completed)
- [x] **11.1 Centralized Visual Asset Studio (`VisualAssetStudioView.tsx`)**: Supporting all 12 asset categories (`character_portrait`, `character_illustration`, `location_illustration`, `kingdom_civilization`, `organization_emblem`, `weapon_artifact`, `armor_equipment`, `magic_ability`, `power_system_illustration`, `world_map`, `novel_cover`, `general_reference`).
- [x] **11.2 Character Visual Profile**: Main portrait in character roster cards and detail headers, full-body/appearance/clothing/weapon/expression reference gallery, and custom visual notes.
- [x] **11.3 Location, Organization, Item & Power Visuals**: Reusable `EntityVisualGallery` integrated into World Builder, Organization Studio, Item & Artifact Studio, and Power System Studio.
- [x] **11.4 Interactive World Map Studio**: High-resolution map upload, Zoom (`50%`–`300%`) & Pan canvas, and interactive Location Map Markers (Pins) linked to Location entities.
- [x] **11.5 Novel Cover Studio**: Portrait `2:3` book cover preview with live customizable Title, Subtitle, and Author typography overlays, plus Dashboard showcase.
- [x] **11.6 AI Image Prompt Assistant & Reviewable Concept Plates**: Transforms entity attributes into structured visual prompts (`mainPrompt`, `negativePrompt`, `artDirectionNotes`, `lightingAndPalette`, `compositionNotes`) and reviewable SVG Editorial Concept Plates without faking raster AI URLs.
