import httpx
import pytest

from app.core.config import settings
from app.llm import client
from app.llm.client import LLMError, generate


def reply(status=200, body=None):
    request = httpx.Request("POST", "http://test/api/chat")
    return httpx.Response(status, json=body if body is not None else {}, request=request)


def test_generate_sends_one_chat_request_and_returns_the_text(monkeypatch):
    seen = {}

    def fake_post(url, json, timeout):
        seen.update(url=url, json=json, timeout=timeout)
        return reply(body={"message": {"role": "assistant", "content": "  Hello [1].  "}})

    monkeypatch.setattr(client.httpx, "post", fake_post)
    assert generate("RULES", "QUESTION") == "Hello [1]."
    assert seen["url"] == f"{settings.ollama_url}/api/chat"
    assert seen["timeout"] == settings.ollama_timeout_seconds
    body = seen["json"]
    assert body["model"] == settings.ollama_model
    assert body["stream"] is False and body["think"] is False
    assert body["options"]["temperature"] == 0
    assert body["messages"] == [
        {"role": "system", "content": "RULES"},
        {"role": "user", "content": "QUESTION"},
    ]


def test_ollama_not_running_raises_llm_error(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(client.httpx, "post", fake_post)
    with pytest.raises(LLMError):
        generate("s", "u")


def test_timeout_raises_llm_error(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ReadTimeout("slow")
    monkeypatch.setattr(client.httpx, "post", fake_post)
    with pytest.raises(LLMError):
        generate("s", "u")


def test_model_not_downloaded_raises_llm_error_with_the_reason(monkeypatch):
    monkeypatch.setattr(client.httpx, "post",
                        lambda url, json, timeout: reply(404, {"error": "model 'x' not found"}))
    with pytest.raises(LLMError, match="not found"):
        generate("s", "u")


@pytest.mark.parametrize("body", [{}, {"message": {}}, {"message": {"content": "   "}}])
def test_missing_or_empty_reply_raises_llm_error(monkeypatch, body):
    monkeypatch.setattr(client.httpx, "post", lambda url, json, timeout: reply(body=body))
    with pytest.raises(LLMError):
        generate("s", "u")
