"""
Environment-driven chain / wallet / axon settings.

Local defaults match the previous hard-coded dev setup. For **testnet** (or
mainnet), set ``OPENMIND_SUBTENSOR_NETWORK=test`` (or ``finney``), your real
``OPENMIND_NETUID``, wallet env vars, ``OPENMIND_PUBLIC_IP`` / ``OPENMIND_PUBLIC_PORT``,
and ``OPENMIND_LOCALNET_PATCH_AXONS=false``.

See ``DEPLOY_TESTNET.md`` in this directory for a full checklist.
"""

from __future__ import annotations

import os


def env_str(key: str, default: str) -> str:
    v = os.environ.get(key)
    if v is None:
        return default
    s = v.strip()
    return s if s else default


def env_int(key: str, default: int) -> int:
    v = os.environ.get(key)
    if v is None or not str(v).strip():
        return default
    return int(str(v).strip(), 10)


def env_bool(key: str, default: bool) -> bool:
    v = os.environ.get(key)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def load_subtensor_network() -> str:
    """
    Value passed to ``bt.Subtensor(network=...)``.

    Priority:
    1. ``OPENMIND_SUBTENSOR_ENDPOINT`` — full ``ws://`` / ``wss://`` URL
    2. ``OPENMIND_SUBTENSOR_NETWORK`` or ``SUBTENSOR_NETWORK`` — e.g. ``test``, ``finney``, ``local``
    3. Default: local dev node ``ws://127.0.0.1:9944``
    """
    ep = os.environ.get("OPENMIND_SUBTENSOR_ENDPOINT", "").strip()
    if ep:
        return ep
    net = (
        os.environ.get("OPENMIND_SUBTENSOR_NETWORK", "").strip()
        or os.environ.get("SUBTENSOR_NETWORK", "").strip()
    )
    if net:
        return net
    return "ws://127.0.0.1:9944"


def is_probably_local_chain(network: str) -> bool:
    n = network.lower()
    if n in ("local", "localnet", "dev"):
        return True
    if "127.0.0.1" in n or "localhost" in n:
        return True
    return False


def load_netuid(default: int = 2) -> int:
    for key in ("OPENMIND_NETUID", "NETUID"):
        raw = os.environ.get(key)
        if raw is not None and str(raw).strip():
            return int(str(raw).strip(), 10)
    return default


def load_wallet(*, default_hotkey: str) -> tuple[str, str, str]:
    name = env_str(
        "OPENMIND_WALLET_NAME",
        env_str("BT_WALLET_NAME", "test-coldkey"),
    )
    hotkey = env_str(
        "OPENMIND_WALLET_HOTKEY",
        env_str("BT_WALLET_HOTKEY", default_hotkey),
    )
    path = os.path.expanduser(
        env_str(
            "OPENMIND_WALLET_PATH",
            env_str("BT_WALLET_PATH", "~/Documents/bittensor-test-wallet"),
        )
    )
    return name, hotkey, path


def localnet_patch_axons_enabled() -> bool:
    """When False, validators/gateway use on-chain axon IPs (testnet/mainnet)."""
    if env_bool("OPENMIND_LOCALNET_PATCH_AXONS", True):
        return True
    return False


def gateway_bind() -> tuple[str, int]:
    host = env_str("OPENMIND_GATEWAY_HOST", "0.0.0.0")
    port = env_int("OPENMIND_GATEWAY_PORT", 8090)
    return host, port


def load_axon_endpoints(network: str) -> tuple[str, int, str, int, bool]:
    """
    Returns (bind_ip, axon_port, public_ip, public_port, public_ip_explicit).

    If ``OPENMIND_PUBLIC_IP`` is unset or empty, ``public_ip`` defaults to
    ``127.0.0.1`` and ``public_ip_explicit`` is False (caller should warn on
    non-local chains).
    """
    bind_ip = env_str("OPENMIND_AXON_BIND_IP", "0.0.0.0")
    axon_port = env_int("OPENMIND_AXON_PORT", 8091)
    public_port = env_int("OPENMIND_PUBLIC_PORT", axon_port)
    raw_pub = os.environ.get("OPENMIND_PUBLIC_IP")
    explicit = raw_pub is not None and str(raw_pub).strip() != ""
    public_ip = env_str("OPENMIND_PUBLIC_IP", "127.0.0.1")
    return bind_ip, axon_port, public_ip, public_port, explicit
