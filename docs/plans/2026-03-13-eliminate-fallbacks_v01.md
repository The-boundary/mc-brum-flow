# Eliminate Unnecessary Fallbacks — Implementation Plan v01

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace silent bug-hiding fallbacks with explicit error handling that surfaces failures via toasts, logs, and UI warnings -- while preserving intentional defaults that represent legitimate design decisions.

**Architecture:** React 19 + Vite 6 + Express 4 + TypeScript + Zustand stores + Socket.IO + Vitest. Client toast system (`showToast()`) exists but is underutilized. Server has Pino structured logger and `emitMaxLog()` for real-time debug feed. Error infrastructure is in place -- the problem is that code bypasses it with silent fallbacks.

**Repos:**
- MC-Brum-Flow: `/home/stan/Desktop/the-boundary/mc-brum-flow`

---

## Phase Overview

| Phase | Focus | Tasks | Est. Effort |
|-------|-------|-------|-------------|
| 1 | Critical crash fix + silent data loss on client | 5 tasks | Medium |
| 2 | Server-side silent fallbacks that hide broken state | 5 tasks | Medium |
| 3 | Client store fallbacks that mask failures | 5 tasks | Medium |
| 4 | TCP message validation + route-level feedback | 4 tasks | Small |
| 5 | UI panel defensive patterns | 4 tasks | Small |

---

## Progress Tracker

### Phase 1: Client-Side Critical Fixes
- [ ] Task 1: Fix `api.ts` error body loss on non-OK responses
- [ ] Task 2: Fix `api.ts` success-field check (false-positive on missing field)
- [ ] Task 3: Surface `resolvePaths` failures via toast instead of silently clearing
- [ ] Task 4: Validate `importCamerasFromMax` result type before casting
- [ ] Task 5: Fix camera filter fallback showing ALL cameras on handle extraction failure

### Phase 2: Server-Side Silent Fallbacks
- [ ] Task 6: Log which fallback level fired in `resolveTargetPath`
- [ ] Task 7: Warn on disabled-path substitution in `resolveTargetPath`
- [ ] Task 8: Log missing camera DB record in `resolveSinglePath`
- [ ] Task 9: Log skipped config delta merge in `resolveSinglePath`
- [ ] Task 10: Log missing output node in `resolveSinglePath`

### Phase 3: Client Store Robustness
- [ ] Task 11: Replace `||` with `??` for flow config arrays in `flowStore.ts`
- [ ] Task 12: Type-narrow socket `flow-config:updated` payload
- [ ] Task 13: Surface `saveGraph` errors via toast
- [ ] Task 14: Surface `createNodeConfig` / `updateNodeConfig` failures via toast
- [ ] Task 15: Log auto-scene selection on initial load

### Phase 4: TCP + Route Validation
- [ ] Task 16: Log invalid cameras dropped during Max import
- [ ] Task 17: Replace `Date.now()` instance ID fallback with UUID
- [ ] Task 18: Log default PID and empty eval_result in TCP message processing
- [ ] Task 19: Document and log the `format` default to 'EXR' in submit-render

### Phase 5: UI Panel Defensive Patterns
- [ ] Task 20: Surface `ensureEditableConfig` failure via toast in ProcessingDetail
- [ ] Task 21: Surface `commitParameterValue` silent exit via toast
- [ ] Task 22: Add error feedback to `pushToMax` / `submitRender` in OutputPreviewPanel
- [ ] Task 23: Warn on unknown node types in `NODE_PARAMETER_GROUPS` lookup

---

## Phase 1: Client-Side Critical Fixes

These fix data loss and incorrect control flow in the API client and stores.

### Task 1: Fix `api.ts` error body loss on non-OK responses

The `res.json().catch(() => ({}))` on line 47 silently discards the server's error response body when JSON parsing fails. This means `ApiError` gets created with no `code`, no `details` -- the caller (e.g., `pushToMax`) can't match on `err.code === 'max_camera_not_found'` if the error body was lost.

**Files:**
- `client/src/lib/api.ts` (line 47) -- replace catch with explicit error for unparseable error bodies
- `client/src/lib/api.test.ts` -- add test for error body parsing failure

**Steps:**
1. In `request()`, change line 47 from:
   ```ts
   const body = await res.json().catch(() => ({}));
   ```
   to:
   ```ts
   let body: unknown;
   try {
     body = await res.json();
   } catch {
     throw new ApiError(`API error: ${res.status} (response body not valid JSON)`, { status: res.status });
   }
   ```
   This ensures that when the server returns a non-JSON error (e.g., nginx 502 HTML page), we get a clear error message instead of silently proceeding with `{}` which produces a generic "Unknown error".

2. Add test in `api.test.ts`:
   - Test that `ApiError` includes the status code when JSON parsing fails

**Verification:**
- `npm test` passes
- Manually verify by checking that a 502 from nginx still produces a readable error

---

### Task 2: Fix `api.ts` success-field check (false-positive on missing field)

Line 57: `if (data.success === false)` only catches explicit `false`. If `success` is `undefined` (field missing from response), the code treats it as a success and proceeds to `data.data`. This is the wrong polarity -- the API convention is `{ success: true, data: ... }`, so missing `success` should be treated as an error.

**Files:**
- `client/src/lib/api.ts` (line 57) -- tighten the success check
- `client/src/lib/api.test.ts` -- add tests for edge cases

**Steps:**
1. Change line 57 from:
   ```ts
   if (data.success === false) throw toApiError(json, res.status, 'Unknown error');
   ```
   to:
   ```ts
   if (data.success !== true) throw toApiError(json, res.status, 'API error: unexpected response format');
   ```
   This catches both `success: false` and missing/undefined `success`.

2. Line 58 (`if (data.data === undefined)`) becomes unreachable for the missing-success case, which is correct -- the check above catches it first. Keep line 58 as a safety net for `{ success: true }` responses missing `data`.

3. Add tests:
   - Response with `{ success: undefined }` throws
   - Response with `{ data: 'foo' }` (no success field) throws
   - Response with `{ success: true, data: 'foo' }` succeeds

**Verification:**
- `npm test` passes
- Review all server routes to confirm they all return `{ success: true, data: ... }` -- they do (confirmed in `server/src/routes/index.ts`)

---

### Task 3: Surface `resolvePaths` failures via toast instead of silently clearing

`flowStore.ts` line 667-677: when `resolvePaths` throws, the catch block does `console.warn` and silently sets `resolvedPaths: [], pathCount: 0`. The user sees all their output paths vanish with no explanation.

**Files:**
- `client/src/stores/flowStore.ts` (lines 667-677) -- add toast on failure, keep paths stale rather than clearing
- `client/src/stores/flowStore.addEdge.test.ts` or new `flowStore.resolvePaths.test.ts` -- test error handling

**Steps:**
1. Change the `resolvePaths` catch block from:
   ```ts
   } catch (err) {
     console.warn('Path resolution failed:', err instanceof Error ? err.message : err);
     set({ resolvedPaths: [], pathCount: 0 });
   }
   ```
   to:
   ```ts
   } catch (err) {
     const message = err instanceof Error ? err.message : 'Path resolution failed';
     console.warn('Path resolution failed:', message);
     get().showToast(`Path resolution failed: ${message}`, 'error');
     // Do NOT clear resolvedPaths -- keep stale data rather than showing empty
   }
   ```
   This surfaces the error to the user and preserves the last-known-good paths.

2. Add a test that verifies the store does NOT clear `resolvedPaths` on resolution failure (mock `api.resolvePaths` to reject).

**Verification:**
- `npm test` passes
- If the server is down, the user sees a red toast instead of a mysteriously empty output panel

---

### Task 4: Validate `importCamerasFromMax` result type before casting

`flowStore.ts` line 856: `Array.isArray(result.cameras) ? (result.cameras as Camera[]) : []` -- the `as Camera[]` cast is unsafe. If the server returns an array of objects missing required `Camera` fields, downstream code will fail in confusing ways.

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
       typeof (value as Record<string, unknown>).max_handle === 'number'
     );
   }
   ```

2. Replace line 856:
   ```ts
   const importedCameras = Array.isArray(result.cameras)
     ? result.cameras.filter(isValidCamera)
     : [];
   ```

3. After the filter, if any cameras were dropped, log a warning:
   ```ts
   const droppedCount = (Array.isArray(result.cameras) ? result.cameras.length : 0) - importedCameras.length;
   if (droppedCount > 0) {
     console.warn(`Dropped ${droppedCount} invalid camera records from Max import`);
   }
   ```

**Verification:**
- `npm test` passes
- Test: passing `[{ id: '1', name: 'Cam', max_handle: 1 }, { bad: true }]` filters out the bad one

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

**Files:**
- `server/src/services/max-sync.ts` (function `resolveTargetPath`) -- add structured log at each level
- `server/src/services/max-sync.test.ts` (new file) -- test the resolution cascade

**Steps:**
1. Add `logger.debug()` calls at each resolution step. Use a local `resolvedVia` variable:
   ```ts
   function resolveTargetPath(...) {
     let path: ResolvedFlowPath | undefined;
     let resolvedVia = 'none';

     if (input.preferredPathKey) {
       path = paths.find((c) => c.pathKey === input.preferredPathKey);
       if (path) resolvedVia = 'preferredPathKey';
     }

     if (!path && input.preferredPathIndex !== undefined) {
       path = paths[input.preferredPathIndex];
       if (path) resolvedVia = 'preferredPathIndex';
     }

     if (!path && syncState?.active_path_key) {
       path = paths.find((c) => c.pathKey === syncState.active_path_key);
       if (path) resolvedVia = 'syncState.active_path_key';
     }

     if (!path) {
       path = paths.find((c) => c.enabled);
       if (path) resolvedVia = 'firstEnabled';
     }

     if (!path) {
       logger.debug({ pathCount: paths.length }, 'resolveTargetPath: no viable path found');
       return null;
     }

     if (!path.enabled && !input.force) {
       const original = path;
       path = paths.find((c) => c.enabled);
       if (path) {
         logger.info(
           { originalPathKey: original.pathKey, substitutedPathKey: path.pathKey },
           'resolveTargetPath: disabled path substituted with enabled alternative'
         );
         resolvedVia = `substituted(was:${resolvedVia})`;
       }
     }

     logger.debug({ resolvedVia, pathKey: path?.pathKey }, 'resolveTargetPath: resolved');
     return path ? { path } : null;
   }
   ```

2. Write tests in `server/src/services/max-sync.test.ts` that verify:
   - `resolveTargetPath` is not directly exported, so test via `syncSceneToMaxNow` behavior, OR extract it for direct testing. Since the function is module-private, the pragmatic approach is to write a focused test file that imports and tests the function directly -- refactor it to be exported for testing only, or test it indirectly through the public API. The best approach: export `resolveTargetPath` (it's pure logic, safe to export).
   - Test: preferredPathKey match wins
   - Test: preferredPathIndex fallback
   - Test: disabled path substitution logs

**Verification:**
- `npm test` passes
- Server logs show `resolveTargetPath: resolved via=...` in debug output during sync

---

### Task 7: Warn on disabled-path substitution in `resolveTargetPath`

Lines 366-368: When a resolved path is disabled, the code silently replaces it with the first enabled path. This can cause confusion -- the user explicitly selected a path, but a different one syncs.

This is addressed as part of Task 6. The `logger.info()` call above covers this. But we should also emit a `max:log` event so the frontend debug panel shows it.

**Files:**
- `server/src/services/max-sync.ts` (lines 366-368, same area as Task 6)

**Steps:**
1. After the disabled-path substitution in `resolveTargetPath`, call `emitMaxLog`:
   ```ts
   emitMaxLog({
     level: 'warn',
     summary: `sync:path-substituted — requested path is disabled`,
     detail: `Original: ${original.pathKey}\nSubstituted: ${path.pathKey}`,
   });
   ```
   Note: `emitMaxLog` is defined in `max-sync.ts` at line 12, so it's available.

**Verification:**
- The Max Debug Panel in the UI shows a yellow warning when a disabled path is substituted

---

### Task 8: Log missing camera DB record in `resolveSinglePath`

`flowResolver.ts` line 207: `cameras[node.camera_id]?.name ?? node.label` -- when the camera isn't in the DB, the system silently uses the node's label. This hides the fact that camera data is stale or the camera was deleted.

**Files:**
- `server/src/services/flowResolver.ts` (line 206-208) -- add a return-value marker when camera is missing
- `server/src/services/flowResolver.test.ts` -- existing test "uses camera node label as fallback" already covers this behavior; update it to verify a warning is emittable

**Steps:**
1. This is actually a legitimate fallback -- the camera node always has a label (the user named it). But we should track that the fallback was used. Add a `warnings` array to `ResolvedFlowPath`:
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

3. Include `warnings` in the returned object.

4. Update the existing test "uses camera node label as fallback" to also check `result[0].warnings` contains the expected warning string.

5. Update the `ResolvedPath` type in `client/src/stores/flowStore.ts` to include `warnings: string[]` and in `shared/types` if it exists there.

**Verification:**
- `npm test` passes (update existing test expectations)
- Warnings are available for downstream consumers (UI can show them later if desired)

---

### Task 9: Log skipped config delta merge in `resolveSinglePath`

`flowResolver.ts` lines 222-224: When `node.config_id` exists but `configs[node.config_id]` is missing (the preset was deleted from the DB but the node still references it), the config delta merge is silently skipped. The resolved config will be incomplete.

**Files:**
- `server/src/services/flowResolver.ts` (lines 222-224)
- `server/src/services/flowResolver.test.ts` -- existing test "skips nodes with config_id that have no matching config" covers this

**Steps:**
1. Add a warning when a node has a `config_id` but the config is missing:
   ```ts
   if (node.config_id) {
     if (configs[node.config_id]) {
       Object.assign(resolvedConfig, configs[node.config_id].delta);
     } else {
       warnings.push(`Config "${node.config_id}" referenced by node "${node.id}" not found`);
     }
   }
   ```

2. Update the existing test to verify the warning is present in the result.

**Verification:**
- `npm test` passes
- The warning string is included in the path's `warnings` array

---

### Task 10: Log missing output node in `resolveSinglePath`

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
   Then use `safeOutputNode` where `outputNode` was used (lines 229-233).

2. Add test: create a path where the trail includes a node ID not in the nodes map, verify the warning.

**Verification:**
- `npm test` passes

---

## Phase 3: Client Store Robustness

### Task 11: Replace `||` with `??` for flow config arrays in `flowStore.ts`

Lines 310-314: `flowConfig.nodes || []` uses `||` which treats empty arrays `[]` as falsy. An empty array IS a valid flow state (user deleted all nodes). With `||`, an empty `[]` from the server would be treated as "missing" and replaced with `[]` -- which happens to be the same result, but the semantics are wrong and this could mask bugs if the code changes.

**Files:**
- `client/src/stores/flowStore.ts` -- replace `||` with `??` in 6 locations

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

2. In `setActiveScene` (around line 351-357), apply the same `||` -> `??` change.

3. In the `flow-config:updated` socket handler (around line 773-774), change:
   ```ts
   const nextNodes = row.nodes || [];
   const nextEdges = normalizeFlowEdges(nextNodes, row.edges || []);
   ```
   to use `??`.

**Verification:**
- `npm test` passes
- Behavior is identical for non-empty arrays; only empty-array semantics are corrected

---

### Task 12: Type-narrow socket `flow-config:updated` payload

Line 770: `socket.on('flow-config:updated', (row: any) => {` -- the `any` type means no compile-time checks on field access. If the server changes the event shape, the client silently gets `undefined` for everything.

**Files:**
- `client/src/stores/flowStore.ts` (line 770)

**Steps:**
1. Define a minimal interface for the socket event payload:
   ```ts
   interface FlowConfigPayload {
     scene_id: string;
     nodes?: FlowNode[];
     edges?: FlowEdge[];
     viewport?: { x: number; y: number; zoom: number };
   }
   ```

2. Replace `(row: any)` with `(row: FlowConfigPayload)`.

3. Add a runtime guard at the top of the handler:
   ```ts
   if (typeof row?.scene_id !== 'string') return;
   ```

**Verification:**
- `npm test` passes
- TypeScript compilation catches any field mismatches

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

### Task 14: Surface `createNodeConfig` / `updateNodeConfig` failures via toast

`flowStore.ts` lines 679-700: Both `createNodeConfig` and `updateNodeConfig` catch errors and set `error` state, but don't show a toast. When preset creation fails, the user's action silently does nothing.

**Files:**
- `client/src/stores/flowStore.ts` (lines 679-689, 691-700)

**Steps:**
1. In `createNodeConfig` catch block, add:
   ```ts
   get().showToast(err instanceof Error ? err.message : 'Failed to create preset', 'error');
   ```

2. In `updateNodeConfig` catch block, add:
   ```ts
   get().showToast(err instanceof Error ? err.message : 'Failed to update preset', 'error');
   ```

3. In `deleteNodeConfig` catch block (lines 703-709), add the same pattern.

**Verification:**
- `npm test` passes

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

**Steps:**
1. Import `randomUUID` (already imported at line 2).

2. Change line 193:
   ```ts
   instanceId = typeof msg.instance_id === 'string' ? msg.instance_id : `max_${randomUUID().slice(0, 12)}`;
   ```

3. Add a `logger.warn` when the fallback is used:
   ```ts
   if (typeof msg.instance_id !== 'string') {
     logger.warn('Max TCP: register message missing instance_id, generated fallback');
   }
   ```

**Verification:**
- `npm test` passes (update existing tests if they rely on the `max_` + timestamp pattern)

---

### Task 18: Log default PID and empty eval_result in TCP message processing

`max-tcp-server.ts` line 205: PID defaults to `0` (meaningless). Line 245: eval_result defaults to `''` (data loss).

**Files:**
- `server/src/services/max-tcp-server.ts` (lines 205, 245)
- `server/src/services/max-tcp-server.test.ts` -- update tests

**Steps:**
1. For PID (line 205), add a log when defaulting:
   ```ts
   pid: typeof msg.pid === 'number' ? msg.pid : (() => {
     logger.debug({ instanceId }, 'Max TCP: register message missing PID');
     return 0;
   })(),
   ```
   Actually, this inline IIFE is ugly. Better approach -- check after construction:
   ```ts
   const instance: MaxInstance = { /* existing */ };
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

2. Use `outputFormat` in the `submitDeadlineJob` call.

**Verification:**
- `npm test` passes

---

## Phase 5: UI Panel Defensive Patterns

### Task 20: Surface `ensureEditableConfig` failure via toast in ProcessingDetail

`DetailPanel.tsx` lines 613-625: `ensureEditableConfig` returns `null` silently when `createNodeConfig` fails. The user clicks a parameter slider, nothing happens, no feedback.

**Files:**
- `client/src/components/detail/DetailPanel.tsx` (lines 613-625)

**Steps:**
1. In `ensureEditableConfig`, when `created` is null, show a toast:
   ```ts
   if (!created) {
     showToast('Failed to create preset — changes cannot be saved', 'error');
     return null;
   }
   ```
   Import `showToast` from the store: `const showToast = useFlowStore((state) => state.showToast);` -- this is already done if `showToast` is used elsewhere in the component. If not, add the selector.

**Verification:**
- `npm test` passes
- User sees a red toast when preset creation fails

---

### Task 21: Surface `commitParameterValue` silent exit via toast

`DetailPanel.tsx` lines 631-636: When `editableConfig` is null (from `ensureEditableConfig` failure), `commitParameterValue` silently returns. Combined with Task 20, the toast from `ensureEditableConfig` covers this. But if `ensureEditableConfig` succeeds but `updateNodeConfig` fails, the error is already surfaced via Task 14.

This task is about ensuring the chain is complete. After Task 20 and Task 14 are implemented, this path is covered. Mark this as a verification-only task.

**Files:**
- `client/src/components/detail/DetailPanel.tsx` (lines 631-636) -- verify no additional changes needed

**Steps:**
1. After Tasks 14 and 20, review the call chain:
   - User changes parameter -> `commitParameterValue` -> `ensureEditableConfig` (toast on fail via Task 20) -> `updateNodeConfig` (toast on fail via Task 14)
   - Both failure points now show toasts. No additional code change needed.

2. Add a test or manual verification that confirms the toast chain works.

**Verification:**
- Confirm this is covered by Tasks 14 and 20

---

### Task 22: Add error feedback to `pushToMax` / `submitRender` in OutputPreviewPanel

`OutputPreviewPanel.tsx` lines 23-40: Both `handlePushToMax` and `handleSubmitRender` use `try/finally` blocks that swallow all errors. The `finally` only resets the loading state. If the underlying store action fails, the button just stops spinning with no feedback.

**Files:**
- `client/src/components/output/OutputPreviewPanel.tsx` (lines 23-29, 32-40)

**Steps:**
1. The store's `pushToMax` and `submitRender` already handle their own errors internally (set `error` state, add sync log entries). But the OutputPreviewPanel doesn't show toasts for these. Check if `pushToMax` returns `false` on failure:

   Looking at `flowStore.ts` lines 937-1003: `pushToMax` returns `false` on failure and sets `error`. And lines 1006-1024: `submitRender` returns `false` on failure.

2. Add toast feedback in OutputPreviewPanel:
   ```ts
   const handlePushToMax = async (pathKey: string) => {
     setPushing(true);
     try {
       const success = await pushToMax(pathKey);
       if (success) {
         showToast('Pushed to 3ds Max', 'success');
       }
       // Failure toasts are handled by the store
     } finally {
       setPushing(false);
     }
   };

   const handleSubmitRender = async () => {
     if (enabledIndices.length === 0) return;
     setSubmitting(true);
     try {
       const success = await submitRender(enabledIndices);
       if (success) {
         showToast(`Submitted ${enabledIndices.length} render${enabledIndices.length > 1 ? 's' : ''} to Deadline`, 'success');
       }
     } finally {
       setSubmitting(false);
     }
   };
   ```

3. Add `const showToast = useFlowStore((s) => s.showToast);` to the component's selectors.

**Verification:**
- `npm test` passes
- User sees a green toast on successful push/submit, and a red toast on failure (from the store)

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

### Shared Type Change (Task 8)
Adding `warnings: string[]` to `ResolvedFlowPath` in Task 8 touches `shared/types` and requires both server and client to be updated together. Deploy Phase 2 and Phase 1 together, or make `warnings` optional (`warnings?: string[]`) so the client gracefully handles its absence.

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
