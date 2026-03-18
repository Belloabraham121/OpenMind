# OpenMind Subnet – Implementation TODOs

This file tracks the main implementation tasks for the OpenMind subnet.  
We will check items off as we complete them.

## 1. Environment & Boilerplate

- [x] Ensure `.venv` is created and activated
- [x] Install dependencies from `requirements.txt`
- [x] Add `.gitignore` entries for `.venv`, caches, and build artifacts

## 2. Protocol & Synapses

- [x] Define `OpenMindRequest` / `OpenMindResponse` structures in `openmind/protocol.py`
- [x] Add time-travel fields (`as_of_timestamp`, `version_id`, `diff_since`)
- [x] Add checkpointing fields (`workflow_id`, `resume_from_checkpoint`)
- [x] Add shared-space fields (`shared_space_id`, auth metadata)
- [x] Wire protocol into `neurons/miner.py` and `neurons/validator.py`

## 3. Storage & Durability

- [x] Implement encrypted shard storage in `openmind/storage.py`
- [x] Implement RS(10,4) encoding/decoding using `reedsolo` in `openmind/durability.py`
- [x] Add basic tests for encode/reconstruct paths

## 4. Retrieval & Scoring

- [x] Implement vector-based retrieval in `openmind/retrieval.py` (MVP)
- [x] Stub graph-enriched retrieval API
- [x] Implement validator-side scoring in `openmind/scoring.py`
- [x] Add tests for retrieval and scoring behaviour

## 5. Versioning & Provenance

- [x] Implement version metadata model in `openmind/versioning.py`
- [x] Implement Merkle-chain creation and verification
- [x] Implement `create_version`, `get_version_chain`, and diff helpers
- [x] Add tests for accurate time-travel reconstruction

## 6. Workflow Checkpointing

- [x] Implement checkpoint save/load in `openmind/checkpoint.py`
- [x] Support `resume_from_checkpoint` in protocol and validator
- [x] Add tests for checkpoint round-trips

## 7. Shared Memory Spaces & Access Control

- [x] Implement wallet-signature verification in `utils/crypto.py`
- [x] Implement `authorize_access` in `openmind/shared_space.py`
- [x] Enforce access control in retrieval paths
- [x] Add tests for shared-space permissions

## 8. Multimodal (Images & PDFs)

- [x] Decide on OCR + visual embedding libraries
- [x] Implement `ingest_image` in `openmind/multimodal.py`
- [x] Implement `ingest_pdf` in `openmind/multimodal.py`
- [x] Add tests for basic multimodal ingest metadata

## 9. Neuron Wiring

- [x] Implement `run()` in `neurons/miner.py` using Bittensor base neuron patterns
- [x] Implement `run()` in `neurons/validator.py`
- [x] Ensure `python neuron.py --role miner|validator` works end-to-end (smoke test)

## 10. Observability & Tooling

- [x] Implement config loading in `utils/config.py`
- [x] Implement logging setup in `utils/logging.py`
- [x] Add structured logs for miner/validator flows
- [x] Add initial unit tests under `tests/` and set up a simple test runner

## 11. Incentive Mechanism & Rewards

- [x] Design OpenMind-specific incentive mechanism based on PRD §2 (benchmark-beating reward model)
- [x] Implement OpenMind reward computation in `openmind/scoring.py` (storage, retrieval, versioning, checkpoints, latency)
- [x] Implement validator challenge modes in `neurons/validator.py` (real + synthetic MCP-style queries)
- [x] Wire rewards into EMA scores and on-chain weights
- [x] Add tests that validate reward behavior for different miner performance profiles
