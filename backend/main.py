"""Patent Drafter FastAPI application."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, List, Literal, Optional, Union
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from community_templates import create_template, list_templates
from drafter.extractor import extract_invention_details, extract_invention_field
from drafter.ada_extractor import extract_ada_details, extract_ada_field
from drafter.ada_sections import draft_all_ada_sections_parallel, draft_single_ada_section
from drafter.grant_extractor import extract_grant_details, extract_grant_field
from drafter.grant_sections import (
    GRANT_SECTIONS,
    draft_all_grant_sections_parallel,
    draft_single_grant_section,
)
from drafter.figures import (
    generate_generic_figures,
    generate_patent_figures,
    regenerate_generic_figure,
    regenerate_patent_figure,
)
from drafter.llm_client import LLMUnavailableError, get_llm_base_url, get_llm_model, probe_llm_reachable
from drafter.prompts import PATENT_SECTIONS
from drafter.selection_regenerate import regenerate_selection
from drafter.sections import draft_all_sections_parallel, draft_section
from drafter.sow_extractor import extract_sow_details, extract_sow_field
from drafter.sow_sections import (
    SOW_SECTIONS,
    draft_all_sow_sections_parallel,
    draft_single_sow_section,
)
from drafter.generic_sections import draft_generic_section, draft_generic_sections_parallel
from drafter.retrieval import citations_for_generic_title
from drafter.sections_suggest import suggest_sections_from_samples
from drafter.titles import suggest_generic_titles, suggest_titles
from learning.config import is_learning_enabled
from learning.guidelines import distill_guidelines_for_submission
from learning.storage import get_storage
from exporter.docx_export import export_patent_docx
from exporter.grant_export import export_grant_docx, export_grant_pdf
from exporter.sow_export import export_sow_docx, export_sow_pdf
from exporter.ada_export import export_ada_docx, export_ada_pdf
from exporter.generic_export import export_generic_docx, export_generic_pdf
from exporter.figure_png import decode_client_pngs, encode_png_map_for_client, prerender_figure_pngs
from exporter.mermaid_render import render_mermaid_to_png
from exporter.pdf_export import export_patent_pdf
from exporter.invention_qa import get_invention_alignment_qa_report
from exporter.text_format import get_format_qa_report
from parsers.confluence import ConfluenceClient
from parsers.docx_parser import extract_text_from_docx
from parsers.pdf_parser import extract_text_from_pdf
from parsers.pptx_parser import extract_text_from_pptx
from parsers.uspto_odp import ODPConfigError, ODPRequestError, search_related_applications
from parsers.web_scraper import scrape_url

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# force=True so INFO app logs appear even when uvicorn already configured logging.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,
)
# Keep common HTTP client loggers quiet unless they warn.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

log = logging.getLogger(__name__)

app = FastAPI(title="Patent Drafter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMUnavailableError)
async def llm_unavailable_handler(
    _request: Request,
    exc: LLMUnavailableError,
) -> JSONResponse:
    """Return a structured 503 so the frontend can show a specific LLM error."""
    log.error("LLM unavailable: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"error": "LLM unavailable", "detail": str(exc)},
    )


SUPPORTED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".pptx"}


class ConfluenceConnectRequest(BaseModel):
    url: str
    space_key: str
    api_token: str


class ScrapeRequest(BaseModel):
    url: str


class SuggestRelatedApplicationsRequest(BaseModel):
    """Request body for looking up an applicant's prior USPTO filings."""

    applicant_name: str


class ExtractRequest(BaseModel):
    combined_text: str
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class InventionDetails(BaseModel):
    invention_title: str = ""
    technical_field: str = ""
    problem_being_solved: str = ""
    core_technical_solution: str = ""
    novel_mechanism: str = ""
    alternative_embodiments: list[str] = Field(default_factory=list)
    key_components: list[str] = Field(default_factory=list)


class ExtractFieldRequest(BaseModel):
    combined_text: str
    field: str
    current: Optional[InventionDetails] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class GrantDetails(BaseModel):
    project_title: str = ""
    problem_statement: str = ""
    proposed_solution: str = ""
    innovation_and_impact: str = ""
    target_population: str = ""
    team_qualifications: str = ""
    budget_overview: str = ""
    evaluation_plan: str = ""


class ExtractGrantRequest(BaseModel):
    combined_text: str
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractGrantFieldRequest(BaseModel):
    combined_text: str
    field: str
    current: Optional[GrantDetails] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractTitlesRequest(BaseModel):
    combined_text: str
    document_kind: str
    current: Optional[str] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractGenericTitlesRequest(BaseModel):
    combined_text: str
    document_type_label: str
    current: Optional[str] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractGenericTitleCitationsRequest(BaseModel):
    combined_text: str
    document_type_label: str
    title: str = ""


class SuggestDocumentTypeSectionsRequest(BaseModel):
    """Request body for inferring a custom document-type section outline."""

    combined_text: str
    document_type_name: str
    description: str = ""


class CommunityTemplateSection(BaseModel):
    """One section definition within a shared community document-type template."""

    id: str
    name: str
    description: str = ""
    order: int = 0


class CommunityTemplateCreateRequest(BaseModel):
    """Request body for publishing a document-type template to the community store."""

    name: str
    description: str = ""
    sections: list[CommunityTemplateSection] = Field(default_factory=list)
    based_on: str = ""
    created_by_name: str = ""


class CommunityTemplateCreateResponse(BaseModel):
    """Response after creating a community document-type template."""

    id: str
    created_at: str


class GrantDraftRequest(GrantDetails):
    section: str
    prior_draft: str = ""
    attorney_feedback: str = ""
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class GrantDraftAllRequest(GrantDetails):
    sections: Optional[List[str]] = None
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class GenericFigureModel(BaseModel):
    number: int
    section_id: str
    title: str
    brief_description: str
    reference_numerals: dict[str, str] = Field(default_factory=dict)
    mermaid: str


class GrantExportRequest(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)
    figures: list[GenericFigureModel] = Field(default_factory=list)
    project_title: str = ""
    section_labels: Dict[str, str] = Field(default_factory=dict)


class SOWDetails(BaseModel):
    engagement_title: str = ""
    client_name: str = ""
    vendor_name: str = ""
    purpose_and_background: str = ""
    objectives: str = ""
    scope_of_work: str = ""
    deliverables: str = ""
    timeline_and_effort: str = ""
    responsibilities_and_inputs: str = ""
    commercial_terms: str = ""


class ExtractSOWRequest(BaseModel):
    combined_text: str
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractSOWFieldRequest(BaseModel):
    combined_text: str
    field: str
    current: Optional[SOWDetails] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class SOWDraftRequest(SOWDetails):
    section: str
    prior_draft: str = ""
    attorney_feedback: str = ""
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class SOWDraftAllRequest(SOWDetails):
    sections: Optional[List[str]] = None
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class SOWExportRequest(BaseModel):
    sections: Dict[str, str] = Field(default_factory=dict)
    figures: list[GenericFigureModel] = Field(default_factory=list)
    engagement_title: str = ""
    section_labels: Dict[str, str] = Field(default_factory=dict)


class ADADetails(BaseModel):
    study_title: str = ""
    study_objective: str = ""
    assay_platform: str = ""
    sample_matrix: str = ""
    cut_point_methodology: str = ""
    sensitivity_data: str = ""
    specificity_data: str = ""
    precision_data: str = ""
    stability_data: str = ""
    results_summary: str = ""


class ExtractADARequest(BaseModel):
    combined_text: str
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ExtractADAFieldRequest(BaseModel):
    combined_text: str
    field: str
    current: Optional[ADADetails] = None
    relevant_notes: str = ""
    irrelevant_notes: str = ""


class ADADraftRequest(ADADetails):
    section: str
    prior_draft: str = ""
    attorney_feedback: str = ""
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class ADADraftAllRequest(ADADetails):
    sections: Optional[List[str]] = None
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class ADAExportRequest(BaseModel):
    sections: Dict[str, str] = Field(default_factory=dict)
    figures: list[GenericFigureModel] = Field(default_factory=list)
    study_title: str = ""
    section_labels: Dict[str, str] = Field(default_factory=dict)


class GenericSectionDef(BaseModel):
    id: str
    name: str
    description: str = ""


class GenericDraftRequest(BaseModel):
    document_title: str = ""
    section_id: str
    name: str
    description: str = ""
    prior_draft: str = ""
    attorney_feedback: str = ""
    combined_text: str = ""


class GenericDraftAllRequest(BaseModel):
    document_title: str = ""
    sections: list[GenericSectionDef]
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    combined_text: str = ""


class GenericExportRequest(BaseModel):
    document_title: str = ""
    sections: dict[str, str] = Field(default_factory=dict)
    figures: list[GenericFigureModel] = Field(default_factory=list)
    section_order: list[str] = Field(default_factory=list)
    section_labels: dict[str, str] = Field(default_factory=dict)


class RegenerateSelectionRequest(BaseModel):
    combined_text: str
    full_field_text: str
    selected_text: str
    instruction: str = ""


class SectionCitation(BaseModel):
    """A source excerpt cited for a drafted section."""

    label: str
    location: str
    excerpt: str
    # Full matched paragraph for preview highlighting; empty on legacy payloads.
    full_excerpt: str = ""


class DraftRequest(InventionDetails):
    section: str
    prior_draft: str = ""
    attorney_feedback: str = ""
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class DraftAllRequest(InventionDetails):
    """Optional subset of section ids; default is all six specification sections."""

    sections: Optional[List[str]] = None
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    combined_text: str = ""
    custom_sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class LearningSubmitRequest(InventionDetails):
    sections: dict[str, str] = Field(default_factory=dict)
    ai_initial_sections: dict[str, str] = Field(default_factory=dict)
    attorney_feedback: dict[str, str] = Field(default_factory=dict)
    attorney_feedback_global: str = ""
    include_in_corpus: bool = True


class LearningApproveRequest(BaseModel):
    section: str


class PatentFigureModel(BaseModel):
    number: int
    title: str
    brief_description: str
    reference_numerals: dict[str, str] = Field(default_factory=dict)
    mermaid: str


class GenerateFiguresRequest(InventionDetails):
    description_text: str = ""
    num_figures: int = Field(default=3, ge=1, le=8)


class GenericFigureSectionInput(BaseModel):
    section_id: str
    section_name: str
    section_content: str = ""


class GenerateGenericFiguresRequest(BaseModel):
    document_type_label: str = ""
    document_title: str = ""
    sections: list[GenericFigureSectionInput]


class RegenerateFigureRequest(InventionDetails):
    figure_number: int
    description_text: str = ""
    existing_figures: list[PatentFigureModel] = Field(default_factory=list)


class RegenerateGenericFigureRequest(BaseModel):
    document_type_label: str = ""
    document_title: str = ""
    section_id: str
    section_name: str
    section_content: str = ""
    figure_number: int
    existing_figures: list[GenericFigureModel] = Field(default_factory=list)


class RenderMermaidRequest(BaseModel):
    mermaid: str


class ExportRequest(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)
    figures: list[PatentFigureModel] = Field(default_factory=list)
    invention_title: str = ""
    filing_info: Optional[Dict[str, str]] = None
    """Optional base64 PNGs keyed by figure number — skips re-render when exporting."""
    figure_pngs: Optional[Dict[str, str]] = None
    section_labels: Dict[str, str] = Field(default_factory=dict)


class QAReportRequest(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)
    invention: Optional[InventionDetails] = None


class FormatQAReportRequest(BaseModel):
    """Format-only QA for any document type (no invention-alignment checks)."""

    sections: dict[str, str] = Field(default_factory=dict)
    document_type: Literal["patent", "grant", "sow"] = "patent"


class PrerenderFiguresRequest(BaseModel):
    figures: list[PatentFigureModel] = Field(default_factory=list)


_FORMAT_QA_CANONICAL_SECTIONS: dict[str, list[str]] = {
    "patent": list(PATENT_SECTIONS),
    "grant": list(GRANT_SECTIONS),
    "sow": list(SOW_SECTIONS),
}


def _confluence_base_url(url: str) -> str:
    """Derive the Confluence wiki base URL from a page or site URL."""
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Invalid Confluence URL.")

    path = parsed.path
    wiki_marker = "/wiki"
    if wiki_marker in path:
        wiki_path = path[: path.index(wiki_marker) + len(wiki_marker)]
        return f"{parsed.scheme}://{parsed.netloc}{wiki_path}"

    return f"{parsed.scheme}://{parsed.netloc}{wiki_marker}"


def _extract_uploaded_text(filename: str, file_bytes: bytes) -> str:
    """Route uploaded file bytes to the appropriate parser."""
    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        return extract_text_from_pdf(file_bytes)
    if extension == ".docx":
        return extract_text_from_docx(file_bytes)
    if extension == ".pptx":
        return extract_text_from_pptx(file_bytes)
    raise ValueError(f"Unsupported file type: {extension}")


@app.get("/health")
def health() -> Dict[str, Union[str, bool]]:
    llm_reachable, llm_error = probe_llm_reachable()
    payload: Dict[str, Union[str, bool]] = {
        "status": "ok",
        "llm_model": get_llm_model(),
        "llm_base_url": get_llm_base_url(),
        "llm_api_key_configured": bool(os.getenv("LLM_API_KEY", "").strip()),
        "llm_reachable": llm_reachable,
    }
    if llm_error:
        payload["llm_error"] = llm_error
    return payload


@app.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)) -> dict:
    """Accept PDF, DOCX, and PPTX uploads and return extracted text."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    results: list[dict[str, str]] = []
    for upload in files:
        filename = upload.filename or "unknown"
        extension = Path(filename).suffix.lower()
        if extension not in SUPPORTED_UPLOAD_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type for {filename}. Use PDF, DOCX, or PPTX.",
            )

        file_bytes = await upload.read()
        try:
            text_content = _extract_uploaded_text(filename, file_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            log.exception("Failed to parse uploaded file %s", filename)
            raise HTTPException(
                status_code=422,
                detail=f"Failed to parse {filename}: {exc}",
            ) from exc

        results.append({"filename": filename, "text_content": text_content})

    return {"files": results}


@app.post("/connect/confluence")
def connect_confluence(body: ConfluenceConnectRequest) -> dict:
    """Fetch Confluence pages using credentials supplied in the request body."""
    username = os.getenv("CONFLUENCE_USERNAME", "")
    if not username:
        raise HTTPException(
            status_code=500,
            detail="CONFLUENCE_USERNAME is not configured on the server.",
        )

    try:
        base_url = _confluence_base_url(body.url)
        client = ConfluenceClient(
            base_url=base_url,
            username=username,
            api_token=body.api_token,
        )
        pages = client.get_space_pages(body.space_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "pages": [
            {"title": page["title"], "content": page["content"]}
            for page in pages
        ]
    }


@app.post("/scrape")
def scrape_page(body: ScrapeRequest) -> dict:
    """Scrape readable text content from a public URL."""
    if not body.url.strip():
        raise HTTPException(status_code=400, detail="URL is required.")

    content = scrape_url(body.url.strip())
    if content.startswith("Unable to fetch URL"):
        raise HTTPException(status_code=502, detail=content)

    return {"url": body.url.strip(), "content": content}


@app.post("/regenerate/selection")
def regenerate_selection_endpoint(body: RegenerateSelectionRequest) -> dict:
    """Rewrite a selected portion of a patent field or draft section."""
    if not body.full_field_text.strip():
        raise HTTPException(status_code=400, detail="full_field_text is required.")
    if not body.selected_text.strip():
        raise HTTPException(status_code=400, detail="selected_text is required.")

    try:
        result = regenerate_selection(
            body.combined_text,
            body.full_field_text,
            body.selected_text,
            body.instruction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Selection regeneration failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to regenerate selection: {exc}",
        ) from exc

    return {"result": result}


@app.post("/extract/field")
def extract_field(body: ExtractFieldRequest) -> dict:
    """Re-extract a single invention detail field from combined source text.

    Returns the field value plus ``citations`` keyed by field name
    (list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")
    if not body.field.strip():
        raise HTTPException(status_code=400, detail="field is required.")

    current = body.current.model_dump() if body.current else None
    try:
        return extract_invention_field(
            body.combined_text,
            body.field.strip(),
            current=current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Field extraction failed for %s", body.field)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract field '{body.field}': {exc}",
        ) from exc


@app.post("/extract/titles")
def extract_titles(body: ExtractTitlesRequest) -> dict:
    """Suggest candidate invention or grant project titles from combined source text."""
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        titles = suggest_titles(
            body.combined_text,
            body.document_kind,
            current=body.current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
        return {"titles": titles}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Title suggestion failed for %s", body.document_kind)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to suggest titles: {exc}",
        ) from exc


@app.post("/extract/titles/generic")
def extract_generic_titles(body: ExtractGenericTitlesRequest) -> dict:
    """Suggest candidate titles for a custom/generic document type.

    Returns ``{"titles": [...], "citations": [...]}`` — citations come from
    cheap keyword retrieval over the current title (no extra LLM call).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return suggest_generic_titles(
            body.combined_text,
            body.document_type_label,
            current=body.current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Generic title suggestion failed for %s", body.document_type_label)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to suggest titles: {exc}",
        ) from exc


@app.post("/extract/titles/generic/citations")
def extract_generic_title_citations(body: ExtractGenericTitleCitationsRequest) -> dict:
    """Return cheap keyword-retrieval citations for a custom type's title.

    No LLM call — safe to invoke on every title change.
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    citations = citations_for_generic_title(
        body.combined_text,
        body.document_type_label,
        body.title,
    )
    return {"citations": citations}


@app.post("/document-types/suggest-sections")
def suggest_document_type_sections(body: SuggestDocumentTypeSectionsRequest) -> dict:
    """Suggest a reusable section outline from sample report text.

    Returns ``{"sections": [{"name", "description"}, ...], "style_note": str | null}``.
    Suggestions are not auto-applied — the client presents accept/edit/reject UI.
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")
    if not body.document_type_name.strip():
        raise HTTPException(status_code=400, detail="document_type_name is required.")

    try:
        return suggest_sections_from_samples(
            body.combined_text,
            body.document_type_name,
            description=body.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception(
            "Section suggestion failed for document type %s",
            body.document_type_name,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to suggest sections: {exc}",
        ) from exc


@app.get("/document-types/community")
def list_community_document_types(
    user: dict = Depends(get_current_user),
) -> dict:
    """List shared community document-type templates for the authenticated user.

    Each template includes ``mine`` (true when the current user created it).
    """
    user_id = user["user_id"]
    templates = []
    for template in list_templates():
        templates.append(
            {
                **template,
                "mine": template.get("created_by_user_id") == user_id,
            }
        )
    return {"templates": templates}


@app.post("/document-types/community")
def create_community_document_type(
    body: CommunityTemplateCreateRequest,
    user: dict = Depends(get_current_user),
) -> CommunityTemplateCreateResponse:
    """Publish a document-type template to the shared community store."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required.")

    created_by_name = body.created_by_name.strip() or "Teammate"
    section_dicts = [section.model_dump() for section in body.sections]
    template_id = create_template(
        name=body.name.strip(),
        description=body.description,
        sections=section_dicts,
        created_by_user_id=user["user_id"],
        created_by_name=created_by_name,
        based_on=body.based_on,
    )
    created_at = ""
    for template in list_templates():
        if template["id"] == template_id:
            created_at = template["created_at"] or ""
            break
    return CommunityTemplateCreateResponse(id=template_id, created_at=created_at)


@app.post("/export/suggest-related-applications")
def suggest_related_applications(body: SuggestRelatedApplicationsRequest) -> dict:
    """Look up an applicant's prior USPTO filings as cross-reference candidates.

    Returns ``{"candidates": [...]}``. Candidates are bibliographic matches on
    applicant name only — this endpoint never determines or asserts that a
    match is legally related (priority claim, continuation, etc.); that
    determination is left to the user before it's added to the filing field.
    """
    if not body.applicant_name.strip():
        raise HTTPException(status_code=400, detail="applicant_name is required.")

    try:
        candidates = search_related_applications(body.applicant_name)
    except ODPConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ODPRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"candidates": candidates}


@app.post("/extract")
def extract_details(body: ExtractRequest) -> dict:
    """Extract structured invention details from combined source text.

    Returns field values plus ``citations`` keyed by field name
    (each a list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return extract_invention_details(
            body.combined_text,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Invention extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract invention details: {exc}",
        ) from exc


@app.post("/extract/grant")
def extract_grant(body: ExtractGrantRequest) -> dict:
    """Extract structured grant application details from combined source text.

    Returns field values plus ``citations`` keyed by field name
    (each a list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return extract_grant_details(
            body.combined_text,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Grant extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract grant details: {exc}",
        ) from exc


@app.post("/extract/grant/field")
def extract_grant_field_endpoint(body: ExtractGrantFieldRequest) -> dict:
    """Re-extract a single grant detail field from combined source text.

    Returns the field value plus ``citations`` keyed by field name
    (list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")
    if not body.field.strip():
        raise HTTPException(status_code=400, detail="field is required.")

    current = body.current.model_dump() if body.current else None
    try:
        return extract_grant_field(
            body.combined_text,
            body.field.strip(),
            current=current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Grant field extraction failed for %s", body.field)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract grant field '{body.field}': {exc}",
        ) from exc


@app.post("/extract/sow")
def extract_sow(body: ExtractSOWRequest) -> dict:
    """Extract structured Statement of Work details from combined source text.

    Returns field values plus ``citations`` keyed by field name
    (each a list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return extract_sow_details(
            body.combined_text,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("SOW extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract SOW details: {exc}",
        ) from exc


@app.post("/extract/sow/field")
def extract_sow_field_endpoint(body: ExtractSOWFieldRequest) -> dict:
    """Re-extract a single SOW detail field from combined source text.

    Returns the field value plus ``citations`` keyed by field name
    (list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")
    if not body.field.strip():
        raise HTTPException(status_code=400, detail="field is required.")

    current = body.current.model_dump() if body.current else None
    try:
        return extract_sow_field(
            body.combined_text,
            body.field.strip(),
            current=current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("SOW field extraction failed for %s", body.field)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract SOW field '{body.field}': {exc}",
        ) from exc


@app.post("/extract/ada")
def extract_ada(body: ExtractADARequest) -> dict:
    """Extract structured ADA bioanalytical report details from combined source text.

    Returns field values plus ``citations`` keyed by field name
    (each a list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return extract_ada_details(
            body.combined_text,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("ADA extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract ADA details: {exc}",
        ) from exc


@app.post("/extract/ada/field")
def extract_ada_field_endpoint(body: ExtractADAFieldRequest) -> dict:
    """Re-extract a single ADA detail field from combined source text.

    Returns the field value plus ``citations`` keyed by field name
    (list of :class:`SectionCitation` dicts).
    """
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")
    if not body.field.strip():
        raise HTTPException(status_code=400, detail="field is required.")

    current = body.current.model_dump() if body.current else None
    try:
        return extract_ada_field(
            body.combined_text,
            body.field.strip(),
            current=current,
            relevant_notes=body.relevant_notes,
            irrelevant_notes=body.irrelevant_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("ADA field extraction failed for %s", body.field)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract ADA field '{body.field}': {exc}",
        ) from exc


@app.post("/draft")
def draft_patent_section(body: DraftRequest) -> dict:
    """Draft a single patent section via one dedicated section agent.

    Returns ``citations`` as a list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.section.strip():
        raise HTTPException(status_code=400, detail="section is required.")

    invention = body.model_dump(
        exclude={
            "section",
            "prior_draft",
            "attorney_feedback",
            "combined_text",
            "custom_sections",
        },
    )
    section = body.section.strip()
    try:
        content, citations = draft_section(
            invention,
            section,
            prior_draft=body.prior_draft,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Section drafting failed for %s", body.section)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft section '{section}': {exc}",
        ) from exc

    return {"section": section, "content": content, "citations": citations}


@app.post("/draft/all")
def draft_all_patent_sections(body: DraftAllRequest) -> dict:
    """
    Draft multiple sections in parallel — one isolated LLM agent per section.

    Each agent uses the provisional filing template for its section only.
    ``citations`` maps section id → list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    invention = body.model_dump(
        exclude={"sections", "attorney_feedback", "combined_text", "custom_sections"},
    )
    section_list = body.sections
    if section_list is not None:
        section_list = [s.strip() for s in section_list if s.strip()]
        if not section_list:
            raise HTTPException(status_code=400, detail="sections must be non-empty when provided.")

    try:
        drafted, citations = draft_all_sections_parallel(
            invention,
            section_list,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Parallel section drafting failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft sections in parallel: {exc}",
        ) from exc

    return {"sections": drafted, "citations": citations}


@app.post("/draft/grant")
def draft_grant_section(body: GrantDraftRequest) -> dict:
    """Draft a single grant application section via one dedicated section agent.

    Returns ``citations`` as a list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.section.strip():
        raise HTTPException(status_code=400, detail="section is required.")

    grant = body.model_dump(
        exclude={
            "section",
            "prior_draft",
            "attorney_feedback",
            "combined_text",
            "custom_sections",
        },
    )
    section = body.section.strip()
    try:
        content, citations = draft_single_grant_section(
            grant,
            section,
            body.prior_draft,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Grant section drafting failed for %s", body.section)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft grant section '{section}': {exc}",
        ) from exc

    return {"section": section, "content": content, "citations": citations}


@app.post("/draft/grant/all")
def draft_all_grant_sections(body: GrantDraftAllRequest) -> dict:
    """Draft multiple grant sections in parallel — one isolated LLM agent per section.

    ``citations`` maps section id → list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    grant = body.model_dump(
        exclude={"sections", "attorney_feedback", "combined_text", "custom_sections"},
    )
    section_list = body.sections
    if section_list is not None:
        section_list = [s.strip() for s in section_list if s.strip()]
        if not section_list:
            raise HTTPException(status_code=400, detail="sections must be non-empty when provided.")

    try:
        drafted, citations = draft_all_grant_sections_parallel(
            grant,
            section_list,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Parallel grant section drafting failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft grant sections in parallel: {exc}",
        ) from exc

    return {"sections": drafted, "citations": citations}


@app.post("/draft/sow")
def draft_sow_section(body: SOWDraftRequest) -> dict:
    """Draft a single Statement of Work section via one dedicated section agent.

    Returns ``citations`` as a list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.section.strip():
        raise HTTPException(status_code=400, detail="section is required.")

    sow = body.model_dump(
        exclude={
            "section",
            "prior_draft",
            "attorney_feedback",
            "combined_text",
            "custom_sections",
        },
    )
    section = body.section.strip()
    try:
        content, citations = draft_single_sow_section(
            sow,
            section,
            body.prior_draft,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("SOW section drafting failed for %s", body.section)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft SOW section '{section}': {exc}",
        ) from exc

    return {"section": section, "content": content, "citations": citations}


@app.post("/draft/sow/all")
def draft_all_sow_sections(body: SOWDraftAllRequest) -> dict:
    """Draft multiple SOW sections in parallel — one isolated LLM agent per section.

    ``citations`` maps section id → list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    sow = body.model_dump(
        exclude={"sections", "attorney_feedback", "combined_text", "custom_sections"},
    )
    section_list = body.sections
    if section_list is not None:
        section_list = [s.strip() for s in section_list if s.strip()]
        if not section_list:
            raise HTTPException(status_code=400, detail="sections must be non-empty when provided.")

    try:
        drafted, citations = draft_all_sow_sections_parallel(
            sow,
            section_list,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Parallel SOW section drafting failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft SOW sections in parallel: {exc}",
        ) from exc

    return {"sections": drafted, "citations": citations}


@app.post("/draft/ada")
def draft_ada_section(body: ADADraftRequest) -> dict:
    """Draft a single ADA bioanalytical report section via one dedicated section agent.

    Returns ``citations`` as a list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.section.strip():
        raise HTTPException(status_code=400, detail="section is required.")

    ada = body.model_dump(
        exclude={
            "section",
            "prior_draft",
            "attorney_feedback",
            "combined_text",
            "custom_sections",
        },
    )
    section = body.section.strip()
    try:
        content, citations = draft_single_ada_section(
            ada,
            section,
            body.prior_draft,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("ADA section drafting failed for %s", body.section)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft ADA section '{section}': {exc}",
        ) from exc

    return {"section": section, "content": content, "citations": citations}


@app.post("/draft/ada/all")
def draft_all_ada_sections(body: ADADraftAllRequest) -> dict:
    """Draft multiple ADA sections in parallel — one isolated LLM agent per section.

    ``citations`` maps section id → list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    ada = body.model_dump(
        exclude={"sections", "attorney_feedback", "combined_text", "custom_sections"},
    )
    section_list = body.sections
    if section_list is not None:
        section_list = [s.strip() for s in section_list if s.strip()]
        if not section_list:
            raise HTTPException(status_code=400, detail="sections must be non-empty when provided.")

    try:
        drafted, citations = draft_all_ada_sections_parallel(
            ada,
            section_list,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
            custom_sections=body.custom_sections,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Parallel ADA section drafting failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft ADA sections in parallel: {exc}",
        ) from exc

    return {"sections": drafted, "citations": citations}


@app.post("/draft/generic")
def draft_generic_section_endpoint(body: GenericDraftRequest) -> dict:
    """Draft a single fully-custom section via a dedicated generic agent.

    Returns ``citations`` as a list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.section_id.strip():
        raise HTTPException(status_code=400, detail="section_id is required.")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required.")

    section_id = body.section_id.strip()
    try:
        content, citations = draft_generic_section(
            body.document_title,
            section_id,
            body.name,
            body.description,
            prior_draft=body.prior_draft,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Generic section drafting failed for %s", section_id)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft generic section '{section_id}': {exc}",
        ) from exc

    return {"section": section_id, "content": content, "citations": citations}


@app.post("/draft/generic/all")
def draft_generic_all_endpoint(body: GenericDraftAllRequest) -> dict:
    """Draft multiple fully-custom sections in parallel — one isolated agent each.

    ``citations`` maps section id → list of :class:`SectionCitation` dicts
    (``label``, ``location``, ``excerpt``).
    """
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections must be non-empty.")

    section_dicts = [sec.model_dump() for sec in body.sections]
    try:
        drafted, citations = draft_generic_sections_parallel(
            body.document_title,
            section_dicts,
            attorney_feedback=body.attorney_feedback,
            combined_text=body.combined_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Parallel generic section drafting failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft generic sections in parallel: {exc}",
        ) from exc

    return {"sections": drafted, "citations": citations}


@app.post("/learning/submit")
def submit_learning_corpus(body: LearningSubmitRequest) -> dict:
    """Persist attorney-reviewed draft and feedback for org-wide learning."""
    if not is_learning_enabled():
        return {"success": True, "stored": False, "reason": "learning_disabled"}

    if not body.include_in_corpus:
        return {"success": True, "stored": False, "reason": "opt_out"}

    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        storage = get_storage()
        submission_id = storage.submit_draft(
            invention_title=body.invention_title,
            technical_field=body.technical_field,
            sections=body.sections,
            ai_initial_sections=body.ai_initial_sections,
            attorney_feedback=body.attorney_feedback,
            attorney_feedback_global=body.attorney_feedback_global,
        )
    except Exception as exc:
        log.exception("Learning corpus submission failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store learning corpus: {exc}",
        ) from exc

    try:
        distill_guidelines_for_submission(submission_id, storage=storage)
    except Exception as exc:
        # Draft is already persisted; distillation is best-effort and must not fail export.
        log.exception(
            "Learning guideline distillation failed for submission %s",
            submission_id,
        )
        return {
            "success": True,
            "stored": True,
            "submission_id": submission_id,
            "distillation_warning": str(exc),
        }

    return {"success": True, "stored": True, "submission_id": submission_id}


@app.post("/learning/submissions/{submission_id}/approve")
def approve_learning_exemplar(submission_id: int, body: LearningApproveRequest) -> dict:
    """Mark a submitted section snapshot as an approved exemplar."""
    if not is_learning_enabled():
        return {"success": True, "approved": False, "reason": "learning_disabled"}

    section = body.section.strip()
    if not section:
        raise HTTPException(status_code=400, detail="section is required.")

    try:
        get_storage().approve_exemplar(submission_id, section)
    except Exception as exc:
        log.exception("Learning exemplar approval failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to approve exemplar: {exc}",
        ) from exc

    return {"success": True, "approved": True}


@app.get("/learning/guidelines")
def list_learning_guidelines() -> dict:
    """Return distilled org-wide drafting guidelines per section."""
    if not is_learning_enabled():
        return {"guidelines": {}, "learning_enabled": False}

    storage = get_storage()
    return {"guidelines": storage.list_all_guidelines(), "learning_enabled": True}


@app.post("/figures/generate")
async def generate_figures(body: GenerateFiguresRequest) -> dict:
    """Generate patent figures (Mermaid) and Brief Description of the Drawings."""
    invention = body.model_dump(exclude={"description_text", "num_figures"})
    try:
        result = await generate_patent_figures(
            invention,
            body.description_text,
            num_figures=body.num_figures,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Figure generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate patent figures: {exc}",
        ) from exc

    return result


@app.post("/figures/generate/generic")
async def generate_generic_figures_route(body: GenerateGenericFiguresRequest) -> dict:
    """Generate one supporting Mermaid diagram per flagged section."""
    try:
        result = await generate_generic_figures(
            body.document_type_label,
            body.document_title,
            [section.model_dump() for section in body.sections],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Generic figure generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate figures: {exc}",
        ) from exc

    return result


@app.post("/figures/regenerate-one")
def regenerate_one_figure(body: RegenerateFigureRequest) -> dict:
    """Regenerate a single patent figure with a unique Mermaid diagram type."""
    invention = body.model_dump(
        exclude={"description_text", "figure_number", "existing_figures"}
    )
    existing = [fig.model_dump() for fig in body.existing_figures]
    try:
        result = regenerate_patent_figure(
            invention,
            body.description_text,
            body.figure_number,
            existing,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Single figure regeneration failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to regenerate figure: {exc}",
        ) from exc

    return result


@app.post("/figures/regenerate-one/generic")
def regenerate_generic_figure_route(body: RegenerateGenericFigureRequest) -> dict:
    """Regenerate a single supporting Mermaid diagram for a non-patent document."""
    existing = [fig.model_dump() for fig in body.existing_figures]
    try:
        result = regenerate_generic_figure(
            body.document_type_label,
            body.document_title,
            body.section_id,
            body.section_name,
            body.section_content,
            body.figure_number,
            existing,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMUnavailableError:
        raise
    except Exception as exc:
        log.exception("Generic single figure regeneration failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to regenerate figure: {exc}",
        ) from exc

    return result


@app.post("/figures/render")
def render_figure_png(body: RenderMermaidRequest) -> Response:
    """Render Mermaid source to a PNG image for preview or download."""
    if not body.mermaid.strip():
        raise HTTPException(status_code=400, detail="mermaid is required.")

    try:
        png_bytes = render_mermaid_to_png(body.mermaid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Mermaid render failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to render diagram: {exc}",
        ) from exc

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="figure.png"'},
    )


@app.post("/export/prerender-figures")
def prerender_figures(body: PrerenderFiguresRequest) -> dict:
    """
    Render all figure Mermaid diagrams to PNG in parallel.

    Returns base64-encoded PNGs for the frontend to cache so DOCX/PDF export
    does not re-render diagrams on each download.
    """
    if not body.figures:
        return {"figure_pngs": {}}

    figure_dicts = [fig.model_dump() for fig in body.figures]
    try:
        png_by_number = prerender_figure_pngs(figure_dicts)
    except Exception as exc:
        log.exception("Figure prerender failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to prerender figures: {exc}",
        ) from exc

    return {"figure_pngs": encode_png_map_for_client(png_by_number)}


@app.post("/qa-report")
def qa_report(body: QAReportRequest) -> List[Dict[str, Union[str, List[str]]]]:
    """Return per-section format QA results for a patent draft.

    When ``invention`` is provided, also append patent invention-alignment checks.
    Grant/SOW clients should prefer ``/format-qa-report`` instead.
    """
    report = get_format_qa_report(body.sections, document_type="patent")
    if body.invention is not None:
        report.extend(
            get_invention_alignment_qa_report(body.sections, body.invention.model_dump())
        )
    return report


@app.post("/format-qa-report")
def format_qa_report(
    body: FormatQAReportRequest,
) -> List[Dict[str, Union[str, List[str]]]]:
    """Return format-only QA (empty sections, claim/abstract rules, insufficient source).

    Uses ``document_type`` to select the canonical section list so Grant/SOW drafts
    are not padded with patent section ids. Does not run invention-alignment checks.
    """
    canonical = _FORMAT_QA_CANONICAL_SECTIONS.get(body.document_type)
    if canonical is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported document_type '{body.document_type}'.",
        )
    return get_format_qa_report(
        body.sections,
        canonical_sections=canonical,
        document_type=body.document_type,
    )


@app.post("/export/docx")
def export_docx(body: ExportRequest) -> Response:
    """Export the full patent draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        client_pngs = decode_client_pngs(body.figure_pngs)
        buffer = export_patent_docx(
            body.sections,
            figure_dicts,
            invention_title=body.invention_title,
            filing_info=body.filing_info,
            client_figure_pngs=client_pngs,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate DOCX export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="patent-draft.docx"'},
    )


@app.post("/export/pdf")
def export_pdf(body: ExportRequest) -> Response:
    """Export the full patent draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        client_pngs = decode_client_pngs(body.figure_pngs)
        buffer = export_patent_pdf(
            body.sections,
            figure_dicts,
            invention_title=body.invention_title,
            filing_info=body.filing_info,
            client_figure_pngs=client_pngs,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="patent-draft.pdf"'},
    )


@app.post("/export/grant/docx")
def export_grant_docx_endpoint(body: GrantExportRequest) -> Response:
    """Export the grant application draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_grant_docx(
            body.sections,
            figure_dicts,
            project_title=body.project_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("Grant DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate grant DOCX export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="grant-application.docx"'},
    )


@app.post("/export/grant/pdf")
def export_grant_pdf_endpoint(body: GrantExportRequest) -> Response:
    """Export the grant application draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_grant_pdf(
            body.sections,
            figure_dicts,
            project_title=body.project_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("Grant PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate grant PDF export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="grant-application.pdf"'},
    )


@app.post("/export/sow/docx")
def export_sow_docx_endpoint(body: SOWExportRequest) -> Response:
    """Export the SOW contract draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_sow_docx(
            body.sections,
            figure_dicts,
            engagement_title=body.engagement_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("SOW DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SOW DOCX export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="sow-contract.docx"'},
    )


@app.post("/export/sow/pdf")
def export_sow_pdf_endpoint(body: SOWExportRequest) -> Response:
    """Export the SOW contract draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_sow_pdf(
            body.sections,
            figure_dicts,
            engagement_title=body.engagement_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("SOW PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SOW PDF export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="sow-contract.pdf"'},
    )


@app.post("/export/ada/docx")
def export_ada_docx_endpoint(body: ADAExportRequest) -> Response:
    """Export the ADA bioanalytical report draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_ada_docx(
            body.sections,
            figure_dicts,
            study_title=body.study_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("ADA DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate ADA DOCX export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="ada-bioanalytical-report.docx"'},
    )


@app.post("/export/ada/pdf")
def export_ada_pdf_endpoint(body: ADAExportRequest) -> Response:
    """Export the ADA bioanalytical report draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_ada_pdf(
            body.sections,
            figure_dicts,
            study_title=body.study_title,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("ADA PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate ADA PDF export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="ada-bioanalytical-report.pdf"'},
    )


@app.post("/export/generic/docx")
def export_generic_docx_endpoint(body: GenericExportRequest) -> Response:
    """Export a fully-custom document draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_generic_docx(
            body.sections,
            figure_dicts,
            document_title=body.document_title,
            section_order=body.section_order,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("Generic DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate generic DOCX export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="custom-document.docx"'},
    )


@app.post("/export/generic/pdf")
def export_generic_pdf_endpoint(body: GenericExportRequest) -> Response:
    """Export a fully-custom document draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_generic_pdf(
            body.sections,
            figure_dicts,
            document_title=body.document_title,
            section_order=body.section_order,
            section_labels=body.section_labels,
        )
    except Exception as exc:
        log.exception("Generic PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate generic PDF export: {exc}",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="custom-document.pdf"'},
    )
