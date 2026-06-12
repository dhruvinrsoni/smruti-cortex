---
name: logging
description: Logging levels + hygiene rules for SmrutiCortex — load before adding or changing any log call.
---

# Logging Policy

Use `Logger.forComponent('Name')` — never raw `console.*`. Default production level is
**INFO**, so INFO must stay quiet.

## Level meanings

| Level | Use for | Frequency |
|-------|---------|-----------|
| `ERROR` | Unexpected failures that need attention | rare |
| `WARN`  | Recoverable anomalies that are genuinely *unexpected* in normal use | rare |
| `INFO`  | **Lifecycle only** — startup, index rebuild start/complete, settings changes, Ollama up/down transitions | low (per session/event) |
| `DEBUG` | Per-operation detail — per search, per item, per request, perf telemetry, expected transient conditions | high |
| `TRACE` | Fine-grained flow | very high |

## The three rules

1. **INFO = lifecycle only.** Anything that fires per keystroke / per search / per batch / per
   item belongs at **DEBUG**, never INFO.
2. **High-frequency logs must be throttled.** Use `logger.throttled(key, level, method, msg, minGapMs, data?)`
   for hot paths (backfill progress 30s, favicon failures 60s, repeated scorer errors 5s). It
   emits at most once per `minGapMs` per `(component, key)`.
3. **Never pass a raw `Error` to a logger.** Always wrap with `errorMeta(err)` — passing an
   `Error` object makes DevTools dump a full stack trace, which is noise for *expected*
   conditions (404s, aborts, "slot busy"). Reserve real stacks for genuine ERROR paths.

## Expected ≠ WARN

Conditions that happen in normal operation are **not** warnings: a 404 favicon, an aborted
request, "Another Ollama request in progress" during a backfill, a cold model warming up.
Log these at DEBUG (throttled if frequent) and degrade gracefully — don't alarm the console.

## Changing levels in tests

Inline logger mocks must include **every** `ComponentLogger` method, including `throttled`:
`{ debug, info, warn, error, trace, throttled }` (all `vi.fn()`). The shared
`src/__test-utils__/logger-mock.ts` already does; copy it for `vi.doMock` blocks.
