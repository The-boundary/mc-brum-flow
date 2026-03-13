# Codex Review — v02 Feedback

**Thread ID:** `019ce866-16b9-74a2-a9b0-dfe84abe832c`
**Round:** 2
**Verdict:** Needs revision (7 items)

---

## Feedback Items

### 1. Task 2 weakens API contract for non-void callers
Removing `data.data === undefined` check globally means a broken `{ success: true }` response from `fetchScenes()` or `resolvePaths()` would quietly return `undefined`. Fix: keep strict `data` validation in `request<T>()`, add a separate `requestVoid()` helper or `allowMissingData` option for delete endpoints.

### 2. Task 3 only guards OutputPreviewPanel
Other panels also have path-based write actions: Output Preview toggles (line 101), MatrixView toggles (line 44), DetailPanel single/bulk toggles (lines 1064, 1167). All path-based actions should be read-only while `pathResolutionError` is true — guard `setResolvedPathEnabled`/`setOutputPathsEnabled`/`setAllResolvedPathsEnabled` in the store itself.

### 3. Task 22 `pushToMax` false != error
`pushToMax` returns `false` for both errors AND the camera-match prompt flow (line 973). Panel-only toasts miss the BrumFlowPage call site (line 462). Fix: return discriminated result like `{ ok: false, reason: 'camera-match' | 'error', message?: string }`, or centralize toast in store and suppress for camera-match case.

### 4. Tasks 8-10 warnings only consumed during sync
Normal preview via `/resolve-paths` route (line 385) doesn't emit warnings. Users inspecting the graph see no feedback about missing cameras/configs. Fix: surface warnings in the client UI when `resolvePaths()` returns them, or emit server-side during the resolve-paths route.

### 5. Task 12 not runtime narrowing
Importing `FlowConfig` type only helps at compile time. Socket payloads are untrusted runtime input. Need a runtime guard like `isFlowConfigPayload(row)` before reading fields.

### 6. Task 4 camera guard misses `max_class`
`max_class` is read by DetailPanel (line 387) and CameraFlowNode (line 50). Either validate full Camera shape, or introduce a narrower type for import rows and re-fetch canonical records.

### 7. Implementation notes self-contradictory
`ResolvedFlowPath` is NOT a shared type — server defines it in `flowResolver.ts:13`, client has its own `ResolvedPath` in `flowStore.ts:9`. Remove "shared type change" deployment note, or actually move to `shared/types`.
