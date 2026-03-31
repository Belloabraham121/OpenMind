# Subnet Code Guide

This document shows where the main OpenMind subnet code lives and what each part is responsible for.

## Core subnet modules

Primary subnet logic is in `openmind-subnet/openmind/`:

- `openmind/protocol.py` - protocol/synapse definitions used by neurons
- `openmind/storage.py` - storage primitives and persistence behavior
- `openmind/retrieval.py` - retrieval pathways for memory data
- `openmind/scoring.py` - scoring/evaluation helpers used by validation logic
- `openmind/durability.py` - durability and replication behavior
- `openmind/versioning.py` - version bookkeeping
- `openmind/shared_space.py` - shared space coordination patterns
- `openmind/multimodal.py` - multimodal handling
- `openmind/checkpoint.py` - checkpoint/state management

## Neuron entrypoints and integration

- `neuron.py` - top-level runtime entrypoint that starts a miner or validator role
- `neurons/env_config.py` - environment-variable driven runtime configuration

## Gateway/API layer

- `gateway/api.py` - FastAPI gateway endpoints for subnet-facing operations
- `gateway/mcp_server.py` - MCP integration layer

## Supporting code

- `utils/` - shared utilities (config, logging, crypto)
- `tests/` - test coverage for core behavior
- `benchmarks/` - benchmark scripts and outputs

## Related docs

- Project overview: `README.md`
- Miner details: `MINER_CODE.md`
- Validator details: `VALIDATOR_CODE.md`
- Setup: `SETUP_INSTRUCTIONS.md`
- Running: `RUN_INSTRUCTIONS.md`
