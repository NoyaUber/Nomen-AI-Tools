# Deployment & Production Readiness Checklist — NOMEN Studio (Phases 1–11)

## 1. Environment & Secrets Security
- [x] **No Exposed Secrets**: `GEMINI_API_KEY` is accessed strictly server-side in `server.ts` / `src/lib/ai/server-provider.ts`. No private keys are referenced in client code.
- [x] **Firebase Configuration**: Uses provisioned `firebase-applet-config.json` with Google Authentication and Cloud Firestore (`ai-studio-95eff9ce-a53c-45ec-b0a2-a924b0829840`).

## 2. Database & Storage Readiness
- [x] **Firestore Rules Deployed**: `firestore.rules` covering all 13 collections (`profiles`, `projects`, `entities`, `entity_relations`, `lore_entries`, `timeline_events`, `naming_rules`, `ai_generations`, `favorites`, `entity_versions`, `project_ai_settings`, `trash_items`, `activity_logs`, `visual_assets`) linted and deployed via `fax.DeployRules`.
- [x] **Cascade Deletion**: `deleteProjectWithCascade` cleans up all child collections including `visual_assets`.
- [x] **Binary Upload Validation**: `POST /api/assets/upload` enforces MIME type whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`), 6 MB size cap, and binary magic-byte header verification.

## 3. Build & Runtime Verification
- [x] **TypeScript & Vite Build**: `compile_applet` succeeds cleanly.
- [x] **Linter Verification**: `lint_applet` passes with 0 errors.
- [x] **Server Entry Point**: `server.ts` serves both `/api/*` routes (AI + Asset Upload/Delivery) and the Vite SPA on port `3000`.
