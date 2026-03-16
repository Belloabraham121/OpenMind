import os

from openmind.multimodal import ingest_image, ingest_pdf


def test_ingest_image_produces_expected_keys_and_dims():
    data = os.urandom(256)
    meta = ingest_image(data)

    assert "visual_embedding" in meta
    assert "ocr_text" in meta
    assert "visual_hash" in meta

    emb = meta["visual_embedding"]
    assert isinstance(emb, list)
    assert len(emb) == 16

    assert isinstance(meta["ocr_text"], str)
    assert isinstance(meta["visual_hash"], str)
    assert len(meta["visual_hash"]) == 64  # sha256 hex


def test_ingest_pdf_produces_consistent_metadata():
    data = os.urandom(512)
    meta1 = ingest_pdf(data)
    meta2 = ingest_pdf(data)

    # Deterministic for same input bytes
    assert meta1["visual_hash"] == meta2["visual_hash"]
    assert meta1["visual_embedding"] == meta2["visual_embedding"]

