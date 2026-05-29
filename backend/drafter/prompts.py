"""
backend/drafter/prompts.py

Patent drafting prompt templates for the opAIda Patent Drafter app.

Each function takes an invention details dict (InventionDetails) and returns
a fully-formed prompt string ready to send to Gemini.

Usage:
    from drafter.prompts import get_prompt, PATENT_SECTIONS
    prompt = get_prompt("field", invention_dict)

InventionDetails dict keys expected:
    - invention_title: str
    - technical_field: str
    - problem_being_solved: str
    - core_technical_solution: str
    - novel_mechanism: str
    - alternative_embodiments: list[str]
    - key_components: list[str]
    - industries: str  (optional, industries/applications)

Context sourced from opAIda Confluence (Rovo, May 2026) and vDoc source docs.
Phase 4 of the Patent Drafter App Build Workflow.
"""

# ─────────────────────────────────────────────────────────────
#  Shared system message used across all section prompts
# ─────────────────────────────────────────────────────────────

PATENT_DRAFTER_SYSTEM = (
    "You are an expert US patent attorney specializing in artificial intelligence, "
    "machine learning, and natural language processing inventions. "
    "Your task is to draft sections of a US provisional patent application with "
    "precise, formal patent language. "
    "Use patent claim conventions throughout: 'comprising' instead of 'including', "
    "'wherein' to add technical conditions, 'configured to' for component capabilities, "
    "'said' or 'the aforementioned' to refer back to previously named elements, "
    "and 'in one embodiment...', 'in another embodiment...' for variations. "
    "Be highly specific and technical. Reference exact AI/ML concepts such as "
    "transformer architectures, attention mechanisms, tokenization, vector embeddings, "
    "cosine similarity, and retrieval-augmented generation where relevant. "
    "Avoid vague business language — focus on what is mechanically novel and inventive. "
    "Output plain text only — no markdown (no **, #, bullet lists, or code fences). "
    "Do not use internal document delimiter markers (%%qa, %%Header 1%%), template "
    "placeholders ({item_1_desc}), or incomplete scaffold text; write complete patent prose."
)


EXTRACT_INVENTION_SYSTEM = (
    "You are a patent analysis expert. Your task is to analyze technical documentation "
    "and extract the key elements needed to write a US provisional patent application. "
    "Be precise and technical. Focus on what is novel and inventive, not just what the "
    "product does as a business matter."
)

EXTRACT_INVENTION_USER = """\
Analyze the following technical documentation and return a JSON object with exactly \
these keys and value types:

- invention_title: str
- technical_field: str (1-2 sentences on the domain)
- problem_being_solved: str (the technical limitation of prior art)
- core_technical_solution: str (how the invention solves it mechanically)
- novel_mechanism: str (the specific technical novelty — what no one else does)
- alternative_embodiments: list[str] (variations of the invention)
- key_components: list[str] (main system components or method steps)

Technical documentation:
{combined_text}
"""

EXTRACT_GROUP_OVERVIEW_USER = """\
Analyze the technical documentation and return a JSON object with exactly these keys:

- invention_title: str
- technical_field: str (1-2 sentences on the domain)
- problem_being_solved: str (the technical limitation of prior art)

Technical documentation:
{combined_text}
"""

EXTRACT_GROUP_SOLUTION_USER = """\
Analyze the technical documentation and return a JSON object with exactly these keys:

- core_technical_solution: str (how the invention solves it mechanically)
- novel_mechanism: str (the specific technical novelty — what no one else does)

Technical documentation:
{combined_text}
"""

EXTRACT_GROUP_STRUCTURE_USER = """\
Analyze the technical documentation and return a JSON object with exactly these keys:

- alternative_embodiments: list[str] (variations of the invention)
- key_components: list[str] (main system components or method steps)

Technical documentation:
{combined_text}
"""


# ─────────────────────────────────────────────────────────────
#  Helper: format invention details into a context block
# ─────────────────────────────────────────────────────────────

def _format_invention_context(invention: dict) -> str:
    """
    Formats the InventionDetails dict into a readable context block
    to include in each section prompt.
    """
    embodiments = invention.get("alternative_embodiments", [])
    embodiments_str = (
        "\n".join(f"  - {e}" for e in embodiments)
        if embodiments
        else "  - Not specified"
    )

    components = invention.get("key_components", [])
    components_str = (
        "\n".join(f"  - {c}" for c in components)
        if components
        else "  - Not specified"
    )

    industries = invention.get("industries", "Not specified")

    return f"""
INVENTION DETAILS:
  Title: {invention.get("invention_title", "Untitled")}
  Technical Field: {invention.get("technical_field", "Not specified")}
  Problem Being Solved: {invention.get("problem_being_solved", "Not specified")}
  Core Technical Solution: {invention.get("core_technical_solution", "Not specified")}
  Novel Mechanism: {invention.get("novel_mechanism", "Not specified")}
  Key Components:
{components_str}
  Alternative Embodiments:
{embodiments_str}
  Target Industries / Applications: {industries}
""".strip()


# ─────────────────────────────────────────────────────────────
#  Section 1: Field of the Invention
# ─────────────────────────────────────────────────────────────

def get_field_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the 'Field of the Invention' section.

    This section is 2-3 sentences naming the technical domain only —
    no description of the invention itself.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the 'Field of the Invention' section for a US provisional patent application.

REQUIREMENTS:
- Exactly 2-3 sentences in formal patent language
- Names the technical domain only — do NOT describe the invention or its novelty
- Situates the invention within its technical field (AI, NLP, document processing, etc.)
- Begin with: 'The present invention relates to...'
- End the section after the 3rd sentence. No additional commentary.

Draft the section now:"""


# ─────────────────────────────────────────────────────────────
#  Section 2: Background of the Invention
# ─────────────────────────────────────────────────────────────

def get_background_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the 'Background of the Invention' section.

    This section describes the problem and prior art limitations — never the solution.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the 'Background of the Invention' section for a US provisional patent application.

REQUIREMENTS:
- Length: 3-5 paragraphs
- Describe the technical problem that existed before this invention
- Reference limitations of prior art approaches WITHOUT citing specific patents or companies
- Build a clear technical case for why the problem is significant
- Use language like: 'conventional methods fail to...', 'existing approaches suffer from...',
  'prior art systems are limited by...', 'this results in a degradation of...'
- Do NOT describe the solution at any point in this section
- Use formal patent language throughout
- End with the phrase: 'Accordingly, there remains a need for improved methods and systems
  that address these deficiencies.'

Focus especially on the specific technical limitations of:
1. Fixed-size/sentence-boundary chunking methods and their loss of structural context
2. How structural context loss degrades downstream retrieval quality in RAG systems
3. The failure of existing vector indexing approaches to preserve document hierarchy

Draft the section now:"""


# ─────────────────────────────────────────────────────────────
#  Section 3: Summary of the Invention
# ─────────────────────────────────────────────────────────────

def get_summary_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the 'Summary of the Invention' section.

    This section briefly introduces the invention and its key technical advantages.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the 'Summary of the Invention' section for a US provisional patent application.

REQUIREMENTS:
- Length: 2-3 paragraphs
- Briefly introduce the invention and how it addresses the prior art limitations
- Name the key technical advantages without providing full technical detail
  (that goes in the Detailed Description)
- Reference that the system and method are described in greater detail below
- Use language like: 'In one aspect, the present invention provides...',
  'In another aspect, the invention provides a method comprising...'
- List 3-5 key technical advantages as a brief inline list within the prose
- Do NOT use bullet points — write in prose paragraph form
- Formal patent language throughout

Draft the section now:"""


# ─────────────────────────────────────────────────────────────
#  Section 4: Detailed Description of Preferred Embodiments
# ─────────────────────────────────────────────────────────────

def get_description_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the 'Detailed Description of Embodiments'.

    This is the most critical section — must be technically comprehensive (500+ words).
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the 'Detailed Description of Preferred Embodiments' section for a US provisional
patent application. This is the most important section of the patent — it must be technically
comprehensive and leave no ambiguity about how the invention works.

REQUIREMENTS:
- Minimum length: 600 words. Be thorough.
- Structure as follows (use these as sub-headings in the prose):
  1. System Overview — describe the overall architecture and main components as an integrated system
  2. Component-by-Component Description — describe each key component in detail, what it does
     and how it interfaces with adjacent components
  3. Method Steps — describe the full processing flow as numbered steps (Step 1, Step 2, etc.)
     from document ingestion through final output
  4. Data Flow — describe precisely what data (types, formats, schemas) enters and exits
     each processing stage
  5. Alternative Embodiments — describe at least 2 concrete variations of the invention
     using 'In one embodiment...' and 'In another embodiment...'
- Where natural, reference drawing figures as FIG. 1 (system), FIG. 2 (method), and FIG. 3
  (data flow), e.g. 'as illustrated in FIG. 1'. Use reference numerals 200, 202, 204, ...
  consistently for named components (component name followed by numeral, e.g.
  'LLM Document Understanding Engine 200').

PATENT LANGUAGE CONVENTIONS (use throughout):
- 'comprises' instead of 'includes'
- 'wherein' to add technical conditions
- 'configured to' for component capabilities
- 'said' or 'the aforementioned' to refer to previously named elements
- 'in one embodiment...', 'in another embodiment...' for variations

TECHNICAL SPECIFICITY REQUIRED:
- Reference transformer architecture, attention mechanisms, tokenization where applicable
- Specify the structural metadata schema stored with each chunk (section type, position,
  parent-child relationships, contextual markers)
- Describe the vector embedding process and how metadata is stored alongside embeddings
- Explain hybrid search mechanics (vector similarity + structural metadata filtering)
- Reference specific data structures (e.g. JSON schema for chunk metadata)
- Do not copy internal chunk delimiter syntax or template braces from source documents
  (write 'qa' not '%%qa'; never leave {{item_1_desc}}-style placeholders)
- For numbered method or component lists, put each item on its own line. Use a short
  title after the number, then a colon and the description (e.g. '1. Ingestion: The
  system receives...'), not %%wrapped%% headers or merged title+body on one line

Draft the section now:"""


# ─────────────────────────────────────────────────────────────
#  Section 5: Claims (Informal, for Provisional Application)
# ─────────────────────────────────────────────────────────────

def get_claims_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting informal patent claims.

    Provisional applications don't require formal claims, but including
    informal claims helps establish the scope of the intended protection.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write 8-10 informal patent claims for a US provisional patent application.

NOTE: These are informal claims for a provisional — they establish intended scope.
They will be formalized by a patent attorney in the non-provisional application.

CLAIM STRUCTURE REQUIRED:
1. One broad independent SYSTEM claim (covers the widest possible version of the invention)
2. One broad independent METHOD claim
3. Three dependent claims narrowing the SYSTEM claim with specific technical detail
4. Two dependent claims narrowing the METHOD claim
5. One dependent claim covering a specific AI model type or architecture used
6. One dependent claim covering the metadata schema stored with each chunk
7. (Optional) One dependent claim covering a specific industry application or use case

FORMATTING RULES:
- Number each claim (1, 2, 3, ...)
- Independent system claims begin: 'A system comprising...'
- Independent method claims begin: 'A method comprising...'
- Dependent claims begin: 'The system of claim N, wherein...' or 'The method of claim N,
  further comprising...'
- Each claim is a single sentence (no periods mid-claim)
- Use 'comprising', 'wherein', 'configured to' throughout
- Each dependent claim adds ONE specific technical limitation

Draft the claims now:"""


# ─────────────────────────────────────────────────────────────
#  Section 6: Abstract
# ─────────────────────────────────────────────────────────────

def get_abstract_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the patent Abstract.

    USPTO requires: one paragraph, ≤150 words, no 'The present invention' opening.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the Abstract for a US provisional patent application.

USPTO REQUIREMENTS (these are strict):
- Exactly ONE paragraph — no line breaks
- Maximum 150 words (count carefully)
- Do NOT begin with 'The present invention' — this is prohibited by USPTO rules
- Written in the third person
- Formal, technical patent language

CONTENT TO COVER (in this order, within 150 words):
1. The technical field
2. The problem in prior art
3. The core technical solution
4. The key novel mechanism
5. The primary benefit/advantage

Draft the abstract now (output ONLY the abstract text, no word count or commentary):"""


# ─────────────────────────────────────────────────────────────
#  Patent figures (Mermaid diagrams)
# ─────────────────────────────────────────────────────────────

FIGURES_SYSTEM = (
    "You are an expert US patent illustrator and technical writer. "
    "You produce black-and-white patent-style line-art diagrams as valid Mermaid flowchart syntax. "
    "Each component must display its reference numeral as plain Arabic digits (no brackets) "
    "on a separate line below the component name, e.g. A[\"Ingestion module<br/>200\"]. "
    "Use reference numerals (200, 202, 204, ...) matching the detailed description. "
    "Keep diagrams simple: rectangles for modules, black borders on white fill, "
    "arrows for data/control flow, no colors or styling. "
    "Output only valid JSON matching the requested schema."
)


def get_figures_prompt(invention: dict, description_text: str = "") -> str:
    """
    Returns the Gemini prompt for generating patent figures as Mermaid diagrams.
    """
    context = _format_invention_context(invention)
    description_block = ""
    if description_text.strip():
        description_block = f"""
DETAILED DESCRIPTION (use for consistency of names, steps, and reference numerals):
{description_text.strip()[:12000]}
"""

    return f"""{context}
{description_block}

TASK: Generate patent drawing content for a US provisional patent application covering an AI/ML invention.

Return a JSON object with exactly these keys:
- brief_description_of_drawings: str — one paragraph per figure, each starting with "FIG. N is a ..." (formal patent style)
- figures: list of objects, each with:
  - number: int (1, 2, 3)
  - title: str (short title, e.g. "System architecture")
  - brief_description: str (single sentence for the figure caption, starting with "FIG. N is...")
  - reference_numerals: object mapping numeral strings to component names (e.g. {{"200": "ingestion module", "202": "structural parser"}})
  - mermaid: str — valid Mermaid flowchart for black-and-white patent figures

REQUIREMENTS:
- Produce exactly 3 figures:
  1. FIG. 1 — system block diagram of key components and their connections (use key_components from invention details)
  2. FIG. 2 — method flowchart with numbered method steps from ingestion through output
  3. FIG. 3 — data flow diagram showing data types/formats between stages
- Mermaid rules:
  - Use "flowchart TB" or "flowchart LR" only
  - Node labels MUST show the component name on the first line and the reference numeral alone
    on the second line using <br/>, e.g. A["Ingestion module<br/>200"]
  - Reference numerals must be plain Arabic digits with no brackets or parentheses
  - No classDef, no style directives, no colors, no subgraph styling
  - Do NOT use subgraphs — use branching node chains for multi-column layouts instead
  - Do NOT use direction statements inside the diagram (only the top-level flowchart TB/LR)
  - Maximum 12 nodes per diagram
  - Use --> for arrows; label critical flows on arrows when helpful
- Layout rules (critical for Word export — target ~4:3 aspect ratio on one page):
  - Do NOT draw a single long horizontal row (max 3 nodes before branching or wrapping)
  - Do NOT draw a single long vertical column (max 5 nodes before splitting into parallel branches)
  - Use branching and parallel columns to keep each diagram compact and roughly square
  - FIG. 1: flowchart TB with components arranged in 2 parallel columns
  - FIG. 2: flowchart TB with method steps in a zigzag or two-column layout
  - FIG. 3: flowchart TB with data stages split across parallel branches (not one straight chain)
- reference_numerals must use even numbers starting at 200 (200, 202, 204, ...) and match labels in mermaid
- The same reference numeral must designate the same component across all three figures
- brief_description_of_drawings must list FIG. 1, FIG. 2, and FIG. 3 in order

Output ONLY the JSON object, no markdown fences."""


# ─────────────────────────────────────────────────────────────
#  Constants and dispatcher
# ─────────────────────────────────────────────────────────────

PATENT_SECTIONS = [
    "field",
    "background",
    "summary",
    "description",
    "claims",
    "abstract",
]

_SECTION_DISPATCH = {
    "field": get_field_prompt,
    "background": get_background_prompt,
    "summary": get_summary_prompt,
    "description": get_description_prompt,
    "claims": get_claims_prompt,
    "abstract": get_abstract_prompt,
}


def get_prompt(section: str, invention: dict) -> str:
    """
    Dispatcher: returns the correct prompt for the given patent section name.

    Args:
        section: One of PATENT_SECTIONS (e.g. 'field', 'background', 'claims')
        invention: InventionDetails dict with keys matching _format_invention_context

    Returns:
        A fully-formed prompt string ready to send to Gemini as the user message.
        Pair with PATENT_DRAFTER_SYSTEM as the system message.

    Raises:
        ValueError: If section name is not recognized.

    Example:
        from drafter.llm_client import generate_text
        from drafter.prompts import PATENT_DRAFTER_SYSTEM, get_prompt

        content = generate_text(
            PATENT_DRAFTER_SYSTEM,
            get_prompt("field", invention),
        )
    """
    if section not in _SECTION_DISPATCH:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {PATENT_SECTIONS}"
        )
    return _SECTION_DISPATCH[section](invention)
