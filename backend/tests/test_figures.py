"""Tests for patent figure generation helpers."""

from drafter.figures import (
    _normalize_figure,
    detect_mermaid_diagram_type,
    validate_figure_diagram_types,
)


def test_detect_mermaid_diagram_type_flowchart():
    assert detect_mermaid_diagram_type("flowchart TB\nA --> B") == "flowchart"


def test_detect_mermaid_diagram_type_graph_alias():
    assert detect_mermaid_diagram_type("graph TB\nA --> B") == "flowchart"


def test_detect_mermaid_diagram_type_sequence():
    source = "sequenceDiagram\nparticipant A as Module 200"
    assert detect_mermaid_diagram_type(source) == "sequencediagram"


def test_normalize_figure_preserves_flowchart_td_for_fig3():
    raw = {
        "number": 3,
        "title": "Interactions",
        "brief_description": "FIG. 3 is a data flow diagram.",
        "reference_numerals": {"200": "module"},
        "mermaid": "flowchart TD\nA[Ingestion module 200] -- \"raw text\" --> B[Parser 202]",
    }
    result = _normalize_figure(raw, 3)
    assert "flowchart TD" in result["mermaid"]
    assert "sequenceDiagram" not in result["mermaid"]


def test_normalize_figure_adds_graph_prefix_for_fig1():
    raw = {
        "number": 1,
        "title": "System",
        "brief_description": "FIG. 1 is a system diagram.",
        "reference_numerals": {"200": "module"},
        "mermaid": "A[\"Ingestion module<br/>200\"] --> B[\"Parser<br/>202\"]",
    }
    result = _normalize_figure(raw, 1)
    assert result["mermaid"].startswith("%%{init:")
    assert "graph TD" in result["mermaid"]
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


def test_normalize_figure_converts_graph_lr_to_td_for_fig1():
    raw = {
        "number": 1,
        "title": "System",
        "brief_description": "FIG. 1",
        "mermaid": "graph LR\nA[10 Module] --> B[12 Parser]",
    }
    result = _normalize_figure(raw, 1)
    assert "graph TD" in result["mermaid"]
    assert "graph LR" not in result["mermaid"]


def test_normalize_figure_uses_flowchart_td_for_fig2():
    raw = {
        "number": 2,
        "title": "Method",
        "brief_description": "FIG. 2",
        "mermaid": "flowchart TB\nA[Start] --> B{Decision?}",
    }
    result = _normalize_figure(raw, 2)
    assert "flowchart TD" in result["mermaid"]


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


def test_validate_figure_diagram_types_skips_patent_theme_prefix():
    from exporter.mermaid_render import apply_patent_mermaid_theme

    figures = [
        {
            "number": 2,
            "mermaid": apply_patent_mermaid_theme("flowchart TD\nA --> B"),
        }
    ]
    assert validate_figure_diagram_types(figures) == []


def test_validate_figure_diagram_types_flags_wrong_type():
    figures = [
        {
            "number": 1,
            "mermaid": "%%{init: {'theme':'base'}}%%\nflowchart TD\nA --> B",
        },
        {
            "number": 2,
            "mermaid": "flowchart TD\nA --> B",
        },
        {
            "number": 3,
            "mermaid": "sequenceDiagram\nparticipant A as Module 200",
        },
    ]
    warnings = validate_figure_diagram_types(figures)
    assert any("FIG. 1" in warning for warning in warnings)
    assert any("FIG. 3" in warning for warning in warnings)
    assert not any("FIG. 2" in warning for warning in warnings)


def test_normalize_figure_converts_sequence_diagram_to_flowchart_for_fig3():
    raw = {
        "number": 3,
        "title": "Interaction",
        "brief_description": "FIG. 3",
        "mermaid": "sequenceDiagram\nparticipant A as Module 200\nA->>B: message",
    }
    result = _normalize_figure(raw, 3)
    assert "flowchart TD" in result["mermaid"]
    assert "sequenceDiagram" not in result["mermaid"]
