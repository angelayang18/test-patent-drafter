"""Generic drafting agents for fully custom (user-defined) document sections."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from exporter.text_format import sanitize_patent_prose

from .llm_client import generate_text
from .retrieval import citations_from_excerpts, format_excerpts_block, retrieve_relevant_excerpts
from .source_chunks import parse_source_chunks

_DEFAULT_GENERIC_DESCRIPTION = (
    "Draft this section using the provided source material and your judgment on "
    "appropriate content and structure for a section with this name in this document."
)


def get_generic_section_agent_system(document_title: str, name: str, description: str) -> str:
    """System prompt for any user-defined section with no canonical template."""
    instructions = description.strip() or _DEFAULT_GENERIC_DESCRIPTION
    title_line = f' for the document "{document_title.strip()}"' if document_title.strip() else ""
    return (
        f'You are a dedicated drafting agent assigned ONLY to draft the "{name}" section'
        f"{title_line}.\n\n"
        f"SECTION INSTRUCTIONS: {instructions}\n\n"
        "Write clear, professional prose appropriate to the section's purpose. Use only "
        "information present in the source material or general domain knowledge relevant to "
        "the section's stated purpose — do not invent specific facts, figures, or claims not "
        "supported by the provided material.\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent content "
        "belonging to other sections unless it appears in the source material provided."
    )


def build_generic_user_prompt(
    document_title: str,
    name: str,
    description: str,
    *,
    prior_draft: str = "",
    excerpts_block: str = "",
) -> str:
    """User prompt for a fully custom section — no canonical entity details block."""
    instructions = description.strip() or _DEFAULT_GENERIC_DESCRIPTION
    title_part = f' of "{document_title.strip()}"' if document_title.strip() else ""
    prior_block = ""
    if prior_draft.strip():
        prior_block = (
            f"\n\nPrior draft of this section (revise and improve; preserve accurate facts):\n"
            f"{prior_draft.strip()}"
        )
    return (
        f'Draft the "{name}" section{title_part}.\n\n'
        f"Instructions:\n{instructions}"
        f"{prior_block}{excerpts_block}\n\n"
        f'Output ONLY the body text for the "{name}" section.'
    )


def draft_generic_section(
    document_title: str,
    section_id: str,
    name: str,
    description: str,
    *,
    prior_draft: str = "",
    combined_text: str = "",
) -> tuple[str, list[dict]]:
    """Draft one fully-custom section. Retrieval seeds off ``description``, no field restriction.

    Returns ``(content, citations)``. When ``combined_text`` is empty, retrieval is
    skipped and citations is ``[]``.
    """
    sid = section_id.strip()
    section_name = name.strip()
    if not sid:
        raise ValueError("section_id is required.")
    if not section_name:
        raise ValueError("name is required.")

    query_description = description.strip() or _DEFAULT_GENERIC_DESCRIPTION

    excerpts: list = []
    excerpts_block = ""
    if combined_text.strip():
        chunks = parse_source_chunks(combined_text)
        if chunks:
            excerpts = retrieve_relevant_excerpts(
                query_description,
                {},
                chunks,
                [],
            )
            excerpts_block = format_excerpts_block(excerpts)

    system = get_generic_section_agent_system(document_title, section_name, description)
    user_prompt = build_generic_user_prompt(
        document_title,
        section_name,
        description,
        prior_draft=prior_draft,
        excerpts_block=excerpts_block,
    )
    raw = generate_text(system, user_prompt)
    content = sanitize_patent_prose(raw)
    return content, citations_from_excerpts(excerpts)


def draft_generic_sections_parallel(
    document_title: str,
    sections: list[dict],
    *,
    combined_text: str = "",
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """One isolated agent per section, run concurrently.

    Each ``sections`` entry must be a dict with ``id``, ``name``, and optional
    ``description``. Returns ``(content_by_section, citations_by_section)``.
    """
    if not sections:
        return {}, {}

    results: dict[str, str] = {}
    citations_by_section: dict[str, list[dict]] = {}
    max_workers = min(len(sections), 8)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_generic_section,
                document_title,
                str(sec.get("id") or ""),
                str(sec.get("name") or ""),
                str(sec.get("description") or ""),
                prior_draft="",
                combined_text=combined_text,
            ): str(sec.get("id") or "").strip()
            for sec in sections
        }
        for future in as_completed(futures):
            section = futures[future]
            content, citations = future.result()
            results[section] = content
            citations_by_section[section] = citations
    return results, citations_by_section
