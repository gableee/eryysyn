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


class LLMUnavailable(LLMError):
    """The model could not be reached at all (connection refused, timeout). A second call right away
    would fail the same way, so callers should not retry it within the same request."""


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
        raise LLMUnavailable(f"Could not reach the model: {exc}") from exc

    if response.status_code != 200:      # e.g. 404 when the model is not downloaded
        reason = _error_reason(response)
        log.error("LLM returned %s: %s", response.status_code, reason)
        raise LLMError(f"Model error {response.status_code}: {reason}")

    # A proxy error page (HTML) or a JSON list would otherwise raise ValueError / AttributeError,
    # which are not LLMError, and the endpoint would answer 500 instead of 502.
    data = _json_object(response)
    if data is None:
        log.error("LLM returned a reply that is not a JSON object: %.200s", response.text)
        raise LLMError("The model returned an unexpected reply")

    # .get(...) instead of [...] so a reply with a missing key becomes LLMError, not KeyError.
    message = data.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    content = content if isinstance(content, str) else ""
    if not content.strip():
        log.error("LLM returned an empty reply")
        raise LLMError("The model returned an empty reply")
    return content.strip()


def _json_object(response: httpx.Response) -> dict | None:
    """The body as a dict, or None if it is not JSON or not a JSON object."""
    try:
        data = response.json()
    except ValueError:            # json.JSONDecodeError is a subclass of ValueError
        return None
    return data if isinstance(data, dict) else None


def _error_reason(response: httpx.Response) -> str:
    """Ollama explains failures as {"error": "..."}; fall back to the raw text otherwise."""
    data = _json_object(response)
    if data is not None and "error" in data:
        return str(data["error"])
    return response.text[:200]
