"""Tests for patent figure reference numeral validation."""

from drafter.figure_numerals import (
    extract_description_numerals,
    extract_mermaid_numerals,
    reconcile_figure_labels,
    validate_figure_numerals,
    _names_conflict,
)


def test_extract_mermaid_numerals_parses_br_labels():
    mermaid = 'flowchart TB\nA["Ingestion module<br/>200"] --> B["Parsing module<br/>202"]'
    numerals = extract_mermaid_numerals(mermaid)
    assert numerals["200"] == "Ingestion module"
    assert numerals["202"] == "Parsing module"


def test_extract_description_numerals_skips_prepositional_phrases():
    description = (
        "Documents pass through an adaptive preprocessing subsystem 202 before parsing. "
        "The ingestion module 200 receives input. "
        "Output is sent to a structural parsing engine 204."
    )
    numerals = extract_description_numerals(description)
    assert numerals["200"] == "ingestion module"
    assert numerals["202"] == "adaptive preprocessing subsystem"
    assert numerals["204"] == "structural parsing engine"


def test_names_conflict_allows_method_step_and_module_labels():
    assert not _names_conflict("1. Ingestion", "Ingestion module")
    assert not _names_conflict(
        "Adaptive image preprocessing subsystem",
        "adaptive preprocessing subsystem",
    )


def test_reconcile_figure_labels_aligns_fig2_and_fig3():
    figures = [
        {
            "number": 1,
            "mermaid": (
                'flowchart TB\nA["Ingestion module<br/>200"] --> '
                'B["Adaptive preprocessing subsystem<br/>202"]'
            ),
            "reference_numerals": {"200": "Ingestion module", "202": "Adaptive preprocessing subsystem"},
        },
        {
            "number": 2,
            "mermaid": (
                'flowchart TB\nA["1. Ingestion<br/>200"] --> '
                'B["2. Cross-Modal Layout Detection<br/>202"]'
            ),
            "reference_numerals": {"200": "1. Ingestion", "202": "2. Cross-Modal Layout Detection"},
        },
        {
            "number": 3,
            "mermaid": (
                'flowchart TB\nA["Adaptive image preprocessing subsystem<br/>202"] --> '
                'B["Ingestion module<br/>200"]'
            ),
            "reference_numerals": {"202": "Adaptive image preprocessing subsystem"},
        },
    ]
    description = (
        "The ingestion module 200 receives documents. "
        "An adaptive preprocessing subsystem 202 normalizes images."
    )
    reconciled = reconcile_figure_labels(figures, description)
    fig2_map = extract_mermaid_numerals(reconciled[1]["mermaid"])
    fig3_map = extract_mermaid_numerals(reconciled[2]["mermaid"])
    assert fig2_map["200"] == "Ingestion module"
    assert fig2_map["202"] == "Adaptive preprocessing subsystem"
    assert fig3_map["202"] == "Adaptive preprocessing subsystem"
    assert not validate_figure_numerals(reconciled, description)


def test_validate_detects_duplicate_numeral_different_names():
    figures = [
        {
            "number": 1,
            "mermaid": 'flowchart TB\nA["Ingestion module<br/>200"] --> B["Parsing module<br/>202"]',
        },
        {
            "number": 3,
            "mermaid": 'flowchart TB\nC["Layout preservation<br/>200"] --> D["JSON schema<br/>204"]',
        },
    ]
    description = (
        "The ingestion module 200 receives documents. "
        "The parsing module 202 extracts structure. "
        "The chunking module 204 segments content."
    )
    errors = validate_figure_numerals(figures, description)
    assert any("200" in err and "Layout preservation" in err for err in errors)


def test_validate_detects_subcomponent_downstream_of_parent():
    figures = [
        {
            "number": 1,
            "mermaid": (
                'flowchart TB\n'
                'A["Ingestion module<br/>200"] --> B["Parsing module<br/>202"] --> '
                'C["Indexing engine<br/>208"] --> D["Retrieval module<br/>210"] --> '
                'E["Cluster index<br/>211"]'
            ),
        },
    ]
    description = (
        "The retrieval module 210 executes a cascading retrieval pipeline using "
        "a cluster index 211 and a local reranker."
    )
    errors = validate_figure_numerals(figures, description)
    assert any("211" in err and "sub-component" in err for err in errors)


def test_validate_detects_duplicate_nodes_in_one_figure():
    figures = [
        {
            "number": 2,
            "mermaid": (
                'flowchart TB\n'
                'A["Parsing and chunking engine<br/>202"] --> B["Indexing engine<br/>208"] --> '
                'C["Parsing and chunking engine<br/>202"]'
            ),
        },
    ]
    errors = validate_figure_numerals(figures)
    assert any("appears 2 times" in err and "202" in err for err in errors)


def test_validate_detects_missing_top_level_module_in_fig2_and_fig3():
    figures = [
        {
            "number": 1,
            "mermaid": (
                'flowchart TB\n'
                'A["Ingestion module<br/>200"] --> B["Parsing module<br/>202"] --> '
                'C["Synthesis engine<br/>206"] --> D["Indexing engine<br/>208"]'
            ),
        },
        {
            "number": 2,
            "mermaid": (
                'flowchart TB\n'
                'A["Ingestion module<br/>200"] --> B["Parsing module<br/>202"] --> '
                'D["Indexing engine<br/>208"]'
            ),
        },
        {
            "number": 3,
            "mermaid": 'flowchart TB\nA["Ingestion module<br/>200"] --> D["Indexing engine<br/>208"]',
        },
    ]
    errors = validate_figure_numerals(figures, "")
    assert any("206" in err and "FIG. 2" in err for err in errors)
    assert any("206" in err and "FIG. 3" in err for err in errors)


def test_validate_detects_fig1_double_representation():
    figures = [
        {
            "number": 1,
            "mermaid": (
                'flowchart TB\n'
                'subgraph left202 ["Structural parsing module 202"]\n'
                '  direction TB\n'
                '  VLM["Vision-language model<br/>203"]\n'
                'end\n'
                'A["Ingestion module<br/>200"] --> B["Structural parsing module<br/>202"] --> '
                'C["Indexing engine<br/>208"]'
            ),
        },
    ]
    errors = validate_figure_numerals(figures, "")
    assert any("202" in err and "more than once" in err for err in errors)
