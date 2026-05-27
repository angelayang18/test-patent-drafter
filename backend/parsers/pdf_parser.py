"""Extract text from PDF files using PyMuPDF."""

import re

import fitz


def _clean_extracted_text(text: str) -> str:
    """Normalize whitespace: trim lines and collapse runs of blank lines."""
    lines: list[str] = []
    prev_blank = False
    for raw_line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        if not line:
            if not prev_blank:
                lines.append("")
            prev_blank = True
        else:
            lines.append(line)
            prev_blank = False
    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract all text from a PDF provided as raw bytes.

    Opens the document with PyMuPDF (fitz), reads every page, and returns a
    single cleaned string with excess whitespace and blank lines removed.

    Args:
        file_bytes: Raw PDF file contents.

    Returns:
        Extracted text from all pages, joined with newlines.

    Raises:
        ValueError: If ``file_bytes`` is empty or not valid PDF data.
        RuntimeError: If the PDF cannot be opened or text extraction fails.
    """
    if not file_bytes:
        raise ValueError("PDF input is empty; cannot extract text from zero bytes.")

    doc = None
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        if doc.page_count == 0:
            return ""

        page_texts: list[str] = []
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            page_text = page.get_text()
            if page_text:
                page_texts.append(page_text)

        combined = "\n".join(page_texts)
        return _clean_extracted_text(combined)
    except ValueError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Failed to extract text from PDF: {exc}") from exc
    finally:
        if doc is not None:
            doc.close()
