"""Tests for patent figure generation helpers."""

from drafter.figures import _normalize_figure


def test_normalize_figure_adds_flowchart_prefix():
    raw = {
        "number": 1,
        "title": "System",
        "brief_description": "FIG. 1 is a system diagram.",
        "reference_numerals": {"10": "module"},
        "mermaid": "A[10 Module] --> B[12 Parser]",
    }
    result = _normalize_figure(raw, 1)
    assert result["mermaid"].startswith("flowchart TB")
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
