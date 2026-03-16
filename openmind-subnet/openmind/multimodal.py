"""
Multimodal (image and PDF) processing for OpenMind.

For the MVP we avoid heavyweight OCR/vision dependencies and instead:
- compute a deterministic visual hash (sha256 of bytes)
- derive a small fixed-size "visual_embedding" vector from the bytes
- expose a placeholder `ocr_text` field (empty string for now)

This gives us stable metadata and shapes for storage and retrieval, and can be
upgraded later to real OCR + CLIP-style embeddings.
"""

from __future__ import annotations

import hashlib
from typing import Dict, Any

import numpy as np


def _bytes_to_embedding(data: bytes, dim: int = 16) -> list[float]:
    """
    Deterministically map raw bytes to a small numeric embedding vector.
    """
    if not data:
        return [0.0] * dim

    # Repeat or truncate bytes to fill dim, then normalise.
    arr = np.frombuffer(data, dtype=np.uint8)
    if arr.size < dim:
        reps = (dim + arr.size - 1) // arr.size
        arr = np.tile(arr, reps)
    arr = arr[:dim].astype(np.float32)
    norm = float(np.linalg.norm(arr)) or 1.0
    return (arr / norm).tolist()


def ingest_image(image_bytes: bytes) -> Dict[str, Any]:
    """
    Ingest an image and return multimodal metadata:
    - visual_embedding: fixed-length list[float]
    - ocr_text: placeholder (empty string for now)
    - visual_hash: hex sha256 of the raw bytes
    """
    visual_hash = hashlib.sha256(image_bytes).hexdigest()
    visual_embedding = _bytes_to_embedding(image_bytes)

    return {
        "visual_embedding": visual_embedding,
        "ocr_text": "",
        "visual_hash": visual_hash,
    }


def ingest_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Ingest a PDF (as raw bytes) and return multimodal metadata.

    For MVP we treat the whole PDF as a single blob and compute the same
    metadata fields as for images.
    """
    visual_hash = hashlib.sha256(pdf_bytes).hexdigest()
    visual_embedding = _bytes_to_embedding(pdf_bytes)

    return {
        "visual_embedding": visual_embedding,
        "ocr_text": "",
        "visual_hash": visual_hash,
    }

