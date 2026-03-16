"""
Cryptographic helpers for the OpenMind subnet.

For the MVP we implement only a simple signature verification helper using
ed25519 public keys, which aligns with common wallet schemes. Encryption is
left as a future enhancement.
"""

from __future__ import annotations

import base64
from typing import Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature


def verify_signature(
    message: bytes,
    signature_b64: str,
    public_key_b64: str,
) -> bool:
    """
    Verify an ed25519 signature where both signature and public key are
    base64-encoded.
    """
    try:
        pub_key_bytes = base64.b64decode(public_key_b64)
        sig_bytes = base64.b64decode(signature_b64)
        pub = Ed25519PublicKey.from_public_bytes(pub_key_bytes)
        pub.verify(sig_bytes, message)
        return True
    except (ValueError, InvalidSignature):
        return False


def encrypt(*_args, **_kwargs):
    """Placeholder for encryption."""
    raise NotImplementedError("Encryption not implemented yet.")


def decrypt(*_args, **_kwargs):
    """Placeholder for decryption."""
    raise NotImplementedError("Decryption not implemented yet.")

