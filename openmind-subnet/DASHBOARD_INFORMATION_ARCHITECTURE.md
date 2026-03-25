# OpenMind Dashboard Information Architecture

## Purpose

This document defines the product dashboard for OpenMind, including:

- Information architecture (tabs/navigation)
- Core user stories
- Required components per tab
- Data contracts (high-level)
- MVP and post-MVP rollout plan

The dashboard complements the public landing page and acts as the operational UI for developers, teams, and validators using OpenMind memory infrastructure.

---

## Product Surfaces

OpenMind should ship with two distinct surfaces:

1. **Marketing Site (Public)**
   - Messaging, trust, docs links, CTA to onboard

2. **App Dashboard (Authenticated)**
   - Real usage, memory operations, monitoring, collaboration, and API integration

This document covers the authenticated dashboard only.

---

## Primary Navigation (Top-Level Tabs)

1. Overview
2. Memory Explorer
3. Sessions & Workflows
4. Provenance & Time Travel
5. Shared Spaces
6. Multimodal Library
7. Durability & Storage
8. Network Quality
9. API & MCP
10. Billing & Plans
11. Settings

---

## 1) Overview

### Goal
Give users immediate situational awareness of memory system health, activity, and performance.

### User Stories
- As a developer, I want to quickly see if memory retrieval is healthy before running agents.
- As an operator, I want to monitor latency and failures over time.
- As a team lead, I want a snapshot of active sessions and collaboration activity.

### Components
- KPI cards:
  - Total sessions
  - Total stored chunks
  - Active workflows
  - Retrieval success rate
  - p50/p95 latency
- Memory health panel (freshness + fidelity + durability composite)
- Recent activity stream (ingest/query/checkpoint/share)
- Alerts panel (failed repairs, degraded retrieval, auth failures)
- Time range selector (24h / 7d / 30d / custom)

### Key Data
- Query metrics, storage metrics, repair events, checkpoint events, auth logs

---

## 2) Memory Explorer

### Goal
Provide the core retrieval interface for semantic + graph-aware memory search.

### User Stories
- As a builder, I want to retrieve the most relevant context for my current task.
- As an analyst, I want to inspect why results were ranked in a specific order.
- As an auditor, I want source and timeline metadata for every result.

### Components
- Global query bar (natural language + filters)
- Filters:
  - Session/workflow
  - Time range
  - Shared space
  - Modality (text/image/pdf)
  - Durability tier
- Results list with:
  - Snippet preview
  - Relevance score
  - Timestamp
  - Source metadata
- Result details drawer:
  - Full content
  - Graph path
  - Provenance pointers
  - Related chunks
- Save query / pin context action

### Key Data
- Retrieval API output with chunk metadata, ranking signals, and graph path

---

## 3) Sessions & Workflows

### Goal
Manage long-running agent processes and checkpoint-driven resumability.

### User Stories
- As an agent developer, I want to resume from the latest checkpoint without restarts.
- As an operator, I want to compare checkpoints to debug drift or failures.

### Components
- Session/workflow table:
  - ID, owner, status, last active, memory usage
- Workflow detail page:
  - Step timeline
  - Checkpoint list
  - State preview (variables/tool outputs/decisions)
- Resume controls:
  - Resume latest
  - Resume specific checkpoint
- Checkpoint diff viewer:
  - Added/removed/changed state entries

### Key Data
- Workflow metadata, checkpoint payloads, resume events, diff outputs

---

## 4) Provenance & Time Travel

### Goal
Enable historical reconstruction, auditability, and root-cause tracing.

### User Stories
- As a compliance owner, I want to reconstruct memory as of a specific timestamp.
- As a debugger, I want to inspect what changed between versions.
- As a stakeholder, I want to trace who changed what and why.

### Components
- Version timeline explorer
- Time-travel controls:
  - `as_of_timestamp`
  - `version_id`
  - `diff_since`
- Diff view (added/removed/modified chunks)
- Provenance chain view (parent links, author, reason)
- Export action (JSON/CSV/PDF)

### Key Data
- Version metadata, Merkle/provenance paths, historical snapshot responses

---

## 5) Shared Spaces

### Goal
Support secure, wallet-authenticated memory collaboration across users and agents.

### User Stories
- As a team admin, I want to manage who can access a shared memory space.
- As a collaborator, I want visibility into activity within shared memory.

### Components
- Shared spaces list and creation flow
- Member management:
  - Wallet address allow-list
  - Role permissions (owner/editor/viewer)
- Access request and approval queue
- Shared activity log
- Security events (failed auth/signature mismatch)

### Key Data
- Shared space membership, permission changes, auth verification logs

---

## 6) Multimodal Library

### Goal
Make image and PDF memory first-class, searchable, and traceable.

### User Stories
- As a user, I want to upload PDFs/images and retrieve from OCR + visual features.
- As an operator, I want to reprocess failed multimodal ingests.

### Components
- Asset grid/list (images + PDFs)
- Ingest status pipeline (uploaded -> processed -> indexed)
- OCR text panel + visual metadata panel
- Source-to-chunk mapping
- Re-index/reprocess actions

### Key Data
- File metadata, OCR text, visual embedding status, ingest errors

---

## 7) Durability & Storage

### Goal
Show reliability posture and storage health across basic and premium tiers.

### User Stories
- As a reliability engineer, I want to monitor redundancy and repair queues.
- As a user, I want to understand storage footprint and tier usage.

### Components
- Tier usage cards:
  - Basic replicated
  - Premium RS-protected
- Redundancy health panel
- RS integrity/coverage indicator
- Repair queue and outcomes
- Storage growth chart

### Key Data
- Replication factors, RS coverage stats, failed shard count, repair success rates

---

## 8) Network Quality

### Goal
Expose decentralized quality signals and miner/validator performance transparency.

### User Stories
- As a subnet participant, I want visibility into quality and scoring trends.
- As a power user, I want confidence that retrieval quality is economically enforced.

### Components
- Miner performance leaderboard
- Validator challenge outcomes
- Quality dimensions:
  - Relevance
  - Fidelity
  - Latency
  - Reconstruction accuracy
- Emission/weight trend charts
- Outlier and anomaly panel

### Key Data
- Scoring aggregates, challenge results, consensus alignment metrics, weight history

---

## 9) API & MCP

### Goal
Provide integration controls and usage visibility for developers.

### User Stories
- As a builder, I want endpoint/auth details and examples to integrate quickly.
- As an SRE, I want error breakdowns and API health insights.

### Components
- Endpoint panel
- API key/token management
- MCP integration quickstart
- Request examples (query, time-travel, checkpoint resume)
- Usage analytics:
  - requests/day
  - errors by type
  - rate-limit events
- Webhook/event log (if enabled)

### Key Data
- API traffic metrics, auth logs, integration configuration state

---

## 10) Billing & Plans

### Goal
Make cost, plan limits, and upgrade paths transparent.

### User Stories
- As a user, I want to track usage against plan limits.
- As an admin, I want invoice and payment visibility.

### Components
- Current plan and included quotas
- Usage counters:
  - Storage
  - Query volume
  - Premium durability usage
- Billing history and invoices
- Payment methods
- Upgrade recommendations

### Key Data
- Plan metadata, metered usage, invoice ledger, payment status

---

## 11) Settings

### Goal
Centralize account, security, and workspace configuration.

### Components
- Profile + workspace settings
- Wallet/auth configuration
- Team and role settings
- Notification preferences
- Data retention/export controls

---

## Global UX Patterns

- Universal top search / command palette
- Date/time range controls shared across analytics tabs
- Persistent context selectors (workspace, shared space, environment)
- Saved views and filters
- Export actions on audit-heavy pages
- Empty states with integration guidance

---

## Roles and Access Model

- **Owner/Admin**
  - Full access, billing, permissions, policy management
- **Builder/Editor**
  - Retrieval, session/workflow operations, integration access
- **Viewer/Auditor**
  - Read-only access to monitoring, provenance, and reports

Role checks should be enforced at API level, not UI-only.

---

## Suggested MVP Scope (V1)

Ship these first:

1. Overview
2. Memory Explorer
3. Sessions & Workflows
4. Provenance & Time Travel
5. API & MCP
6. Minimal Settings (auth + workspace)

### Why this MVP
- Covers core OpenMind value loop: ingest -> retrieve -> validate -> resume -> integrate
- Supports developer onboarding and operational trust quickly
- Avoids heavy UI complexity before strong usage telemetry

---

## V1.5 / V2 Expansion

Add next:

- Shared Spaces (full permissions and collaboration workflows)
- Multimodal Library (advanced processing controls)
- Durability & Storage (deep infra observability)
- Network Quality (power-user and subnet participant insights)
- Billing & Plans (self-serve monetization at scale)

---

## Suggested Sidebar Order (Final)

1. Overview
2. Memory Explorer
3. Sessions & Workflows
4. Provenance
5. Shared Spaces
6. Multimodal
7. Durability
8. Network Quality
9. API & MCP
10. Billing
11. Settings

---

## First-Wireframe Checklist

For design/engineering kickoff:

- Define one canonical page template (filters + content + details panel)
- Finalize KPI definitions and formulas for Overview cards
- Confirm retrieval result card schema and detail drawer fields
- Standardize timeline component for both Workflows and Provenance
- Define role-based visibility matrix per tab
- Create no-data, loading, and error states for each primary page

---

## Implementation Notes

- Start with static mock data contracts for each tab, then bind real APIs incrementally.
- Keep tab URLs stable from day one for future deep-linking and docs references.
- Instrument all major actions (query, resume, export, share, reprocess) for product analytics.
- Add strong audit logging early for provenance-related trust and enterprise readiness.
