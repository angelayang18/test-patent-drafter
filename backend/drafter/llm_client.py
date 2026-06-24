"""Shared OpenAI-compatible LLM client helpers."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Callable, TypeVar

import httpx
from openai import APIConnectionError, APITimeoutError, APIStatusError, OpenAI

log = logging.getLogger(__name__)

DEFAULT_LLM_BASE_URL = "http://96.248.110.124:8024/v1"
DEFAULT_LLM_MODEL = "Qwen3.6-35B-A3B-FP8"
DEFAULT_LLM_TIMEOUT_SECONDS = 180.0
DEFAULT_LLM_CONNECT_TIMEOUT_SECONDS = 30.0
DEFAULT_LLM_MAX_RETRIES = 2
DEFAULT_LLM_RETRY_BACKOFF_SECONDS = 5.0
DEFAULT_LLM_HEALTH_PROBE_TIMEOUT_SECONDS = 10.0

_REASONING_BLOCK = re.compile(
    r"<think(?:ing)?>.*?</think(?:ing)?>",
    re.DOTALL | re.IGNORECASE,
)

T = TypeVar("T")


class LLMUnavailableError(Exception):
    """The configured LLM endpoint is unreachable, timed out, or returned a fatal error."""


def get_llm_api_key() -> str:
    """Return the configured LLM API key."""
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        raise ValueError("LLM_API_KEY is not configured.")
    return api_key


def get_llm_base_url() -> str:
    """Return the configured OpenAI-compatible base URL."""
    return os.getenv("LLM_BASE_URL", DEFAULT_LLM_BASE_URL).rstrip("/")


def get_llm_model() -> str:
    """Return the configured model name."""
    return os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL)


def get_llm_timeout_seconds() -> float:
    """Per-request timeout for LLM calls (patent sections can take 30–90+ seconds)."""
    raw = os.getenv("LLM_TIMEOUT_SECONDS", str(DEFAULT_LLM_TIMEOUT_SECONDS))
    try:
        return max(1.0, float(raw))
    except ValueError:
        return DEFAULT_LLM_TIMEOUT_SECONDS


def get_llm_connect_timeout_seconds() -> float:
    """Connection timeout when opening a socket to the LLM server."""
    raw = os.getenv("LLM_CONNECT_TIMEOUT_SECONDS", str(DEFAULT_LLM_CONNECT_TIMEOUT_SECONDS))
    try:
        return max(1.0, float(raw))
    except ValueError:
        return DEFAULT_LLM_CONNECT_TIMEOUT_SECONDS


def get_llm_max_retries() -> int:
    """Number of retries after the first failed attempt (total attempts = retries + 1)."""
    raw = os.getenv("LLM_MAX_RETRIES", str(DEFAULT_LLM_MAX_RETRIES))
    try:
        return max(0, int(raw))
    except ValueError:
        return DEFAULT_LLM_MAX_RETRIES


def get_llm_retry_backoff_seconds() -> float:
    """Initial backoff between retries; doubles on each retry."""
    raw = os.getenv("LLM_RETRY_BACKOFF_SECONDS", str(DEFAULT_LLM_RETRY_BACKOFF_SECONDS))
    try:
        return max(0.0, float(raw))
    except ValueError:
        return DEFAULT_LLM_RETRY_BACKOFF_SECONDS


def get_llm_health_probe_timeout_seconds() -> float:
    """Short timeout for /health reachability checks."""
    raw = os.getenv("LLM_HEALTH_PROBE_TIMEOUT_SECONDS", str(DEFAULT_LLM_HEALTH_PROBE_TIMEOUT_SECONDS))
    try:
        return max(1.0, float(raw))
    except ValueError:
        return DEFAULT_LLM_HEALTH_PROBE_TIMEOUT_SECONDS


def get_llm_client(timeout_seconds: float | None = None) -> OpenAI:
    """Create an OpenAI-compatible API client with explicit timeouts."""
    request_timeout = timeout_seconds if timeout_seconds is not None else get_llm_timeout_seconds()
    connect_timeout = min(get_llm_connect_timeout_seconds(), request_timeout)
    timeout = httpx.Timeout(request_timeout, connect=connect_timeout)
    return OpenAI(
        api_key=get_llm_api_key(),
        base_url=get_llm_base_url(),
        timeout=timeout,
    )


def _is_retryable_llm_error(exc: Exception) -> bool:
    """Return True when a transient LLM failure should be retried."""
    if isinstance(exc, (APITimeoutError, APIConnectionError)):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code in (429, 502, 503, 504):
        return True
    return False


def _wrap_llm_error(exc: Exception) -> LLMUnavailableError:
    """Normalize upstream failures into a single application error type."""
    if isinstance(exc, LLMUnavailableError):
        return exc
    message = str(exc).strip() or exc.__class__.__name__
    return LLMUnavailableError(
        f"LLM ({get_llm_model()} at {get_llm_base_url()}) failed: {message}"
    )


def _call_with_retry(operation: Callable[[], T], *, operation_name: str) -> T:
    """Run an LLM API call with exponential backoff on transient failures."""
    max_retries = get_llm_max_retries()
    backoff = get_llm_retry_backoff_seconds()
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return operation()
        except Exception as exc:
            last_error = exc
            if not _is_retryable_llm_error(exc) or attempt >= max_retries:
                break
            wait_seconds = backoff * (2 ** attempt)
            log.warning(
                "%s failed (attempt %d/%d): %s. Retrying in %.1fs.",
                operation_name,
                attempt + 1,
                max_retries + 1,
                exc,
                wait_seconds,
            )
            if wait_seconds > 0:
                time.sleep(wait_seconds)

    raise _wrap_llm_error(last_error or LLMUnavailableError("LLM call failed with no error detail."))


def probe_llm_reachable() -> tuple[bool, str | None]:
    """
    Lightweight connectivity check against the configured LLM server.

    Uses a short timeout suitable for /health — does not validate generation quality.
    """
    try:
        client = get_llm_client(timeout_seconds=get_llm_health_probe_timeout_seconds())
        client.models.list()
        return True, None
    except ValueError as exc:
        return False, str(exc)
    except Exception as exc:
        return False, str(exc)


def _strip_json_fences(content: str) -> str:
    """Remove optional Markdown code fences from model output."""
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _strip_reasoning_blocks(content: str) -> str:
    """Remove optional model reasoning blocks before JSON parsing."""
    return _REASONING_BLOCK.sub("", content).strip()


def _parse_json_object(content: str) -> dict:
    """Parse a JSON object from raw LLM output."""
    text = _strip_json_fences(_strip_reasoning_blocks(content))
    if not text:
        raise ValueError(
            f"LLM ({get_llm_model()}) returned empty content. "
            "Check LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY in .env, then restart the backend."
        )

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    preview = text[:240].replace("\n", " ")
    raise ValueError(
        f"LLM ({get_llm_model()}) response was not a JSON object. Preview: {preview}"
    )


def _build_messages(system_instruction: str | None, user_prompt: str) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def generate_text(system_instruction: str | None, user_prompt: str) -> str:
    """Generate plain-text content from the configured LLM."""
    client = get_llm_client()

    def _create_completion() -> str:
        response = client.chat.completions.create(
            model=get_llm_model(),
            messages=_build_messages(system_instruction, user_prompt),
        )
        return (response.choices[0].message.content or "").strip()

    return _call_with_retry(_create_completion, operation_name="LLM text generation")


def generate_json(system_instruction: str, user_prompt: str) -> dict:
    """Generate and parse a JSON object from the configured LLM."""
    client = get_llm_client()
    messages = _build_messages(system_instruction, user_prompt)

    def _create_json_completion() -> dict:
        try:
            response = client.chat.completions.create(
                model=get_llm_model(),
                messages=messages,
                response_format={"type": "json_object"},
            )
        except APIStatusError as exc:
            if exc.status_code in (400, 422):
                log.debug("JSON response_format unsupported, falling back: %s", exc)
                response = client.chat.completions.create(
                    model=get_llm_model(),
                    messages=messages,
                )
            else:
                raise

        content = response.choices[0].message.content or ""
        return _parse_json_object(content)

    return _call_with_retry(_create_json_completion, operation_name="LLM JSON generation")
