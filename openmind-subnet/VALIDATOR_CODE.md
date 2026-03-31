# Validator Code Guide

This document points to the validator implementation and related modules.

## Main validator implementation

- `neurons/validator.py` - primary validator neuron logic

Key responsibilities in this file typically include:
- loading metagraph/network state
- sampling/querying miners
- evaluating responses and scoring behavior
- managing validation loop cadence and runtime checks
- publishing or preparing weights (when configured)

## Validator runtime entrypoint

- `neuron.py` - run validator mode with `--role validator`

## Validator configuration

- `neurons/env_config.py` - environment settings used by validator startup
- `DEPLOY_TESTNET.md` - recommended validator env vars for testnet

## Relevant shared modules

- `openmind/protocol.py` - protocol contracts used in miner/validator communication
- `openmind/scoring.py` - scoring helpers used by validation behavior
- `gateway/api.py` - validator-hosted API/gateway integration

## Related docs

- Project overview: `README.md`
- Subnet code map: `SUBNET_CODE.md`
- Miner guide: `MINER_CODE.md`
- Setup instructions: `SETUP_INSTRUCTIONS.md`
- Run instructions: `RUN_INSTRUCTIONS.md`
