# Codex Review — v03

**Model:** GPT-5.4 (xhigh reasoning)
**Thread:** 019ce8e3-0275-7910-99a1-8caa871a6546
**Round:** 3 of 20

---

1. The keep-alive decision gate in Task 4.2 is not executable as written against the real dependency. The plan says to test with two sequential requests on the same socket, but the external 3ds Max MCP listener is not in this repo. Fix: split into automated protocol tests against a mock TCP server in max-mcp-client.test.ts + manual validation against the actual external listener before choosing Outcome A vs B.

2. Outcome B's warming design can over-create sockets. `warmSocket` stays null until `connect`, so repeated calls before first connection completes will create multiple concurrent warm sockets. The test matrix says Outcome B is "No (always fresh)" even though the design hands off a pre-connected socket. Fix: track in-flight warming attempt immediately (warmingPromise), update matrix wording.

3. The pooled-socket framing story is not production-safe. The `responseData` parsing only checks for first `\n` but doesn't handle trailing bytes on reused sockets. Fix: require explicit strategy — parse only up to first `\n`, reject pool reuse if trailing bytes remain, or maintain per-socket buffer and only return to pool when empty.

4. Top-level architecture section still says `useFlowStore.setState()` for store seeding but v03 migrates to sub-store seeding. Fix: update architecture sentence.
