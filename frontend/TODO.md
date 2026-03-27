# Frontend — API & Endpoints TODO

Track integration work between the Next.js app and your backend (REST or tRPC, etc.).  
**Backend DB:** MongoDB for users, sessions, and app data.

Mark items `[x]` when done; keep them `[ ]` while pending.

---

## 0. Foundation

- [x] Add `.env.local` (and document in team notes): `NEXT_PUBLIC_API_BASE_URL`, feature flags
- [x] Create a single API client module (base URL, `fetch` wrappers, error parsing, auth header injection)
- [x] Define TypeScript types/DTOs aligned with backend responses (or generate from OpenAPI if you add it)
- [x] Replace demo cookie auth with real login/register/logout/refresh calls to the backend
- [x] Store session token securely (prefer **httpOnly cookie** set by backend; avoid localStorage for access tokens in production)
- [ ] Update Next.js middleware to validate session against backend (or verify JWT) instead of demo cookie only
- [ ] Add global loading/error UI patterns for data fetching (per route or shared layout)

---

## 1. Authentication (phone, email, password → MongoDB)

**Note:** User identity and credentials live in Mongo; frontend only calls APIs.

- [x] **Register** — `POST` (email, phone, password) → handle validation errors in UI
- [x] **Login** — `POST` (email or phone + password) → session established (cookie or token per your API design)
- [x] **Logout** — `POST` or `DELETE` session endpoint — clear client state
- [x] **Refresh session** — if using short-lived access + refresh tokens, wire silent refresh or redirect on 401
- [x] **Verify email / phone** — OTP or link flows: UI for code entry + resend cooldown
- [x] **Forgot password** — request reset + reset form + success states
- [x] **Change password** — authenticated endpoint + dashboard settings form
- [x] Login/register pages: remove or narrow “demo-only” copy once real auth ships

---

## 2. Dashboard — shared

- [x] **Current user / workspace** — `GET` profile + workspace list for header and settings
- [x] **Overview metrics** — `GET` aggregated KPIs (sessions, chunks, latency, success rate) — replace sample cards
- [x] **Activity feed** — `GET` paginated events (ingest, query, checkpoint, share) — replace static list

---

## 3. Dashboard — tab endpoints

- [x] **Memory Explorer** — `GET`/`POST` search (query, `top_k`, filters, tier) — bind to search UI + result cards
- [x] **Sessions & Workflows** — `GET` list + detail; **checkpoint resume** — `POST` with `workflow_id` / `resume_from_checkpoint`
- [x] **Provenance** — `GET`/`POST` time-travel (`as_of_timestamp`, `version_id`, `diff_since`) — bind to form + diff panel
- [x] **Shared Spaces** — `GET` spaces; `POST` create; **members** — add/remove; enforce errors for unauthorized
- [x] **Multimodal** — `GET` assets + ingest status; optional `POST` upload + poll status
- [x] **Durability** — `GET` tier usage, RS/replication health, repair queue — bind to progress UI
- [ ] **Network Quality** — `GET` miner/validator leaderboard + challenge stats — bind to table
- [x] **API & MCP** — Mongo-backed keys (`/api/auth/api-keys`), Bearer on `/api/gateway/*`, dashboard UI; MCP stdio `--bff-url` + `--api-key`
- [x] **API usage stats** — per-key request counts / quotas (dashboard placeholders)
- [ ] **Billing** — `GET` plan + usage; Stripe/customer portal link if applicable
- [ ] **Settings** — `GET`/`PATCH` workspace + notification prefs — wire forms (remove `disabled` where done)

---

## 4. Quality & ops (frontend side)

- [ ] Handle **401/403** consistently (redirect to login or show upgrade/forbidden)
- [ ] Add **request timeouts** and retry policy where safe (idempotent GETs only)
- [ ] Paginate long lists (explorer results, activity, leaderboard)
- [ ] Accessibility pass on forms (labels, errors, focus)
- [ ] E2E smoke: register → login → dashboard overview loads from API

---

## 5. Done = definition of checklist

Consider this file “complete” when every `[ ]` above is `[x]` and the app runs against your real **Mongo-backed** APIs with no hardcoded sample data in user-facing paths (sample badges can remain only in non-prod builds if you want).
