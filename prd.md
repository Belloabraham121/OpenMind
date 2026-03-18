# OpenMind Product Requirements Document (PRD)

**Version 1.0 – March 2026**  
**Product Name:** OpenMind  
**Subtitle:** The Decentralized Memory Operating System for MCP-Compatible AI Agents  
**Author:** iteoluwakisi.eth (@BAbraham_92)  
**Status:** Pre-Implementation / Bittensor Subnet Ideathon Submission

## 1. Vision & Purpose

OpenMind is the persistent, provenance-aware external memory layer that turns short-term, forgetful AI agents into long-term, coherent, stateful intelligences.

**Core Promise**  
Any MCP-compatible tool (Claude Desktop, Cursor, LangGraph, ChatGPT/Gemini integrations, etc.) can paste one endpoint and instantly gain:

- lossless, uncompressed memory across months/years
- instant precise recall without summarization
- full provenance & time-travel
- shared context across multiple agents
- multimodal understanding (text + images + PDFs)
- durable workflow checkpointing & resumability

**Tagline**  
OpenMind – The Memory OS for the Agentic Workspace

**Why now (2026 context)**  
Agentic AI is exploding, but production agents still fail catastrophically on long-running tasks due to state loss, context rot, and lack of shared memory. The real trillion-dollar moat is the structured, compounding context layer — OpenMind is building exactly that on Bittensor.

## 2. High-Level Product Scope – MVP (Minimum Viable Product)

### Must-have Features (Phase 1 – Launch)

| #   | Feature                                            | Description                                                | Priority |
| --- | -------------------------------------------------- | ---------------------------------------------------------- | -------- |
| 1   | Persistent lossless storage                        | Full uncompressed history stored as encrypted shards       | Must     |
| 2   | Hybrid retrieval (semantic + graph)                | Vector search + relational graph traversal                 | Must     |
| 3   | Tiered durability (basic replication + premium RS) | Reed-Solomon erasure coding for fault tolerance            | Must     |
| 4   | MCP endpoint compatibility                         | Plug-and-play with Claude Desktop, Cursor, LangGraph       | Must     |
| 5   | Versioning & time-travel queries                   | “as_of_timestamp”, “version_id”, diff_since                | Must     |
| 6   | Durable workflow checkpointing                     | Structured JSON state save/resume for agent workflows      | Must     |
| 7   | Basic shared memory spaces                         | Group/session sharing with wallet-signature access control | Must     |
| 8   | Image & PDF multimodal support                     | Visual embeddings + OCR + layout-aware storage             | Must     |

### Nice-to-have / Phase 2 (post-launch 3–6 months)

- Full multimodal expansion (audio transcription, diagrams, handwriting)
- Auto-graph enrichment (NER + relation extraction on ingest)
- Feedback loop & active re-ranking learning
- Export / backup API (full encrypted session archive)
- Multi-user provenance audit logs
- Threshold encryption for shared spaces

## 3. Functional Requirements – Detailed Breakdown

### 3.1 Core Memory Storage & Retrieval

- **Input**: MCP call with session_id, query (text or embedding), top_k, filters, tier
- **Output**: Ranked list of chunks with content, relevance score, timestamp, source, graph_path, reconstructed flag
- **Durability**:
  - Basic: 3–5 full copies
  - Premium: RS(10,4) default (survive 4 miner failures), configurable
- **Encryption**: Client-side before upload (AES-256-GCM or similar), miner never sees plaintext

### 3.2 Full Provenance & Time-Travel (expanded section)

**Goal**  
OpenMind must provide complete **provenance** (traceability of origin, changes, and lineage) and **time-travel** (ability to query or reconstruct any past state of the memory exactly as it existed at a specific point in time). This turns raw memory into **institutional intelligence** — agents can understand not just _what_ was remembered, but _why_, _when_, _by whom_, and _how it evolved_.

**Why this is critical (2026 context)**  
Agentic workflows frequently fail due to “context rot” and lack of auditability. Developers and enterprises need to:

- Audit decisions (“Why did the agent reject vendor A on March 5?”)
- Rollback changes (“Revert to the state before I approved the budget increase”)
- Debug long-running tasks (“Show me exactly what the memory looked like mid-workflow when it failed”)
- Comply with regulations (provenance for legal, financial, or medical agents)

**Core Mechanics**

1. **Versioned Shards**
   - Every time a shard is updated or new data is added to a session, a new immutable version is created.
   - Each version links to its parent via a **Merkle tree hash chain** (provenance root).
   - Metadata stored with every version:
     - `version_id`: unique hash
     - `timestamp`: ISO 8601 UTC
     - `author`: wallet address or agent identifier (if shared space)
     - `change_reason`: optional short description (e.g., “user correction”, “tool output”, “agent decision”)
     - `parent_version_id`: link to previous state

2. **Time-Travel Query Interface**
   - New Synapse fields in `OpenMindRequest`:
     - `as_of_timestamp`: ISO 8601 string → reconstruct memory exactly as it existed at that moment
     - `version_id`: specific version hash → jump directly to that state
     - `diff_since`: version_id or timestamp → return only what changed since then
   - Response fields in `OpenMindResponse`:
     - `version_diff`: added/removed/modified chunks (delta)
     - `provenance_path`: full chain from root to requested version (audit trail)

3. **Provenance Graph**
   - Each version node in the Merkle tree is also a node in the knowledge graph.
   - Edges represent causality: “this decision → this tool output → this memory update”.
   - Agents can query: “show all changes that led to the current budget approval”.

4. **Implementation Notes**
   - Storage: Version metadata + Merkle proofs stored as small JSON shards (cheap to replicate).
   - Retrieval: Validators reconstruct the exact view by traversing the Merkle chain and applying only versions ≤ requested time.
   - Durability: Version metadata uses premium RS protection (critical for audit integrity).

**Success Criteria**

- 100% accurate reconstruction of any historical state (verified via hash match)
- Provenance queries return full audit trail in < 1.5 s
- Agents can rollback or diff without restarting workflows

### 3.3 Workflow Checkpointing (The Agent OS Layer)

- Agents can save structured checkpoints:
  ```json
  {
    "workflow_id": "wf-uuid-123",
    "step": 7,
    "timestamp": "2026-03-16T11:42:00Z",
    "state": {
      "variables": {"budget": 5000, "approved": true},
      "tool_results": [...],
      "decisions": ["rejected option A", "chose vendor B"]
    }
  }
  ```
- Resume query: `resume_from_checkpoint: true` → returns latest or specific checkpoint
- Stored with premium RS + fast retrieval priority

### 3.4 Shared Memory Spaces

- `shared_space_id` in request
- Access control: wallet signature + optional allow-list
- Miners enforce permission before returning shared shards

### 3.5 Multimodal (Images & PDFs)

- Ingest: render PDF → images → visual embedding (CLIP) + OCR text
- Store: visual_embedding (512-dim), ocr_text, visual_hash
- Query: `multimodal_type: "image"` or `"pdf"` → returns visual description + text

### 3.6 Durability & Reed-Solomon Erasure Coding (expanded with multiple options)

**Goal**  
Ensure data survives even when 30–40% of miners go offline, with minimal latency impact.

**Default Scheme (MVP)**

- RS(10,4): 10 data shards + 4 parity shards
- Can tolerate loss of any 4 shards → ~40% failure tolerance
- Chunk size: 4–64 KB per shard (optimal for context fragments)

**Several Implementation Options Compared**

| Library                        | Language / Implementation | Approx. Throughput (RS(10,4), 64 KB chunk) | Modern SIMD? | Ease of Install (Python) | Production Use Cases                  | Recommendation for OpenMind                         |
| ------------------------------ | ------------------------- | ------------------------------------------ | ------------ | ------------------------ | ------------------------------------- | --------------------------------------------------- |
| reedsolo                       | Pure Python / Cython      | ~10–50 MB/s encode/decode                  | No           | Very easy (pip only)     | Prototyping, small data               | Good for dev/test, **not production**               |
| zfec                           | C + Python bindings       | ~200–800 MB/s                              | Partial      | Easy (pip + C deps)      | Tahoe-LAFS, old distributed systems   | **Strong upgrade** for early production (Phase 1–2) |
| liberasurecode (ISA-L backend) | C + Python (pyeclib)      | **1–10+ GB/s**                             | Yes (AVX2+)  | Medium (build deps)      | OpenStack Swift, Ceph, modern storage | **Best for production / scale** (Phase 2+)          |

**Recommended Phased Approach**

- **Phase 1 (MVP / testnet launch)**  
  → Use `reedsolo`  
  Reason: Zero build dependencies, easy to debug, sufficient for small chunks and testing.

- **Phase 2 (first mainnet users, moderate load)**  
  → Switch to `zfec`  
  Reason: 10–50× faster than reedsolo, still simple pip install, proven in real decentralized systems.

- **Phase 3 (high query volume, larger chunks, enterprise adoption)**  
  → Upgrade to `liberasurecode` with **ISA-L backend**  
  Reason: Hardware-accelerated (AVX2/AVX-512), reaches GB/s throughput, future-proof for 1000+ concurrent sessions.

**Implementation Notes**

- All options expose similar API: `encode(data)` → data_shards + parity_shards, `reconstruct(available_shards)` → original data
- Validators must support the same library version as miners (enforced via requirements.txt hash)
- Premium tier: configurable (k,m) pairs (e.g., RS(16,6) for ultra-sensitive data)

## 4. Non-Functional Requirements

| Category            | Requirement                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| Latency             | p95 retrieval < 800 ms (basic), < 1200 ms (RS reconstruction)                    |
| Durability          | Premium tier survives ≥ 30% miner failure                                        |
| Privacy             | End-to-end encryption; miners never see plaintext                                |
| Scalability         | Handle 1000+ concurrent sessions, 10–100 GB per user over time                   |
| Incentive Alignment | Benchmark-beating + multipliers for premium, versioning, checkpoints, multimodal |
| Security            | Wallet-signature auth, rate limiting, poisoned query resistance                  |

## 5. Project Structure (Recommended Folder Layout)

```text
openmind-subnet/                        # Root repo
├── neurons/                            # Entry points
│   ├── miner.py
│   └── validator.py
├── openmind/                           # Core business logic
│   ├── __init__.py
│   ├── protocol.py                     # Synapse definitions
│   ├── storage.py                      # Shard storage + encryption
│   ├── retrieval.py                    # Hybrid vector + graph retrieval
│   ├── durability.py                   # Reed-Solomon & proofs
│   ├── versioning.py                   # Merkle-tree version history
│   ├── shared_space.py                 # Access control & shared sessions
│   ├── multimodal.py                   # Image/PDF processing (OCR + visual embeddings)
│   ├── checkpoint.py                   # Workflow state save/resume
│   └── scoring.py                      # Validator scoring logic
├── utils/
│   ├── config.py
│   ├── logging.py
│   └── crypto.py                       # Encryption helpers
├── tests/                              # Unit & integration tests
├── requirements.txt
├── README.md
└── neuron.py                           # CLI entry: python neuron.py --role miner/validator
```

## 6. Implementation Roadmap (Suggested Order)

**Phase 1 – MVP Launch (4–8 weeks)**

1. Protocol + basic storage/retrieval
2. Premium RS durability
3. MCP endpoint compatibility
4. Versioning & time-travel
5. Workflow checkpointing
6. Basic shared spaces
7. Image/PDF multimodal basics

**Phase 2 – Polish & Scale (post-launch)**

- Auto-graph enrichment
- Feedback loop
- Full provenance audit logs
- Export/backup API
- Audio support

## 7. Success Metrics (Launch Goals)

- ≥ 50 active miners within 3 months
- ≥ 100 daily MCP queries routed through OpenMind
- ≥ 90% retrieval success rate (including RS reconstruction)
- Average latency < 800 ms p95
- Positive feedback from Cursor/Claude/LangGraph agent developers on X/Discord

---

This PRD is ready to be your north star document. You can paste it into Notion, Google Docs, or your repo README.

Would you like me to:

- Expand any section into full technical requirements (e.g., exact Synapse fields, scoring weights)?
- Generate the README.md content based on this PRD?
- Or start writing one of the new files (e.g., `checkpoint.py` full implementation)?

Let me know which direction to go next!

### 2. Emission and Reward Logic: A Benchmark-Beating System

OpenMind operates on a decisive benchmark-beating reward model, inspired by high-stakes competitive dynamics but adapted to reward sustained excellence in memory utility rather than a strict single-winner snapshot.

The core principle is straightforward: the miner (or group of miners) whose performance consistently achieves and maintains the highest aggregate utility score — measured across real and synthetic MCP queries, retrieval relevance, fidelity to original data, reconstruction accuracy, latency, durability proofs, graph reasoning depth, and measurable downstream agent improvement — captures the largest share of the subnet's TAO emissions for the validation cycle (tempo).

Whenever a new all-time high benchmark is set (e.g., a miner delivers superior hybrid retrieval + RS reconstruction results on a standardised set of challenges, or sustains top scores across multiple epochs), that miner's weighted contribution surges, drawing the majority (or in peak cases, nearly all) of the miner-side emissions until surpassed. This creates relentless pressure to innovate while allowing multiple high-performers to share rewards proportionally based on how closely they approach or exceed the current frontier.

This approach ensures emissions always flow to the cutting edge of memory intelligence: the best context retrieval, the most faithful reconstructions, the deepest relational insights, and the lowest hallucination rates in agent loops. Unlike flat proportional allocation, it amplifies rewards for breakthroughs (e.g., a novel indexing method that halves latency while boosting precision@K) while still distributing meaningfully to strong contenders — preventing winner-takes-all from becoming winner-takes-nothing stagnation.

### Incentive Alignment for Miners and Validators

The key to OpenMind's success lies in radical transparency and outcome-oriented evaluation.

- **For Miners**: Miners are driven to maximize genuine utility rather than superficial metrics. Their earnings scale dramatically when they deliver high-relevance retrievals, faithful graph-based reasoning, low-latency responses, successful storage proofs, accurate Reed-Solomon reconstruction in premium mode, and verifiable improvements in downstream MCP agent performance (e.g., coherence/consistency gains in follow-up queries). High-spec hardware for erasure coding, large-scale indexing, and fast graph traversal receives priority task assignment and higher effective multipliers, creating a clear path for specialization and investment. The benchmark-beating dynamic encourages continuous R&D: a breakthrough in semantic + graph hybrid search becomes the new baseline, raising the bar for all and turning competition into collective advancement.
- **For Validators**: Validators are aligned to produce honest, accurate, diligent scoring. Their dividends scale with how closely their submitted weights match the final Yuma consensus outcome. By rigorously testing miners on real MCP queries, synthetic benchmarks, possession challenges, poisoned/adversarial inputs, and reconstruction tasks, validators maintain the subnet's integrity. Strong alignment attracts delegation; poor performance (outliers, missed repairs) risks stake penalties and delegation flight. The transparent, reproducible evaluation criteria (open-source validator logic) eliminate black-box gaming and ensure credibility.

### Mechanisms to Discourage Low-Quality or Adversarial Behavior

Multiple overlapping safeguards protect against gaming, laziness, collusion, and malice:

- Yuma Consensus automatically downweights or zeros outliers (malicious validator manipulation or low-effort miners).
- Commit-reveal protocols for miner responses prevent front-running, copying, or fake pre-computed results.
- Reputation decay exponentially reduces task assignment probability for persistent low performance.
- Continuous storage/possession challenges (zk-proofs or hash verification) prove shard retention; repeated failures trigger severe score reduction or ejection.
- Validators inject poisoned/adversarial queries to expose hallucinations, tampering, staleness, or inconsistent reconstruction.
- In premium Reed-Solomon mode, parity verification rejects faulty shards during reconstruction.
- MCP calls require wallet-signature authentication and per-wallet rate limiting to prevent spam/abuse.
- Validators face stake-weighted slashing risk for repeated consensus failures or collusive patterns.

These create strong economic and reputational pressure toward honest, high-quality participation.

### Qualification as a Genuine “Proof of Intelligence” (and Robust Proof of Effort)

OpenMind qualifies as genuine proof of intelligence because miners must execute sophisticated, non-trivial cognitive and computational tasks that cannot be reliably faked or brute-forced:

- High-precision semantic vector similarity search across millions of embeddings.
- Knowledge-graph traversal, entity resolution, and relational reasoning to connect disparate context meaningfully.
- Faithful reconstruction of original data from Reed-Solomon parity shards (correct Galois field mathematics).
- Intelligent re-ranking/enrichment of retrieved chunks to maximize downstream MCP agent utility.
- Scoring anchors to real outcomes: relevance to query, fidelity to uncompressed source, low hallucination, graph path accuracy, and (via MCP feedback) measurable agent performance gains.

Even at baseline, it delivers robust proof of effort through:

- Cryptographically verifiable storage possession proofs.
- Consistent low-latency, high-precision retrieval under load.
- Compute-intensive RS encoding/decoding/reconstruction.
- Ongoing maintenance of vector indexes and graph structures across massive datasets.

This combination makes OpenMind's output meaningfully intelligent and reliably effortful — far beyond generic proof-of-storage or proof-of-work — positioning it as foundational infrastructure for the agentic AI era.

### 4. Validator Design

Validators in the **OpenMind** subnet serve as impartial referees, coordinators, and truth engines for the decentralized persistent memory layer. Their primary mission is to rigorously evaluate miner performance, ensure genuine high-fidelity context delivery, maintain network-wide data durability and integrity, and produce fair, consensus-driven weights that direct emissions to the most useful and intelligent memory providers.

Validators do not store large volumes of user context themselves — they focus on task orchestration, quality assessment, challenge generation, repair coordination, MCP request routing (when applicable), and decentralized consensus formation. By continuously testing miners against real and synthetic workloads, validators guarantee that OpenMind remains a reliable, always-available external brain for MCP-compatible agents.

### Scoring and Evaluation Methodology

The evaluation process is multi-layered, outcome-focused, and designed to reward real utility while keeping validator compute costs manageable and minimizing gaming vectors. It operates as a continuous, adaptive funnel rather than fixed batches.

1. **Continuous Lightweight Monitoring & Screening**
   Validators run frequent, low-cost checks on all active miners to maintain baseline health: - **Storage Possession Screening**: Random cryptographic challenges (hash proofs or zk-proofs) issued every 5–15 minutes to verify shard retention. Failure rate > threshold triggers immediate reputation decay and repair queuing. - **Quick Retrieval Probes**: Lightweight synthetic queries (pre-planted sessions with known ground truth) to catch obvious degradation (e.g., stale indexes, hallucinated chunks, excessive latency). Poor performers are temporarily downweighted or excluded from high-value task assignment.
2. **Full Retrieval & Intelligence Evaluation**
   For every real MCP/agent query (routed via gateway) and a steady stream of synthetic benchmark queries: - Validators collect responses from a random or stake-weighted subset of miners (typically 10–30 per query to balance coverage and cost). - Responses are scored individually across multiple automated metrics: - Relevance: precision@K, recall@K, normalized discounted cumulative gain (NDCG) against query embedding/ground truth. - Fidelity: edit distance or semantic similarity to original uncompressed shard; zero tolerance for fabrication. - Graph Reasoning: path correctness, depth, and entity resolution accuracy in relational traversals. - Latency: p95 response time (heavily penalized beyond 800 ms). - Reconstruction Accuracy : bit-for-bit match after RS decode; parity verification success. - Periodic downstream simulation: select responses are fed to a small reference agent via MCP loop; measure coherence/consistency improvement in follow-up outputs (optional but high-weight when used). - Poisoned/adversarial injection: ~5–10% of tasks are deliberately tricky (tampered shards, conflicting relations, stale data) to expose weaknesses.
3. **Durability & Repair Evaluation**
   Validators monitor shard health across the network: - When redundancy drops below tier-specific thresholds, they coordinate repairs (re-replication in basic mode, RS reconstruction in premium). - Miners that successfully participate in repairs or provide correct reconstructions receive bonus points. - Persistent failures trigger automatic ejection from meaningful task queues.
4. **Final Weight Calculation**
   All individual scores are aggregated per miner over the epoch (~1 hour / ~360 blocks): - Weighted average across dimensions (e.g., 40% retrieval quality, 20% fidelity, 15% speed, 10% durability, 10% capacity, 5% graph depth). - Apply tier multipliers (1.5–2× for premium RS tasks, 1.15–1.25× for archive retention). - Reputation decay applied (exponential reduction for repeated failures). - Resulting vector (0.0–1.0 per miner UID) is submitted to Yuma Consensus for stake-weighted trimmed aggregation.

### Evaluation Cadence

Evaluation is fully event-driven and continuous for maximum responsiveness:

- Real MCP queries trigger immediate retrieval scoring.
- Synthetic benchmarks, possession challenges, and adversarial tests run asynchronously every 5–15 minutes.
- Repair/reconstruction checks activate proactively whenever shard coverage falls.
- Weights are updated and committed on-chain every epoch (~1 hour), ensuring the network quickly reflects improvements, degradations, or new benchmark-setting miners.

### Validator Incentive Alignment

Validators are strongly motivated to act honestly, diligently, and in the subnet's long-term interest through interlocking economic and reputational mechanisms:

- **Stake & Delegation Pressure**: Validators require meaningful TAO stake (or delegation) to participate effectively. Dividends scale with consensus alignment — accurate weights that closely match the final Yuma outcome yield higher rewards; divergence causes delegation flight and reduced earnings.
- **Economic Skin in the Game**: Validator returns (emissions + micro-fee share) depend on OpenMind's overall adoption and reputation. Allowing low-quality miners to dominate or failing to repair degraded data erodes user trust, shrinks premium fees, and reduces subnet emission share — directly harming validators.
- **Transparency & Verifiability**: All challenge sets, scoring logic, synthetic queries, and evaluation criteria are open-source and reproducible. Any participant can audit results, making sustained manipulation detectable and reputationally catastrophic.
- **Redundancy & Decentralization**: Overlapping evaluations by multiple validators + Yuma's outlier trimming prevent any single actor from distorting outcomes. Collusive or lazy behavior is quickly penalized via consensus mismatch.
- **Hardware & Cost Alignment**: Validators run efficient, batched evaluations (no need for massive GPU farms), keeping costs reasonable while still enforcing rigorous quality.

In essence, validators are active stewards of OpenMind's integrity and value. Their incentives are deeply tied to delivering a trustworthy, high-utility memory layer — because only then will MCP-integrated agents, developers, and enterprises adopt the subnet at scale, driving fees, adoption, and emission share upward for everyone involved.
