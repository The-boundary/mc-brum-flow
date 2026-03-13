# Codex Review — v04

**Model:** GPT-5.4 (xhigh reasoning)
**Thread:** 019ce8e3-0275-7910-99a1-8caa871a6546
**Round:** 4 of 20

---

1. Outcome B warmingPromise never settles on error (hangs acquireSocket). Shutdown doesn't destroy in-flight warmingSocket. Fix: resolve null on error, track warmingSocket, drainPool destroys both.

2. Mock TCP server in Task 4.3 assumes one JSON per chunk (not newline-framed). Fix: buffer incoming data and parse newline-delimited frames in a while loop. Add helpers for multi-chunk and trailing-byte test cases.

3. Phase 4 verification criteria inconsistent: Task 4.2 says both outcome suites must pass, Task 4.3 says only chosen outcome. Fix: choose one — either both always pass, or unchosen suite uses describe.skip and verification says "chosen + shared tests pass."
