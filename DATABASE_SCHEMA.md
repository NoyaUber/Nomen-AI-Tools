# Database Schema & Security Architecture — NOMEN Studio (Phases 1–11)

## 1. Database Engine & Isolation Model
- **Database**: Google Cloud Firestore (`ai-studio-95eff9ce-a53c-45ec-b0a2-a924b0829840`)
- **Security Rules**: `/firestore.rules` (enforced on all reads/writes)
- **Ownership Contract**: Every document in every collection stores an immutable `ownerId` matching `request.auth.uid`. Cross-user access is strictly denied at the Firestore rules level.
- **Binary Image Storage Rule**: Raw image binaries are **never** stored inside Firestore documents. Uploaded images are validated and stored on the Express server (`/uploads/<ownerId>/<projectId>/<filename>`), while Firestore (`visual_assets`) stores only metadata, dimensions, entity associations, and `storagePath` / `publicUrl` references.

---

## 2. Collections Overview (13 Collections)

### 2.1 `profiles/{userId}`
Stores authenticated author profile settings (`ownerId`, `displayName`, `email`, `defaultGenre`, `createdAt`, `updatedAt`).

### 2.2 `projects/{projectId}`
Stores isolated writing universes (`ownerId`, `title`, `description`, `genre`, `worldSettings`, `language`, `status`, `createdAt`, `updatedAt`).

### 2.3 `entities/{entityId}`
Unified worldbuilding entity store for `character`, `location`, `organization`, `family`, `item`, and `ability` (`ownerId`, `projectId`, `category`, `subCategory`, `name`, `subtitle`, `summary`, `parentId`, `attributes`, `createdAt`, `updatedAt`).

### 2.4 `entity_relations/{relationId}`
Directed, typed relationships between any two entities (`ownerId`, `projectId`, `sourceEntityId`, `sourceEntityName`, `targetEntityId`, `targetEntityName`, `relationType`, `description`, `createdAt`).

### 2.5 `lore_entries/{loreId}`
Encyclopedia articles, myths, religions, and historical chronicles (`ownerId`, `projectId`, `title`, `category`, `era`, `summary`, `content`, `createdAt`, `updatedAt`).

### 2.6 `timeline_events/{eventId}`
Chronological events ordered by numeric `sortOrder` (`ownerId`, `projectId`, `title`, `dateLabel`, `sortOrder`, `era`, `category`, `locationName`, `participants`, `description`, `createdAt`, `updatedAt`).

### 2.7 `naming_rules/{ruleId}`
Cultural and linguistic naming conventions (`ownerId`, `projectId`, `title`, `category`, `cultureOrGroup`, `phoneticPattern`, `prefixSuffixRule`, `structureRule`, `examples`, `isActive`, `createdAt`, `updatedAt`).

### 2.8 `ai_generations/{generationId}`
Audit history of AI naming and blueprint generations (`ownerId`, `projectId`, `generationType`, `category`, `promptSummary`, `resultsSummary`, `modelUsed`, `createdAt`).

### 2.9 `favorites/{favoriteId}`
Curated names and candidates (`ownerId`, `projectId`, `name`, `pronunciation`, `category`, `interpretation`, `inspiration`, `suitability`, `titleOrVariation`, `createdAt`).

### 2.10 `entity_versions/{versionId}` (Phase 7)
Point-in-time snapshots for entities, lore entries, and timeline events (`ownerId`, `projectId`, `targetId`, `targetType`, `targetName`, `versionNumber`, `changeSummary`, `snapshot`, `authorName`, `createdAt`).

### 2.11 `project_ai_settings/{settingId}` (Phase 8)
Per-project custom AI instructions (`ownerId`, `projectId`, `instructions`, `isEnabled`, `createdAt`, `updatedAt`).

### 2.12 `trash_items/{trashId}` & `activity_logs/{logId}` (Phase 10)
Soft-deleted records (`trash_items`) for non-destructive recovery and chronological audit trail (`activity_logs`).

### 2.13 `visual_assets/{assetId}` (Phase 11)
Metadata and storage references for project images, portraits, location art, emblems, artifacts, interactive world maps, and novel covers:
- `ownerId` (`string`, required, immutable): UID of the owning author.
- `projectId` (`string`, required, immutable): Parent project ID.
- `entityId` (`string`, optional): Associated entity ID (`""` for project-wide assets such as novel covers).
- `entityType` (`string`): Associated entity category (`character`, `location`, `organization`, `item`, `ability`, `project`).
- `entityName` (`string`): Cached display name of the linked entity.
- `assetCategory` (`string`, enum): One of the 12 supported categories (`character_portrait`, `character_illustration`, `location_illustration`, `kingdom_civilization`, `organization_emblem`, `weapon_artifact`, `armor_equipment`, `magic_ability`, `power_system_illustration`, `world_map`, `novel_cover`, `general_reference`).
- `subRole` (`string`): Specific visual role (e.g., `Main Portrait`, `Full-Body Illustration`, `Organization Logo`, `Continent Map`, `Novel Cover`).
- `fileName` (`string`): Display filename.
- `mimeType` (`string`, enum): `image/jpeg`, `image/png`, `image/webp`, or `image/svg+xml`.
- `fileSize` (`number`): Size in bytes (`0` to `20,971,520`).
- `width` / `height` (`number`): Image dimensions in pixels.
- `storagePath` (`string`): Server storage path (`uploads/<ownerId>/<projectId>/<filename>`).
- `publicUrl` (`string`): Delivery URL (`/api/assets/file/<ownerId>/<projectId>/<filename>`).
- `description` (`string`): Visual description / art notes (`<= 4000` chars).
- `metadataJson` (`string`): Serialized JSON for interactive map pins (`{ pins: MapMarkerPin[] }`) or novel cover typography overlay settings (`<= 12000` chars).
- `isPrimary` (`boolean`): Whether this asset is the Main Portrait / Primary Image for its linked entity or category.
- `createdAt` / `updatedAt` (`timestamp`).
