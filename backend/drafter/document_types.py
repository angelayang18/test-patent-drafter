"""Document type config schema and default seed configs.

Additive registry used by future multi-document-type flows. Not wired into
API routes or the existing patent/grant UI yet.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .ada_sections import (
    ADA_SECTIONS,
    _SECTION_DESCRIPTIONS as ADA_SECTION_DESCRIPTIONS,
    _SECTION_LABELS as ADA_SECTION_LABELS,
)
from .grant_sections import GRANT_SECTIONS, _SECTION_LABELS as GRANT_SECTION_LABELS
from .prompts import PATENT_SECTIONS
from .sow_sections import (
    SOW_SECTIONS,
    _SECTION_DESCRIPTIONS as SOW_SECTION_DESCRIPTIONS,
    _SECTION_LABELS as SOW_SECTION_LABELS,
)

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


def get_patent_section_description(section_id: str) -> str:
    """Return the patent section description used for retrieval queries."""
    return _PATENT_SECTION_DESCRIPTIONS.get(section_id, "")


def get_grant_section_description(section_id: str) -> str:
    """Return the grant section description used for retrieval queries."""
    return _GRANT_SECTION_DESCRIPTIONS.get(section_id, "")


def get_sow_section_description(section_id: str) -> str:
    """Return the SOW section description used for retrieval queries."""
    return SOW_SECTION_DESCRIPTIONS.get(section_id, "")


def get_ada_section_description(section_id: str) -> str:
    """Return the ADA section description used for retrieval queries."""
    return ADA_SECTION_DESCRIPTIONS.get(section_id, "")


# Invention/grant/SOW/ADA fields that feed each section's retrieval query. Restricting
# inputs (not scoring weights) prevents cross-section vocabulary bleed.
_PATENT_SECTION_QUERY_FIELDS: dict[str, list[str]] = {
    "field": ["technical_field"],
    "background": ["technical_field", "problem_being_solved"],
    "summary": [
        "technical_field",
        "problem_being_solved",
        "core_technical_solution",
        "novel_mechanism",
    ],
    "description": [
        "technical_field",
        "core_technical_solution",
        "novel_mechanism",
        "key_components",
        "alternative_embodiments",
    ],
    "claims": [
        "technical_field",
        "core_technical_solution",
        "novel_mechanism",
        "key_components",
        "alternative_embodiments",
    ],
    "abstract": [
        "technical_field",
        "novel_mechanism",
        "core_technical_solution",
    ],
}

_GRANT_SECTION_QUERY_FIELDS: dict[str, list[str]] = {
    "executive_summary": [
        "problem_statement",
        "proposed_solution",
        "innovation_and_impact",
    ],
    "problem_statement": ["problem_statement", "target_population"],
    "project_description": ["proposed_solution", "innovation_and_impact"],
    "methodology": ["proposed_solution"],
    "evaluation": ["evaluation_plan"],
    "budget_narrative": ["budget_overview"],
    "organizational_capacity": ["team_qualifications"],
}

_SOW_SECTION_QUERY_FIELDS: dict[str, list[str]] = {
    "purpose": ["purpose_and_background"],
    "objectives": ["objectives", "purpose_and_background"],
    "scope_of_work": ["scope_of_work", "objectives"],
    "deliverables": ["deliverables", "scope_of_work"],
    "development_areas_effort_schedule": ["timeline_and_effort", "scope_of_work"],
    "responsibilities_required_inputs": ["responsibilities_and_inputs"],
    "technical_integration_approach": ["scope_of_work", "deliverables"],
    "acceptance_criteria": ["deliverables", "objectives"],
    "assumptions_dependencies": [
        "timeline_and_effort",
        "responsibilities_and_inputs",
    ],
    "out_of_scope": ["scope_of_work"],
    "governance_change_control": ["responsibilities_and_inputs"],
    "commercial_terms": ["commercial_terms"],
    "data_protection_confidentiality": [],
    "completion": ["deliverables"],
}

_ADA_SECTION_QUERY_FIELDS: dict[str, list[str]] = {
    "study_overview": ["study_objective"],
    "method_summary": ["assay_platform"],
    "study_samples": ["sample_matrix"],
    "cut_point_determination": ["cut_point_methodology"],
    "sensitivity": ["sensitivity_data"],
    "specificity_selectivity": ["specificity_data"],
    "precision_reproducibility_robustness": ["precision_data"],
    "stability": ["stability_data"],
    "sample_analysis_results": [
        "results_summary",
        "sensitivity_data",
        "specificity_data",
    ],
    "data_analysis_conclusion": ["results_summary", "cut_point_methodology"],
}


def get_patent_section_query_fields(section_id: str) -> list[str]:
    """Return invention field keys used for a patent section's retrieval query."""
    return list(_PATENT_SECTION_QUERY_FIELDS.get(section_id, []))


def get_grant_section_query_fields(section_id: str) -> list[str]:
    """Return grant field keys used for a grant section's retrieval query."""
    return list(_GRANT_SECTION_QUERY_FIELDS.get(section_id, []))


def get_sow_section_query_fields(section_id: str) -> list[str]:
    """Return SOW field keys used for a SOW section's retrieval query."""
    return list(_SOW_SECTION_QUERY_FIELDS.get(section_id, []))


def get_ada_section_query_fields(section_id: str) -> list[str]:
    """Return ADA field keys used for an ADA section's retrieval query."""
    return list(_ADA_SECTION_QUERY_FIELDS.get(section_id, []))


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


def _build_sow_sections() -> list[SectionConfig]:
    """Build SOW sections from SOW_SECTIONS (id source of truth)."""
    return [
        SectionConfig(
            id=section_id,
            name=SOW_SECTION_LABELS[section_id],
            description=SOW_SECTION_DESCRIPTIONS[section_id],
            order=index + 1,
            required=True,
            prompt_template_id=f"sow_{section_id}",
        )
        for index, section_id in enumerate(SOW_SECTIONS)
    ]


def _build_ada_sections() -> list[SectionConfig]:
    """Build ADA sections from ADA_SECTIONS (id source of truth)."""
    return [
        SectionConfig(
            id=section_id,
            name=ADA_SECTION_LABELS[section_id],
            description=ADA_SECTION_DESCRIPTIONS[section_id],
            order=index + 1,
            required=True,
            prompt_template_id=f"ada_{section_id}",
        )
        for index, section_id in enumerate(ADA_SECTIONS)
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
        sections=_build_sow_sections(),
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
        sections=_build_ada_sections(),
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
