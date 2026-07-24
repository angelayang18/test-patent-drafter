"""Document type config schema and default seed configs.

Additive registry used by future multi-document-type flows. Not wired into
API routes or the existing patent/grant UI yet.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .grant_sections import GRANT_SECTIONS, _SECTION_LABELS as GRANT_SECTION_LABELS
from .prompts import PATENT_SECTIONS

SourceType = Literal[
    "file_upload",
    "pasted_text",
    "website_url",
    "prior_draft",
    "confluence",
]

ALL_SOURCE_TYPES: list[SourceType] = [
    "file_upload",
    "pasted_text",
    "website_url",
    "prior_draft",
    "confluence",
]

# Aligned to frontend SECTION_LABELS (UI display names). Backend section_agents
# uses longer formal titles; those are not the source of truth for this config.
_PATENT_SECTION_NAMES: dict[str, str] = {
    "field": "Field of the Invention",
    "background": "Background",
    "summary": "Summary",
    "description": "Detailed Description",
    "claims": "Claims",
    "abstract": "Abstract",
}

_PATENT_SECTION_DESCRIPTIONS: dict[str, str] = {
    "field": (
        "Names the technical domain only, 2-3 sentences, "
        "no description of the invention itself"
    ),
    "background": "The problem and prior-art limitations, never the solution",
    "summary": "Brief introduction of the invention and its key technical advantages",
    "description": (
        "Full technical description: system overview, components, method steps, "
        "data flow, alternative embodiments"
    ),
    "claims": "8-10 informal claims establishing intended scope of protection",
    "abstract": (
        "One paragraph, max 150 words, technical field + problem + solution + benefit"
    ),
}

_GRANT_SECTION_DESCRIPTIONS: dict[str, str] = {
    "executive_summary": (
        "Introduces the project, problem, solution, innovation, impact, "
        "and organizational capacity"
    ),
    "problem_statement": (
        "The need being addressed, supporting evidence, and why this project "
        "is the right response now"
    ),
    "project_description": (
        "Project goals, activities, timeline, and deliverables, and how the "
        "solution addresses the problem"
    ),
    "methodology": (
        "The approach, methods, tools, and implementation steps, including "
        "sequencing and staffing"
    ),
    "evaluation": (
        "Measurable outcomes, indicators, data collection methods, and how "
        "results inform improvement"
    ),
    "budget_narrative": (
        "Major cost categories, personnel, equipment, and other direct costs "
        "aligned to the budget overview"
    ),
    "organizational_capacity": (
        "Team qualifications, relevant experience, partnerships, and "
        "infrastructure supporting delivery"
    ),
}


class SectionConfig(BaseModel):
    """Configuration for a single document section."""

    id: str
    name: str
    description: str
    order: int
    required: bool = True
    prompt_template_id: str


class DocumentTypeConfig(BaseModel):
    """Configuration for a document type and its drafting sections."""

    id: str
    label: str
    description: str
    sections: list[SectionConfig] = Field(default_factory=list)
    source_types: list[SourceType] = Field(default_factory=list)
    title_generation_enabled: bool = True
    citations_enabled: bool = True


def _build_patent_sections() -> list[SectionConfig]:
    """Build patent sections from PATENT_SECTIONS (id source of truth)."""
    return [
        SectionConfig(
            id=section_id,
            name=_PATENT_SECTION_NAMES[section_id],
            description=_PATENT_SECTION_DESCRIPTIONS[section_id],
            order=index + 1,
            required=True,
            prompt_template_id=section_id,
        )
        for index, section_id in enumerate(PATENT_SECTIONS)
    ]


def _build_grant_sections() -> list[SectionConfig]:
    """Build grant sections from GRANT_SECTIONS (id source of truth)."""
    return [
        SectionConfig(
            id=section_id,
            name=GRANT_SECTION_LABELS[section_id],
            description=_GRANT_SECTION_DESCRIPTIONS[section_id],
            order=index + 1,
            required=True,
            prompt_template_id=section_id,
        )
        for index, section_id in enumerate(GRANT_SECTIONS)
    ]


def _sow_sections() -> list[SectionConfig]:
    """Default SOW Contract sections (prompt templates are placeholders)."""
    raw: list[tuple[str, str, str]] = [
        (
            "purpose",
            "Purpose / Introduction & Background",
            "Why the engagement is happening and what problem it solves",
        ),
        (
            "objectives",
            "Objectives",
            "The specific, quantifiable goals of the engagement",
        ),
        (
            "scope_of_work",
            "Scope of Work",
            "The tasks and workstreams covered, broken out by development area",
        ),
        (
            "deliverables",
            "Deliverables",
            "What will be delivered, mapped to each scope item",
        ),
        (
            "development_areas_effort_schedule",
            "Development Areas, Effort & Schedule",
            "Estimated hours and timing per development area",
        ),
        (
            "responsibilities_required_inputs",
            "Responsibilities & Required Inputs",
            "What the service provider and customer each own, including "
            "required inputs from the customer",
        ),
        (
            "technical_integration_approach",
            "Technical / Integration Approach",
            "How the solution integrates with customer systems, data exchange "
            "method, and where AI assists vs. deterministic rules",
        ),
        (
            "acceptance_criteria",
            "Acceptance Criteria",
            "Measurable criteria that define when the engagement is accepted",
        ),
        (
            "assumptions_dependencies",
            "Assumptions & Dependencies",
            "What must be true for the schedule and scope to hold",
        ),
        (
            "out_of_scope",
            "Out of Scope",
            "What is explicitly excluded, to prevent scope creep",
        ),
        (
            "governance_change_control",
            "Governance & Change Control",
            "Meeting cadence and how scope changes are requested and approved",
        ),
        (
            "commercial_terms",
            "Commercial Terms",
            "Fees, payment schedule, and what's billed separately",
        ),
        (
            "data_protection_confidentiality",
            "Data Protection & Confidentiality",
            "How each party's data is handled, retained, and protected",
        ),
        (
            "completion",
            "Completion",
            "The conditions that mark the engagement as complete",
        ),
    ]
    return [
        SectionConfig(
            id=section_id,
            name=name,
            description=description,
            order=index + 1,
            required=True,
            prompt_template_id=f"sow_{section_id}",
        )
        for index, (section_id, name, description) in enumerate(raw)
    ]


def _ada_sections() -> list[SectionConfig]:
    """Default ADA Bioanalytical Report sections (prompt templates are placeholders)."""
    raw: list[tuple[str, str, str]] = [
        (
            "study_overview",
            "Study Overview / Objective",
            "What is being validated or reported and why",
        ),
        (
            "method_summary",
            "Method Summary",
            "Assay platform, critical reagents, and equipment used",
        ),
        (
            "study_samples",
            "Study Samples",
            "Sample source, matrix, and handling",
        ),
        (
            "cut_point_determination",
            "Cut Point Determination",
            "Pre-study and in-study cut point methodology and results",
        ),
        (
            "sensitivity",
            "Sensitivity",
            "Lowest ADA concentration consistently detected above the cut point",
        ),
        (
            "specificity_selectivity",
            "Specificity & Selectivity",
            "Drug tolerance, target tolerance, and matrix interference",
        ),
        (
            "precision_reproducibility_robustness",
            "Precision, Reproducibility & Robustness",
            "Inter/intra-assay precision and robustness data",
        ),
        (
            "stability",
            "Stability",
            "Sample stability under storage and handling conditions",
        ),
        (
            "sample_analysis_results",
            "Sample Analysis Results & Titer Reporting",
            "Screening, confirmatory, and titer results per the tiered testing approach",
        ),
        (
            "data_analysis_conclusion",
            "Data Analysis & Conclusion",
            "Interpretation of results against acceptance criteria",
        ),
    ]
    return [
        SectionConfig(
            id=section_id,
            name=name,
            description=description,
            order=index + 1,
            required=True,
            prompt_template_id=f"ada_{section_id}",
        )
        for index, (section_id, name, description) in enumerate(raw)
    ]


DOCUMENT_TYPES: list[DocumentTypeConfig] = [
    DocumentTypeConfig(
        id="PATENT_PROVISIONAL",
        label="Patent Provisional",
        description=(
            "US provisional patent application draft with field, background, "
            "summary, description, claims, and abstract."
        ),
        sections=_build_patent_sections(),
        source_types=list(ALL_SOURCE_TYPES),
        title_generation_enabled=True,
        citations_enabled=True,
    ),
    DocumentTypeConfig(
        id="GRANT_APPLICATION",
        label="Grant Application",
        description=(
            "Grant proposal draft covering executive summary through "
            "organizational capacity."
        ),
        sections=_build_grant_sections(),
        source_types=list(ALL_SOURCE_TYPES),
        title_generation_enabled=True,
        citations_enabled=True,
    ),
    DocumentTypeConfig(
        id="SOW_CONTRACT",
        label="SOW Contract",
        description=(
            "Statement of Work contract covering purpose, scope, deliverables, "
            "schedule, and commercial terms."
        ),
        sections=_sow_sections(),
        source_types=list(ALL_SOURCE_TYPES),
        title_generation_enabled=True,
        citations_enabled=True,
    ),
    DocumentTypeConfig(
        id="ADA_BIOANALYTICAL_REPORT",
        label="ADA Bioanalytical Report",
        description=(
            "Anti-drug antibody bioanalytical report covering method validation, "
            "cut points, and sample analysis."
        ),
        sections=_ada_sections(),
        source_types=list(ALL_SOURCE_TYPES),
        title_generation_enabled=True,
        citations_enabled=True,
    ),
]

_DOCUMENT_TYPE_BY_ID: dict[str, DocumentTypeConfig] = {
    config.id: config for config in DOCUMENT_TYPES
}


def get_document_type_config(document_type_id: str) -> DocumentTypeConfig:
    """Return the document type config for the given id.

    Args:
        document_type_id: Document type identifier (e.g. PATENT_PROVISIONAL).

    Returns:
        Matching DocumentTypeConfig.

    Raises:
        ValueError: If the id is not a known document type.
    """
    config = _DOCUMENT_TYPE_BY_ID.get(document_type_id)
    if config is None:
        known = ", ".join(c.id for c in DOCUMENT_TYPES)
        raise ValueError(
            f"Unknown document type '{document_type_id}'. Must be one of: {known}"
        )
    return config
