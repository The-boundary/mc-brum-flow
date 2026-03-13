# Codex Review — v01

**Model:** GPT-5.4 (xhigh reasoning)
**Thread:** 019ce8e3-0275-7910-99a1-8caa871a6546
**Round:** 1 of 20

---

1. Task 1.8 is not actually backward-compatible as written. The proposed wrapper is `export function useFlowStore<T>(selector: (state: CombinedFlowState) => T): T`, but current code still uses `const { ... } = useFlowStore();` in BrumFlowPage.tsx and NodeFlowView.tsx, and also relies on `useFlowStore.setState/getState` in tests and BrumFlowPage. Fix: either migrate every no-arg/static usage in the same task, or preserve a real Zustand-bound API with overloads plus `getState/setState/subscribe`.

2. Task 1.5 contradicts Task 1.4 about `addSyncLog`. Task 1.4 puts `addSyncLog` in `useSyncStore`, then Task 1.5 says to move `addSyncLog` into `useUiStore` as "display-only". That breaks cohesion because `syncLog` still belongs to sync state and is consumed directly in OutputPreviewPanel.tsx. Fix: keep `syncLog` and `addSyncLog` together in `useSyncStore`; only move `toast` and `maxDebugLog` if you want a UI-only store.

3. The socket-event split is incomplete and will leave stale state unless the coordinator keeps the side effects. Current handlers do more than simple store writes: `studio-defaults:updated`, `node-config:*`, and `flow-config:updated` all trigger `resolvePaths()`. Also `scene:deleted` can switch `activeSceneId` without loading the replacement scene. Fix: keep those handlers in the coordinator, or explicitly define callbacks so config/graph events resolve paths and active-scene deletion calls `setActiveScene()` rather than only `setActiveSceneId()`.

4. Task 2.1 documents the wrong `getEffectiveFieldValue` signature. The plan says `getEffectiveFieldValue(delta, definitions, spec)`, but the real function is `function getEffectiveFieldValue(delta, definition, spec)`. Fix: correct the signature everywhere in the extraction plan before anyone copies it into `utils.ts`.

5. Several Task 3.1 test cases do not match the current code. The plan says `inferParameterKind` should map `array->string`, but the code is `if (Array.isArray(value)) return 'color';`. It also says `parseParameterInputValue` should cover `bool parsing` and `enum validation`, but the implementation only special-cases `int`, `float`, and `color`, then falls through to `return rawValue;`. Fix: update the expected behaviors in the plan, or explicitly add a behavior-change step before writing those tests.

6. Task 3.2 expects a reset UI that does not exist. The proposed `ParameterEditorRow` tests include "Reset button appears" and "Clicking reset calls onChange with default value", but ParameterEditorRow has no reset button at all. Fix: remove those assertions from the plan, or add a separate feature task to implement reset behavior first.

7. The plan assumes a Vitest/jsdom setup that the repo does not currently have. There is a `client/vitest.setup.ts`, but `client/vite.config.ts` has no `test` block and there is no `vitest.config.*` file wiring jsdom or `setupFiles`. Fix: add test config before Phase 3, or annotate client component tests with `@vitest-environment jsdom` and wire the setup file explicitly.

8. Task 4.1 is not rollout-safe, and its rejection snippet can lose the error response. The plan only updates server-side files, but there is no corresponding sender in this repo that would start including `auth_token`, so enabling `MAX_TCP_AUTH_TOKEN` would cut off existing Max clients until the external TCP client is updated. Also `socket.write(errorPayload, 'utf8'); socket.destroy();` does not guarantee the payload flushes. Fix: add an explicit rollout sequence "deploy sender first, enable env var second, rollback by unsetting env var", and use `socket.end(errorPayload, 'utf8')` or destroy in the write callback.

9. Task 4.3's config-mocking instructions do not fit the current `max-tcp-server.test.ts` structure. The file does a top-level `vi.mock('../config.js', ...)` and imports the module under test immediately, so "mock config to set/unset `maxTcpAuthToken`" per test will not work as written. Fix: use a mutable mocked config object, or reset modules and dynamically import inside each auth test.

10. Task 4.2's pooling design is not compatible with the current client code and is missing shutdown integration. The sketch reuses sockets, but the real request path writes only inside `socket.on('connect', () => { socket.write(...) })`; a reused socket will never emit `connect` again, so no request will be sent. The plan also does not cover cleanup of per-request `data/timeout/error/end` listeners, assumes the external 3ds Max listener supports persistent connections even though this repo does not prove that, and exports `drainPool()` without wiring it into shutdown. Fix: first verify the remote listener supports keep-alive and multi-request framing; then change the design so `acquireSocket()` returns whether the socket is fresh, attach `once` listeners with explicit cleanup, and add `drainPool()` to server shutdown/test teardown.

11. Phase 5 overstates the required work and has an incorrect verification count. The plan says `flowLayout.test.ts` has "12 test cases", but the file currently has 43 `it(...)` blocks, and Task 5.2 proposes a Vite chunk change even though the existing condition already matches `@dagrejs/dagre` via `id.includes('dagre')`. Fix: correct the verification text to the real test count, and collapse Task 5.2 into a simple build verification unless you want the `@dagrejs` check only for readability.
