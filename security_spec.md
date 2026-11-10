# NOMEN — AI Worldbuilding Studio Security Specification

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Identity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Strict Ownership Isolation (PII & Multi-Tenant Project Isolation)**:
   - `/profiles/{userId}` can ONLY be read or written when `request.auth.uid == userId` and `incoming().ownerId == request.auth.uid`.
   - `/projects/{projectId}` can ONLY be read, listed, created, updated, or deleted by `ownerId == request.auth.uid`.
4. **Relational Master Gate**:
   - Every child document (`entities`, `entity_relations`, `lore_entries`, `timeline_events`, `naming_rules`, `ai_generations`, `favorites`) MUST reference an existing `/projects/{projectId}` document whose `ownerId == request.auth.uid`.
5. **Immutable Identity & Temporal Integrity**:
   - `ownerId`, `projectId`, and `createdAt` are strictly immutable during updates.
   - `createdAt` on create and `updatedAt` on update must equal `request.time`.
6. **Strict Schema & Volumetric Bounds**:
   - Every string field enforces `.size() <= maxLength` matching `firebase-blueprint.json`.
   - Every write enforces `.keys().hasAll(...)` and `.keys().hasOnly(...)` (no shadow fields).

---

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Project Create**: Authenticated user `user_A` attempts to create `/projects/proj_1` with `ownerId: "user_B"`.
2. **Unverified Email Write**: Authenticated user `user_A` with `email_verified: false` attempts to create `/projects/proj_1`.
3. **PII Leak on Profiles**: Authenticated user `user_B` attempts `get` or `list` on `/profiles/user_A`.
4. **Cross-Tenant Project Read/List**: Authenticated user `user_B` attempts `list` on `/projects` without filtering by `ownerId == "user_B"`.
5. **Orphaned Entity Creation**: Authenticated user `user_A` attempts to create `/entities/ent_1` with a non-existent `projectId: "ghost_proj"`.
6. **Cross-Tenant Entity Injection**: Authenticated user `user_B` attempts to create `/entities/ent_1` referencing `user_A`'s `projectId`.
7. **Shadow Field Injection on Update**: Authenticated user `user_A` updates `/projects/proj_1` and injects `isAdmin: true`.
8. **Immutable Field Mutation (`ownerId` / `projectId`)**: Authenticated user `user_A` updates `/entities/ent_1` to change `projectId` or `ownerId`.
9. **Client Timestamp Forgery**: Authenticated user `user_A` creates `/projects/proj_1` with a forged past/future `createdAt` instead of `request.time`.
10. **Denial-of-Wallet Oversized String**: Authenticated user `user_A` sends a 50,000-character string in `Project.title` (exceeding `maxLength: 160`).
11. **ID Poisoning Attack**: Authenticated user `user_A` attempts to create `/projects/invalid$id!with*spaces` violating `^[a-zA-Z0-9_\-]+$`.
12. **Terminal / Invalid Enum State**: Authenticated user `user_A` updates `/projects/proj_1` with `status: "hacked_state"` (outside `["active", "archived"]`).

---

## 3. Red Team Audit & Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning | Shadow Update | PII Blanket | Query Trust |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/profiles/{userId}` | Blocked (`userId == auth.uid`) | N/A | Blocked (`size()` caps) | Blocked (`hasOnly`) | Blocked (Owner-only `get`, `list: false`) | Pass |
| `/projects/{projectId}` | Blocked (`ownerId == auth.uid`) | Blocked (`status in ['active','archived']`) | Blocked (`size()` caps) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/entities/{entityId}` | Blocked (`ownsProject(projectId)`) | Blocked (enum validation) | Blocked (`attributes.size() <= 50`) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/entity_relations/{relationId}` | Blocked (`ownsProject(projectId)`) | N/A | Blocked (`size()` caps) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/lore_entries/{loreId}` | Blocked (`ownsProject(projectId)`) | N/A | Blocked (`size()` caps) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/timeline_events/{eventId}` | Blocked (`ownsProject(projectId)`) | N/A | Blocked (`size()` caps) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/naming_rules/{ruleId}` | Blocked (`ownsProject(projectId)`) | N/A | Blocked (`size()` caps) | Blocked (`affectedKeys().hasOnly`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/ai_generations/{generationId}` | Blocked (`ownsProject(projectId)`) | Immutable log (`update: false`) | Blocked (`size()` caps) | Blocked (`update: false`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
| `/favorites/{favoriteId}` | Blocked (`ownsProject(projectId)`) | Immutable item (`update: false`) | Blocked (`size()` caps) | Blocked (`update: false`) | Pass | Blocked (`resource.data.ownerId == auth.uid`) |
