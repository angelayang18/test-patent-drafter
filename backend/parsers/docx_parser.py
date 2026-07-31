"""Extract text from DOCX files using python-docx."""

import re
from io import BytesIO

from docx import Document


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


def extract_text_from_docx(file_bytes: bytes) -> str:
    """
    Extract all paragraph text from a Word document provided as raw bytes.

    Each non-empty paragraph is introduced with a header of the form
    ``=== Paragraph N ===``, mirroring the PPTX slide-header convention so
    paragraph boundaries survive the flat-string pipeline used for
    retrieval/citations. Numbering is sequential over non-empty paragraphs only.

    Args:
        file_bytes: Raw DOCX file contents.

    Returns:
        Extracted paragraph text with per-paragraph markers.

    Raises:
        ValueError: If ``file_bytes`` is empty.
        RuntimeError: If the document cannot be opened or text extraction fails.
    """
    if not file_bytes:
        raise ValueError("DOCX input is empty; cannot extract text from zero bytes.")

    try:
        doc = Document(BytesIO(file_bytes))
        paragraph_sections: list[str] = []
        paragraph_number = 0
        for paragraph in doc.paragraphs:
            text = paragraph.text.strip()
            if not text:
                continue
            paragraph_number += 1
            header = f"=== Paragraph {paragraph_number} ==="
            paragraph_sections.append(f"{header}\n{text}")

        return _clean_extracted_text("\n\n".join(paragraph_sections))
    except ValueError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Failed to extract text from DOCX: {exc}") from exc
