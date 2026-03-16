"""
Shared memory spaces and access control for OpenMind.

Enforces a minimal wallet-signature-based access control using utilities from
`utils.crypto`. The `auth_metadata` field on the protocol is expected to carry
the signature and public key material.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from utils.crypto import verify_signature


def authorize_access(
    shared_space_id: str,
    author: Optional[str],
    auth_metadata: Dict[str, Any],
) -> bool:
    """
    Basic access control for shared spaces.

    Expected `auth_metadata` fields:
    - "public_key": base64-encoded ed25519 public key
    - "signature": base64-encoded signature over `shared_space_id`

    If any are missing, access is denied.
    """
    public_key = auth_metadata.get("public_key")
    signature = auth_metadata.get("signature")

    if not shared_space_id or not public_key or not signature:
        return False

    # The message is currently just the shared_space_id; can be extended later
    # to include author, nonce, expiry, etc.
    message = shared_space_id.encode("utf-8")
    return verify_signature(message=message, signature_b64=signature, public_key_b64=public_key)

