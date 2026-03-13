# MC-Brum-Flow Decomposition & Modernization — Implementation Plan v02

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose oversized modules (flowStore 1,216 lines, DetailPanel 1,581 lines), add test coverage for under-tested components, harden the TCP layer with authentication and connection pooling, and replace the unmaintained dagre layout library.

**Architecture:** React 19 + Vite 6 + Express 4 + TypeScript + Tailwind v4 + Zustand + @xyflow/react + socket.io. Client tests use Vitest with jsdom (configured in root `vitest.config.ts` projects array), server tests use Vitest with node environment. Test framework uses `vi.mock` for module mocking and direct `useFlowStore.setState()` for store seeding.

**Repos:**
- MC-Brum-Flow: `/home/stan/Desktop/the-boundary/mc-brum-flow`

---

## Changes vs v01

| # | Feedback issue | What changed in v02 | Why |
|---|---------------|---------------------|-----|
| 1 | Task 1.8 backward-compat wrapper `useFlowStore<T>(selector)` does not cover no-arg destructuring (`const { ... } = useFlowStore()`) or static methods (`useFlowStore.setState`, `useFlowStore.getState`) used in BrumFlowPage, NodeFlowView, and tests | Rewritten Task 1.8 to create a **real combined Zustand store** with `getState`/`setState`/`subscribe` plus overloaded selector support, OR to fully migrate all no-arg and static usages in the same task. Added explicit migration table for every `useFlowStore()`, `useFlowStore.setState()`, and `useFlowStore.getState()` call site. | A selector-only wrapper would break 2 component destructure sites, 1 `setState` call, and 30+ `getState` calls in tests. |
| 2 | Task 1.4 puts `addSyncLog` in `useSyncStore`; Task 1.5 contradicts by moving `addSyncLog` to `useUiStore`. `syncLog` is consumed in `OutputPreviewPanel.tsx` alongside other sync data. | Removed `addSyncLog` from Task 1.5 scope. `syncLog` and `addSyncLog` remain in `useSyncStore` (Task 1.4). Task 1.5 only moves `toast`, `maxDebugLog`, and top-level `error`. | `syncLog` is domain data consumed alongside `resolvedPaths` and `pushToMax` in `OutputPreviewPanel.tsx` -- it belongs with sync state, not UI chrome. |
| 3 | Socket event handlers for `studio-defaults:updated`, `node-config:*`, `flow-config:updated`, and `scene:deleted` have side effects (calling `resolvePaths()`, loading replacement scene data) that the plan did not account for. | Added explicit side-effect routing in Task 1.7's `initSocket` section: `studio-defaults:updated` and `node-config:*` call `resolvePaths()` after store update; `flow-config:updated` calls `resolvePaths()` after detecting changes; `scene:deleted` calls `setActiveScene()` (not just `setActiveSceneId()`) when the active scene is deleted. | Without these, config/default changes would leave stale resolved paths, and deleting the active scene would show an empty graph with no camera/flow data loaded. |
| 4 | Task 2.1 documents wrong `getEffectiveFieldValue` signature as `(delta, definitions, spec)` but actual code is `(delta, definition, spec)` (singular `definition: ParameterDefinition`). | Corrected the signature to `getEffectiveFieldValue(delta: Record<string, unknown>, definition: ParameterDefinition, spec: EditableFieldSpec): number` in Task 2.1 and Task 3.1. | Verified at line 213 of DetailPanel.tsx: the second parameter is `definition: ParameterDefinition` (singular), not `definitions`. |
| 5 | Task 3.1 test cases claim `inferParameterKind` maps `array->string` but code maps `array->color`. Also claims `parseParameterInputValue` covers bool/enum but code only special-cases int/float/color and falls through to `return rawValue`. | Corrected test expectations: `inferParameterKind(array)` expects `'color'`; `parseParameterInputValue` test cases updated to match actual implementation (int, float, color special cases; string/bool/enum/ref all return `rawValue`). | Verified at lines 153-158 and 266-298 of DetailPanel.tsx. The plan must match the code, not assumed behavior. |
| 6 | Task 3.2 expects ParameterEditorRow to have a "Reset button" and "Clicking reset calls onChange with default value" tests, but ParameterEditorRow has no reset button (verified lines 1431-1521). | Removed the two reset-button test assertions from Task 3.2. Replaced with tests for the actual component behavior: bool toggle button, enum dropdown rendering, color/string text input. | The component does not have a reset button. Adding one would be a feature change, not a test task. |
| 7 | Plan assumes jsdom vitest setup exists, but reviewer claims no `test` block in `client/vite.config.ts` and no `vitest.config.*` file. | Clarified in Architecture section: the repo **does** have a root `vitest.config.ts` with a `projects` array that configures `client` with `environment: 'jsdom'` and `setupFiles: ['./vitest.setup.ts']`. No additional config task is needed. | Verified: `/home/stan/Desktop/the-boundary/mc-brum-flow/vitest.config.ts` exists with jsdom env for client project. The reviewer was looking for config inside `client/` but the root config handles it via Vitest projects. |
| 8 | Task 4.1 is not rollout-safe: no TCP client in this repo sends `auth_token`, so enabling `MAX_TCP_AUTH_TOKEN` would cut off existing Max clients. Also `socket.write(); socket.destroy()` may not flush the error payload. | Added explicit rollout sequence (deploy client-side sender first, then enable token on server). Changed `socket.write(); socket.destroy()` to `socket.end(errorPayload)` for guaranteed flush. Added `MAX_TCP_AUTH_TOKEN` rollback instructions (unset env var). | The MaxScript TCP client lives outside this repo. The server must not break existing clients. `socket.end()` flushes the write buffer before closing. |
| 9 | Task 4.3 config-mocking does not work with current test structure. The file does top-level `vi.mock('../config.js', ...)` and static import, so per-test `maxTcpAuthToken` changes require a mutable config mock or dynamic imports. | Rewrote Task 4.3 auth test approach: use a mutable mock config object (the existing pattern already uses `vi.mock('../config.js', () => ({ config: { ... } }))`). For auth tests, modify the mocked `config` object properties directly before each test, or use `vi.doMock` with dynamic `import()` for auth-specific tests in an isolated describe block. | The existing test file already uses a static `vi.mock` at top level. The simplest working approach is to make the mocked config object mutable and mutate `config.maxTcpAuthToken` per test. |
| 10 | Task 4.2 pooling design incompatible with current code: reused sockets never emit `connect` again so `socket.on('connect', () => socket.write(...))` would never fire. Missing per-request listener cleanup, no proof remote supports keep-alive, no `drainPool` wiring to shutdown. | Fundamentally redesigned Task 4.2. New approach: (a) verify whether the remote MCP listener supports persistent connections before implementing pooling (add investigation step); (b) if it does, send data directly on acquired socket instead of waiting for `connect`; (c) use `once` listeners with explicit cleanup for per-request `data/timeout/error/end`; (d) wire `drainPool()` into `server/src/index.ts` shutdown handler. If remote does NOT support keep-alive, downgrade to a simpler "connection warming" approach that pre-creates sockets. | The current `sendMaxMcpCommand` uses one-shot sockets (`socket.on('connect', () => write)`). A reused socket will never re-emit `connect`. The design must handle fresh vs. reused sockets differently and clean up per-request listeners. |
| 11 | Phase 5 says `flowLayout.test.ts` has "12 test cases" but it actually has 43 `it(...)` blocks. Task 5.2 proposes a Vite chunk change but `id.includes('dagre')` already matches `@dagrejs/dagre`. | Corrected test count to 43. Collapsed Task 5.2 into Task 5.1 as a build verification step rather than a separate task, since `id.includes('dagre')` already matches `@dagrejs/dagre`. The optional `@dagrejs` check is a readability improvement only. | Verified: `grep -c 'it(' flowLayout.test.ts` = 43. The chunk config change is not functionally necessary. |

---

## Phase Overview

| Phase | Focus | Tasks | Est. Effort |
|-------|-------|-------|-------------|
| 1 | Split flowStore.ts into focused Zustand stores | 8 tasks | Large |
| 2 | Split DetailPanel.tsx into component files | 5 tasks | Medium |
| 3 | Add test coverage for DetailPanel utils + NodeFlowView | 4 tasks | Medium |
| 4 | TCP authentication and connection pooling | 3 tasks | Medium |
| 5 | Replace dagre with @dagrejs/dagre | 1 task | Small |

---

## Progress Tracker

### Phase 1: flowStore Decomposition
- [ ] Task 1.1: Extract useSceneStore
- [ ] Task 1.2: Extract useConfigStore
- [ ] Task 1.3: Extract useOutputStore
- [ ] Task 1.4: Extract useSyncStore (includes syncLog + addSyncLog)
- [ ] Task 1.5: Merge toast/debug into existing useUiStore (NOT syncLog)
- [ ] Task 1.6: Extract useFlowGraphStore (graph nodes/edges/selection)
- [ ] Task 1.7: Create useFlowCoordinator (orchestration layer with socket side effects)
- [ ] Task 1.8: Delete old flowStore.ts, migrate all consumers (no-arg, getState, setState)

### Phase 2: DetailPanel Decomposition
- [ ] Task 2.1: Extract types.ts and utils.ts from DetailPanel.tsx
- [ ] Task 2.2: Extract shared sub-components (EmptyPanel, NodeHeader, Section, Row, NodeRef, ParameterEditorRow)
- [ ] Task 2.3: Extract CameraDetail and GroupDetail into separate files
- [ ] Task 2.4: Extract ProcessingDetail and OutputDetail into separate files
- [ ] Task 2.5: Slim DetailPanel.tsx to a router, barrel export, verify

### Phase 3: Test Coverage
- [ ] Task 3.1: Unit tests for DetailPanel utility functions
- [ ] Task 3.2: Component tests for DetailPanel sub-components
- [ ] Task 3.3: Unit tests for NodeFlowView pure functions
- [ ] Task 3.4: Integration tests for NodeFlowView event handlers

### Phase 4: TCP Auth & Connection Pooling
- [ ] Task 4.1: Add shared-secret authentication to max-tcp-server (with rollout plan)
- [ ] Task 4.2: Investigate keep-alive support, then add connection pooling to max-mcp-client
- [ ] Task 4.3: Add tests for TCP auth and connection pooling

### Phase 5: Replace dagre
- [ ] Task 5.1: Swap dagre for @dagrejs/dagre, verify build and tests

---

## Phase 1: flowStore Decomposition

The current `flowStore.ts` (1,216 lines) is a monolithic Zustand store holding ~25 state fields and ~30 actions spanning scenes, cameras, graph topology, output resolution, 3ds Max TCP state, sync logging, toast notifications, and debug logs. It must be split into focused stores while preserving the debounced save orchestration and socket event wiring.

**Migration strategy:** Each task extracts one store, re-exports the same hook names from the old file for backward compatibility, and only the final task (1.8) removes the old file and updates all import paths. This ensures every intermediate commit is independently working.

### Task 1.1: Extract useSceneStore

**Files:**
- `client/src/stores/sceneStore.ts` -- NEW, ~80 lines
- `client/src/stores/flowStore.ts` -- remove scene/camera state and loadAll/setActiveScene data-fetching

**What moves:**
```
State:  scenes, activeSceneId, cameras, loading, error
Actions: loadAll (partial -- scene/camera fetching), setActiveScene (partial -- camera fetching)
Socket events: scene:created, scene:deleted, camera:upserted, camera:deleted
```

**Structure of new file:**
```typescript
// client/src/stores/sceneStore.ts
import { create } from 'zustand';
import * as api from '@/lib/api';
import type { Scene, Camera } from '@shared/types';

interface SceneState {
  scenes: Scene[];
  activeSceneId: string | null;
  cameras: Camera[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchScenes: () => Promise<{ scenes: Scene[]; activeSceneId: string | null }>;
  fetchSceneData: (sceneId: string) => Promise<Camera[]>;
  setScenes: (scenes: Scene[]) => void;
  setActiveSceneId: (id: string | null) => void;
  setCameras: (cameras: Camera[]) => void;
  mergeCameras: (imported: Camera[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSceneStore = create<SceneState>()((set, get) => ({
  scenes: [],
  activeSceneId: null,
  cameras: [],
  loading: true,
  error: null,

  fetchScenes: async () => { /* ... */ },
  fetchSceneData: async (sceneId) => { /* ... */ },
  setScenes: (scenes) => set({ scenes }),
  setActiveSceneId: (id) => set({ activeSceneId: id }),
  setCameras: (cameras) => set({ cameras }),
  mergeCameras: (imported) => set((s) => {
    const merged = [...s.cameras];
    for (const cam of imported) {
      const idx = merged.findIndex((c) => c.id === cam.id);
      if (idx >= 0) merged[idx] = cam;
      else merged.push(cam);
    }
    return { cameras: merged };
  }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
```

**Steps:**
1. Create `client/src/stores/sceneStore.ts` with the state/actions listed above
2. Move `isValidCamera` helper function from flowStore.ts to sceneStore.ts
3. In `flowStore.ts`, import from `sceneStore` and delegate scene-related socket events to the new store's setters
4. Re-export `useSceneStore` from flowStore.ts for backward compat

**Verification:**
- `npm test` passes all existing tests
- App loads scenes and cameras correctly at `http://192.168.0.51:5174`

---

### Task 1.2: Extract useConfigStore

**Files:**
- `client/src/stores/configStore.ts` -- NEW, ~70 lines
- `client/src/stores/flowStore.ts` -- remove config/defaults state

**What moves:**
```
State:  nodeConfigs, studioDefaults
Actions: createNodeConfig, updateNodeConfig, deleteNodeConfig
Socket events: studio-defaults:updated, node-config:created, node-config:updated, node-config:deleted
```

**Structure of new file:**
```typescript
// client/src/stores/configStore.ts
import { create } from 'zustand';
import * as api from '@/lib/api';
import type { NodeConfig, NodeType, StudioDefault } from '@shared/types';

interface ConfigState {
  nodeConfigs: NodeConfig[];
  studioDefaults: StudioDefault[];

  setNodeConfigs: (configs: NodeConfig[]) => void;
  setStudioDefaults: (defaults: StudioDefault[]) => void;
  createNodeConfig: (nodeType: NodeType, label: string, delta: Record<string, unknown>) => Promise<NodeConfig | null>;
  updateNodeConfig: (id: string, updates: { label?: string; delta?: Record<string, unknown> }) => Promise<NodeConfig | null>;
  deleteNodeConfig: (id: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  nodeConfigs: [],
  studioDefaults: [],
  // ... actions calling api.createNodeConfig, api.updateNodeConfig, api.deleteNodeConfig
}));
```

**Steps:**
1. Create `client/src/stores/configStore.ts`
2. Move `createNodeConfig`, `updateNodeConfig`, `deleteNodeConfig` actions (lines 718-755)
3. Note: These actions currently call `get().resolvePaths()` and `get().showToast()` -- they need to accept callbacks or import from the coordinator/uiStore. Use a callback pattern: `onResolvePaths?: () => void` passed in or imported from coordinator.
4. Wire socket events for `node-config:*` and `studio-defaults:updated` into the new store
5. Re-export from flowStore.ts

**Verification:**
- `npm test` passes
- Creating/editing/deleting presets in the detail panel works

---

### Task 1.3: Extract useOutputStore

**Files:**
- `client/src/stores/outputStore.ts` -- NEW, ~100 lines
- `client/src/stores/flowStore.ts` -- remove output resolution state

**What moves:**
```
State:  resolvedPaths, pathCount, pathResolutionError
Actions: resolvePaths, setResolvedPathEnabled, setOutputPathsEnabled, setAllResolvedPathsEnabled
```

**Note:** `setResolvedPathEnabled`, `setOutputPathsEnabled`, and `setAllResolvedPathsEnabled` currently mutate **both** `resolvedPaths` and `flowNodes` (updating `path_states` on output nodes). After extraction, these actions need to read/write flow nodes from the graph store. Use `useFlowGraphStore.getState()` for cross-store access.

**Structure of new file:**
```typescript
// client/src/stores/outputStore.ts
import { create } from 'zustand';
import * as api from '@/lib/api';
import type { ResolvedPath } from './types'; // move ResolvedPath type here

interface OutputState {
  resolvedPaths: ResolvedPath[];
  pathCount: number;
  pathResolutionError: boolean;

  resolvePaths: (sceneId: string) => Promise<void>;
  setResolvedPaths: (paths: ResolvedPath[], count: number) => void;
  setResolvedPathEnabled: (pathKey: string, outputNodeId: string, enabled: boolean) => void;
  setOutputPathsEnabled: (outputNodeId: string, pathKeys: string[], enabled: boolean) => void;
  setAllResolvedPathsEnabled: (enabled: boolean) => void;
}
```

**Steps:**
1. Create `client/src/stores/types.ts` -- move `ResolvedPath`, `SyncLogEntry`, `CameraMatchPrompt`, `MaxTcpInstance`, `MaxDebugLogEntry`, `PushToMaxResult` type definitions there (shared across stores)
2. Create `client/src/stores/outputStore.ts`
3. Move `resolvePaths` action (lines 704-716) -- accepts sceneId parameter instead of reading from get()
4. Move `setResolvedPathEnabled` (lines 567-601), `setOutputPathsEnabled` (lines 603-644), `setAllResolvedPathsEnabled` (lines 646-685) -- these need to import `useFlowGraphStore.getState()` to update flowNode path_states
5. Re-export from flowStore.ts

**Verification:**
- `npm test` passes
- Output paths resolve correctly, toggling works in output panel

---

### Task 1.4: Extract useSyncStore

**Files:**
- `client/src/stores/syncStore.ts` -- NEW, ~130 lines
- `client/src/stores/flowStore.ts` -- remove sync/Max state

**What moves:**
```
State:  maxHealth, maxTcpInstances, cameraMatchPrompt, maxSyncState, syncLog
Actions: checkMaxHealth, importCamerasFromMax, refreshLayersFromMax, pushToMax, submitRender, addSyncLog, dismissCameraMatchPrompt
Socket events: max-sync:updated, max-tcp:connected, max-tcp:disconnected, max-tcp:instances, max-tcp:file-opened
```

**Note on `syncLog` and `addSyncLog`:** These remain here in `useSyncStore`, NOT in `useUiStore`. The `syncLog` is domain data consumed in `OutputPreviewPanel.tsx` alongside `resolvedPaths`, `pushToMax`, and `submitRender` -- all sync-domain concerns. It is not display-only UI chrome.

**Critical cross-store dependencies:**
- `importCamerasFromMax` (lines 897-986): touches `cameras` (sceneStore), `flowNodes` (graphStore), `nodeConfigs` (configStore), `syncLog` (self), `saveGraph`/`resolvePaths` (coordinator). This is the most complex action -- it must call into other stores.
- `pushToMax` (lines 1043-1113): reads `resolvedPaths` (outputStore), `flowNodes` (graphStore), `cameras` (sceneStore). Calls `importCamerasFromMax` on error.
- `refreshLayersFromMax` (lines 989-1041): reads `maxTcpInstances` (self), `nodeConfigs` (configStore), `flowNodes` (graphStore). Calls `createNodeConfig`/`updateNodeConfig` (configStore), `assignNodeConfig` (coordinator).

**Steps:**
1. Create `client/src/stores/syncStore.ts` with all state/actions above
2. For cross-store reads, use `useSceneStore.getState()`, `useFlowGraphStore.getState()`, `useConfigStore.getState()`, `useOutputStore.getState()`
3. For cross-store writes that trigger saves (e.g., importCamerasFromMax adding flow nodes), dispatch through the coordinator
4. Move `genNodeId` helper to a shared utility (`client/src/stores/utils.ts`) since both graphStore and syncStore create nodes
5. Re-export from flowStore.ts

**Verification:**
- `npm test` passes
- 3ds Max connection indicator works, camera import creates nodes, push-to-max works

---

### Task 1.5: Merge toast/debug state into existing useUiStore

**Files:**
- `client/src/stores/uiStore.ts` -- add toast, maxDebugLog, error states
- `client/src/stores/flowStore.ts` -- remove toast/debug state

**What moves from flowStore to uiStore:**
```
State:  toast, maxDebugLog, error (UI-level error display)
Actions: showToast, dismissToast, clearMaxDebugLog, setError
Socket events: max:log
```

**What does NOT move here:** `syncLog` and `addSyncLog` stay in `useSyncStore` (Task 1.4). The sync activity log is domain data consumed alongside `resolvedPaths` and `pushToMax` in `OutputPreviewPanel.tsx`, not display-only UI chrome.

The existing `uiStore.ts` (111 lines) already manages UI preferences (viewMode, panel toggles, sidebar, nonce counters). Toast/debug are pure UI concerns and belong here.

**Steps:**
1. Add to `UiState` interface in `uiStore.ts`:
   - `toast: { message: string; level: 'info' | 'success' | 'error' } | null`
   - `maxDebugLog: MaxDebugLogEntry[]`
   - `error: string | null`
   - `showToast`, `dismissToast`, `clearMaxDebugLog`, `setError` actions
2. Import `MaxDebugLogEntry` type from `client/src/stores/types.ts`
3. Do NOT persist toast/maxDebugLog/error (update `partialize` to exclude them)
4. Update `MaxDebugPanel.tsx` and `BrumFlowPage.tsx` imports to use `useUiStore`
5. Re-export from flowStore.ts for backward compat

**Verification:**
- `npm test` passes
- Toast notifications appear/dismiss correctly
- Debug panel shows Max log entries
- UI preferences (panel widths, view mode) still persist via localStorage

---

### Task 1.6: Extract useFlowGraphStore (graph topology)

**Files:**
- `client/src/stores/flowGraphStore.ts` -- NEW, ~200 lines
- `client/src/stores/flowStore.ts` -- remove graph state

**What moves:**
```
State:  flowNodes, flowEdges, viewport, selectedNodeId, selectedNodeIds
Actions: selectNode, setSelectedNodeIds, addNode, removeNode, removeNodes, addEdge, removeEdge, updateNodePosition, applyNodeLayout, updateViewport, updateNodeLabel, toggleHidePrevious
Helpers: genNodeId (from utils.ts), normalizeFlowEdges, areSerializedValuesEqual
```

**Critical detail:** `addEdge` (lines 375-490) contains the passthrough lane propagation logic -- this is complex (~115 lines) and self-contained (only reads flowNodes/flowEdges). It stays in this store.

**What stays in flowStore temporarily:** `scheduleStoreSave`, `saveGraph`, `initSocket`, `loadAll`, `setActiveScene`, `assignNodeConfig`, `assignNodeCamera`, `scaffoldPipeline` -- these orchestrate multiple stores and move to the coordinator in task 1.7.

**Steps:**
1. Create `client/src/stores/flowGraphStore.ts`
2. Move `normalizeFlowEdges` (needs `getFlowHandleLayout` import from flowLayout -- this is fine, the dependency direction is stores -> layout)
3. Move `areSerializedValuesEqual` helper
4. Move all graph mutation actions. Each action that previously called `scheduleStoreSave(get().saveGraph, get().resolvePaths)` now calls a `onGraphChanged` callback. This callback is registered by the coordinator.
5. Export `useFlowGraphStore` and the `useFlowNode` selector hook (currently at line 1212)
6. Re-export from flowStore.ts

**Callback pattern for deferred saves:**
```typescript
// In flowGraphStore.ts
let onGraphChanged: ((needsResolve: boolean) => void) | null = null;

export function registerGraphChangeHandler(handler: (needsResolve: boolean) => void) {
  onGraphChanged = handler;
}

// In actions like addNode:
addNode: (type, position, configId, cameraId) => {
  // ... same mutation logic ...
  set((s) => ({ flowNodes: [...s.flowNodes, node], selectedNodeId: id }));
  onGraphChanged?.(true); // was: scheduleStoreSave(get().saveGraph, get().resolvePaths, true)
},
```

**Verification:**
- `npm test` passes -- especially `flowStore.addEdge.test.ts` (update imports)
- Adding/removing/moving nodes in the flow editor works
- Graph auto-saves after changes

---

### Task 1.7: Create useFlowCoordinator (orchestration layer)

**Files:**
- `client/src/stores/flowCoordinator.ts` -- NEW, ~280 lines
- `client/src/stores/flowStore.ts` -- reduced to re-exports only

**What moves here:**
```
Functions: scheduleStoreSave, saveGraph, loadAll, setActiveScene, initSocket, assignNodeConfig, assignNodeCamera, scaffoldPipeline, importCamerasFromMax (delegate from syncStore)
Module-level state: persistTimer, persistNeedsResolve (debounce internals)
```

The coordinator is NOT a Zustand store -- it is a plain module with exported functions that read/write across stores:

```typescript
// client/src/stores/flowCoordinator.ts
import { useSceneStore } from './sceneStore';
import { useConfigStore } from './configStore';
import { useFlowGraphStore, registerGraphChangeHandler } from './flowGraphStore';
import { useOutputStore } from './outputStore';
import { useSyncStore } from './syncStore';
import { useUiStore } from './uiStore';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistNeedsResolve = false;

function scheduleStoreSave(needsResolve = false) {
  persistNeedsResolve = persistNeedsResolve || needsResolve;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const shouldResolve = persistNeedsResolve;
    persistNeedsResolve = false;
    void saveGraph().then(async () => {
      if (shouldResolve) {
        const sceneId = useSceneStore.getState().activeSceneId;
        if (sceneId) await useOutputStore.getState().resolvePaths(sceneId);
      }
    });
  }, 400);
}

// Register with graph store so mutations trigger debounced saves
registerGraphChangeHandler((needsResolve) => scheduleStoreSave(needsResolve));

export async function saveGraph() { /* reads from graphStore + sceneStore, calls api.saveFlowConfig */ }
export async function loadAll() { /* orchestrates sceneStore.fetchScenes, configStore, graphStore, outputStore */ }
export async function setActiveScene(id: string) { /* orchestrates scene switch */ }
export function initSocket() { /* wires all 14+ socket events to the correct stores WITH side effects */ }
export async function assignNodeConfig(nodeId: string, configId?: string) { /* graphStore + saveGraph + resolvePaths */ }
export async function assignNodeCamera(nodeId: string, cameraId: string) { /* graphStore + saveGraph + resolvePaths */ }
export function scaffoldPipeline() { /* graphStore mutation + scheduleStoreSave + showToast */ }
```

**Critical: Socket event side effects in `initSocket`**

The following socket event handlers have side effects beyond simple store writes. These side effects MUST be preserved in the coordinator:

| Socket event | Store update | Side effect (in coordinator) |
|---|---|---|
| `studio-defaults:updated` | `configStore.set(...)` | `void resolvePaths()` -- resolved output paths depend on studio defaults |
| `node-config:created` | `configStore.set(...)` | `void resolvePaths()` -- new config may affect path resolution |
| `node-config:updated` | `configStore.set(...)` | `void resolvePaths()` -- updated config delta changes path output |
| `node-config:deleted` | `configStore.set(...)` | `void resolvePaths()` -- deleted config may invalidate paths |
| `flow-config:updated` | `graphStore.set(...)` (only if nodes/edges changed) | `void resolvePaths()` -- graph topology change requires re-resolution |
| `scene:deleted` | `sceneStore.set(scenes: remaining)` | If deleted scene was active: call `setActiveScene(remaining[0]?.id)` to load cameras, flow config, and resolve paths for the replacement scene. Do NOT just set `activeSceneId` -- that would leave stale flow/camera data. |
| `max-sync:updated` | `syncStore.set(maxSyncState)` | Auto-log sync completions via `addSyncLog` when status transitions to `success` or `error` |

**Steps:**
1. Create `client/src/stores/flowCoordinator.ts`
2. Move `scheduleStoreSave` with its module-level variables (`persistTimer`, `persistNeedsResolve`)
3. Move `saveGraph` -- reads `activeSceneId` from sceneStore, `flowNodes`/`flowEdges`/`viewport` from graphStore
4. Move `loadAll` -- fetches scenes (sceneStore), defaults/configs (configStore), flow config (graphStore), resolves paths (outputStore)
5. Move `setActiveScene` -- same orchestration pattern
6. Move `initSocket` -- registers socket events, dispatches to correct stores with side effects:
   - `scene:*` -> sceneStore (with `setActiveScene()` fallback on `scene:deleted`)
   - `camera:*` -> sceneStore
   - `studio-defaults:*` / `node-config:*` -> configStore + `resolvePaths()`
   - `flow-config:updated` -> graphStore + `resolvePaths()` (if changed)
   - `max-sync:*` / `max-tcp:*` -> syncStore
   - `max:log` -> uiStore
7. Move `assignNodeConfig`, `assignNodeCamera`, `scaffoldPipeline`
8. Register `registerGraphChangeHandler` to connect graph mutations to `scheduleStoreSave`

**Verification:**
- `npm test` passes
- Full app lifecycle works: load -> edit graph -> auto-save -> switch scene -> socket events
- Deleting the active scene switches to next scene with full data load
- Config/default changes via socket trigger path re-resolution

---

### Task 1.8: Delete old flowStore.ts, migrate all consumers

**Files:**
- `client/src/stores/flowStore.ts` -- DELETE (or reduce to barrel re-exports)
- All consumer files -- update imports

**Consumer inventory (verified via grep):**
| File | Imports used |
|------|-------------|
| `pages/BrumFlow/BrumFlowPage.tsx` | loadAll, initSocket, scenes, activeSceneId, setActiveScene, cameras, checkMaxHealth, maxHealth, maxTcpInstances, cameraMatchPrompt, selectedNodeId, removeNode, removeNodes, selectedNodeIds, assignNodeCamera, dismissCameraMatchPrompt, pushToMax, showToast, importCamerasFromMax, scaffoldPipeline, toast, dismissToast, maxDebugLog.length, error |
| `components/flow/NodeFlowView.tsx` | activeSceneId, flowNodes, flowEdges, selectedNodeId, viewport, selectNode, addNode, addEdge, setSelectedNodeIds, removeNode, removeEdge, updateNodePosition, applyNodeLayout, updateViewport, saveGraph, resolvePaths, resolvedPaths, ResolvedPath type |
| `components/detail/DetailPanel.tsx` | useFlowStore (selectors for node, configs, cameras, etc.), useFlowNode |
| `components/flow/nodes/*.tsx` | useFlowStore (selectNode, selectedNodeId, cameras, nodeConfigs, flowEdges, toggleHidePrevious, resolvedPaths) |
| `components/output/OutputPreviewPanel.tsx` | resolvedPaths, pathCount, selectNode, setResolvedPathEnabled, setAllResolvedPathsEnabled, pushToMax, submitRender, showToast, pathResolutionError, syncLog |
| `components/matrix/MatrixView.tsx` | resolvedPaths, selectNode, setResolvedPathEnabled, pathCount, ResolvedPath type |
| `components/debug/MaxDebugPanel.tsx` | maxDebugLog, clearMaxDebugLog, MaxDebugLogEntry type |
| `components/flow/FlowMiniMap.tsx` | useFlowStore |

**Usage patterns that need migration (verified via grep):**

1. **No-arg destructuring** -- `const { ... } = useFlowStore()` -- used in:
   - `BrumFlowPage.tsx` (line 38-60): destructures ~20 fields
   - `NodeFlowView.tsx` (line 156-173): destructures ~15 fields

2. **Static `useFlowStore.setState()`** -- used in:
   - `BrumFlowPage.tsx` (line 366): `useFlowStore.setState({ error: null })`

3. **Static `useFlowStore.getState()`** -- used in:
   - `NodeFlowView.tsx` (lines 430, 560, 789, 840): reads viewport, flowEdges, flowNodes
   - `flowStore.addEdge.test.ts` (30+ calls): `useFlowStore.getState().addEdge(...)`, `useFlowStore.setState({...})`

**Migration strategy:**

Option A (preferred -- direct migration): Replace each `useFlowStore()` destructure with multiple individual store hooks. This improves re-render performance since components only subscribe to the stores they actually use.

```typescript
// Before (BrumFlowPage.tsx):
const { loading, error, scenes, activeSceneId, ... } = useFlowStore();

// After:
const { loading, error, scenes, activeSceneId } = useSceneStore();
const { selectedNodeId, removeNode, removeNodes, selectedNodeIds } = useFlowGraphStore();
const { cameraMatchPrompt, pushToMax, importCamerasFromMax, ... } = useSyncStore();
const { showToast, toast, dismissToast } = useUiStore();
// loadAll, initSocket, setActiveScene, scaffoldPipeline from coordinator:
import { loadAll, initSocket, setActiveScene, scaffoldPipeline } from '@/stores/flowCoordinator';
```

For `useFlowStore.getState()` calls in `NodeFlowView.tsx`:
```typescript
// Before:
const currentViewport = useFlowStore.getState().viewport;
// After:
const currentViewport = useFlowGraphStore.getState().viewport;
```

For `useFlowStore.setState()` in `BrumFlowPage.tsx`:
```typescript
// Before:
onClick={() => useFlowStore.setState({ error: null })}
// After:
onClick={() => useUiStore.getState().setError(null)}
```

For test files (`flowStore.addEdge.test.ts`):
```typescript
// Before:
useFlowStore.setState({ flowNodes: [...], flowEdges: [...] });
const result = useFlowStore.getState().addEdge('cam', 'grp', null, null);
// After:
useFlowGraphStore.setState({ flowNodes: [...], flowEdges: [...] });
const result = useFlowGraphStore.getState().addEdge('cam', 'grp', null, null);
```

Option B (fallback -- thin barrel with combined store): If Option A proves too disruptive for a single commit, create a real combined Zustand store as a backward-compat layer. But this is not recommended as it defeats the re-render optimization purpose.

**Steps:**
1. Update each consumer file to import from the correct sub-store (Option A)
2. Convert `BrumFlowPage.tsx` and `NodeFlowView.tsx` to use multiple store hooks
3. Update `flowStore.addEdge.test.ts` imports to use `useFlowGraphStore`
4. Convert `useFlowStore.setState/getState` calls to the correct sub-store
5. Reduce `flowStore.ts` to a barrel re-export file for any remaining consumers:
   ```typescript
   // client/src/stores/flowStore.ts -- barrel re-exports
   export { useSceneStore } from './sceneStore';
   export { useConfigStore } from './configStore';
   export { useFlowGraphStore, useFlowNode } from './flowGraphStore';
   export { useOutputStore } from './outputStore';
   export { useSyncStore } from './syncStore';
   export type { ResolvedPath, SyncLogEntry, MaxDebugLogEntry, CameraMatchPrompt, MaxTcpInstance, PushToMaxResult } from './types';
   export { loadAll, setActiveScene, initSocket, saveGraph, assignNodeConfig, assignNodeCamera, scaffoldPipeline } from './flowCoordinator';
   ```
6. Run full test suite
7. Verify the app loads and all features work

**Verification:**
- `npm test` -- all 8 test files pass
- Manual smoke test: load app, add/remove/connect nodes, auto-layout, switch scenes, import cameras, push to Max, toggle output paths
- Build succeeds: `cd client && npx vite build`

---

## Phase 2: DetailPanel Decomposition

The current `DetailPanel.tsx` (1,581 lines) contains 12 utility functions, 4 major detail components, 6 shared sub-components, type definitions, and constant data. Split into focused files within the existing `client/src/components/detail/` directory.

### Task 2.1: Extract types.ts and utils.ts

**Files:**
- `client/src/components/detail/types.ts` -- NEW, ~60 lines
- `client/src/components/detail/utils.ts` -- NEW, ~180 lines
- `client/src/components/detail/DetailPanel.tsx` -- remove extracted code, add imports

**What moves to `types.ts`:**
```typescript
export type ParameterKind = 'int' | 'float' | 'bool' | 'string' | 'enum' | 'color' | 'ref';

export interface ParameterDefinition { /* lines 27-35 */ }
export interface ParameterGroupDefinition { /* lines 37-41 */ }
export interface EditableFieldSpec { /* lines 43-52 */ }
export interface MarqueeRect { /* lines 54-59 */ }

export const STAGE_REV_FIELDS: EditableFieldSpec[] = [ /* lines 62-73 */ ];
export const TONE_MAPPING_FIELDS: EditableFieldSpec[] = [ /* lines 75-127 */ ];
export const PARAMETER_GROUP_LABELS: Record<string, string> = { /* lines 128-139 */ };
export const NODE_PARAMETER_GROUPS: Partial<Record<NodeType, string[]>> = { /* lines 141-148 */ };
```

**What moves to `utils.ts`:**
```typescript
export function isRecord(value: unknown): value is Record<string, unknown>  // line 149
export function inferParameterKind(value: unknown): ParameterKind  // line 153
export function normalizeParameterDefinitions(settings: Record<string, unknown>): ParameterDefinition[]  // line 160
export function getFieldDefinition(definitions: ParameterDefinition[], spec: EditableFieldSpec): ParameterDefinition  // line 199
export function getEffectiveFieldValue(delta: Record<string, unknown>, definition: ParameterDefinition, spec: EditableFieldSpec): number  // line 213
export function areValuesEqual(left: unknown, right: unknown): boolean  // line 228
export function formatValue(value: unknown): string  // line 248
export function getEffectiveParameterValue(delta: Record<string, unknown>, definition: ParameterDefinition): unknown  // line 260
export function parseParameterInputValue(rawValue: string, definition: ParameterDefinition): unknown | null  // line 266
export function formatInputValue(value: unknown, definition: ParameterDefinition): string  // line 301
export function normalizeMarquee(start: { x: number; y: number }, current: { x: number; y: number }): MarqueeRect  // line 309
export function intersectsRect(a: MarqueeRect, b: MarqueeRect): boolean  // line 318
```

**Note on `getEffectiveFieldValue` signature:** The second parameter is `definition: ParameterDefinition` (singular), NOT `definitions` (plural). Verified at line 213 of DetailPanel.tsx.

**Steps:**
1. Create `client/src/components/detail/types.ts` -- copy type definitions and constants
2. Create `client/src/components/detail/utils.ts` -- copy all 12 pure functions
3. In `DetailPanel.tsx`, replace the extracted code with `import { ... } from './types'` and `import { ... } from './utils'`
4. Verify no functionality changed

**Verification:**
- `npm test` passes
- Detail panel renders correctly for all node types

---

### Task 2.2: Extract shared sub-components

**Files:**
- `client/src/components/detail/components/EmptyPanel.tsx` -- NEW, ~15 lines
- `client/src/components/detail/components/NodeHeader.tsx` -- NEW, ~25 lines
- `client/src/components/detail/components/Section.tsx` -- NEW, ~15 lines
- `client/src/components/detail/components/Row.tsx` -- NEW, ~15 lines
- `client/src/components/detail/components/NodeRef.tsx` -- NEW, ~20 lines
- `client/src/components/detail/components/ParameterEditorRow.tsx` -- NEW, ~100 lines
- `client/src/components/detail/components/index.ts` -- NEW, barrel export

**Source locations in current DetailPanel.tsx:**
- `EmptyPanel` -- line 1523 (8 lines)
- `NodeHeader` -- line 1531 (16 lines)
- `Section` -- line 1548 (9 lines)
- `Row` -- line 1557 (9 lines)
- `NodeRef` -- line 1566 (15 lines)
- `ParameterEditorRow` -- line 1431 (92 lines)

**Steps:**
1. Create `client/src/components/detail/components/` directory
2. Extract each component into its own file with proper imports
3. Create `index.ts` barrel export
4. In `DetailPanel.tsx`, replace inline definitions with `import { EmptyPanel, NodeHeader, ... } from './components'`

**Verification:**
- `npm test` passes
- Visual rendering unchanged

---

### Task 2.3: Extract CameraDetail and GroupDetail

**Files:**
- `client/src/components/detail/CameraDetail.tsx` -- NEW, ~65 lines
- `client/src/components/detail/GroupDetail.tsx` -- NEW, ~75 lines
- `client/src/components/detail/DetailPanel.tsx` -- remove these components

**Source locations:**
- `CameraDetail` -- line 355 to ~419 (64 lines)
- `GroupDetail` -- line 419 to ~491 (72 lines)

**Steps:**
1. Create `CameraDetail.tsx` -- moves camera assignment dropdown, camera info display
2. Create `GroupDetail.tsx` -- moves hide_previous toggle, upstream path list
3. Both import from `./types`, `./utils`, `./components`
4. Update `DetailPanel.tsx` switch statement to import from new files

**Verification:**
- `npm test` passes
- Selecting a camera node shows camera details
- Selecting a group node shows group details with hide_previous toggle

---

### Task 2.4: Extract ProcessingDetail and OutputDetail

**Files:**
- `client/src/components/detail/ProcessingDetail.tsx` -- NEW, ~610 lines
- `client/src/components/detail/OutputDetail.tsx` -- NEW, ~335 lines
- `client/src/components/detail/DetailPanel.tsx` -- remove these components

**Source locations:**
- `ProcessingDetail` -- line 492 to ~1098 (606 lines). This is the largest component -- it handles parameter editing, preset selection (light setup, tone mapping, layer setup, aspect ratio, stage rev, deadline, override), and editable numeric fields. It contains 9 inline handler functions for preset changes.
- `OutputDetail` -- line 1100 to ~1430 (330 lines). Handles output format selection, resolved path display, marquee selection, path toggle, and enabled/disabled state.

**Steps:**
1. Create `ProcessingDetail.tsx` -- moves the full component with all its inline handlers
2. Create `OutputDetail.tsx` -- moves the full component with marquee selection logic
3. Both import from `./types`, `./utils`, `./components`
4. Update `DetailPanel.tsx` switch statement

**Verification:**
- `npm test` passes
- Editing light setup / tone mapping / layer setup / aspect ratio / stage rev / deadline / override parameters works
- Output detail shows resolved paths, marquee selection works

---

### Task 2.5: Slim DetailPanel.tsx to router, barrel export

**Files:**
- `client/src/components/detail/DetailPanel.tsx` -- reduce to ~30 lines (router only)
- `client/src/components/detail/index.ts` -- NEW, barrel export

**Final DetailPanel.tsx:**
```typescript
import { useFlowStore } from '@/stores/flowStore';
import { CameraDetail } from './CameraDetail';
import { GroupDetail } from './GroupDetail';
import { ProcessingDetail } from './ProcessingDetail';
import { OutputDetail } from './OutputDetail';
import { EmptyPanel } from './components';

export function DetailPanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const flowNodes = useFlowStore((state) => state.flowNodes);

  if (!selectedNodeId) return <EmptyPanel />;

  const splitMatch = selectedNodeId.match(/^(.+)__split__(\d+)$/);
  const realNodeId = splitMatch ? splitMatch[1] : selectedNodeId;
  const splitIndex = splitMatch ? Number.parseInt(splitMatch[2], 10) : null;
  const node = flowNodes.find((entry) => entry.id === realNodeId);

  if (!node) return <EmptyPanel />;

  switch (node.type) {
    case 'camera': return <CameraDetail nodeId={node.id} />;
    case 'group': return <GroupDetail nodeId={node.id} />;
    case 'output': return <OutputDetail nodeId={node.id} splitIndex={splitIndex} />;
    default: return <ProcessingDetail nodeId={node.id} />;
  }
}
```

**Steps:**
1. Verify all components have been extracted
2. Remove all remaining dead code from DetailPanel.tsx
3. Create `index.ts` barrel: `export { DetailPanel } from './DetailPanel'`
4. Verify the import in BrumFlowPage.tsx still resolves (it imports from `@/components/detail/DetailPanel`)

**Verification:**
- `npm test` passes
- `wc -l client/src/components/detail/DetailPanel.tsx` shows ~30 lines
- All detail views render correctly for every node type

---

## Phase 3: Test Coverage

### Task 3.1: Unit tests for DetailPanel utility functions

**Files:**
- `client/src/components/detail/utils.test.ts` -- NEW, ~200 lines

**Functions to test (12 pure functions, all in `utils.ts` after Task 2.1):**

| Function | Key test cases |
|----------|---------------|
| `isRecord` | primitives return false, arrays return false, objects return true, null returns false |
| `inferParameterKind` | boolean->bool, integer->int, float->float, string->string, **array->color** (not string -- verified at line 154) |
| `normalizeParameterDefinitions` | empty object, nested `{default:...}` object with explicit type, plain value inference, key naming |
| `getFieldDefinition` | matches first candidate, falls back to fallbackKey, returns correct type/range |
| `getEffectiveFieldValue` | **signature: `(delta, definition, spec)`** (singular `definition: ParameterDefinition`). Returns delta value when present via definition.key or spec.candidates, returns defaultValue when missing |
| `areValuesEqual` | primitives, objects, arrays, null/undefined, float epsilon comparison |
| `formatValue` | numbers, strings, booleans, objects, arrays, null |
| `getEffectiveParameterValue` | returns delta override when key exists, returns definition default otherwise |
| `parseParameterInputValue` | **int**: parseInt, returns null for NaN. **float**: parseFloat, returns null for NaN. **color**: JSON array, comma-separated RGB, fallback to rawValue as string. **All other types** (bool, enum, string, ref): returns rawValue unchanged (verified lines 266-298) |
| `formatInputValue` | formats based on type (int, float, bool, string) |
| `normalizeMarquee` | positive dimensions, negative dimensions (drag left/up) |
| `intersectsRect` | overlapping, non-overlapping, edge-touching, zero-size |

**Steps:**
1. Create `utils.test.ts` with test cases for all 12 functions
2. Each function gets its own `describe` block
3. Run `npm test` to verify

**Verification:**
- All tests pass: `npm test -- --filter utils.test`

---

### Task 3.2: Component tests for DetailPanel sub-components

**Files:**
- `client/src/components/detail/components/NodeHeader.test.tsx` -- NEW, ~50 lines
- `client/src/components/detail/components/ParameterEditorRow.test.tsx` -- NEW, ~100 lines

**Test approach:** Use React Testing Library with jsdom. Mock the flowStore with `vi.mock`. Test rendering and user interactions.

**Note on test environment:** The root `vitest.config.ts` already configures the client project with `environment: 'jsdom'` and `setupFiles: ['./vitest.setup.ts']` which imports `@testing-library/jest-dom/vitest`. No additional configuration is needed.

**NodeHeader tests:**
- Renders label text
- Renders correct icon for each node type
- Applies correct color class

**ParameterEditorRow tests:**
- Renders label and key
- Shows "Override" badge when `isOverridden` is true, "Default" when false
- Number input shows formatted value for int/float types
- Changing number input calls onChange with parsed value
- Bool toggle button renders and toggles on click (calls `onChange(!value)`)
- Enum dropdown renders options from `definition.options`
- Text input renders for string/ref/color types
- Displays type and default value in footer

**Note:** ParameterEditorRow does NOT have a reset button (verified lines 1431-1521). Do not test for reset functionality.

**Steps:**
1. Create test files using existing vitest setup (root `vitest.config.ts` handles jsdom + `@testing-library/jest-dom`)
2. Mock flowStore and any API calls
3. Use `render()`, `screen.getByText()`, `fireEvent.change()` patterns

**Verification:**
- `npm test` passes

---

### Task 3.3: Unit tests for NodeFlowView pure functions

**Files:**
- `client/src/components/flow/NodeFlowView.test.ts` -- NEW, ~80 lines

**Testable pure function:** `getHiddenPreviousNodeIds` (lines 74-104 of NodeFlowView.tsx)

This function must be exported for testing. Currently it is a module-private function.

**Steps:**
1. Extract `getHiddenPreviousNodeIds` to a named export (or move to `flowLayout.ts` alongside other graph utilities)
2. Create test file with these cases:

| Test case | Setup | Expected |
|-----------|-------|----------|
| No group nodes | 3 nodes, no groups | empty set |
| Group without hide_previous | group node with hide_previous=false | empty set |
| Group with hide_previous, single upstream | cam -> group(hide=true) | {cam.id} |
| Group with hide_previous, chain | cam -> ls -> group(hide=true) | {cam.id, ls.id} |
| Group with hide_previous, diamond | cam1, cam2 -> group(hide=true) | {cam1.id, cam2.id} |
| Multiple groups, only one hiding | cam -> grp1(hide=false) -> grp2(hide=true) | {cam.id, grp1.id} |
| Does not hide downstream nodes | cam -> group(hide=true) -> output | only {cam.id} |

**Verification:**
- `npm test` passes

---

### Task 3.4: Integration tests for NodeFlowView event handlers

**Files:**
- `client/src/components/flow/NodeFlowView.integration.test.tsx` -- NEW, ~150 lines

**Approach:** These tests are more complex because NodeFlowView uses `@xyflow/react` hooks (`useReactFlow`, `useNodesState`, `useEdgesState`). We need to:
1. Mock `@xyflow/react` to provide a minimal ReactFlow wrapper
2. Seed `useFlowStore` / `useFlowGraphStore` with test state
3. Test keyboard handlers and callback behavior

**Testable behaviors:**
- Delete key removes selected node(s) -- calls `removeNode`
- Ctrl+S calls `saveGraph` then `resolvePaths`
- L key calls `getAutoLayoutPositions` then `applyNodeLayout`
- Z key calls `reactFlowInstance.fitView`
- Escape deselects and closes menus
- `onConnect` with `source-all` handle calls `connectAllOutputs`
- `onConnect` with multi-select wires all selected nodes
- Position change on drag end calls `updateNodePosition`

**Steps:**
1. Create a mock ReactFlow wrapper that provides the needed context
2. Write tests for each keyboard shortcut
3. Write tests for connect and drag-end handlers

**Verification:**
- `npm test` passes

---

## Phase 4: TCP Auth & Connection Pooling

### Task 4.1: Add shared-secret authentication to max-tcp-server

**Files:**
- `server/src/config.ts` -- add `MAX_TCP_AUTH_TOKEN` env var (optional, empty = no auth for backward compat)
- `server/src/services/max-tcp-server.ts` -- validate auth token on `register` message

**Current state (no auth):** Any TCP client can connect to port 8766 and send a `register` message (line 192). The handler at line 192-228 accepts any `instance_id`, `hostname`, `username`, etc.

**Design:**
- Add optional `MAX_TCP_AUTH_TOKEN` to `envSchema` in `config.ts` (default empty string = auth disabled)
- On `register` message, if `MAX_TCP_AUTH_TOKEN` is set, require `msg.auth_token` to match
- Reject unauthenticated connections with `socket.end(errorPayload)` (NOT `socket.write` + `socket.destroy` -- `end()` guarantees the write buffer flushes before closing)
- Allow heartbeat/eval_result messages only from registered instances

**Rollout plan:**
1. **Deploy server first** with `MAX_TCP_AUTH_TOKEN` unset or empty. Auth is disabled, existing clients continue working.
2. **Update the external MaxScript TCP client** (outside this repo) to include `auth_token` in its `register` message.
3. **Set `MAX_TCP_AUTH_TOKEN`** in the server's `.env` file and restart.
4. **Rollback:** Unset `MAX_TCP_AUTH_TOKEN` env var and restart. Auth reverts to disabled.

**Steps:**
1. Add `MAX_TCP_AUTH_TOKEN` to config.ts envSchema (z.string().default(''))
2. Add `maxTcpAuthToken` to the config export
3. In `processMessage`, `case 'register'` block (line 192), add auth check:
   ```typescript
   case 'register': {
     const authToken = config.maxTcpAuthToken;
     if (authToken && msg.auth_token !== authToken) {
       const errorPayload = JSON.stringify({ type: 'error', message: 'Authentication failed' }) + '\n';
       socket.end(errorPayload, 'utf8');  // end() flushes then closes
       logger.warn({ remoteAddr: `${socket.remoteAddress}:${socket.remotePort}` }, 'Max TCP: rejected unauthenticated register');
       return null;
     }
     // ... existing register logic ...
   }
   ```
4. Guard heartbeat/eval_result/default cases: if `currentInstanceId` is null and we have not registered, log warning and ignore

**Verification:**
- `npm test` passes (existing tests don't set auth token, so auth is disabled in test mode)
- Add new test cases in `max-tcp-server.test.ts` (see Task 4.3)

---

### Task 4.2: Investigate keep-alive support, then add connection pooling to max-mcp-client

**Files:**
- `server/src/services/max-mcp-client.ts` -- add connection pool
- `server/src/index.ts` -- wire `drainPool()` into shutdown

**Current state:** Every call to `sendMaxMcpCommand` (line 38) creates a **new** TCP socket, sends one command, waits for the response, and destroys the socket. For rapid sequences (e.g., push-to-max hitting multiple paths), this creates connection churn.

**Critical prerequisite -- verify remote listener behavior:**

The current code creates a fresh socket per request and writes only inside `socket.on('connect', () => { socket.write(...) })`. A reused/pooled socket will never re-emit `connect`, so data must be written directly on the acquired socket.

Before implementing pooling, investigate whether the remote 3ds Max MCP listener:
1. Supports persistent connections (does it keep the socket open after responding?)
2. Can handle multiple sequential requests on the same socket
3. Uses newline-delimited JSON framing (the current code assumes `responseData.includes('\n')` means complete)

**Step 0 (investigation):** Add a test that sends two requests on the same socket sequentially. If the remote closes the socket after the first response, connection pooling is not viable and should be replaced with a simpler connection-warming approach.

**Design (assuming keep-alive is supported):**
- Maintain a pool of up to N idle sockets per host:port pair (default N=3)
- `acquireSocket` returns `{ socket, isFresh }` -- fresh sockets need no special handling, reused sockets skip the `connect` event
- For fresh sockets: wait for `connect` event, then write
- For reused sockets: write immediately
- Use `once` listeners (not `on`) for per-request `data`, `timeout`, `error`, `end` handlers to prevent listener accumulation
- After receiving a response, remove all per-request listeners, then return the socket to the pool
- Idle sockets expire after 30 seconds
- On socket error, remove from pool and create fresh
- Wire `drainPool()` into the server's graceful shutdown handler in `server/src/index.ts`

**Implementation:**
```typescript
interface PoolEntry {
  socket: net.Socket;
  idleTimer: ReturnType<typeof setTimeout>;
}

const pool = new Map<string, PoolEntry[]>();
const MAX_POOL_SIZE = 3;
const IDLE_TIMEOUT_MS = 30_000;

function getPoolKey(host: string, port: number): string {
  return `${host}:${port}`;
}

function acquireSocket(host: string, port: number): Promise<{ socket: net.Socket; isFresh: boolean }> {
  const key = getPoolKey(host, port);
  const entries = pool.get(key);
  if (entries && entries.length > 0) {
    const entry = entries.pop()!;
    clearTimeout(entry.idleTimer);
    if (!entry.socket.destroyed) {
      return Promise.resolve({ socket: entry.socket, isFresh: false });
    }
    // Socket was destroyed between pool return and acquire -- fall through to create new
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => resolve({ socket, isFresh: false }));
    // isFresh is false here because we already waited for connect
    socket.once('error', reject);
  });
}

function releaseSocket(socket: net.Socket, host: string, port: number): void {
  if (socket.destroyed) return;
  const key = getPoolKey(host, port);
  const entries = pool.get(key) ?? [];
  if (entries.length >= MAX_POOL_SIZE) {
    socket.destroy();
    return;
  }
  // Remove any lingering per-request listeners
  socket.removeAllListeners('data');
  socket.removeAllListeners('timeout');
  socket.removeAllListeners('end');
  // Keep a persistent error handler so the socket does not crash the process
  socket.removeAllListeners('error');
  socket.on('error', () => {
    const arr = pool.get(key);
    if (arr) {
      const idx = arr.findIndex((e) => e.socket === socket);
      if (idx >= 0) arr.splice(idx, 1);
    }
    socket.destroy();
  });

  const idleTimer = setTimeout(() => {
    socket.destroy();
    const arr = pool.get(key);
    if (arr) {
      const idx = arr.findIndex((e) => e.socket === socket);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }, IDLE_TIMEOUT_MS);
  entries.push({ socket, idleTimer });
  pool.set(key, entries);
}

export function drainPool(): void {
  for (const entries of pool.values()) {
    for (const entry of entries) {
      clearTimeout(entry.idleTimer);
      entry.socket.destroy();
    }
  }
  pool.clear();
}
```

**Modified `sendMaxMcpCommand`:**
```typescript
export async function sendMaxMcpCommand(...) {
  const host = options.host || config.maxHost;
  const port = options.port || config.maxPort;

  const { socket } = await acquireSocket(host, port);

  return new Promise<MaxMcpResponse>((resolve, reject) => {
    let responseData = '';
    let settled = false;
    const startedAt = performance.now();

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('timeout', onTimeout);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onData = (chunk: Buffer) => {
      responseData += chunk.toString('utf8');
      if (!responseData.includes('\n')) return;
      finish(() => {
        // ... parse response ...
        releaseSocket(socket, host, port);  // return to pool on success
        resolve(parsed);
      });
    };

    const onTimeout = () => finish(() => { socket.destroy(); reject(...); });
    const onError = (err: Error) => finish(() => { socket.destroy(); reject(...); });
    const onEnd = () => finish(() => { socket.destroy(); reject(...); });

    socket.on('data', onData);
    socket.on('timeout', onTimeout);
    socket.on('error', onError);
    socket.on('end', onEnd);
    socket.setTimeout(timeoutMs);

    // Write immediately -- acquireSocket already waited for connect
    socket.write(`${payload}\n`, 'utf8');
  });
}
```

**Shutdown wiring in `server/src/index.ts`:**
```typescript
import { drainPool } from './services/max-mcp-client.js';

process.on('SIGTERM', () => {
  drainPool();
  // ... existing shutdown logic ...
});
```

**Design fallback (if remote does NOT support keep-alive):**
If the investigation in Step 0 reveals the remote listener closes the connection after each response, replace the pool with a simpler "connection warming" approach: create the next socket in the background while processing the current response, so the next request has a pre-connected socket ready.

**Steps:**
1. Investigate remote keep-alive behavior (add a test or manual check)
2. If keep-alive supported: implement pool as designed above
3. If keep-alive NOT supported: implement connection warming instead
4. Wire `drainPool()` into `server/src/index.ts` shutdown handler
5. Handle edge case: reset `responseData` buffer before reuse (or verify `acquireSocket` returns with clean buffer state)

**Verification:**
- `npm test` passes
- Manual test: rapid push-to-max calls reuse connections (check log output)
- Server shutdown cleanly drains pool

---

### Task 4.3: Add tests for TCP auth and connection pooling

**Files:**
- `server/src/services/max-tcp-server.test.ts` -- add auth test cases
- `server/src/services/max-mcp-client.test.ts` -- NEW, ~120 lines

**max-tcp-server.test.ts auth tests:**

The existing test file uses a static `vi.mock('../config.js', ...)` with a fixed config object. To test auth scenarios, make the mocked config object mutable:

```typescript
// At top of file, modify the existing config mock to be mutable:
const mockConfig = {
  maxTcpServerPort: 9999,
  nodeEnv: 'test',
  maxTcpAuthToken: '',  // default: auth disabled
};

vi.mock('../config.js', () => ({
  config: mockConfig,
}));
```

Then in the auth describe block, mutate `mockConfig.maxTcpAuthToken` before each test:

```typescript
describe('authentication', () => {
  afterEach(() => {
    mockConfig.maxTcpAuthToken = '';  // reset to no auth
  });

  it('rejects register without token when auth is configured', async () => {
    mockConfig.maxTcpAuthToken = 'secret-token';
    startMaxTcpServer();
    await waitMs(50);

    const client = await createTcpClient(9999);
    try {
      await sendJson(client, { type: 'register', instance_id: 'no-auth-inst' });
      await waitMs(50);
      expect(getConnectedInstances()).toHaveLength(0);
      // Client should receive error response before socket closes
    } finally {
      client.destroy();
    }
  });

  it('accepts register with correct token', async () => {
    mockConfig.maxTcpAuthToken = 'secret-token';
    startMaxTcpServer();
    await waitMs(50);

    const client = await createTcpClient(9999);
    try {
      await sendJson(client, {
        type: 'register',
        instance_id: 'auth-inst',
        auth_token: 'secret-token',
      });
      await waitMs(50);
      expect(getConnectedInstances()).toHaveLength(1);
    } finally {
      client.destroy();
    }
  });

  it('accepts register without token when auth is not configured', async () => {
    // mockConfig.maxTcpAuthToken is already '' (no auth)
    startMaxTcpServer();
    await waitMs(50);

    const client = await createTcpClient(9999);
    try {
      await sendJson(client, { type: 'register', instance_id: 'noauth-inst' });
      await waitMs(50);
      expect(getConnectedInstances()).toHaveLength(1);
    } finally {
      client.destroy();
    }
  });

  it('ignores heartbeat from unregistered connection', async () => {
    startMaxTcpServer();
    await waitMs(50);

    const client = await createTcpClient(9999);
    try {
      // Send heartbeat without registering first
      await sendJson(client, { type: 'heartbeat' });
      await waitMs(50);
      expect(getConnectedInstances()).toHaveLength(0);
    } finally {
      client.destroy();
    }
  });
});
```

**max-mcp-client.test.ts:**
```typescript
describe('connection pooling', () => {
  it('reuses idle connections', async () => { /* ... */ });
  it('creates new connection when pool is empty', async () => { /* ... */ });
  it('limits pool size', async () => { /* ... */ });
  it('expires idle connections after timeout', async () => { /* ... */ });
  it('removes errored connections from pool', async () => { /* ... */ });
  it('drainPool destroys all connections', async () => { /* ... */ });
});
```

**Steps:**
1. Modify the existing `vi.mock('../config.js', ...)` in `max-tcp-server.test.ts` to use a mutable config object
2. Add auth tests in a new `describe('authentication', ...)` block
3. Create `max-mcp-client.test.ts` -- spin up a mock TCP server that echoes responses, test pool behavior
4. Test cleanup: ensure `drainPool()` is called in `afterEach` for pool tests

**Verification:**
- `npm test` -- all server tests pass

---

## Phase 5: Replace dagre

### Task 5.1: Swap dagre for @dagrejs/dagre, verify build and tests

**Files:**
- `client/package.json` -- replace `dagre`/`@types/dagre` with `@dagrejs/dagre`
- `client/src/components/flow/flowLayout.ts` -- update import
- `client/vite.config.ts` -- optional readability update to chunk config

**Background:** `dagre` (npm package) has not been updated since 2019. `@dagrejs/dagre` is the maintained community fork with the same API surface. It is a drop-in replacement.

**Current usage (flowLayout.ts lines 1, 154-175):**
```typescript
import dagre from 'dagre';
// ...
const g = new dagre.graphlib.Graph();
g.setDefaultEdgeLabel(() => ({}));
g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });
g.setNode(node.id, { width: NODE_WIDTH, height: getNodeHeight(hCount) });
g.setEdge(edge.source, edge.target);
dagre.layout(g);
const dagreNode = g.node(node.id);
```

**@dagrejs/dagre API is identical** -- same `graphlib.Graph`, same `layout()`, same `setGraph`/`setNode`/`setEdge` methods.

**Steps:**
1. Remove old packages:
   ```bash
   cd client && npm uninstall dagre @types/dagre
   ```
2. Install replacement:
   ```bash
   cd client && npm install @dagrejs/dagre
   ```
3. Update import in `flowLayout.ts`:
   ```typescript
   // Before:
   import dagre from 'dagre';
   // After:
   import dagre from '@dagrejs/dagre';
   ```
4. Run the existing 43 test cases in `flowLayout.test.ts` -- they should all pass without any other changes
5. Run `npx tsc --noEmit` to verify type compatibility
6. (Optional, readability) Update `vite.config.ts` chunk config to also match `@dagrejs`:
   ```javascript
   if (id.includes('@xyflow') || id.includes('@dagrejs') || id.includes('dagre') || id.includes('d3-')) {
     return 'graph-vendor';
   }
   ```
   Note: The existing `id.includes('dagre')` already matches `@dagrejs/dagre` since the path contains `dagre`. This change is purely for readability.
7. Run production build: `cd client && npx vite build`
8. Verify the `graph-vendor` chunk contains `@dagrejs/dagre`

**Verification:**
- `npm test` -- all 43 `flowLayout.test.ts` tests pass
- Auto-layout (L key) produces correct results visually
- `cd client && npx vite build` succeeds
- Graph vendor chunk exists in `client/dist/assets/`

---

## Appendix: File Inventory After All Phases

### New files created

| File | Phase | Lines (est.) |
|------|-------|-------------|
| `client/src/stores/types.ts` | 1.3 | 65 |
| `client/src/stores/utils.ts` | 1.4 | 15 |
| `client/src/stores/sceneStore.ts` | 1.1 | 80 |
| `client/src/stores/configStore.ts` | 1.2 | 70 |
| `client/src/stores/outputStore.ts` | 1.3 | 100 |
| `client/src/stores/syncStore.ts` | 1.4 | 130 |
| `client/src/stores/flowGraphStore.ts` | 1.6 | 200 |
| `client/src/stores/flowCoordinator.ts` | 1.7 | 280 |
| `client/src/components/detail/types.ts` | 2.1 | 60 |
| `client/src/components/detail/utils.ts` | 2.1 | 180 |
| `client/src/components/detail/CameraDetail.tsx` | 2.3 | 65 |
| `client/src/components/detail/GroupDetail.tsx` | 2.3 | 75 |
| `client/src/components/detail/ProcessingDetail.tsx` | 2.4 | 610 |
| `client/src/components/detail/OutputDetail.tsx` | 2.4 | 335 |
| `client/src/components/detail/components/EmptyPanel.tsx` | 2.2 | 15 |
| `client/src/components/detail/components/NodeHeader.tsx` | 2.2 | 25 |
| `client/src/components/detail/components/Section.tsx` | 2.2 | 15 |
| `client/src/components/detail/components/Row.tsx` | 2.2 | 15 |
| `client/src/components/detail/components/NodeRef.tsx` | 2.2 | 20 |
| `client/src/components/detail/components/ParameterEditorRow.tsx` | 2.2 | 100 |
| `client/src/components/detail/components/index.ts` | 2.2 | 10 |
| `client/src/components/detail/index.ts` | 2.5 | 5 |
| `client/src/components/detail/utils.test.ts` | 3.1 | 200 |
| `client/src/components/detail/components/NodeHeader.test.tsx` | 3.2 | 50 |
| `client/src/components/detail/components/ParameterEditorRow.test.tsx` | 3.2 | 100 |
| `client/src/components/flow/NodeFlowView.test.ts` | 3.3 | 80 |
| `client/src/components/flow/NodeFlowView.integration.test.tsx` | 3.4 | 150 |
| `server/src/services/max-mcp-client.test.ts` | 4.3 | 120 |

### Modified files

| File | Change |
|------|--------|
| `client/src/stores/flowStore.ts` | Reduced from 1,216 lines to ~30 (barrel re-exports) |
| `client/src/stores/uiStore.ts` | +30 lines (toast, debug, error -- NOT syncLog) |
| `client/src/components/detail/DetailPanel.tsx` | Reduced from 1,581 lines to ~30 (router) |
| `client/src/components/flow/flowLayout.ts` | 1 line change (dagre import) |
| `client/vite.config.ts` | Optional 1 line change (chunk config readability) |
| `client/package.json` | dagre -> @dagrejs/dagre |
| `server/src/config.ts` | +1 env var (MAX_TCP_AUTH_TOKEN) |
| `server/src/services/max-tcp-server.ts` | +15 lines (auth check with socket.end) |
| `server/src/services/max-mcp-client.ts` | +80 lines (connection pool with proper lifecycle) |
| `server/src/services/max-tcp-server.test.ts` | +50 lines (auth tests with mutable config) |
| `server/src/index.ts` | +3 lines (drainPool on shutdown) |
| `client/src/stores/flowStore.addEdge.test.ts` | Import path update to useFlowGraphStore |
| `client/src/pages/BrumFlow/BrumFlowPage.tsx` | Multi-store imports replacing single useFlowStore destructure |
| `client/src/components/flow/NodeFlowView.tsx` | Multi-store imports, getState calls updated |
