# MC-Brum-Flow — Project Instructions

## Testing Requirements

**Tests are mandatory.** Every feature, bug fix, or code change MUST include or update corresponding tests.

- Run tests before committing: `npm test` (from project root)
- Test framework: Vitest (shared config at project root)
- Client tests: `client/src/**/*.test.ts(x)` — unit tests for stores, utilities, and pure logic
- Server tests: `server/src/**/*.test.ts` — unit tests for services, route handlers, and utilities
- Shared tests: `shared/**/*.test.ts` — type/utility tests

### What to test
- **Stores** (flowStore, uiStore): state mutations, computed values, socket event handling
- **Flow logic** (flowLayout, graphSemantics): layout algorithms, semantic analysis, path resolution
- **Server services** (max-tcp-server, max-sync, flowResolver): message processing, command dispatch, sync logic
- **Route handlers**: request validation, response format, error handling
- **Utility functions**: all pure helper functions

### When changing code
1. Check if existing tests cover the changed code
2. If yes, update those tests to match the new behavior
3. If no, write new tests
4. Run the full test suite and ensure all tests pass before committing
