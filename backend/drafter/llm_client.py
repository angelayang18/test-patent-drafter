"""Shared OpenAI-compatible LLM client helpers."""

from __future__ import annotations

import json
import logging
import os
import re

from openai import OpenAI

log = logging.getLogger(__name__)

DEFAULT_LLM_BASE_URL = "http://96.248.110.124:8024/v1"
DEFAULT_LLM_MODEL = "Qwen3.6-35B-A3B-FP8"

_REASONING_BLOCK = re.compile(
    r"<think(?:ing)?>.*?</think(?:ing)?>",
    re.DOTALL | re.IGNORECASE,
)


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


def get_llm_client() -> OpenAI:
    """Create an OpenAI-compatible API client."""
    return OpenAI(
        api_key=get_llm_api_key(),
        base_url=get_llm_base_url(),
    )


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
    response = client.chat.completions.create(
        model=get_llm_model(),
        messages=_build_messages(system_instruction, user_prompt),
    )
    return (response.choices[0].message.content or "").strip()


def generate_json(system_instruction: str, user_prompt: str) -> dict:
    """Generate and parse a JSON object from the configured LLM."""
    client = get_llm_client()
    messages = _build_messages(system_instruction, user_prompt)

    try:
        response = client.chat.completions.create(
            model=get_llm_model(),
            messages=messages,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        log.debug("JSON response_format unsupported, falling back: %s", exc)
        response = client.chat.completions.create(
            model=get_llm_model(),
            messages=messages,
        )

    content = response.choices[0].message.content or ""
    return _parse_json_object(content)
