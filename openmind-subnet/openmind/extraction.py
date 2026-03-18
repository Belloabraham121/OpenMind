"""
Fact extraction, temporal grounding, and session anchoring for OpenMind.

Uses spaCy NER + dependency parsing to extract atomic (subject, predicate, object)
triples from conversation content, plus dateutil for temporal expression resolution.
Each extracted fact links back to its source episode for two-phase retrieval.
"""

from __future__ import annotations

import re
import uuid
import datetime
from typing import Any, Dict, List, Optional, Tuple

from dateutil import parser as dateparser
from dateutil.relativedelta import relativedelta

_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# ---- Temporal extraction ---------------------------------------------------

_RELATIVE_PATTERNS: List[Tuple[re.Pattern, Any]] = [
    (re.compile(r"\byesterday\b", re.I), lambda ref: ref - datetime.timedelta(days=1)),
    (re.compile(r"\btoday\b", re.I), lambda ref: ref),
    (re.compile(r"\btomorrow\b", re.I), lambda ref: ref + datetime.timedelta(days=1)),
    (re.compile(r"\blast\s+week\b", re.I), lambda ref: ref - datetime.timedelta(weeks=1)),
    (re.compile(r"\bnext\s+week\b", re.I), lambda ref: ref + datetime.timedelta(weeks=1)),
    (re.compile(r"\blast\s+month\b", re.I), lambda ref: ref - relativedelta(months=1)),
    (re.compile(r"\bnext\s+month\b", re.I), lambda ref: ref + relativedelta(months=1)),
    (re.compile(r"\blast\s+year\b", re.I), lambda ref: ref - relativedelta(years=1)),
    (re.compile(r"\bnext\s+year\b", re.I), lambda ref: ref + relativedelta(years=1)),
]


def extract_temporal(
    text: str,
    reference_date: Optional[str] = None,
) -> Optional[str]:
    """Return the first resolved ISO-8601 date found in *text*, or None."""
    ref = datetime.datetime.now(datetime.timezone.utc)
    if reference_date:
        try:
            ref = dateparser.parse(reference_date)
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=datetime.timezone.utc)
        except (ValueError, TypeError):
            pass

    for pattern, resolver in _RELATIVE_PATTERNS:
        if pattern.search(text):
            resolved = resolver(ref)
            if isinstance(resolved, datetime.datetime):
                return resolved.isoformat()
            return datetime.datetime.combine(
                resolved, datetime.time(), tzinfo=datetime.timezone.utc
            ).isoformat()

    nlp = _get_nlp()
    doc = nlp(text)
    for ent in doc.ents:
        if ent.label_ == "DATE":
            try:
                parsed = dateparser.parse(ent.text, fuzzy=True, default=ref)
                if parsed:
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
                    return parsed.isoformat()
            except (ValueError, TypeError):
                continue

    return None


# ---- Fact extraction -------------------------------------------------------

def _extract_svo_triples(text: str) -> List[Dict[str, str]]:
    """Extract (subject, predicate, object) triples via dependency parsing."""
    nlp = _get_nlp()
    doc = nlp(text)
    triples = []

    for token in doc:
        if token.dep_ == "ROOT" and token.pos_ == "VERB":
            subj = None
            obj = None
            for child in token.children:
                if child.dep_ in ("nsubj", "nsubjpass"):
                    subj = _expand_compound(child)
                elif child.dep_ in ("dobj", "attr", "oprd", "pobj", "acomp"):
                    obj = _expand_compound(child)
                elif child.dep_ == "prep":
                    for grandchild in child.children:
                        if grandchild.dep_ == "pobj":
                            obj = _expand_compound(grandchild)
            if subj and obj:
                triples.append({
                    "subject": subj,
                    "predicate": token.lemma_,
                    "object": obj,
                })

    return triples


def _expand_compound(token) -> str:
    """Expand a token to include its compound modifiers and determiners."""
    parts = []
    for child in token.children:
        if child.dep_ in ("compound", "amod", "nummod", "poss"):
            parts.append(child.text)
    parts.append(token.text)
    return " ".join(parts)


def _extract_entity_assertions(text: str) -> List[Dict[str, str]]:
    """Extract assertions from NER: 'PERSON works at ORG', 'EVENT on DATE', etc."""
    nlp = _get_nlp()
    doc = nlp(text)
    entities = [(ent.text, ent.label_) for ent in doc.ents]
    assertions = []

    persons = [e for e, l in entities if l == "PERSON"]
    orgs = [e for e, l in entities if l == "ORG"]
    moneys = [e for e, l in entities if l == "MONEY"]
    dates = [e for e, l in entities if l == "DATE"]
    quantities = [e for e, l in entities if l in ("CARDINAL", "QUANTITY", "PERCENT")]

    for p in persons:
        for o in orgs:
            assertions.append({"subject": p, "predicate": "associated_with", "object": o})

    for m in moneys:
        ctx = text[:text.find(m)] if m in text else ""
        subj_words = [w for w in ctx.split() if w[0].isupper()] if ctx else []
        subject = subj_words[-1] if subj_words else "amount"
        assertions.append({"subject": subject, "predicate": "equals", "object": m})

    for q in quantities:
        assertions.append({"subject": "metric", "predicate": "is", "object": q})

    return assertions


def extract_fact_keys(text: str) -> List[str]:
    """Extract searchable fact keys: named entities, dates, amounts."""
    nlp = _get_nlp()
    doc = nlp(text)
    keys = set()
    for ent in doc.ents:
        keys.add(ent.text.lower())
    for token in doc:
        if token.pos_ in ("PROPN", "NUM") and len(token.text) > 1:
            keys.add(token.text.lower())
    return sorted(keys)


def extract_facts(
    content: str,
    episode_id: str,
    session_id: str,
    role: str = "user",
    recorded_at: Optional[str] = None,
    reference_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Extract atomic facts from a conversation message.

    Returns a list of fact dicts ready to be stored as chunks with type=fact.
    """
    if not content or len(content.strip()) < 5:
        return []

    now = recorded_at or datetime.datetime.now(datetime.timezone.utc).isoformat()
    event_at = extract_temporal(content, reference_date)

    svo_triples = _extract_svo_triples(content)
    entity_assertions = _extract_entity_assertions(content)

    seen = set()
    all_triples = []
    for t in svo_triples + entity_assertions:
        key = (t["subject"].lower(), t["predicate"].lower(), t["object"].lower())
        if key not in seen:
            seen.add(key)
            all_triples.append(t)

    if not all_triples:
        all_triples.append({
            "subject": "message",
            "predicate": "states",
            "object": content[:200],
        })

    fact_keys = extract_fact_keys(content)

    facts = []
    for triple in all_triples:
        fact_id = str(uuid.uuid4())
        fact_content = f"{triple['subject']} {triple['predicate']} {triple['object']}"
        confidence = 1.0 if triple in svo_triples else 0.7

        facts.append({
            "id": fact_id,
            "type": "fact",
            "content": fact_content,
            "source_episode_id": episode_id,
            "session_id": session_id,
            "subject": triple["subject"],
            "predicate": triple["predicate"],
            "object": triple["object"],
            "confidence": confidence,
            "recorded_at": now,
            "event_at": event_at,
            "valid_from": event_at or now,
            "valid_until": None,
            "is_latest": True,
            "role": role,
            "fact_keys": fact_keys,
        })

    return facts


# ---- Session anchoring -----------------------------------------------------

_ANCHOR_THRESHOLD = 20


def generate_anchor(
    session_id: str,
    facts: List[Dict[str, Any]],
    existing_anchor: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Generate or update a session anchor (structured summary).

    Returns None if there are fewer than _ANCHOR_THRESHOLD facts.
    """
    if len(facts) < _ANCHOR_THRESHOLD and existing_anchor is None:
        return None

    latest_facts = [f for f in facts if f.get("is_latest", True)]

    subjects = {}
    for f in latest_facts:
        subj = f.get("subject", "unknown")
        if subj not in subjects:
            subjects[subj] = []
        subjects[subj].append(f"{f.get('predicate', '')} {f.get('object', '')}")

    key_facts = []
    for subj, preds in list(subjects.items())[:10]:
        key_facts.append(f"{subj}: {'; '.join(preds[:3])}")

    roles_seen = set()
    for f in facts:
        r = f.get("role", "user")
        roles_seen.add(r)

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    anchor_id = (existing_anchor or {}).get("id") or f"anchor-{session_id}"

    return {
        "id": anchor_id,
        "type": "anchor",
        "session_id": session_id,
        "content": f"Session summary for {session_id} ({len(latest_facts)} active facts)",
        "intent": _infer_intent(latest_facts),
        "key_facts": key_facts,
        "key_decisions": _extract_decisions(facts),
        "open_items": [],
        "participant_roles": {r: r for r in sorted(roles_seen)},
        "fact_count": len(facts),
        "active_fact_count": len(latest_facts),
        "last_updated": now,
        "recorded_at": now,
    }


def _infer_intent(facts: List[Dict[str, Any]]) -> str:
    """Infer session intent from the most common subjects."""
    from collections import Counter
    subjects = Counter(f.get("subject", "") for f in facts)
    top = subjects.most_common(3)
    if not top:
        return "General conversation"
    return f"Discussion about {', '.join(s for s, _ in top)}"


def _extract_decisions(facts: List[Dict[str, Any]]) -> List[str]:
    """Extract statements that look like decisions."""
    decision_verbs = {"decide", "approve", "reject", "choose", "select", "confirm", "set", "update"}
    decisions = []
    for f in facts:
        pred = f.get("predicate", "").lower()
        if pred in decision_verbs:
            decisions.append(f"{f.get('subject', '')} {pred} {f.get('object', '')}")
    return decisions[:5]
