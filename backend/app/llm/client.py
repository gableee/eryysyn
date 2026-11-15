"""The ONLY file that knows which LLM we use and how to talk to it.

Everything else calls generate(system, user) and gets text back. To switch provider
(Ollama -> a paid API), rewrite the inside of generate(). Nothing else changes.
Tests replace generate() with a fake, so they never wait for a real model.
"""

import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


class LLMError(Exception):
    """The model could not give us an answer (not running, not downloaded, too slow, empty reply)."""


def generate(system: str, user: str) -> str:
    """Send one question to the model and return its reply text.

    system = our rules (and the user's tone instructions).  user = passages + question.
    Raises LLMError on any failure, so callers handle ONE error type, not httpx details.
    """
    body = {
        "model": settings.ollama_model,
        "stream": False,                 # wait for the whole answer instead of word-by-word pieces
        "think": False,                  # no hidden reasoning step: it adds delay and can leak into the text
        "options": {"temperature": 0},   # always pick the most likely next word: same question, same answer
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    try:
        response = httpx.post(
            f"{settings.ollama_url}/api/chat",
            json=body,
            timeout=settings.ollama_timeout_seconds,
        )
    except httpx.HTTPError as exc:       # connection refused, timeout, DNS, ...
        log.exception("LLM request failed")
        raise LLMError(f"Could not reach the model: {exc}") from exc

    if response.status_code != 200:      # e.g. 404 when the model is not downloaded
        reason = _error_reason(response)
        log.error("LLM returned %s: %s", response.status_code, reason)
        raise LLMError(f"Model error {response.status_code}: {reason}")

    # .get(...) instead of [...] so a reply with a missing key becomes LLMError, not KeyError.
    content = (response.json().get("message") or {}).get("content") or ""
    if not content.strip():
        log.error("LLM returned an empty reply")
        raise LLMError("The model returned an empty reply")
    return content.strip()


def _error_reason(response: httpx.Response) -> str:
    """Ollama explains failures as {"error": "..."}; fall back to the raw text if it is not JSON."""
    try:
        return str(response.json().get("error", response.text))
    except ValueError:
        return response.text
