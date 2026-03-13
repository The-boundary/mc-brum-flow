# Codex Review — v01 Feedback

**Thread ID:** `019ce866-16b9-74a2-a9b0-dfe84abe832c`
**Round:** 1
**Verdict:** Needs revision (11 items)

---

## Feedback Items

### 1. Task 2 breaks delete routes
Delete routes return `{ success: true }` without a `data` field. Changing to `data.success !== true` would cause these routes to throw on the missing `data` field. Need to handle `{ success: true }` responses that legitimately omit `data`.

### 2. Task 1 should use `res.text()` first
Instead of `res.json().catch(...)`, read the body as text first, then try `JSON.parse`. Include the truncated body text in the error for debugging non-JSON responses (e.g., nginx 502 HTML pages).

### 3. Task 3 needs `pathResolutionError` flag
Just keeping stale paths isn't enough — the UI needs to know paths are stale so it can disable push/submit buttons. Add a `pathResolutionError` flag to the store state and use it to disable actions that depend on fresh paths.

### 4. Task 4 type guard doesn't match full `Camera` type
The `Camera` type from `shared/types/index.ts:15` has more fields than just `id`, `name`, `max_handle`. The type guard should check all required fields of the actual `Camera` interface, or at minimum document which fields are the critical minimum.

### 5. Tasks 8-10 `warnings` array is never consumed
Adding `warnings: string[]` to `ResolvedFlowPath` is pointless if no UI or log consumer reads it. Either add rendering in the output panel, pipe warnings through `emitMaxLog()` for the debug feed, or both. Otherwise it's dead data.

### 6. Task 11 rationale is wrong
Empty arrays `[]` ARE truthy in JavaScript. `[] || fallback` returns `[]`, not `fallback`. So `||` and `??` behave identically for empty arrays. The change is still correct for semantic clarity (signaling "we mean nullish, not falsy"), but the stated rationale ("treats empty arrays as falsy") is factually wrong and should be corrected.

### 7. Task 12 duplicates existing `FlowConfig` type
`FlowConfig` already exists in `shared/types/index.ts:73`. The proposed `FlowConfigPayload` interface duplicates it. Either import and extend `FlowConfig`, or explain why a separate type is needed.

### 8. Tasks 14/20 overlap causes double-toast
Task 14 adds toast to `createNodeConfig` catch in the store. Task 20 adds toast to `ensureEditableConfig` in DetailPanel, which calls `createNodeConfig`. If `createNodeConfig` fails, both toasts fire. Need to pick one location or guard against duplicates.

### 9. Task 22 wrong — store does NOT toast on failure
The plan assumes `pushToMax`/`submitRender` already toast on failure ("Failure toasts are handled by the store"). This is incorrect — the store only sets `error` state, it does NOT call `showToast`. The OutputPreviewPanel needs to toast on failure itself, not rely on the store.

### 10. Task 17 drops `max_` prefix
The proposed `max_${randomUUID().slice(0,12)}` preserves the prefix, but existing tests may match on `max_` + timestamp pattern. Need to explicitly list which tests need updating and verify the `max_` prefix is preserved (it is in the proposed code, but the description is ambiguous).

### 11. Task 6 `resolveTargetPath` is private
The plan says to "export it for testing" but doesn't specify how to handle the testing approach. `resolveTargetPath` is file-private. Options: (a) export it, (b) test indirectly through `syncSceneToMaxNow`, (c) extract to a separate module. The plan should pick one and specify the approach.
