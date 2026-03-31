# Setup Instructions

Use these steps to prepare an OpenMind miner or validator environment.

## 1) Prerequisites

- Python environment set up for this repository
- Access to Bittensor testnet (or target chain endpoint)
- Wallets available (coldkey + role-specific hotkey)
- Registered subnet/netuid and role registration where required
- Network/firewall access for your configured axon or gateway ports

## 2) Install dependencies

From `openmind-subnet/`:

```bash
pip install -r requirements.txt
```

## 3) Configure environment variables

Common variables:

- `OPENMIND_SUBTENSOR_NETWORK` (example: `test`)
- `OPENMIND_SUBTENSOR_ENDPOINT` (optional alternative endpoint)
- `OPENMIND_NETUID`
- `OPENMIND_WALLET_NAME`
- `OPENMIND_WALLET_HOTKEY`
- `OPENMIND_WALLET_PATH`

Miner-specific variables:

- `OPENMIND_AXON_PORT`
- `OPENMIND_PUBLIC_IP`
- `OPENMIND_PUBLIC_PORT`
- `OPENMIND_SERVE_AXON`

Validator-specific variables:

- `OPENMIND_VALIDATOR_SAMPLE_SIZE`
- `OPENMIND_GATEWAY_HOST`
- `OPENMIND_GATEWAY_PORT`

## 4) Testnet-specific setup reference

For the exact recommended testnet values and notes, read:

- `DEPLOY_TESTNET.md`

That file includes:
- miner-specific environment table
- validator-specific environment table
- caveats around localnet patching and gateway routing

## 5) Verify setup

Before running:

- confirm wallet files exist
- confirm `OPENMIND_NETUID` is correct
- confirm public IP/port mapping if running miner
- confirm firewall/security groups allow required inbound traffic

Then continue with `RUN_INSTRUCTIONS.md`.
