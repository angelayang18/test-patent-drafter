"""Tests for Mermaid sanitization of LLM figure output."""

from drafter.mermaid_sanitize import sanitize_mermaid_source, strip_html_from_mermaid_labels


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
    assert "<br" not in fixed.lower()
    assert 'A["Step 1 200"]' in fixed


def test_preserves_named_subgraph_title():
    raw = 'flowchart TB\n  subgraph cols ["Method steps"]\n    A --> B\n  end'
    fixed = sanitize_mermaid_source(raw)
    assert '["Method steps"]' in fixed


def test_strips_bare_autoid_subgraph():
    raw = """graph LR
  subgraph sg203
    A["Vision-language model 203"]
  end
  B["Ingestion module 200"] --> A"""
    fixed = sanitize_mermaid_source(raw)
    assert "sg203" not in fixed
    assert "subgraph\n" in fixed or "subgraph\r\n" in fixed or fixed.count("subgraph") >= 1
    assert "subgraph sg203" not in fixed.lower()


def test_preserves_subgraph_with_bracket_title():
    raw = 'graph LR\n  subgraph ingestion [Ingestion Layer]\n    A["Module 200"]\n  end'
    fixed = sanitize_mermaid_source(raw)
    assert "subgraph ingestion [Ingestion Layer]" in fixed
    assert "sg203" not in fixed


def test_strips_html_from_node_labels():
    raw = (
        'flowchart TB\n'
        'A["Ingestion module<br/>200"] --> B["Parser<b>bold</b><br/>202"]'
    )
    fixed = strip_html_from_mermaid_labels(raw)
    assert 'A["Ingestion module 200"]' in fixed
    assert 'B["Parserbold 202"]' in fixed
    assert "<" not in fixed.split("flowchart TB")[1]


def test_strips_html_from_participant_labels():
    raw = "sequenceDiagram\nparticipant A as Ingestion module<br/>200"
    fixed = strip_html_from_mermaid_labels(raw)
    assert "participant A as Ingestion module 200" in fixed
    assert "<br" not in fixed.lower()
