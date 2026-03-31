# Run Instructions

Use this guide to run OpenMind in miner or validator mode.

## 1) Move to project directory

```bash
cd openmind-subnet
```

## 2) Run as miner

Set required miner environment variables, then start:

```bash
python neuron.py --role miner
```

Example variables are documented in `DEPLOY_TESTNET.md`.

## 3) Run as validator

Set required validator environment variables, then start:

```bash
python neuron.py --role validator
```

Example variables are documented in `DEPLOY_TESTNET.md`.

## 4) Local development mode

For local testing (for example local subtensor and local axon patching), use your local endpoint variables and runtime settings as described in:

- `DEPLOY_TESTNET.md` (see local dev notes)

## 5) Operational checks

After startup, verify:

- process starts without import/config errors
- wallet and network connection initialize correctly
- miner axon is reachable (if miner role)
- validator loop starts and samples miners (if validator role)
- gateway endpoint is reachable (if validator gateway is enabled)

## 6) Useful file references

- Entrypoint: `neuron.py`
- Miner runtime: `neurons/miner.py`
- Validator runtime: `neurons/validator.py`
- Environment config: `neurons/env_config.py`
- Gateway API: `gateway/api.py`
