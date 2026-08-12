"""Draft ADA bioanalytical report sections via isolated per-section agents."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from .drafting_guidance import format_prior_draft_context
from .llm_client import generate_text
from .retrieval import citations_from_excerpts, format_excerpts_block, retrieve_relevant_excerpts
from .review_field_sources import (
    ADA_REVIEW_FIELD_LABELS,
    append_review_fields_to_combined_text,
)
from .source_chunks import parse_source_chunks

ADA_SECTIONS = [
    "study_overview",
    "method_summary",
    "study_samples",
    "cut_point_determination",
    "sensitivity",
    "specificity_selectivity",
    "precision_reproducibility_robustness",
    "stability",
    "sample_analysis_results",
    "data_analysis_conclusion",
]

_SECTION_LABELS = {
    "study_overview": "Study Overview / Objective",
    "method_summary": "Method Summary",
    "study_samples": "Study Samples",
    "cut_point_determination": "Cut Point Determination",
    "sensitivity": "Sensitivity",
    "specificity_selectivity": "Specificity & Selectivity",
    "precision_reproducibility_robustness": "Precision, Reproducibility & Robustness",
    "stability": "Stability",
    "sample_analysis_results": "Sample Analysis Results & Titer Reporting",
    "data_analysis_conclusion": "Data Analysis & Conclusion",
}

_SECTION_DESCRIPTIONS = {
    "study_overview": "What is being validated or reported and why",
    "method_summary": "Assay platform, critical reagents, and equipment used",
    "study_samples": "Sample source, matrix, and handling",
    "cut_point_determination": (
        "Pre-study and in-study cut point methodology and results"
    ),
    "sensitivity": (
        "Lowest ADA concentration consistently detected above the cut point"
    ),
    "specificity_selectivity": (
        "Drug tolerance, target tolerance, and matrix interference"
    ),
    "precision_reproducibility_robustness": (
        "Inter/intra-assay precision and robustness data"
    ),
    "stability": "Sample stability under storage and handling conditions",
    "sample_analysis_results": (
        "Screening, confirmatory, and titer results per the tiered testing approach"
    ),
    "data_analysis_conclusion": (
        "Interpretation of results against acceptance criteria"
    ),
}

_ADA_DRAFTER_SYSTEM = (
    "You are an expert bioanalytical and regulatory scientist specializing in "
    "anti-drug antibody (ADA) immunogenicity testing. Draft in the style of a formal "
    "bioanalytical report appendix — not a lab notebook and not marketing copy. "
    "Be precise and quantitative where data is available, and honest about what the "
    "source material does and does not specify. Do not invent %CV values, cut point "
    "numbers, or concentrations that are not grounded in the extracted details or "
    "source excerpts. Output plain text only — no markdown, headings, or meta-commentary."
)

_AGENT_CONVENTIONS = (
    "Write complete bioanalytical report prose for your assigned section only. "
    "Do not include the section title in your output. "
    "Ground statements in the study details provided; do not invent unsupported "
    "numerical assay performance claims."
)

_DEFAULT_CUSTOM_DESCRIPTION = (
    "Draft this section using the study details and any provided source material. "
    "Use your judgment on appropriate content and structure for a section with this name "
    "in an ADA bioanalytical report."
)


def _resolve_custom_meta(
    custom_sections: dict[str, dict[str, str]] | None,
    section: str,
) -> tuple[str, str] | None:
    """Return (name, description) for a custom section id, or None if not registered."""
    if not custom_sections or section not in custom_sections:
        return None
    meta = custom_sections.get(section) or {}
    name = str(meta.get("name") or "").strip() or section.replace("_", " ").title()
    description = str(meta.get("description") or "").strip()
    return name, description


def get_custom_ada_section_agent_system(name: str, description: str) -> str:
    """System prompt for a user-defined section not in the canonical ADA_SECTIONS list."""
    instructions = description.strip() or _DEFAULT_CUSTOM_DESCRIPTION
    return (
        f'You are a dedicated ADA bioanalytical report drafting agent assigned ONLY to draft the '
        f'"{name}" section of an anti-drug antibody immunogenicity report, a section the user '
        f"has added beyond the standard set.\n\n"
        f"{_ADA_DRAFTER_SYSTEM}\n\n"
        f"SECTION INSTRUCTIONS: {instructions}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from other sections unless it appears in the study details provided in "
        "the user message."
    )


def _format_ada_details(ada: dict) -> str:
    """Format ADA details dict as context block for prompts."""
    lines = []
    field_labels = {
        "study_title": "Study Title",
        "study_objective": "Study Objective",
        "assay_platform": "Assay Platform",
        "sample_matrix": "Sample Matrix",
        "cut_point_methodology": "Cut Point Methodology",
        "sensitivity_data": "Sensitivity Data",
        "specificity_data": "Specificity Data",
        "precision_data": "Precision Data",
        "stability_data": "Stability Data",
        "results_summary": "Results Summary",
    }
    for key, label in field_labels.items():
        value = str(ada.get(key) or "").strip()
        if value:
            lines.append(f"{label}:\n{value}")
    return "\n\n".join(lines)


def _section_instructions(section: str) -> str:
    """Section-specific drafting instructions."""
    instructions = {
        "study_overview": (
            "State what is being validated or reported and why — a method validation "
            "report for a specific ADA assay, or a clinical/nonclinical sample analysis "
            "report — grounded in the extracted study objective."
        ),
        "method_summary": (
            "Describe the assay platform, format, critical reagents, and equipment "
            "used, grounded in the extracted assay platform details."
        ),
        "study_samples": (
            "Describe the sample source, matrix, species, and handling/collection "
            "conditions."
        ),
        "cut_point_determination": (
            "Describe the pre-study and in-study cut point methodology — statistical "
            "approach (e.g. parametric vs. non-parametric, percentile-based) — and "
            "results, distinguishing screening cut point from confirmatory cut point "
            "where the source supports it."
        ),
        "sensitivity": (
            "State the lowest ADA concentration consistently detected above the cut "
            "point, grounded in the extracted sensitivity data. Do not invent a "
            "concentration value if the source does not specify one — describe the "
            "sensitivity assessment approach instead."
        ),
        "specificity_selectivity": (
            "Describe drug tolerance (how much circulating free drug the assay "
            "tolerates before false negatives), target tolerance, and matrix "
            "interference/selectivity findings."
        ),
        "precision_reproducibility_robustness": (
            "Report inter-assay and intra-assay precision, and robustness across "
            "analysts, days, or reagent lots where the source specifies it."
        ),
        "stability": (
            "Describe sample stability under storage and handling conditions — "
            "freeze-thaw cycles, bench-top stability, long-term storage — grounded "
            "in the extracted stability data."
        ),
        "sample_analysis_results": (
            "Report screening, confirmatory, and titer results per the tiered testing "
            "approach, referencing incidence rates and findings from the extracted "
            "results summary."
        ),
        "data_analysis_conclusion": (
            "Interpret the results against acceptance criteria and summarize overall "
            "assay performance and study conclusions."
        ),
    }
    return instructions.get(section, f"Draft the {_SECTION_LABELS.get(section, section)} section.")


def _build_user_prompt(
    section: str,
    ada: dict,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    excerpts_block: str = "",
    label: str | None = None,
    instructions: str | None = None,
) -> str:
    """Assemble the user prompt for an ADA section agent."""
    resolved_label = label or _SECTION_LABELS.get(section, section)
    resolved_instructions = instructions or _section_instructions(section)
    details = _format_ada_details(ada)
    prior_block = format_prior_draft_context(
        prior_draft,
        attorney_feedback,
        feedback_label="Bioanalytical reviewer feedback",
    )

    return f"""\
Draft the "{resolved_label}" section of an ADA bioanalytical report.

Study details extracted from source documentation:
{details}

Instructions:
{resolved_instructions}
{prior_block}{excerpts_block}

Output ONLY the body text for the "{resolved_label}" section.
"""


def get_ada_section_agent_system(section: str) -> str:
    """System prompt for a single ADA section agent."""
    label = _SECTION_LABELS.get(section, section)
    return (
        f"You are a dedicated ADA bioanalytical report drafting agent assigned ONLY to draft the "
        f'"{label}" section of an anti-drug antibody immunogenicity report.\n\n'
        f"{_ADA_DRAFTER_SYSTEM}\n\n"
        f"{_AGENT_CONVENTIONS}"
    )


def draft_single_ada_section(
    ada: dict,
    section_name: str,
    prior_draft: str = "",
    *,
    attorney_feedback: str = "",
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[str, list[dict]]:
    """Draft one ADA section via its isolated agent.

    Returns ``(content, citations)``. When ``combined_text`` is empty and Review
    fields are empty/N/A, retrieval is skipped and citations is ``[]``.
    """
    section = section_name.strip()
    custom_meta = _resolve_custom_meta(custom_sections, section)
    if section not in ADA_SECTIONS and custom_meta is None:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {ADA_SECTIONS}"
        )

    # Make Review-tab fields citable via the same chunk/citation pipeline as uploads.
    combined_text = append_review_fields_to_combined_text(
        combined_text, ada, ADA_REVIEW_FIELD_LABELS
    )

    excerpts = []
    query_terms: set[str] = set()
    excerpts_block = ""
    if combined_text.strip():
        from .document_types import (
            get_ada_section_description,
            get_ada_section_query_fields,
        )

        chunks = parse_source_chunks(combined_text)
        if chunks:
            if custom_meta is not None and section not in ADA_SECTIONS:
                _, description = custom_meta
                excerpts, query_terms = retrieve_relevant_excerpts(
                    description,
                    ada,
                    chunks,
                    [],
                )
            else:
                excerpts, query_terms = retrieve_relevant_excerpts(
                    get_ada_section_description(section),
                    ada,
                    chunks,
                    get_ada_section_query_fields(section),
                )
            excerpts_block = format_excerpts_block(excerpts)

    if custom_meta is not None and section not in ADA_SECTIONS:
        name, description = custom_meta
        system = get_custom_ada_section_agent_system(name, description)
        user_prompt = _build_user_prompt(
            section,
            ada,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
            label=name,
            instructions=description.strip() or _DEFAULT_CUSTOM_DESCRIPTION,
        )
    else:
        system = get_ada_section_agent_system(section)
        user_prompt = _build_user_prompt(
            section,
            ada,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
        )
    content = generate_text(system, user_prompt).strip()
    return content, citations_from_excerpts(excerpts, query_terms)


def draft_all_ada_sections_parallel(
    ada: dict,
    section_names: Iterable[str] | None = None,
    *,
    attorney_feedback: dict[str, str] | None = None,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """Run one agent per ADA section concurrently.

    Returns ``(content_by_section, citations_by_section)``.
    """
    names = list(section_names) if section_names is not None else list(ADA_SECTIONS)
    custom = custom_sections or {}
    invalid = [n for n in names if n not in ADA_SECTIONS and n not in custom]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {ADA_SECTIONS}"
        )
    if not names:
        return {}, {}

    feedback_map = attorney_feedback or {}
    results: dict[str, str] = {}
    citations_by_section: dict[str, list[dict]] = {}
    max_workers = min(len(names), 10)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_single_ada_section,
                ada,
                name,
                "",
                attorney_feedback=feedback_map.get(name, ""),
                combined_text=combined_text,
                custom_sections=custom,
            ): name
            for name in names
        }
        for future in as_completed(futures):
            section = futures[future]
            content, citations = future.result()
            results[section] = content
            citations_by_section[section] = citations
    return results, citations_by_section
