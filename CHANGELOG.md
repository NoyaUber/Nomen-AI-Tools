# Changelog — NOMEN: AI Worldbuilding Studio

## [Phase 11.0.0] — Visual Asset Studio & Image Management
### Added
- **Centralized Visual Asset Studio (`/src/features/assets/VisualAssetStudioView.tsx`)**:
  - Supports all 12 canonical asset categories: Character Portraits, Character Illustrations, Location Illustrations, Kingdom & Civilization Illustrations, Organization Emblems, Weapons & Artifacts, Armor & Equipment, Magic & Abilities, Power System Illustrations, World Maps, Novel Covers, and General Visual References.
  - Grid and List view modes, instant search, category filter, associated entity filter, sort by upload date/name/primary status, full-screen Lightbox preview, image replacement, metadata editing, and confirmed deletion.
- **Binary Image Upload & Magic-Byte Validation (`POST /api/assets/upload` & `GET /api/assets/file/:ownerId/:projectId/:filename`)**:
  - Validates MIME type (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`), file size (up to 6 MB), and binary magic-byte signatures before storing files in `/uploads/<ownerId>/<projectId>/`.
  - Stores only lightweight metadata and storage references in Firestore (`visual_assets`), keeping Firestore documents well under the 1 MB limit.
- **Character Visual Profile (`CharacterStudioView.tsx` & `EntityVisualGallery.tsx`)**:
  - Displays main character portraits on roster cards and character detail headers.
  - Supports multiple gallery images per character (Main Portrait, Full-Body Illustration, Appearance Reference, Clothing & Attire Reference, Weapon Reference, Expression Sheet) plus persistent Custom Visual Notes.
- **Location, Organization, Artifact & Power System Visuals (`WorldBuilderView.tsx` & `WorldStudiosView.tsx`)**:
  - Attached visual reference galleries for Continents, Kingdoms, Cities, Noble Family Crests, Organization Emblems, Weapons/Relics, and Power System diagrams.
- **Interactive World Map Studio**:
  - Upload world, continent, regional, and kingdom maps with interactive Zoom (`50%`–`300%`) & Pan controls and clickable Location Map Markers (Pins) linked to canonical Location entities.
- **Novel Cover Studio & Dashboard Showcase**:
  - Portrait `2:3` book cover preview with live editable Title, Subtitle, and Author Name overlays, plus primary cover display on the Project Dashboard.
- **AI Image Prompt Assistant (`POST /api/ai/image-prompt` & `POST /api/ai/generate-image`)**:
  - Synthesizes structured visual prompts from character, location, artifact, organization, power system, and cover descriptions, with transparent Free-Tier handling and reviewable Editorial Vector Concept Plates (`.svg`).

## [Phase 10.0.0] — Data Management, Recovery & Analytics
### Added
- **Portable Export & Validated Import**: JSON v2.0.0 bundle export/import (New Project or Merge), Markdown World Bible (`.md`), and Printable Report view.
- **Soft-Delete Trash & Activity Log**: Full search/filter/restore/empty controls for Trash (`trash_items`) and searchable/CSV-exportable Activity Log (`activity_logs`).
- **Firestore Rules Fix**: Resolved `saveProjectAiSettings` and `restoreEntityVersion` non-existent document check by using `getDocs(query(..., where('ownerId', '==', uid), where('projectId', '==', projectId)))`.

## [Phases 7.0.0 – 9.0.0] — Advanced Writing Experience, AI Intelligence & Visual Worldbuilding
### Added
- Version history & diff restore (`entity_versions`), debounced autosave, `Ctrl+K` Omni-Search, Encyclopedia Wiki, Smart AI Context Retrieval, Multi-Candidate AI Comparison, Custom AI Instructions (`project_ai_settings`), Interactive Relationship Graph, and Visual Timeline.
