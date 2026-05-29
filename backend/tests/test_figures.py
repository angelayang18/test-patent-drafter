"""Tests for patent figure generation helpers."""

from drafter.figures import _normalize_figure


def test_normalize_figure_adds_flowchart_prefix():
    raw = {
        "number": 1,
        "title": "System",
        "brief_description": "FIG. 1 is a system diagram.",
        "reference_numerals": {"200": "module"},
        "mermaid": "A[\"Ingestion module<br/>200\"] --> B[\"Parser<br/>202\"]",
    }
    result = _normalize_figure(raw, 1)
    assert result["mermaid"].startswith("%%{init:")
    assert "flowchart TB" in result["mermaid"]
    assert result["number"] == 1


def test_normalize_figure_rejects_styling():
    raw = {
        "number": 2,
        "title": "Method",
        "brief_description": "FIG. 2",
        "mermaid": "flowchart TB\nA-->B\nclassDef foo fill:#fff",
    }
    try:
        _normalize_figure(raw, 2)
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_normalize_figure_sanitizes_ampersands():
    raw = {
        "number": 2,
        "title": "Method",
        "brief_description": "FIG. 2",
        "mermaid": 'flowchart TB\nA["Tokenize & Extract"] --> B["Dense & Sparse"]',
    }
    result = _normalize_figure(raw, 2)
    assert "&" not in result["mermaid"]
    assert " and " in result["mermaid"]


def test_normalize_figure_converts_horizontal_layout_to_tb():
    raw = {
        "number": 1,
        "title": "System",
        "brief_description": "FIG. 1",
        "mermaid": "flowchart LR\nA[10 Module] --> B[12 Parser]",
    }
    result = _normalize_figure(raw, 1)
    assert result["mermaid"].startswith("flowchart TB")


def test_normalize_figure_fixes_empty_subgraph_titles():
    raw = {
        "number": 2,
        "title": "Method",
        "brief_description": "FIG. 2",
        "mermaid": 'flowchart TB\n  subgraph Left [""]\n    direction TB\n    A["Step<br/>200"] --> B\n  end',
    }
    result = _normalize_figure(raw, 2)
    assert '[""]' not in result["mermaid"]
    assert "direction TB" not in result["mermaid"]
    assert "subgraph Left" in result["mermaid"]
