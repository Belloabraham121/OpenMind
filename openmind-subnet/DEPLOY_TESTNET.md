# Deploy OpenMind neurons on Bittensor testnet

## 1. Prerequisites

- A **registered subnet** (your `netuid` on test) or the target subnet you join.
- **Coldkey + hotkey** funded on testnet (TAO for fees).
- **Miner** registered on that `netuid` with an **on-chain axon** (reachable IP + open port).
- **Validator** registered if you will run weights (optional for early integration tests).

Use `btcli` / your usual workflow to register and fund.

## 2. Miner environment

Bind locally, advertise your **public** IP and port (NAT must forward to `OPENMIND_AXON_PORT`).

| Variable | Example | Notes |
|----------|---------|--------|
| `OPENMIND_SUBTENSOR_NETWORK` | `test` | Or `OPENMIND_SUBTENSOR_ENDPOINT=wss://…` |
| `OPENMIND_NETUID` | `…` | Your subnet uid |
| `OPENMIND_WALLET_NAME` | `my_coldkey` | |
| `OPENMIND_WALLET_HOTKEY` | `miner_hot` | |
| `OPENMIND_WALLET_PATH` | `~/.bittensor/wallets` | Expanded path |
| `OPENMIND_AXON_PORT` | `8091` | Firewall / security group must allow inbound |
| `OPENMIND_PUBLIC_IP` | `203.0.113.50` | **Required** for other peers to connect |
| `OPENMIND_PUBLIC_PORT` | `8091` | Often same as axon port |
| `OPENMIND_LOCALNET_PATCH_AXONS` | `false` | Set on **validator** / gateway only; miner ignores |
| `OPENMIND_SERVE_AXON` | `true` | Attempts on-chain `serve_axon` after `axon.start()` (if supported by your `bittensor` version) |

Example:

```bash
export OPENMIND_SUBTENSOR_NETWORK=test
export OPENMIND_NETUID=123
export OPENMIND_WALLET_NAME=my_coldkey
export OPENMIND_WALLET_HOTKEY=miner_hot
export OPENMIND_PUBLIC_IP=203.0.113.50
export OPENMIND_PUBLIC_PORT=8091
export OPENMIND_SERVE_AXON=true
python neuron.py --role miner
```

## 3. Validator environment

| Variable | Example | Notes |
|----------|---------|--------|
| `OPENMIND_SUBTENSOR_NETWORK` | `test` | Same chain as miner |
| `OPENMIND_NETUID` | same as miner | |
| Wallet vars | … | Validator hotkey |
| `OPENMIND_VALIDATOR_SAMPLE_SIZE` | `4` | Cap miners queried per step |
| `OPENMIND_LOCALNET_PATCH_AXONS` | **`false`** | **Critical** — use real metagraph axons |
| `OPENMIND_GATEWAY_HOST` / `OPENMIND_GATEWAY_PORT` | `0.0.0.0` / `8090` | REST gateway |

```bash
export OPENMIND_SUBTENSOR_NETWORK=test
export OPENMIND_NETUID=123
export OPENMIND_WALLET_NAME=my_coldkey
export OPENMIND_WALLET_HOTKEY=validator_hot
export OPENMIND_LOCALNET_PATCH_AXONS=false
python neuron.py --role validator
```

## 4. Gateway / dashboard

Point `SUBNET_GATEWAY_URL` (or your app’s gateway base URL) at `http://<validator-host>:8090` if you use the embedded FastAPI gateway.

## 5. Local dev (unchanged)

Omit the variables above (or keep `OPENMIND_LOCALNET_PATCH_AXONS=true`) to use `ws://127.0.0.1:9944`, default wallets, and `127.0.0.1:8091` axon patching.
