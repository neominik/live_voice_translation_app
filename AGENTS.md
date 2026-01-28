# Overview

This repo contains a live translation app that uses OpenAIs realtime models via WebRTC.

- Stack: Vite + React + TypeScript frontend, Convex backend, WorkOS Auth.
- Frontend source: `src/`
- Backend source: `convex/`
- Auth/config: `convex/auth.ts`, `convex/auth.config.ts` (WorkOS)

## Dev

Never run your own dev server unless otherwise told to.

### Lint

- `npm run lint` (TypeScript typecheck + Convex check + Vite build)
- `npm run lint:eslint` (ESLint only)

We have a zero warnings policy. Be sure to run both commands and fix any errors/warnings before claiming completion after every code edit!

## Code style (repo conventions)

- Always strive for concise, simple solutions
- If a problem can be solved in a simpler way, propose it

### TypeScript

- `strict: true` and `noUncheckedSideEffectImports: true` are enabled.
- Avoid `any`. Prefer explicit types for complex data and API boundaries.
- Keep function signatures explicit when returning nullable data.
- Avoid return types unless necessary (lean on inference).

### React

- Hooks must follow the Rules of Hooks (ESLint enforced).
- Keep state initialization close to usage; avoid unnecessary effects.
- When using `useEffect`, include all dependencies (lint warns).

## Convex rules

Follow these rules for all `convex/` code:

### Function registration

- ALWAYS use the new function syntax: `query`, `mutation`, `action` from `./_generated/server`.
- Use `internalQuery`, `internalMutation`, `internalAction` for private functions.
- ALWAYS include `args` and `returns` validators.
- If no return value, specify `returns: v.null()`.

### HTTP endpoints

- Define HTTP endpoints in `convex/http.ts` via `httpAction` in `convex/http.ts`.
- Use `convex/router.ts` for user-defined routes; keep auth routes untouched.

### Validators

- Use `v.null()` when returning null.
- Use `v.int64()` instead of deprecated `v.bigint()`.
- Use `v.record()` for records; `v.map()` and `v.set()` are not supported.

### Queries and indexes

- Do NOT use `filter` on queries. Prefer indexes + `withIndex`.
- Use `.unique()` when you expect exactly one doc.
- Use `.order("asc" | "desc")` explicitly when order matters.

### Mutations

- Use `ctx.db.patch` for partial updates.
- Use `ctx.db.replace` for full replacements.

### Actions

- Add `"use node";` at the top of files that use Node built-ins.
- Do NOT use `ctx.db` in actions; use `ctx.runQuery`/`ctx.runMutation` instead.

### Scheduling

- Use `crons.interval` or `crons.cron` only (no `crons.daily/hourly/weekly`).
- Pass `FunctionReference` values, not function objects.

### File storage

- Use `ctx.storage.getUrl()` and query `_storage` for metadata.
- Treat storage items as `Blob` values.

### Types

- Use `Id<"table">` in types for Convex IDs.
- Use `as const` for string literal discriminators.

## Notes

- `docs/` is generated output for GitHub Pages; avoid manual edits unless requested.
- `convex/_generated` is generated; never edit by hand.
