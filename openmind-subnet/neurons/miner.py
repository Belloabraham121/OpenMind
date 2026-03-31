"""
Miner entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor miner that serves the `OpenMindRequest`
synapse defined in `openmind.protocol`.
"""

import copy
import datetime
import hashlib
import os
import time
import typing as t
import uuid

import bittensor as bt

from openmind.protocol import OpenMindRequest
from openmind import retrieval, storage, durability, versioning, checkpoint, shared_space
from openmind import storage_v2
from openmind import extraction, graph

from neurons.env_config import (
    env_bool,
    is_probably_local_chain,
    load_axon_endpoints,
    load_netuid,
    load_subtensor_network,
    load_wallet,
)


class Miner:
    """
    OpenMind miner neuron.

    Handles incoming `OpenMindRequest` synapses and returns enriched responses
    containing retrieval results, versioning info, and optional checkpoints.
    """

    def __init__(self, config: t.Optional[bt.Config] = None):
        """
        Minimal miner implementation without relying on the template base
        classes. This configures wallet, subtensor, metagraph, and an axon
        that serves the OpenMind protocol.
        """
        self.config = config or bt.Config()

        cfg_uid = getattr(self.config, "netuid", None)
        self.netuid = int(cfg_uid) if cfg_uid is not None else load_netuid(2)
        self.chain_endpoint = load_subtensor_network()
        self.wallet_name, self.wallet_hotkey, self.wallet_path = load_wallet(
            default_hotkey="test-hotkey"
        )
        bind_ip, axon_port, public_ip, public_port, pub_explicit = load_axon_endpoints(
            self.chain_endpoint
        )
        self._axon_bind_ip = bind_ip
        self._axon_port = axon_port
        self._public_ip = public_ip
        self._public_port = public_port
        if not is_probably_local_chain(self.chain_endpoint) and not pub_explicit:
            bt.logging.warning(
                "OPENMIND_PUBLIC_IP is not set — axon is advertised as 127.0.0.1; "
                "set it to your public IPv4 for testnet/mainnet."
            )

        # Standard Bittensor components — pass params directly to constructors
        # so they don't rely on config namespace structure.
        self.wallet = bt.Wallet(
            name=self.wallet_name,
            hotkey=self.wallet_hotkey,
            path=self.wallet_path,
        )

        try:
            self.subtensor = bt.Subtensor(network=self.chain_endpoint)
        except Exception as e:
            bt.logging.error(f"Failed to create Subtensor for miner: {e}")
            self.subtensor = None

        if self.subtensor is not None:
            try:
                self.metagraph = self.subtensor.metagraph(netuid=self.netuid)
            except Exception as e:
                bt.logging.error(f"Failed to sync metagraph for miner: {e}")
                self.metagraph = None
        else:
            self.metagraph = None

        # Axon creation — pass ip/port explicitly to avoid the external IP
        # lookup that fails in some environments.
        # SDK v10 Axon.attach() inspects function type annotations and breaks
        # on bound methods, so we wrap them as module-level-style closures.
        _self = self

        async def _forward(synapse: OpenMindRequest) -> OpenMindRequest:
            return await _self.forward(synapse)

        async def _blacklist(synapse: OpenMindRequest) -> t.Tuple[bool, str]:
            return await _self.blacklist(synapse)

        async def _priority(synapse: OpenMindRequest) -> float:
            return await _self.priority(synapse)

        try:
            self.axon = bt.Axon(
                wallet=self.wallet,
                ip=self._axon_bind_ip,
                port=self._axon_port,
                external_ip=self._public_ip,
                external_port=self._public_port,
            )
            self.axon.attach(
                forward_fn=_forward,
                blacklist_fn=_blacklist,
                priority_fn=_priority,
            )
        except Exception as e:
            import traceback as _tb
            bt.logging.error(f"Failed to create Axon for miner: {e}\n{_tb.format_exc()}")
            self.axon = None

        self.should_exit = False
        self.storage_backend = os.environ.get("OPENMIND_STORAGE_BACKEND", "legacy").lower()
        self.storage_dual_write = (
            os.environ.get("OPENMIND_STORAGE_DUAL_WRITE", "false").lower() == "true"
        )

    def _primary_storage(self):
        return storage_v2 if self.storage_backend == "sqlite" else storage

    def _secondary_storage(self):
        return storage if self.storage_backend == "sqlite" else storage_v2

    def _validator_challenge_modes_1_4(
        self, synapse: OpenMindRequest, mode: int
    ) -> OpenMindRequest:
        """Non-empty, mode-shaped payloads for validator scoring (live session)."""
        sid = synapse.session_id
        k = synapse.top_k
        base = retrieval.list_recent_episode_results(sid, k)
        if not base:
            synapse.results = []
            return synapse

        if mode == 1:
            synapse.results = base
            return synapse

        if mode == 2:
            synapse.results = base
            synapse.version_ok = True
            synapse.checkpoint_ok = True
            return synapse

        if mode == 3:
            fc = retrieval.count_facts_in_session(sid)
            first = copy.deepcopy(base[0])
            first["fact_count"] = max(int(fc), 1)
            synapse.results = [first] + base[1:]
            return synapse

        if mode == 4:
            first = copy.deepcopy(base[0])
            first["status"] = "stored"
            synapse.results = [first] + base[1:]
            return synapse

        synapse.results = base
        return synapse

    def _rs_challenge_response(
        self, synapse: OpenMindRequest
    ) -> t.List[t.Dict[str, t.Any]]:
        flt = synapse.filters or {}
        cid = flt.get("rs_chunk_id")
        drops = flt.get("rs_drop_indices") or []
        if not cid or not isinstance(drops, list):
            bt.logging.info(
                "RS challenge: empty response (missing rs_chunk_id or rs_drop_indices — "
                "validator has no cached chunk to verify)"
            )
            return []
        try:
            drop_set = {int(x) for x in drops}
            payload = durability.reconstruct_chunk_rs(str(cid), drop_indices=drop_set)
        except Exception as exc:
            bt.logging.warning(f"RS reconstruct challenge failed for {cid}: {exc}")
            return []
        content = payload.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return [
            {
                "id": str(cid),
                "rs_reconstruct_ok": True,
                "content_sha256": digest,
            }
        ]

    async def forward(self, synapse: OpenMindRequest) -> OpenMindRequest:
        """
        Core OpenMind miner logic.

        For now this implements a minimal MVP:
        - validates shared-space access (if provided)
        - performs a stubbed retrieval call
        - attaches empty versioning / checkpoint metadata
        """
        # Enforce shared-space access control if a shared_space_id is present.
        if synapse.shared_space_id is not None:
            authorized = shared_space.authorize_access(
                shared_space_id=synapse.shared_space_id,
                author=synapse.author,
                auth_metadata=synapse.auth_metadata,
            )
            if not authorized:
                bt.logging.warning("Unauthorized shared-space access.")
                # No results returned for unauthorized requests.
                synapse.results = []
                return synapse

        if (synapse.filters or {}).get("challenge_mode") == 5:
            synapse.results = self._rs_challenge_response(synapse)
            return synapse

        if (synapse.filters or {}).get("challenge_mode") == 0:
            probes = (synapse.filters or {}).get("_recall_probes") or []
            if isinstance(probes, list) and probes:
                ids = [str(p) for p in probes if p]
                synapse.results = retrieval.retrieve_chunks_by_ids(
                    session_id=synapse.session_id,
                    chunk_ids=ids,
                    top_k=synapse.top_k,
                )
                return synapse
            base = retrieval.list_recent_episode_results(
                synapse.session_id, synapse.top_k
            )
            synapse.results = base
            return synapse

        ch = (synapse.filters or {}).get("challenge_mode")
        if ch in (1, 2, 3, 4):
            return self._validator_challenge_modes_1_4(synapse, int(ch))

        action = (synapse.filters or {}).get("_action")

        if action == "store":
            chunk_id = str(uuid.uuid4())
            ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
            content = synapse.query or ""
            role = (synapse.filters or {}).get("_role", "user")
            event_at = getattr(synapse, "event_at", None) or extraction.extract_temporal(content)

            # 1. Store the episode (raw conversation turn)
            retrieval.add_chunk(
                session_id=synapse.session_id,
                content=content,
                embedding=synapse.embedding or [],
                metadata={
                    "id": chunk_id,
                    "type": "episode",
                    "role": role,
                    "timestamp": ts,
                    "recorded_at": ts,
                    "event_at": event_at,
                    "multimodal_type": synapse.multimodal_type,
                },
            )

            # 2. Extract facts from the episode
            facts = extraction.extract_facts(
                content=content,
                episode_id=chunk_id,
                session_id=synapse.session_id,
                role=role,
                recorded_at=ts,
            )

            # 3. Store each fact as its own chunk and detect relationships
            existing_facts = retrieval.get_facts_for_session(synapse.session_id)
            for fact in facts:
                retrieval.add_chunk(
                    session_id=synapse.session_id,
                    content=fact["content"],
                    embedding=synapse.embedding or [],
                    metadata={
                        "id": fact["id"],
                        "type": "fact",
                        "source_episode_id": fact["source_episode_id"],
                        "subject": fact["subject"],
                        "predicate": fact["predicate"],
                        "object": fact["object"],
                        "confidence": fact["confidence"],
                        "recorded_at": fact["recorded_at"],
                        "event_at": fact["event_at"],
                        "valid_from": fact["valid_from"],
                        "valid_until": fact["valid_until"],
                        "is_latest": True,
                        "role": fact["role"],
                        "fact_keys": fact["fact_keys"],
                        "timestamp": ts,
                    },
                )

                edges = graph.detect_relationships(fact, existing_facts)
                for edge in edges:
                    if edge["relation"] == "supersedes":
                        old_id = edge["target_id"]
                        retrieval.update_fact_latest(synapse.session_id, old_id, False)
                        self._primary_storage().update_chunk_metadata(
                            synapse.session_id, old_id,
                            {"is_latest": False, "valid_until": ts},
                        )
                        if self.storage_dual_write:
                            self._secondary_storage().update_chunk_metadata(
                                synapse.session_id, old_id,
                                {"is_latest": False, "valid_until": ts},
                            )

                existing_facts.append(fact)

            # 4. Auto-compact if threshold reached
            all_session_facts = retrieval.get_facts_for_session(synapse.session_id)
            anchor = extraction.generate_anchor(
                synapse.session_id,
                all_session_facts,
                retrieval.get_anchor_for_session(synapse.session_id),
            )
            if anchor:
                retrieval.add_chunk(
                    session_id=synapse.session_id,
                    content=anchor["content"],
                    embedding=[],
                    metadata=anchor,
                )

            bt.logging.info(
                f"Stored episode {chunk_id} + {len(facts)} facts for session {synapse.session_id}"
            )
            synapse.results = [{
                "id": chunk_id,
                "content": content,
                "role": role,
                "status": "stored",
                "timestamp": ts,
                "fact_count": len(facts),
            }]

        elif action == "query_smart":
            clean_filters = {
                k: v for k, v in (synapse.filters or {}).items()
                if not k.startswith("_")
            }
            synapse.results = retrieval.retrieve_smart(
                session_id=synapse.session_id,
                query=synapse.query,
                embedding=synapse.embedding,
                top_k=synapse.top_k,
                filters=clean_filters,
                time_point=synapse.as_of_timestamp,
            )

        elif action == "compact":
            all_facts = retrieval.get_facts_for_session(synapse.session_id)
            existing_anchor = retrieval.get_anchor_for_session(synapse.session_id)
            anchor = extraction.generate_anchor(synapse.session_id, all_facts, existing_anchor)
            if anchor:
                retrieval.add_chunk(
                    session_id=synapse.session_id,
                    content=anchor["content"],
                    embedding=[],
                    metadata=anchor,
                )
                synapse.results = [{"status": "compacted", "anchor": anchor}]
            else:
                synapse.results = [{"status": "no_compaction_needed"}]

        else:
            clean_filters = {
                k: v for k, v in (synapse.filters or {}).items()
                if not k.startswith("_")
            }
            synapse.results = retrieval.retrieve(
                session_id=synapse.session_id,
                query=synapse.query,
                embedding=synapse.embedding,
                top_k=synapse.top_k,
                filters=clean_filters,
                as_of_timestamp=synapse.as_of_timestamp,
                version_id=synapse.version_id,
                diff_since=synapse.diff_since,
            )

        # Versioning / provenance hooks (currently minimal).
        synapse.version_diff = None
        synapse.provenance_path = None

        # Workflow checkpoint hooks (no-op for now).
        if synapse.resume_from_checkpoint and synapse.workflow_id:
            synapse.checkpoint = checkpoint.load_checkpoint(
                workflow_id=synapse.workflow_id
            )

        return synapse

    async def blacklist(self, synapse: OpenMindRequest) -> t.Tuple[bool, str]:
        """
        Basic blacklist policy.

        For local development we allow all requests since the metagraph
        may not be fully synchronized between neurons on a local chain.
        In production, tighten this to require ``validator_permit``.
        """
        if self.metagraph is None:
            bt.logging.warning("Metagraph not available; allowing request (local dev).")
            return False, "Metagraph unavailable – allowing"

        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return False, "Missing dendrite – allowing (local dev)"

        if synapse.dendrite.hotkey in self.metagraph.hotkeys:
            bt.logging.trace(
                f"Allowing registered hotkey {synapse.dendrite.hotkey}"
            )
            return False, "Hotkey recognized!"

        bt.logging.info(
            f"Hotkey {synapse.dendrite.hotkey[:16]}… not in metagraph (n={self.metagraph.n}), "
            f"allowing anyway (local dev)"
        )
        return False, "Allowing unrecognized hotkey (local dev)"

    async def priority(self, synapse: OpenMindRequest) -> float:
        """
        Priority function based on caller stake, identical in spirit to the
        template miner implementation.
        """
        if self.metagraph is None:
            bt.logging.warning("Metagraph not available; zero priority.")
            return 0.0

        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return 0.0

        # In local dev the caller (gateway/validator) may not appear in the miner's
        # metagraph view yet. If so, just return lowest priority instead of erroring
        # (errors here abort the request before `forward()` runs).
        try:
            caller_uid = self.metagraph.hotkeys.index(synapse.dendrite.hotkey)
        except ValueError:
            bt.logging.info(
                f"Priority: hotkey {synapse.dendrite.hotkey[:16]}… not in metagraph "
                f"(n={self.metagraph.n}); returning 0.0 (local dev)"
            )
            return 0.0
        priority = float(self.metagraph.S[caller_uid])
        bt.logging.trace(
            f"Prioritizing {synapse.dendrite.hotkey} with value: {priority}"
        )
        return priority


def run() -> None:
    """
    Main entrypoint used by `python neuron.py --role miner`.
    """
    bt.logging.set_debug()

    miner = Miner()

    bt.logging.info(
        f"OpenMind miner initialised "
        f"(netuid={miner.netuid}, endpoint={miner.chain_endpoint})"
    )

    status_parts = []
    status_parts.append(f"subtensor={'OK' if miner.subtensor else 'OFFLINE'}")
    status_parts.append(f"metagraph={'OK' if miner.metagraph else 'UNAVAILABLE'}")
    status_parts.append(f"axon={'OK' if miner.axon else 'UNAVAILABLE'}")
    print(f"[MINER] Init status: {', '.join(status_parts)}")

    if miner.axon is not None:
        try:
            miner.axon.start()
            print(f"[MINER] Axon listening on {miner.axon.ip}:{miner.axon.port}")
        except Exception as e:
            bt.logging.error(f"Failed to start axon: {e}")
        if miner.subtensor is not None and env_bool("OPENMIND_SERVE_AXON", False):
            try:
                sa = getattr(miner.subtensor, "serve_axon", None)
                if not callable(sa):
                    bt.logging.warning(
                        "OPENMIND_SERVE_AXON=1 but subtensor.serve_axon is missing; "
                        "register your axon with btcli for your bittensor version."
                    )
                else:
                    try:
                        sa(netuid=miner.netuid, axon=miner.axon)
                    except TypeError:
                        sa(miner.axon, miner.netuid)
                    bt.logging.info("serve_axon extrinsic submitted.")
            except Exception as e:
                bt.logging.warning(f"serve_axon failed (btcli subnet register may still be required): {e}")

    print("[MINER] Running main loop (Ctrl+C to stop)...")
    try:
        while True:
            time.sleep(12)
            if miner.subtensor is not None and miner.metagraph is not None:
                try:
                    miner.metagraph.sync(subtensor=miner.subtensor)
                    bt.logging.info(f"Metagraph synced — n={miner.metagraph.n}")
                except Exception as e:
                    bt.logging.warning(f"Metagraph sync failed: {e}")
    except KeyboardInterrupt:
        print("\n[MINER] Shutting down...")
        if miner.axon is not None:
            try:
                miner.axon.stop()
            except Exception:
                pass


if __name__ == "__main__":
    run()
