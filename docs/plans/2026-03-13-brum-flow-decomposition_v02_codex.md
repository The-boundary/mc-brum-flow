# Codex Review — v02

**Model:** GPT-5.4 (xhigh reasoning)
**Thread:** 019ce8e3-0275-7910-99a1-8caa871a6546
**Round:** 2 of 20

---

1. The plan still has an unresolved `error` ownership conflict between `sceneStore` and `uiStore`. Task 1.1 SceneState includes `error` and `setError`, but Task 1.5 also moves `error` to `useUiStore` as "UI-level error display". Task 1.8 migration then mixes both. Fix: choose one owner. Either keep `error` only in `useUiStore` and remove/rename it in `sceneStore`, or keep it in `sceneStore` and stop moving it to `uiStore`.

2. The `useFlowStore` migration is still inconsistent in later phases. Task 1.8 says preferred path is full direct migration to sub-stores and the barrel no longer exports a combined `useFlowStore` hook, but Task 2.5's "Final DetailPanel.tsx" still uses `import { useFlowStore } from '@/stores/flowStore'` and `useFlowStore((state) => state.selectedNodeId)`. Task 3.4 also still says "Seed `useFlowStore` / `useFlowGraphStore`". Fix: make every post-Task-1.8 snippet use actual sub-stores, or explicitly commit to keeping a real combined `useFlowStore` in the barrel. Also add `export { useUiStore }` to the barrel if backward compatibility is still a goal.

3. The test migration for `flowStore.addEdge.test.ts` is incomplete. Task 1.8 only shows migrating to `useFlowGraphStore` for `setState()` and `addEdge()`, but the file also contains `useFlowStore.getState().scaffoldPipeline()` which moves to the coordinator in Task 1.7. Fix: split this test file or update scaffold tests to import from `flowCoordinator` and seed required stores explicitly.

4. Task 4.2 still contains incorrect and internally inconsistent pooling API. `acquireSocket` returns `isFresh: false` even for newly created sockets. The prose says use `once` listeners but sample code uses `socket.on('data', onData)` (not `once`, which is correct for multi-chunk responses but contradicts the prose). No cleanup of temporary `socket.once('error', reject)` during connect. Fix: remove `isFresh` entirely (acquireSocket returns connected socket), correct prose to say `on('data')` with explicit cleanup and `once` only for connect/error/timeout/end.

5. The fallback branch in Phase 4 is not carried through into the test plan. Task 4.2 has a "connection warming" fallback if keep-alive isn't supported, but Task 4.3 only defines pooling tests. Fix: add explicit decision gate after investigation step and define two verification paths.

6. The shutdown wiring in Task 4.2 is under-specified. References "existing shutdown logic" but there is no graceful shutdown handler in server/src/index.ts. Fix: specify a full shutdown sequence for SIGTERM and SIGINT that drains pool, stops TCP server, closes Socket.IO and HTTP server.
