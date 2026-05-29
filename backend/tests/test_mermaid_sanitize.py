"""Tests for Mermaid sanitization of LLM figure output."""

from drafter.mermaid_sanitize import sanitize_mermaid_source


def test_removes_empty_subgraph_title():
    raw = """flowchart TB
  subgraph Left [""]
    direction TB
    A["Step 1<br/>200"] --> B["Step 2<br/>202"]
  end"""
    fixed = sanitize_mermaid_source(raw)
    assert '[""]' not in fixed
    assert "direction TB" not in fixed
    assert "subgraph Left" in fixed


def test_preserves_named_subgraph_title():
    raw = 'flowchart TB\n  subgraph cols ["Method steps"]\n    A --> B\n  end'
    fixed = sanitize_mermaid_source(raw)
    assert '["Method steps"]' in fixed
