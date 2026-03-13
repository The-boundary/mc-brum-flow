# Eliminate Unnecessary Fallbacks — Implementation Plan v03

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace silent bug-hiding fallbacks with explicit error handling that surfaces failures via toasts, logs, and UI warnings -- while preserving intentional defaults that represent legitimate design decisions.

**Architecture:** React 19 + Vite 6 + Express 4 + TypeScript + Zustand stores + Socket.IO + Vitest. Client toast system (`showToast()`) exists but is underutilized. Server has Pino structured logger and `emitMaxLog()` for real-time debug feed. Error infrastructure is in place -- the problem is that code bypasses it with silent fallbacks.

**Repos:**
- MC-Brum-Flow: `/home/stan/Desktop/the-boundary/mc-brum-flow`

**Revision history:**
- v01: Initial plan
- v02: Addressed all 11 Codex feedback items. Fixed: Task 1 uses `res.text()` then `JSON.parse`; Task 2 handles delete routes returning `{ success: true }` without `data`; Task 3 adds `pathResolutionError` store flag; Task 4 type guard matches actual `Camera` fields; Task 11 corrected rationale (empty arrays ARE truthy in JS); Task 12 imports existing `FlowConfig` type; Tasks 8-10 pipe warnings through `emitMaxLog()`; Task 14/20 double-toast resolved (store toasts, panels do not duplicate); Task 22 fixed (store does NOT toast, panel handles both success and error toasts); Task 6 picks explicit testing approach; Task 17 confirms prefix preservation and lists affected test.
- v03: Addressed all 7 Codex round-2 feedback items. Fixed: Task 2 keeps strict `data` validation in `request<T>()` and adds separate `requestVoid()` for delete endpoints; Task 3 guards path-based actions at the STORE level (`setResolvedPathEnabled`, `setOutputPathsEnabled`, `setAllResolvedPathsEnabled`) so all UI panels are protected; Task 22 returns discriminated result from `pushToMax` and handles BrumFlowPage call site; Tasks 8-10 surface warnings through `/resolve-paths` route response AND in client UI; Task 12 adds runtime guard function `isFlowConfigPayload()`; Task 4 adds `max_class` to type guard; Implementation notes corrected — server's `ResolvedFlowPath` and client's `ResolvedPath` are separate types.

---

## Phase Overview

| Phase | Focus | Tasks | Est. Effort |
|-------|-------|-------|-------------|
| 1 | Critical crash fix + silent data loss on client | 5 tasks | Medium |
| 2 | Server-side silent fallbacks that hide broken state | 5 tasks | Medium |
| 3 | Client store robustness | 5 tasks | Medium |
| 4 | TCP message validation + route-level feedback | 4 tasks | Small |
| 5 | UI panel defensive patterns | 4 tasks | Small |

---

## Progress Tracker

### Phase 1: Client-Side Critical Fixes
- [ ] Task 1: Fix `api.ts` error body loss on non-OK responses
- [ ] Task 2: Add `requestVoid()` helper for delete endpoints; tighten `request<T>()` success check
- [ ] Task 3: Surface `resolvePaths` failures via toast, `pathResolutionError` flag, and store-level path action guards
- [ ] Task 4: Validate `importCamerasFromMax` result type before casting (including `max_class`)
- [ ] Task 5: Fix camera filter fallback showing ALL cameras on handle extraction failure

### Phase 2: Server-Side Silent Fallbacks
- [ ] Task 6: Log which fallback level fired in `resolveTargetPath`
- [ ] Task 7: Warn on disabled-path substitution in `resolveTargetPath`
- [ ] Task 8: Warn on missing camera DB record in `resolveSinglePath`
- [ ] Task 9: Warn on skipped config delta merge in `resolveSinglePath`
- [ ] Task 10: Warn on missing output node in `resolveSinglePath`

### Phase 3: Client Store Robustness
- [ ] Task 11: Replace `||` with `??` for flow config arrays in `flowStore.ts`
- [ ] Task 12: Type-narrow socket `flow-config:updated` payload with runtime guard
- [ ] Task 13: Surface `saveGraph` errors via toast
- [ ] Task 14: Surface `createNodeConfig` / `updateNodeConfig` / `deleteNodeConfig` failures via toast
- [ ] Task 15: Log auto-scene selection on initial load

### Phase 4: TCP + Route Validation
- [ ] Task 16: Log invalid cameras dropped during Max import
- [ ] Task 17: Replace `Date.now()` instance ID fallback with UUID
- [ ] Task 18: Log default PID and empty eval_result in TCP message processing
- [ ] Task 19: Document and log the `format` default to 'EXR' in submit-render

### Phase 5: UI Panel Defensive Patterns
- [ ] Task 20: Rely on store toasts from Task 14 for `ensureEditableConfig` failure in DetailPanel
- [ ] Task 21: Surface `commitParameterValue` silent exit via toast
- [ ] Task 22: Return discriminated result from `pushToMax`; handle all call sites
- [ ] Task 23: Warn on unknown node types in `NODE_PARAMETER_GROUPS` lookup

---

## Phase 1: Client-Side Critical Fixes

These fix data loss and incorrect control flow in the API client and stores.

### Task 1: Fix `api.ts` error body loss on non-OK responses

The `res.json().catch(() => ({}))` on line 47 silently discards the server's error response body when JSON parsing fails. This means `ApiError` gets created with no `code`, no `details` -- the caller (e.g., `pushToMax`) can't match on `err.code === 'max_camera_not_found'` if the error body was lost.

**Files:**
- `client/src/lib/api.ts` (line 47) -- use `res.text()` then `JSON.parse` for better error diagnostics
- `client/src/lib/api.test.ts` -- add tests for `request()` error body handling

**Steps:**
1. In `request()`, change the error-path body parsing (line 47) from:
   ```ts
   const body = await res.json().catch(() => ({}));
   throw toApiError(body, res.status, `API error: ${res.status}`);
   ```
   to:
   ```ts
   const rawText = await res.text();
   let body: unknown;
   try {
     body = JSON.parse(rawText);
   } catch {
     throw new ApiError(
       `API error: ${res.status} (response body not valid JSON)`,
       { status: res.status, details: { rawBody: rawText.slice(0, 500) } },
     );
   }
   throw toApiError(body, res.status, `API error: ${res.status}`);
   ```
   This approach reads as text first, then tries to parse. When the server returns non-JSON (e.g., nginx 502 HTML page), the truncated body is included in `details` for debugging.

2. Add tests in `api.test.ts` for the `request()` function (these currently only test `ApiError` construction):
   - Test that a non-OK response with valid JSON error body produces an `ApiError` with the right `code` and `message`
   - Test that a non-OK response with non-JSON body (e.g., HTML) produces an `ApiError` with the status and `rawBody` in details
   - Test that a non-OK response with `{ success: false, error: { message: '...', code: '...' } }` produces the correct `ApiError`

**Verification:**
- `npm test` passes
- Manually verify by checking that a 502 from nginx still produces a readable error

---

### Task 2: Add `requestVoid()` helper for delete endpoints; tighten `request<T>()` success check

Line 57: `if (data.success === false)` only catches explicit `false`. If `success` is `undefined` (field missing from response), the code treats it as a success and proceeds to `data.data`. This is the wrong polarity -- the API convention is `{ success: true, data: ... }`, so missing `success` should be treated as an error.

However, delete routes (`DELETE /scenes/:id`, `DELETE /node-configs/:id`, `DELETE /cameras/:id`) return `{ success: true }` without a `data` field. Removing the `data.data === undefined` check globally would mean a broken response from `fetchScenes()` or `resolvePaths()` would quietly return `undefined` instead of throwing. We need to keep strict `data` validation for `request<T>()` while allowing delete endpoints to succeed without a `data` field.

**Files:**
- `client/src/lib/api.ts` (lines 40-60) -- tighten `request<T>()` and add `requestVoid()`
- `client/src/lib/api.test.ts` -- add tests for both functions

**Steps:**
1. Tighten `request<T>()` (lines 56-59) to require both `success: true` AND `data` field:
   ```ts
   const data = json as Record<string, unknown>;
   if (data.success !== true) throw toApiError(json, res.status, 'API error: unexpected response format');
   if (data.data === undefined) throw new Error('API error: response missing data field');
   return data.data as T;
   ```
   This catches both `success: false` and missing/undefined `success`, AND still requires `data` for non-void endpoints. A broken server response that returns `{ success: true }` without `data` to `fetchScenes()` will now throw instead of silently returning `undefined`.

2. Add a `requestVoid()` function for delete endpoints that only need to confirm `success: true`:
   ```ts
   async function requestVoid(url: string, options?: RequestInit): Promise<void> {
     const res = await fetch(`${BASE}${url}`, {
       credentials: 'include',
       headers: { 'Content-Type': 'application/json', ...options?.headers },
       ...options,
     });
     if (!res.ok) {
       const rawText = await res.text();
       let body: unknown;
       try {
         body = JSON.parse(rawText);
       } catch {
         throw new ApiError(
           `API error: ${res.status} (response body not valid JSON)`,
           { status: res.status, details: { rawBody: rawText.slice(0, 500) } },
         );
       }
       throw toApiError(body, res.status, `API error: ${res.status}`);
     }
     let json: unknown;
     try {
       json = await res.json();
     } catch {
       throw new Error(`API error: invalid JSON response (${res.status})`);
     }
     const data = json as Record<string, unknown>;
     if (data.success !== true) throw toApiError(json, res.status, 'API error: unexpected response format');
     // No data field required — void endpoints return { success: true } only
   }
   ```

3. Update delete endpoint exports to use `requestVoid`:
   ```ts
   export const deleteScene = (id: string) => requestVoid(`/scenes/${id}`, { method: 'DELETE' });
   export const deleteNodeConfig = (id: string) => requestVoid(`/node-configs/${id}`, { method: 'DELETE' });
   export const deleteCamera = (id: string) => requestVoid(`/cameras/${id}`, { method: 'DELETE' });
   ```

4. Add tests:
   - `request<T>()`: Response with `{ success: true }` (no data field) throws `'response missing data field'`
   - `request<T>()`: Response with `{ success: true, data: 'foo' }` succeeds and returns `'foo'`
   - `request<T>()`: Response with `{ data: 'foo' }` (no success field) throws
   - `requestVoid()`: Response with `{ success: true }` succeeds (returns void)
   - `requestVoid()`: Response with `{ success: false }` throws

**Verification:**
- `npm test` passes
- Existing delete operations continue to work
- `fetchScenes()`, `resolvePaths()`, etc. throw if the server returns a broken response missing `data`

---

### Task 3: Surface `resolvePaths` failures via toast, `pathResolutionError` flag, and store-level path action guards

`flowStore.ts` line 667-677: when `resolvePaths` throws, the catch block does `console.warn` and silently sets `resolvedPaths: [], pathCount: 0`. The user sees all their output paths vanish with no explanation. Additionally, path-based write actions should be disabled when path resolution has failed.

Multiple UI panels call path toggle actions: OutputPreviewPanel (line 101 `setResolvedPathEnabled`, line 55 `setAllResolvedPathsEnabled`), MatrixView (line 44 `setResolvedPathEnabled`), and DetailPanel (lines 1064 `setOutputPathsEnabled`, 1167 `setResolvedPathEnabled`). Rather than guarding each UI call site, guard at the STORE level so all panels are protected.

**Files:**
- `client/src/stores/flowStore.ts` -- add `pathResolutionError` flag, guard `setResolvedPathEnabled`/`setOutputPathsEnabled`/`setAllResolvedPathsEnabled`, toast on failure
- `client/src/components/output/OutputPreviewPanel.tsx` -- use flag to disable push/submit buttons

**Steps:**
1. Add `pathResolutionError: boolean` to the `FlowState` interface (after `pathCount`):
   ```ts
   pathResolutionError: boolean;
   ```
   Initialize it as `false` in the store defaults.

2. In the `resolvePaths` action, set `pathResolutionError: false` on success and `true` on failure:
   ```ts
   resolvePaths: async () => {
     const { activeSceneId } = get();
     if (!activeSceneId) return;
     try {
       const result = await api.resolvePaths(activeSceneId);
       set({ resolvedPaths: result.paths, pathCount: result.count, pathResolutionError: false });
     } catch (err) {
       const message = err instanceof Error ? err.message : 'Path resolution failed';
       console.warn('Path resolution failed:', message);
       get().showToast(`Path resolution failed: ${message}`, 'error');
       set({ pathResolutionError: true });
       // Do NOT clear resolvedPaths -- keep stale data rather than showing empty
     }
   },
   ```

3. Add early-return guards to the three path-toggle store actions. When `pathResolutionError` is true, show a toast and refuse the write:

   In `setResolvedPathEnabled`:
   ```ts
   setResolvedPathEnabled: async (pathKey, outputNodeId, enabled) => {
     if (get().pathResolutionError) {
       get().showToast('Cannot toggle paths — path resolution is stale', 'error');
       return;
     }
     // ... existing logic
   },
   ```

   In `setOutputPathsEnabled`:
   ```ts
   setOutputPathsEnabled: async (outputNodeId, pathKeys, enabled) => {
     if (pathKeys.length === 0) return;
     if (get().pathResolutionError) {
       get().showToast('Cannot toggle paths — path resolution is stale', 'error');
       return;
     }
     // ... existing logic
   },
   ```

   In `setAllResolvedPathsEnabled`:
   ```ts
   setAllResolvedPathsEnabled: async (enabled) => {
     if (get().pathResolutionError) {
       get().showToast('Cannot toggle paths — path resolution is stale', 'error');
       return;
     }
     // ... existing logic
   },
   ```

4. In `OutputPreviewPanel.tsx`, subscribe to `pathResolutionError`:
   ```ts
   const pathResolutionError = useFlowStore((s) => s.pathResolutionError);
   ```
   Use it to disable push/submit buttons:
   - Add `disabled={pushing || pathResolutionError}` to the push button
   - Add `disabled={submitting || pathResolutionError}` to the submit button

5. Add tests:
   - Test that the store sets `pathResolutionError: true` on resolution failure and does NOT clear `resolvedPaths` (mock `api.resolvePaths` to reject)
   - Test that `setResolvedPathEnabled` does nothing and shows a toast when `pathResolutionError` is true
   - Test that `setAllResolvedPathsEnabled` does nothing and shows a toast when `pathResolutionError` is true

**Verification:**
- `npm test` passes
- If the server is down, the user sees a red toast instead of a mysteriously empty output panel
- Push/submit buttons are disabled when paths are stale
- Path toggles in ALL panels (OutputPreviewPanel, MatrixView, DetailPanel) are blocked when resolution is stale

---

### Task 4: Validate `importCamerasFromMax` result type before casting (including `max_class`)

`flowStore.ts` line 856: `Array.isArray(result.cameras) ? (result.cameras as Camera[]) : []` -- the `as Camera[]` cast is unsafe. If the server returns an array of objects missing required `Camera` fields, downstream code will fail in confusing ways.

The actual `Camera` type from `shared/types/index.ts` is:
```ts
interface Camera {
  id: string;
  scene_id: string;
  name: string;
  max_handle: number;
  max_class: string;
  created_at: string;
  updated_at: string;
}
```

The type guard should check the fields that the store and UI actually depend on:
- `id` (string) — used by merge logic and node-creation
- `name` (string) — used as node label and in display
- `max_handle` (number) — used by camera matching in `pushToMax`
- `max_class` (string) — read by `DetailPanel.tsx` (line 387: `camera.max_class && <Row label="Class" ...>`) and `CameraFlowNode.tsx` (line 50: `camera?.max_class && ...`)

**Files:**
- `client/src/stores/flowStore.ts` (line 856) -- add runtime validation
- Add test for malformed camera data

**Steps:**
1. Add a validation function near the top of `flowStore.ts`:
   ```ts
   function isValidCamera(value: unknown): value is Camera {
     return (
       typeof value === 'object' &&
       value !== null &&
       typeof (value as Record<string, unknown>).id === 'string' &&
       typeof (value as Record<string, unknown>).name === 'string' &&
       typeof (value as Record<string, unknown>).max_handle === 'number' &&
       typeof (value as Record<string, unknown>).max_class === 'string'
     );
   }
   ```
   Note: We check `id`, `name`, `max_handle`, and `max_class` because all four are read by downstream store logic or UI components. The remaining fields (`scene_id`, `created_at`, `updated_at`) come from the DB response and are always present in practice but aren't critical for the store's merge/node-creation/display logic.

2. Replace line 856:
   ```ts
   const importedCameras = Array.isArray(result.cameras)
     ? result.cameras.filter(isValidCamera)
     : [];
   ```

3. After the filter, if any cameras were dropped, log a warning:
   ```ts
   const rawCount = Array.isArray(result.cameras) ? result.cameras.length : 0;
   if (importedCameras.length < rawCount) {
     console.warn(`Dropped ${rawCount - importedCameras.length} invalid camera records from Max import`);
   }
   ```

**Verification:**
- `npm test` passes
- Test: passing `[{ id: '1', name: 'Cam', max_handle: 1, max_class: 'Physical' }, { bad: true }]` filters out the bad one
- Test: camera missing `max_class` is also filtered out

---

### Task 5: Fix camera filter fallback showing ALL cameras on handle extraction failure

`flowStore.ts` lines 969-971: When `availableHandles` is null (handle extraction failed), the fallback `cameras` shows ALL DB cameras as candidates for re-matching. This is misleading -- the user sees cameras that don't exist in the Max scene.

**Files:**
- `client/src/stores/flowStore.ts` (lines 960-972) -- distinguish "no handles extracted" from "handles extracted but empty"

**Steps:**
1. Change lines 969-971 from:
   ```ts
   const availableCameras = availableHandles && availableHandles.size > 0
     ? cameras.filter((camera) => availableHandles.has(camera.max_handle))
     : cameras;
   ```
   to:
   ```ts
   const availableCameras = availableHandles
     ? cameras.filter((camera) => availableHandles.has(camera.max_handle))
     : cameras;
   ```
   This way, if `availableHandles` is a Set (even empty), we filter. Only if the error response didn't include `available_cameras` at all (null) do we fall back to all cameras -- which is the correct "we don't know what's in Max" behavior.

2. Additionally, when `availableHandles` is a non-null Set with size 0, show a toast:
   ```ts
   if (availableHandles && availableHandles.size === 0) {
     get().showToast('No cameras found in the 3ds Max scene', 'error');
   }
   ```

**Verification:**
- `npm test` passes
- Test: when `available_cameras` is `[]`, the prompt shows no available cameras (instead of showing all DB cameras)

---

## Phase 2: Server-Side Silent Fallbacks

These add logging and structured feedback to the server's sync/resolution pipeline so problems are visible instead of silently masked.

### Task 6: Log which fallback level fired in `resolveTargetPath`

`max-sync.ts` lines 341-371: The 4-level cascade (preferredPathKey -> preferredPathIndex -> syncState.active_path_key -> first enabled) has NO logging. When the system syncs an unexpected path, there's no way to diagnose which fallback fired.

`resolveTargetPath` is a file-private function (not exported). **Testing approach:** Export it directly. It is pure logic (takes paths array, sync state, and input; returns a result) with no side effects, making it safe and easy to test in isolation. This is preferable to testing indirectly through `syncSceneToMaxNow`, which requires mocking the database, MCP client, and socket events.

**Files:**
- `server/src/services/max-sync.ts` (function `resolveTargetPath`, lines 341-371) -- add structured log at each level, export the function
- `server/src/services/max-sync.test.ts` (new file) -- test the resolution cascade

**Steps:**
1. Change the function signature from `function resolveTargetPath(...)` to `export function resolveTargetPath(...)`.

2. Add `logger.debug()` calls and a `resolvedVia` variable. The current code is:
   ```ts
   function resolveTargetPath(
     paths: ResolvedFlowPath[],
     syncState: MaxSyncState | null,
     input: SyncSceneNowInput,
   ) {
     let path = input.preferredPathKey
       ? paths.find((candidate) => candidate.pathKey === input.preferredPathKey)
       : undefined;

     if (!path && input.preferredPathIndex !== undefined) {
       path = paths[input.preferredPathIndex];
     }

     if (!path && syncState?.active_path_key) {
       path = paths.find((candidate) => candidate.pathKey === syncState.active_path_key);
     }

     if (!path) {
       path = paths.find((candidate) => candidate.enabled);
     }

     if (!path) {
       return null;
     }

     if (!path.enabled && !input.force) {
       path = paths.find((candidate) => candidate.enabled);
     }

     return path ? { path } : null;
   }
   ```

   Replace with:
   ```ts
   export function resolveTargetPath(
     paths: ResolvedFlowPath[],
     syncState: MaxSyncState | null,
     input: SyncSceneNowInput,
   ) {
     let path: ResolvedFlowPath | undefined;
     let resolvedVia = 'none';

     if (input.preferredPathKey) {
       path = paths.find((candidate) => candidate.pathKey === input.preferredPathKey);
       if (path) resolvedVia = 'preferredPathKey';
     }

     if (!path && input.preferredPathIndex !== undefined) {
       path = paths[input.preferredPathIndex];
       if (path) resolvedVia = 'preferredPathIndex';
     }

     if (!path && syncState?.active_path_key) {
       path = paths.find((candidate) => candidate.pathKey === syncState.active_path_key);
       if (path) resolvedVia = 'syncState.active_path_key';
     }

     if (!path) {
       path = paths.find((candidate) => candidate.enabled);
       if (path) resolvedVia = 'firstEnabled';
     }

     if (!path) {
       logger.debug({ pathCount: paths.length }, 'resolveTargetPath: no viable path found');
       return null;
     }

     if (!path.enabled && !input.force) {
       const original = path;
       path = paths.find((candidate) => candidate.enabled);
       if (path) {
         resolvedVia = `substituted(was:${resolvedVia})`;
       }
     }

     logger.debug({ resolvedVia, pathKey: path?.pathKey }, 'resolveTargetPath: resolved');
     return path ? { path } : null;
   }
   ```

3. Write tests in `server/src/services/max-sync.test.ts`:
   - Mock `logger.js` and `config.js` (same pattern as `max-tcp-server.test.ts`)
   - Test: preferredPathKey match returns the correct path
   - Test: preferredPathIndex fallback when preferredPathKey is missing
   - Test: syncState.active_path_key fallback
   - Test: firstEnabled fallback
   - Test: disabled path substitution — when resolved path is disabled and `force=false`, substitutes with first enabled
   - Test: returns null when no paths at all
   - Test: returns null when all paths are disabled and `force=false`

**Verification:**
- `npm test` passes
- Server logs show `resolveTargetPath: resolved via=...` in debug output during sync

---

### Task 7: Warn on disabled-path substitution in `resolveTargetPath`

Lines 366-368: When a resolved path is disabled, the code silently replaces it with the first enabled path. This can cause confusion -- the user explicitly selected a path, but a different one syncs.

This is addressed as part of Task 6 (the logging). But we should also emit a `max:log` event so the frontend debug panel shows it.

**Files:**
- `server/src/services/max-sync.ts` (lines 366-368, same area as Task 6)

**Steps:**
1. Inside the disabled-path substitution block (added in Task 6), add an `emitMaxLog` call:
   ```ts
   if (!path.enabled && !input.force) {
     const original = path;
     path = paths.find((candidate) => candidate.enabled);
     if (path) {
       logger.info(
         { originalPathKey: original.pathKey, substitutedPathKey: path.pathKey },
         'resolveTargetPath: disabled path substituted with enabled alternative'
       );
       emitMaxLog({
         level: 'warn',
         summary: `sync:path-substituted — requested path is disabled`,
         detail: `Original: ${original.pathKey}\nSubstituted: ${path.pathKey}`,
       });
       resolvedVia = `substituted(was:${resolvedVia})`;
     }
   }
   ```
   Note: `emitMaxLog` is defined in `max-sync.ts` at line 12, so it's available within the module.

**Verification:**
- The Max Debug Panel in the UI shows a yellow warning when a disabled path is substituted

---

### Task 8: Warn on missing camera DB record in `resolveSinglePath`

`flowResolver.ts` line 207: `cameras[node.camera_id]?.name ?? node.label` -- when the camera isn't in the DB, the system silently uses the node's label. This hides the fact that camera data is stale or the camera was deleted.

**Important:** Warnings must be surfaced both during sync (via `emitMaxLog`) AND through the `/resolve-paths` route response so users inspecting the graph in the UI see feedback about missing cameras/configs.

**Files:**
- `server/src/services/flowResolver.ts` (lines 206-208) -- add a `warnings` array to `ResolvedFlowPath` and populate it
- `server/src/services/flowResolver.test.ts` -- update existing test to verify warning
- `server/src/routes/index.ts` (line 385) -- include warnings in the `/resolve-paths` response
- `client/src/stores/flowStore.ts` -- add optional `warnings` to client's `ResolvedPath` type
- `client/src/components/output/OutputPreviewPanel.tsx` -- show warning indicator on paths with warnings

**Steps:**
1. Add `warnings` to the server's `ResolvedFlowPath` interface in `flowResolver.ts`:
   ```ts
   export interface ResolvedFlowPath {
     // ... existing fields ...
     warnings: string[];
   }
   ```

2. In `resolveSinglePath`, initialize `const warnings: string[] = [];` and when the camera DB lookup fails:
   ```ts
   if (node.type === 'camera' && node.camera_id) {
     const dbCamera = cameras[node.camera_id];
     if (dbCamera) {
       cameraName = dbCamera.name;
     } else {
       cameraName = node.label;
       warnings.push(`Camera "${node.camera_id}" not found in DB, using node label "${node.label}"`);
     }
   }
   ```

3. Include `warnings` in the returned `ResolvedFlowPath` object at the end of `resolveSinglePath`.

4. **Surface warnings through the `/resolve-paths` route.** The `loadResolvedSceneData` function already calls `resolveFlowPaths` and returns `paths` (which now include `warnings`). The route at line 385 responds with `{ paths, count }` — warnings are already included in each path object. No route change needed; they flow through automatically.

5. **Consume warnings during sync.** In `syncSceneToMaxNow` (max-sync.ts), after resolving paths and selecting a target, emit any warnings via `emitMaxLog`:
   ```ts
   if (target.path.warnings.length > 0) {
     for (const warning of target.path.warnings) {
       emitMaxLog({ level: 'warn', summary: `sync:path-warning`, detail: warning });
     }
   }
   ```

6. **Add optional `warnings` to the client's `ResolvedPath` type** in `flowStore.ts` (line 9). These are separate types — the server defines `ResolvedFlowPath` in `flowResolver.ts`, and the client defines `ResolvedPath` in `flowStore.ts`. Add:
   ```ts
   export interface ResolvedPath {
     // ... existing fields ...
     warnings?: string[];
   }
   ```
   Making it optional means the client handles the deploy gap gracefully (old server sends paths without `warnings`, new client doesn't crash).

7. **Show a warning indicator in the UI.** In `OutputPreviewPanel.tsx`, in the `OutputRow` component, add a subtle warning icon when a path has warnings:
   ```tsx
   import { AlertTriangle } from 'lucide-react';
   // ... in OutputRow:
   {path.warnings && path.warnings.length > 0 && (
     <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" title={path.warnings.join('\n')} />
   )}
   ```
   Place it after the filename cell or as an inline indicator.

8. Update the existing test "uses camera node label as fallback when camera_id is not in cameras map" to also check `result[0].warnings` contains the expected warning string.

**Verification:**
- `npm test` passes (update existing test expectations)
- Warnings appear in the Max Debug Panel when a camera DB record is missing during sync
- Warnings appear as amber indicators in the OutputPreviewPanel when viewing resolved paths
- The `/resolve-paths` API response includes `warnings` arrays on each path

---

### Task 9: Warn on skipped config delta merge in `resolveSinglePath`

`flowResolver.ts` lines 222-224: When `node.config_id` exists but `configs[node.config_id]` is missing (the preset was deleted from the DB but the node still references it), the config delta merge is silently skipped. The resolved config will be incomplete.

**Files:**
- `server/src/services/flowResolver.ts` (lines 222-224)
- `server/src/services/flowResolver.test.ts` -- update existing test "skips nodes with config_id that have no matching config"

**Steps:**
1. Add a warning when a node has a `config_id` but the config is missing (uses the `warnings` array from Task 8):
   ```ts
   if (node.config_id) {
     if (configs[node.config_id]) {
       Object.assign(resolvedConfig, configs[node.config_id].delta);
     } else {
       warnings.push(`Config "${node.config_id}" referenced by node "${node.id}" not found`);
     }
   }
   ```

2. Update the existing test "skips nodes with config_id that have no matching config" to verify the warning is present in `result[0].warnings`.

**Verification:**
- `npm test` passes
- The warning string is included in the path's `warnings` array, surfaced via `emitMaxLog` during sync (from Task 8's consumer code) and visible in OutputPreviewPanel's amber indicators

---

### Task 10: Warn on missing output node in `resolveSinglePath`

`flowResolver.ts` line 195: `nodes.get(outputNodeId) ?? {}` -- if the output node is missing from the map (should be impossible in normal operation but indicates data corruption), the code proceeds with an empty object. This means `path_states`, `enabled`, `config_id` are all undefined, leading to incorrect defaults being used.

**Files:**
- `server/src/services/flowResolver.ts` (line 195)
- `server/src/services/flowResolver.test.ts` -- add test for missing output node

**Steps:**
1. Replace line 195:
   ```ts
   const outputNode = nodes.get(outputNodeId);
   if (!outputNode) {
     warnings.push(`Output node "${outputNodeId}" not found in flow — path may be invalid`);
   }
   const safeOutputNode = outputNode ?? {};
   ```
   Then use `safeOutputNode` in place of the original `outputNode` reference (for `path_states`, `enabled`, `config_id` lookups on lines 229-233):
   ```ts
   const format = safeOutputNode.config_id
     ? (configs[safeOutputNode.config_id]?.delta?.format ?? 'EXR')
     : 'EXR';
   const explicitEnabled = safeOutputNode.path_states?.[pathKey];
   const enabled = explicitEnabled ?? (safeOutputNode.enabled !== false);
   ```

2. Add test: create a path where the trail includes a node ID not in the nodes map as the last element (output), verify the warning is present.

**Verification:**
- `npm test` passes

---

## Phase 3: Client Store Robustness

### Task 11: Replace `||` with `??` for flow config arrays in `flowStore.ts`

Lines 310-314: `flowConfig.nodes || []` uses `||` which replaces the value when it's falsy. In JavaScript, empty arrays `[]` are truthy, so `[] || fallback` returns `[]` -- the behavior is identical to `?? []` for arrays. The change is still correct for **semantic clarity**: `??` signals "we mean nullish, not falsy" and protects against future bugs if someone changes these to non-array types. It also applies correctly to the `viewport` case (line 314/357) where the value is an object -- empty objects are also truthy, but `0` (a valid zoom) would be falsy with `||`.

**Files:**
- `client/src/stores/flowStore.ts` -- replace `||` with `??` in the specified locations

**Steps:**
1. In `loadAll` (around line 311-314), change:
   ```ts
   flowNodes = flowConfig.nodes || [];
   flowEdges = normalizeFlowEdges(flowNodes, flowConfig.edges || []);
   flowEdgesWereNormalized = (flowConfig.edges || []).some(...)
   viewport = flowConfig.viewport || viewport;
   ```
   to:
   ```ts
   flowNodes = flowConfig.nodes ?? [];
   flowEdges = normalizeFlowEdges(flowNodes, flowConfig.edges ?? []);
   flowEdgesWereNormalized = (flowConfig.edges ?? []).some(...)
   viewport = flowConfig.viewport ?? viewport;
   ```

2. In `setActiveScene` (around line 351-357), apply the same `||` -> `??` change:
   ```ts
   const normalizedEdges = normalizeFlowEdges(flowConfig?.nodes ?? [], flowConfig?.edges ?? []);
   const flowEdgesWereNormalized = (flowConfig?.edges ?? []).some((edge: FlowEdge) => !edge.source_handle || !edge.target_handle);
   // ...
   flowNodes: flowConfig?.nodes ?? [],
   // ...
   viewport: flowConfig?.viewport ?? { x: 0, y: 0, zoom: 1 },
   ```

3. In the `flow-config:updated` socket handler (around line 773-774), change:
   ```ts
   const nextNodes = row.nodes ?? [];
   const nextEdges = normalizeFlowEdges(nextNodes, row.edges ?? []);
   ```

**Verification:**
- `npm test` passes
- No behavioral change for arrays/objects (they are truthy), but semantics are now correct

---

### Task 12: Type-narrow socket `flow-config:updated` payload with runtime guard

Line 770: `socket.on('flow-config:updated', (row: any) => {` -- the `any` type means no compile-time checks on field access. If the server changes the event shape, the client silently gets `undefined` for everything.

The `FlowConfig` type already exists in `shared/types/index.ts`:
```ts
export interface FlowConfig {
  id: string;
  scene_id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };
  updated_at: string;
}
```

We should import and use it. However, socket payloads are untrusted runtime input — a compile-time type annotation alone does not prevent malformed data. We need a runtime guard function.

**Files:**
- `client/src/stores/flowStore.ts` (line 770)

**Steps:**
1. Add a runtime guard function near the top of `flowStore.ts`:
   ```ts
   function isFlowConfigPayload(value: unknown): value is FlowConfig {
     if (typeof value !== 'object' || value === null) return false;
     const row = value as Record<string, unknown>;
     return (
       typeof row.scene_id === 'string' &&
       Array.isArray(row.nodes) &&
       Array.isArray(row.edges)
     );
   }
   ```
   This checks the three fields the handler actually reads. The `viewport` field defaults via `??` (Task 11), so its absence is handled.

2. Add `FlowConfig` to the existing import from `@shared/types` on line 6:
   ```ts
   import type { Scene, Camera, StudioDefault, NodeConfig, FlowNode, FlowEdge, FlowConfig, NodeType, MaxSyncState } from '@shared/types';
   ```

3. Replace `(row: any)` with `(row: unknown)` on line 770, and add the runtime guard at the top of the handler:
   ```ts
   socket.on('flow-config:updated', (row: unknown) => {
     if (!isFlowConfigPayload(row)) return;
     // ... rest of handler (row is now narrowed to FlowConfig)
   });
   ```

**Verification:**
- `npm test` passes
- TypeScript compilation catches any field mismatches
- Malformed socket payloads are silently dropped instead of causing crashes

---

### Task 13: Surface `saveGraph` errors via toast

`flowStore.ts` lines 652-664: `saveGraph` catches errors and sets `error` state, but `error` is barely visible in the UI. If the save silently fails, the user continues editing a graph that isn't persisted.

**Files:**
- `client/src/stores/flowStore.ts` (lines 652-664)

**Steps:**
1. Add a toast in the catch block:
   ```ts
   } catch (err) {
     const message = err instanceof Error ? err.message : 'Failed to save graph';
     set({ error: message });
     get().showToast(message, 'error');
   }
   ```

**Verification:**
- `npm test` passes
- When the server is unreachable, the user sees a red toast "Failed to save graph"

---

### Task 14: Surface `createNodeConfig` / `updateNodeConfig` / `deleteNodeConfig` failures via toast

`flowStore.ts` lines 679-709: All three functions catch errors and set `error` state, but don't show a toast. When preset creation fails, the user's action silently does nothing.

**IMPORTANT:** Task 20 (DetailPanel's `ensureEditableConfig`) calls `createNodeConfig`. To avoid double-toasting, we toast here in the store (single source of truth for error display) and Task 20 does NOT add its own toast.

**Files:**
- `client/src/stores/flowStore.ts` (lines 679-689, 691-700, 703-709)

**Steps:**
1. In `createNodeConfig` catch block, add:
   ```ts
   get().showToast(err instanceof Error ? err.message : 'Failed to create preset', 'error');
   ```

2. In `updateNodeConfig` catch block, add:
   ```ts
   get().showToast(err instanceof Error ? err.message : 'Failed to update preset', 'error');
   ```

3. In `deleteNodeConfig` catch block, add:
   ```ts
   get().showToast(err instanceof Error ? err.message : 'Failed to delete preset', 'error');
   ```

**Verification:**
- `npm test` passes
- When preset creation/update/delete fails, the user sees a red toast

---

### Task 15: Log auto-scene selection on initial load

`flowStore.ts` line 294: `const activeId = scenesList[0]?.id ?? null;` -- when multiple scenes exist, the first one is silently auto-selected. This is a legitimate default, but it should be logged for debugging.

**Files:**
- `client/src/stores/flowStore.ts` (line 294)

**Steps:**
1. After line 294, add:
   ```ts
   if (scenesList.length > 1) {
     console.info(`Auto-selected first scene "${scenesList[0]?.name}" out of ${scenesList.length} scenes`);
   }
   ```

**Verification:**
- `npm test` passes
- Console shows which scene was auto-selected when multiple exist

---

## Phase 4: TCP + Route Validation

### Task 16: Log invalid cameras dropped during Max import

`server/src/routes/index.ts` line 315: `if (!camera?.name || typeof camera.max_handle !== 'number') continue;` silently drops invalid cameras from the import. The response only says `imported: N` -- the user has no idea cameras were skipped.

**Files:**
- `server/src/routes/index.ts` (lines 313-315) -- count and report dropped cameras
- `server/src/routes/index.test.ts` -- add test

**Steps:**
1. Track dropped cameras:
   ```ts
   let droppedCount = 0;
   for (const camera of parsed) {
     if (!camera?.name || typeof camera.max_handle !== 'number') {
       droppedCount++;
       continue;
     }
     // ... existing upsert logic
   }
   ```

2. If `droppedCount > 0`, log it:
   ```ts
   if (droppedCount > 0) {
     logger.warn({ droppedCount, totalParsed: parsed.length }, 'Dropped invalid camera records during Max import');
   }
   ```

3. Include `droppedCount` in the response:
   ```ts
   res.json({ success: true, data: { imported: imported.length, dropped: droppedCount, cameras: imported } });
   ```

4. Add test: send a payload with one valid and one invalid camera, verify response includes `dropped: 1`.

**Verification:**
- `npm test` passes
- Response now reports dropped cameras

---

### Task 17: Replace `Date.now()` instance ID fallback with UUID

`max-tcp-server.ts` line 193: `typeof msg.instance_id === 'string' ? msg.instance_id : \`max_${Date.now()}\`` -- the `Date.now()` fallback risks collisions if two instances register in the same millisecond without an ID.

**Files:**
- `server/src/services/max-tcp-server.ts` (line 193)
- `server/src/services/max-tcp-server.test.ts` -- update the test that checks the fallback pattern

**Steps:**
1. `randomUUID` is already imported at line 2. Change line 193 from:
   ```ts
   instanceId = typeof msg.instance_id === 'string' ? msg.instance_id : `max_${Date.now()}`;
   ```
   to:
   ```ts
   instanceId = typeof msg.instance_id === 'string' ? msg.instance_id : `max_${randomUUID().slice(0, 12)}`;
   ```
   Note: The `max_` prefix is preserved for consistency with existing code that may pattern-match on it.

2. Add a `logger.warn` when the fallback is used:
   ```ts
   if (typeof msg.instance_id !== 'string') {
     instanceId = `max_${randomUUID().slice(0, 12)}`;
     logger.warn({ instanceId }, 'Max TCP: register message missing instance_id, generated fallback');
   }
   ```

3. **Affected test:** The test "generates a fallback instance_id when not provided" at line 143-165 currently asserts:
   ```ts
   expect(instances[0].id).toMatch(/^max_\d+$/);
   ```
   This regex matches `max_` followed by digits only (the `Date.now()` pattern). Update the assertion to accept UUID hex characters:
   ```ts
   expect(instances[0].id).toMatch(/^max_[0-9a-f]{12}$/);
   ```

**Verification:**
- `npm test` passes
- The `max_` prefix is preserved for backward compatibility

---

### Task 18: Log default PID and empty eval_result in TCP message processing

`max-tcp-server.ts` line 205: PID defaults to `0` (meaningless). Line 245: eval_result defaults to `''` (data loss).

**Files:**
- `server/src/services/max-tcp-server.ts` (lines 205, 245)

**Steps:**
1. For PID (line 205), add a log after the instance is constructed:
   ```ts
   const instance: MaxInstance = {
     id: instanceId,
     hostname: typeof msg.hostname === 'string' ? msg.hostname : 'unknown',
     username: typeof msg.username === 'string' ? msg.username : 'unknown',
     pid: typeof msg.pid === 'number' ? msg.pid : 0,
     // ... rest
   };
   if (typeof msg.pid !== 'number') {
     logger.debug({ instanceId }, 'Max TCP: register message missing PID');
   }
   ```

2. For eval_result (line 245), the empty string default is actually reasonable for MaxScript commands that return `undefined`. However, log at debug level:
   ```ts
   const resultValue = typeof msg.result === 'string' ? msg.result : '';
   if (typeof msg.result !== 'string') {
     logger.debug({ commandId }, 'Max TCP: eval_result has non-string result, defaulting to empty');
   }
   pending.resolve(resultValue);
   ```

**Verification:**
- `npm test` passes

---

### Task 19: Document and log the `format` default to 'EXR' in submit-render

`server/src/routes/index.ts` line 460: `(p.resolvedConfig.format as string) ?? 'EXR'` -- this fallback is used when submitting to Deadline. EXR is a reasonable production default, but if a path is missing its format, it's worth logging since it might indicate a config gap.

**Files:**
- `server/src/routes/index.ts` (line 460)

**Steps:**
1. Extract the format and log when defaulting:
   ```ts
   const outputFormat = typeof p.resolvedConfig.format === 'string'
     ? p.resolvedConfig.format
     : 'EXR';
   if (typeof p.resolvedConfig.format !== 'string') {
     logger.debug({ pathKey: p.pathKey, filename: p.filename }, 'submit-render: format not set, defaulting to EXR');
   }
   ```

2. Use `outputFormat` in the `submitDeadlineJob` call instead of the inline cast.

**Verification:**
- `npm test` passes

---

## Phase 5: UI Panel Defensive Patterns

### Task 20: Rely on store toasts from Task 14 for `ensureEditableConfig` failure

`DetailPanel.tsx` lines 613-625: `ensureEditableConfig` calls `createNodeConfig`, which (after Task 14) now toasts on failure. Adding another toast in `ensureEditableConfig` would cause a double-toast. This task is a verification-only task.

**Files:**
- `client/src/components/detail/DetailPanel.tsx` (lines 613-625) -- verify no additional changes needed

**Steps:**
1. After Task 14, the failure chain is:
   - User changes parameter -> `commitParameterValue` -> `ensureEditableConfig` -> `createNodeConfig` (store toasts on fail via Task 14)
   - `ensureEditableConfig` already returns `null` on failure, and `commitParameterValue` already exits early when `editableConfig` is null
   - The user sees a toast from the store. No duplicate toast is needed.

2. Verify this manually: trigger a `createNodeConfig` failure and confirm exactly one toast appears.

**Verification:**
- No code change required -- covered by Task 14
- Confirm single toast on preset creation failure

---

### Task 21: Surface `commitParameterValue` silent exit via toast

`DetailPanel.tsx` lines 631-636: When `editableConfig` is null (from `ensureEditableConfig` failure), `commitParameterValue` silently returns. Combined with Task 14/20, the toast from `createNodeConfig` covers the `ensureEditableConfig` failure case. If `ensureEditableConfig` succeeds but `updateNodeConfig` fails, Task 14 covers that too.

This task is about ensuring the chain is complete. After Tasks 14 are implemented, this path is covered. Mark this as a verification-only task.

**Files:**
- `client/src/components/detail/DetailPanel.tsx` (lines 631-636) -- verify no additional changes needed

**Steps:**
1. After Task 14, review the call chain:
   - User changes parameter -> `commitParameterValue` -> `ensureEditableConfig` (toast on fail via store's `createNodeConfig`) -> `updateNodeConfig` (toast on fail via store's `updateNodeConfig`)
   - Both failure points now show toasts. No additional code change needed.

2. Add a test or manual verification that confirms the toast chain works.

**Verification:**
- Confirm this is covered by Task 14

---

### Task 22: Return discriminated result from `pushToMax`; handle all call sites

`OutputPreviewPanel.tsx` lines 23-40: Both `handlePushToMax` and `handleSubmitRender` use `try/finally` blocks that swallow all errors. The `finally` only resets the loading state. If the underlying store action fails, the button just stops spinning with no feedback.

**Problem with boolean return:** The store's `pushToMax` returns `false` for two very different reasons:
1. An actual error (API failure, Max not connected, etc.)
2. The `max_camera_not_found` camera-match prompt flow (line 973) — this is NOT an error from the user's perspective; it's an interactive prompt

Showing "Push to 3ds Max failed" for the camera-match case would be confusing since the user is about to see a camera-match dialog.

**Additionally,** `BrumFlowPage.tsx` (line 462) calls `pushToMax` after camera rebind — this call site also needs to handle the result properly.

**Files:**
- `client/src/stores/flowStore.ts` (line 127, 937-1003) -- change return type to discriminated result
- `client/src/components/output/OutputPreviewPanel.tsx` (lines 23-40)
- `client/src/pages/BrumFlow/BrumFlowPage.tsx` (line 462)

**Steps:**
1. Define a discriminated result type near the top of `flowStore.ts`:
   ```ts
   export type PushToMaxResult =
     | { ok: true }
     | { ok: false; reason: 'camera-match' | 'error'; message?: string };
   ```

2. Change the `pushToMax` return type in the `FlowState` interface from `Promise<boolean>` to `Promise<PushToMaxResult>`:
   ```ts
   pushToMax: (pathKey?: string, pathIndex?: number) => Promise<PushToMaxResult>;
   ```

3. Update the `pushToMax` implementation:
   - Success path (line 951): return `{ ok: true }` instead of `true`
   - Camera-match path (line 993): return `{ ok: false, reason: 'camera-match', message: err.message }` instead of `false`
   - Generic error path (line 1002): return `{ ok: false, reason: 'error', message: err instanceof Error ? err.message : 'Push to Max failed' }` instead of `false`

4. Update `OutputPreviewPanel.tsx` to use the discriminated result:
   ```ts
   const showToast = useFlowStore((s) => s.showToast);

   const handlePushToMax = async (pathKey: string) => {
     setPushing(true);
     try {
       const result = await pushToMax(pathKey);
       if (result.ok) {
         showToast('Pushed to 3ds Max', 'success');
       } else if (result.reason === 'error') {
         showToast(result.message ?? 'Push to 3ds Max failed', 'error');
       }
       // 'camera-match' — no toast; the camera match prompt dialog will appear
     } finally {
       setPushing(false);
     }
   };
   ```

5. Update `handleSubmitRender` in `OutputPreviewPanel.tsx` (this uses `submitRender` which still returns `boolean`):
   ```ts
   const handleSubmitRender = async () => {
     if (enabledIndices.length === 0) return;
     setSubmitting(true);
     try {
       const success = await submitRender(enabledIndices);
       if (success) {
         showToast(`Submitted ${enabledIndices.length} render${enabledIndices.length > 1 ? 's' : ''} to Deadline`, 'success');
       } else {
         showToast('Render submission failed', 'error');
       }
     } finally {
       setSubmitting(false);
     }
   };
   ```

6. Update `BrumFlowPage.tsx` (line 462) to handle the discriminated result. Currently:
   ```ts
   await pushToMax(cameraMatchPrompt.pathKey);
   ```
   Change to:
   ```ts
   const result = await pushToMax(cameraMatchPrompt.pathKey);
   if (result.ok) {
     showToast('Pushed to 3ds Max', 'success');
   } else if (result.reason === 'error') {
     showToast(result.message ?? 'Push to 3ds Max failed', 'error');
   }
   ```
   Import `showToast` from the store if not already available in scope. Note: `BrumFlowPage` already destructures from `useFlowStore`, so add `showToast` to its selector.

**Verification:**
- `npm test` passes
- User sees a green toast on successful push
- User sees a red toast on actual errors
- User sees NO error toast when the camera-match dialog appears
- BrumFlowPage's "Rebind and retry" flow shows appropriate feedback

---

### Task 23: Warn on unknown node types in `NODE_PARAMETER_GROUPS` lookup

`DetailPanel.tsx` line 542-543: `NODE_PARAMETER_GROUPS[nodeType] ?? []` silently returns empty for any node type not in the map. This is mostly correct (camera, group, output don't have parameter groups), but if a new node type is added without updating the map, it would silently have no settings panel.

**Files:**
- `client/src/components/detail/DetailPanel.tsx` (lines 541-543)

**Steps:**
1. Add a development-only warning for unexpected node types:
   ```ts
   const parameterGroupKeys = nodeType === 'override'
     ? (upstreamNodeType ? (NODE_PARAMETER_GROUPS[upstreamNodeType] ?? []) : [])
     : (NODE_PARAMETER_GROUPS[nodeType] ?? []);

   if (import.meta.env.DEV && nodeType !== 'override' && !(nodeType in NODE_PARAMETER_GROUPS)) {
     console.warn(`NODE_PARAMETER_GROUPS: no entry for node type "${nodeType}"`);
   }
   ```

2. This is a dev-only guard, so no test needed. It will alert developers when adding new node types.

**Verification:**
- No console warnings in production
- Warning fires in dev if a new node type is added without updating the map

---

## Implementation Notes

### Test Requirements
Every task that changes behavior must include or update tests per the project's CLAUDE.md:
- Run `npm test` from project root before committing
- Client tests: `client/src/**/*.test.ts`
- Server tests: `server/src/**/*.test.ts`

### Deployment Strategy
Each phase is independently deployable:
- **Phase 1** changes only client code (no server restart needed for dev, full deploy for production)
- **Phase 2** changes only server code (requires backend restart/redeploy)
- **Phase 3** changes only client code
- **Phase 4** changes server code
- **Phase 5** changes only client code

### Server and Client Type Separation (Tasks 8-10)
The server's `ResolvedFlowPath` (defined in `server/src/services/flowResolver.ts`) and the client's `ResolvedPath` (defined in `client/src/stores/flowStore.ts`) are **separate types** — they are NOT shared. Adding `warnings: string[]` to `ResolvedFlowPath` is a server-only change. The client's `ResolvedPath` gets a separate `warnings?: string[]` (optional) addition. This means:
- No shared type file needs to change
- The client gracefully handles the deploy gap (old server sends paths without `warnings`, new client doesn't crash)
- The server-side `ResolvedFlowPath` has `warnings: string[]` (non-optional) since it's always populated by `resolveSinglePath`

### Warning Surfacing (Tasks 8-10)
Warnings are surfaced through TWO channels:
1. **During sync** — `emitMaxLog()` sends warnings to the Max Debug Panel in real-time
2. **During preview** — The `/resolve-paths` route response includes `warnings` in each path object. The client reads these and shows amber warning indicators in OutputPreviewPanel.

This ensures users see feedback about missing cameras/configs regardless of whether they're actively syncing or just inspecting the graph.

### Double-Toast Prevention (Tasks 14 + 20)
Task 14 adds toasts to the store's `createNodeConfig`, `updateNodeConfig`, and `deleteNodeConfig`. Task 20 does NOT add a separate toast to `ensureEditableConfig` in DetailPanel, avoiding duplicate toasts. If the store toasts need to be moved to the UI layer later, Tasks 14 and 20 should be revisited together.

### Store vs Panel Error Toasting (Task 22)
The store's `pushToMax` returns a discriminated result (`PushToMaxResult`) instead of a boolean. This allows callers to distinguish between actual errors and the camera-match prompt flow. The store does NOT toast — callers handle feedback based on the result's `reason` field. For `submitRender`, the boolean return pattern is kept since it has no intermediate states.

### What Was NOT Changed (Intentional Defaults)
These fallbacks were reviewed and confirmed as legitimate:
- `flowResolver.ts` aspect ratio parser (lines 58-84) -- well-designed multi-format parser
- `flowResolver.ts` resolution fallback chain (lines 86-92) -- clear precedence
- `flowResolver.ts` format 'EXR' default (line 230) -- reasonable production default
- `flowResolver.ts` enabled state precedence (lines 232-233) -- correct logic
- `max-sync.ts` FALLBACK_GROUPS bundled defaults (line 77) -- intentional feature
- `max-sync.ts` queue merging preferredPathKey chain (lines 159-164) -- correct merge
- `max-sync.ts` previous config empty object for first sync (line 268-270) -- correct
- `config.ts` all Zod defaults -- proper validation pattern
- `uiStore.ts` migration defaults (lines 92-107) -- proper Zustand persist pattern
- `graphSemantics.ts` getEdgesForLane (lines 35-49) -- already fixed per recent commit
- `graphSemantics.ts` label summarization (lines 51-94) -- well-designed
- `flowLayout.ts` handle fallback chain (lines 117-135) -- correct conflict resolution
