"""Patent Drafter FastAPI application."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from drafter.extractor import extract_invention_details, extract_invention_field
from drafter.figures import generate_patent_figures
from drafter.sections import draft_section
from exporter.docx_export import export_patent_docx
from exporter.mermaid_render import render_mermaid_to_png
from exporter.pdf_export import export_patent_pdf
from parsers.confluence import ConfluenceClient
from parsers.docx_parser import extract_text_from_docx
from parsers.pdf_parser import extract_text_from_pdf
from parsers.pptx_parser import extract_text_from_pptx
from parsers.web_scraper import scrape_url

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

log = logging.getLogger(__name__)

app = FastAPI(title="Patent Drafter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".pptx"}


class ConfluenceConnectRequest(BaseModel):
    url: str
    space_key: str
    api_token: str


class ScrapeRequest(BaseModel):
    url: str


class ExtractRequest(BaseModel):
    combined_text: str


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
    current: InventionDetails | None = None


class DraftRequest(InventionDetails):
    section: str


class PatentFigureModel(BaseModel):
    number: int
    title: str
    brief_description: str
    reference_numerals: dict[str, str] = Field(default_factory=dict)
    mermaid: str


class GenerateFiguresRequest(InventionDetails):
    description_text: str = ""


class RenderMermaidRequest(BaseModel):
    mermaid: str


class ExportRequest(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)
    figures: list[PatentFigureModel] = Field(default_factory=list)


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
def health() -> dict[str, str]:
    return {"status": "ok"}


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


@app.post("/extract/field")
def extract_field(body: ExtractFieldRequest) -> dict:
    """Re-extract a single invention detail field from combined source text."""
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
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Field extraction failed for %s", body.field)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract field '{body.field}': {exc}",
        ) from exc


@app.post("/extract")
def extract_details(body: ExtractRequest) -> dict:
    """Extract structured invention details from combined source text."""
    if not body.combined_text.strip():
        raise HTTPException(status_code=400, detail="combined_text is required.")

    try:
        return extract_invention_details(body.combined_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Invention extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract invention details: {exc}",
        ) from exc


@app.post("/draft")
def draft_patent_section(body: DraftRequest) -> dict:
    """Draft a single patent section from extracted invention details."""
    if not body.section.strip():
        raise HTTPException(status_code=400, detail="section is required.")

    invention = body.model_dump(exclude={"section"})
    try:
        content = draft_section(invention, body.section.strip())
    except Exception as exc:
        log.exception("Section drafting failed for %s", body.section)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to draft section '{body.section}': {exc}",
        ) from exc

    return {"section": body.section.strip(), "content": content}


@app.post("/figures/generate")
def generate_figures(body: GenerateFiguresRequest) -> dict:
    """Generate patent figures (Mermaid) and Brief Description of the Drawings."""
    invention = body.model_dump(exclude={"description_text"})
    try:
        result = generate_patent_figures(invention, body.description_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Figure generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate patent figures: {exc}",
        ) from exc

    return result


@app.post("/figures/render")
def render_figure_png(body: RenderMermaidRequest) -> StreamingResponse:
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

    return StreamingResponse(
        png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="figure.png"'},
    )


@app.post("/export/docx")
def export_docx(body: ExportRequest) -> StreamingResponse:
    """Export the full patent draft as a downloadable DOCX file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        figure_dicts = [fig.model_dump() for fig in body.figures]
        buffer = export_patent_docx(body.sections, figure_dicts)
    except Exception as exc:
        log.exception("DOCX export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate DOCX export: {exc}",
        ) from exc

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="patent-draft.docx"'},
    )


@app.post("/export/pdf")
def export_pdf(body: ExportRequest) -> StreamingResponse:
    """Export the full patent draft as a downloadable PDF file."""
    if not body.sections:
        raise HTTPException(status_code=400, detail="sections are required.")

    try:
        buffer = export_patent_pdf(body.sections)
    except Exception as exc:
        log.exception("PDF export failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF export: {exc}",
        ) from exc

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="patent-draft.pdf"'},
    )
