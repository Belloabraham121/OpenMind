# Miner Code Guide

This document points to the miner implementation and its supporting modules.

## Main miner implementation

- `neurons/miner.py` - primary miner neuron logic

Key responsibilities in this file typically include:
- initializing miner runtime state
- binding/serving axon interfaces
- handling inbound subnet requests/synapses
- reading runtime configuration and wallet/network context
- interacting with storage/retrieval components

## Miner runtime entrypoint

- `neuron.py` - run miner mode with `--role miner`

## Miner configuration

- `neurons/env_config.py` - environment settings used by miner startup
- `DEPLOY_TESTNET.md` - recommended miner env vars for testnet

## Relevant shared modules

- `openmind/protocol.py` - request/response protocol contracts
- `openmind/storage.py` and `openmind/retrieval.py` - memory operations
- `utils/logging.py` - logging behavior used by miner runtime

## Related docs

- Project overview: `README.md`
- Subnet code map: `SUBNET_CODE.md`
- Validator guide: `VALIDATOR_CODE.md`
- Setup instructions: `SETUP_INSTRUCTIONS.md`
- Run instructions: `RUN_INSTRUCTIONS.md`
