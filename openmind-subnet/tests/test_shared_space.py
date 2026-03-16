import base64

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

from openmind.shared_space import authorize_access


def _make_keys():
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    pub_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    pub_b64 = base64.b64encode(pub_bytes).decode("utf-8")
    return priv, pub_b64


def test_authorize_access_with_valid_signature():
    priv, pub_b64 = _make_keys()
    shared_space_id = "space-123"

    message = shared_space_id.encode("utf-8")
    sig_b64 = base64.b64encode(priv.sign(message)).decode("utf-8")

    auth_metadata = {
        "public_key": pub_b64,
        "signature": sig_b64,
    }

    assert authorize_access(shared_space_id, author=None, auth_metadata=auth_metadata)


def test_authorize_access_with_invalid_signature():
    _, pub_b64 = _make_keys()
    shared_space_id = "space-456"

    # Wrong signature (sign different message)
    priv_wrong, _ = _make_keys()
    sig_b64 = base64.b64encode(priv_wrong.sign(b"other")).decode("utf-8")

    auth_metadata = {
        "public_key": pub_b64,
        "signature": sig_b64,
    }

    assert not authorize_access(shared_space_id, author=None, auth_metadata=auth_metadata)

