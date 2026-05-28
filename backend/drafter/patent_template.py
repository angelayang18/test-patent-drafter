"""
US provisional patent specification template (opAIda Patent Filing Guide, May 2026).

Each section agent receives only its slot instructions plus invention details —
not text from other sections — to avoid cross-section context poisoning.
"""

from __future__ import annotations

PROVISIONAL_FILING_OVERVIEW = """\
PROVISIONAL PATENT APPLICATION TEMPLATE (USPTO / 35 U.S.C. §111(b)):
This draft follows the opAIda Patent Filing Guide structure for a US provisional specification.
The written description must meet 35 U.S.C. §112(a) enablement: a person skilled in AI/NLP must
be able to reproduce the invention from the text alone.

Required specification sections (in filing order):
  1. Title of the Invention — clear, specific (from invention_title in context)
  2. Field of the Invention — one paragraph on the technical domain only
  3. Background / Prior Art — technical problem and limitations of prior approaches
  4. Summary of the Invention — high-level overview of what the invention is and does
  5. Detailed Description of Embodiments — step-by-step technical walkthrough (most critical)
  6. Drawings / Diagrams — handled separately (FIG. 1, FIG. 2, …)
  7. Claims — informal claims recommended for provisional scope
  8. Abstract — optional for provisional; if included: one paragraph, ≤150 words

AI/software inventions must describe HOW, not only WHAT: system architecture, data flow,
algorithms, novel mechanisms, alternative embodiments, and specific parameters (models,
tokenization, embeddings, etc.). Avoid vague phrases like "the AI processes the data."
"""

SECTION_TEMPLATE_INSTRUCTIONS: dict[str, str] = {
    "field": """\
TEMPLATE SLOT: Field of the Invention (Required)
- One short section: 2–3 sentences in formal patent language
- Names the technical domain only (e.g., NLP, document processing, ML)
- Begin with "The present invention relates to..."
- Do NOT describe the invention, solution, or novelty in this section
""",
    "background": """\
TEMPLATE SLOT: Background of the Invention / Prior Art (Required)
- 3–5 paragraphs in formal patent language
- Describe the technical problem and why prior art approaches are deficient
- Use phrases such as "conventional methods fail to...", "prior art systems are limited by..."
- Do NOT describe the inventive solution in this section
""",
    "summary": """\
TEMPLATE SLOT: Summary of the Invention (Required)
- High-level overview of what the invention is and what it accomplishes
- May reference major components at a high level
- Bridge between background (problem) and detailed description (how)
""",
    "description": """\
TEMPLATE SLOT: Detailed Description of Embodiments (Required — most critical)
Per the filing guide, include where applicable:
  - System architecture (block-level components and connections)
  - Data flow (inputs, transformations, outputs)
  - Algorithms and logic (steps, rules, model architectures)
  - Novel mechanisms vs. prior art
  - Alternative embodiments
  - Specific parameters (formats, model types, chunking, embeddings, indexing)
Use "comprising", "wherein", "configured to", and "in one embodiment..." throughout.
""",
    "claims": """\
TEMPLATE SLOT: Informal Claims (Optional for provisional — strongly recommended)
- Establish intended scope for a future non-provisional
- Independent system claim, independent method claim, dependent claims with technical detail
- Use "A system comprising...", "A method comprising...", "The system of claim N, wherein..."
""",
    "abstract": """\
TEMPLATE SLOT: Abstract (Optional for provisional — good practice)
- Exactly ONE paragraph, maximum 150 words
- Do NOT begin with "The present invention"
- Third person; cover field, problem, solution, novelty, and primary benefit
""",
}


def get_section_template_instructions(section: str) -> str:
    """Return filing-guide template instructions for a single specification section."""
    return SECTION_TEMPLATE_INSTRUCTIONS.get(
        section,
        "Follow the provisional specification template for this section.",
    )
