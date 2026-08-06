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

- invention_title: str (as short and specific as possible; maximum 15 words; no marketing adjectives or taglines)
- technical_field: str (1-2 sentences on the domain)
- problem_being_solved: str (the technical limitation of prior art)
- core_technical_solution: str (how the invention works mechanically — components, steps, and data flows; do not leave empty when the source describes system operation)
- novel_mechanism: str (the specific technical novelty vs prior art — structural or algorithmic distinction; do not leave empty when the source describes distinctive technical approaches)
- alternative_embodiments: list[str] (variations of the invention)
- key_components: list[str] (main system components or method steps)

Technical documentation:
{combined_text}
"""

EXTRACT_GROUP_OVERVIEW_USER = """\
Analyze the technical documentation and return a JSON object with exactly these keys:

- invention_title: str (as short and specific as possible; maximum 15 words; no marketing adjectives or taglines)
- technical_field: str (1-2 sentences on the domain)
- problem_being_solved: str (the technical limitation of prior art)

Technical documentation:
{combined_text}
"""

EXTRACT_GROUP_SOLUTION_USER = """\
Analyze the technical documentation and return a JSON object with exactly these keys \
(use these exact snake_case key names — do not rename, omit, or nest them):

- core_technical_solution: str — How the invention works mechanically: the main components, \
processing steps, data flows, and architecture that solve the technical problem. Write 2-5 \
sentences grounded in the source material. Do not leave this empty if the documentation \
describes how the system or method operates.
- novel_mechanism: str — The specific technical feature that distinguishes this invention from \
prior art: what is structurally or algorithmically different, not merely a business benefit. \
Write 1-3 sentences. Do not leave this empty if the documentation describes distinctive \
technical approaches, algorithms, or integrations.

IMPORTANT: Both fields are required. If the documentation describes any technical system, \
method, or algorithm — even at a high level — you must produce non-empty values. Never \
return empty strings for these fields.

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

    This section is one sentence naming the technical domain only —
    no description of the invention itself.
    """
    context = _format_invention_context(invention)
    return f"""{context}

TASK: Write the 'Field of the Invention' section for a US provisional patent application.

REQUIREMENTS:
- Exactly ONE sentence in formal patent language — no more
- Names the technical domain only — do NOT describe the invention, solution, or novelty
- Use plain language; avoid jargon and acronyms unless essential
- Begin with: 'The present invention relates to...'
- End after that single sentence. No additional commentary.

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
- Set the stage: describe the unfulfilled technical need and why the problem is significant
- Reference limitations of prior art approaches WITHOUT citing specific patents or companies
- Build a clear technical case for why prior approaches are deficient
- Use language like: 'conventional methods fail to...', 'existing approaches suffer from...',
  'prior art systems are limited by...', 'this results in a degradation of...'
- Do NOT describe the solution at any point in this section
- Avoid over-stating prior art or making admissions that could be cited against the applicant
  during prosecution (background statements may be treated as prior art)
- Use formal patent language throughout
- End with the phrase: 'Accordingly, there remains a need for improved methods and systems
  that address these deficiencies.'
- Ground the background exclusively in the invention details above (especially Technical Field
  and Problem Being Solved). Do not introduce domain-specific prior-art themes (e.g. RAG,
  chunking, vector indexing, or any other technology) unless those themes appear in the
  invention details. If the details are largely missing, marked 'N/A', or too sparse to
  identify a real technical problem, state that plainly instead of inventing prior-art context.

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
- Explicitly connect the background problem to the inventive solution (problem → solution bridge)
- Briefly introduce the invention and how it addresses the prior art limitations
- Name the key technical advantages without providing full technical detail
  (that goes in the Detailed Description)
- Broad characterization of benefits at a high level (functional advantages in prose)
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
- Structure as follows (use these as sub-headings, with a colon before the body text):
  0. Definitions (when applicable): define coined or special terms using
     'As used herein, [term] means [definition]' before using them elsewhere
  1. System Overview: describe the overall architecture and main components as an integrated system
  2. Component-by-Component Description: describe each key component in detail, what it does,
     how it interfaces with adjacent components, and the advantages of key features
  3. Method Steps: describe the full processing flow as numbered steps (Step 1, Step 2, etc.)
     from document ingestion through final output
  4. Data Flow: describe precisely what data (types, formats, schemas) enters and exits
     each processing stage
  5. Alternative Embodiments: describe at least 2 concrete variations using breadth-preserving
     language such as 'In certain embodiments, the system includes, but is not limited to...'
     and 'In one embodiment...' / 'In another embodiment...'
- Disclose the best mode of practicing the invention where applicable under 35 U.S.C. §112(a)
FIGURE REFERENCE REQUIREMENTS (mandatory — USPTO sample format):
- Reference figures where they illustrate the text, e.g. 'as shown in FIG. 1',
  'as illustrated in FIG. 2'
- Every named component MUST include a reference numeral on first mention, e.g.
  'parser module 202', 'indexing engine 204' (component name followed by numeral)
- Use reference numerals 200, 202, 204, 206... (even numbers) consistently throughout
- Assign sub-component numerals for nested parts: vision-language model 203 (within parsing
  module 202), vector database 209 (within indexing engine 208), cluster index 211 (within
  retrieval module 210)
- Tie physical or structural descriptions to figure labels, e.g. 'the ingestion module 200
  receives documents... as shown in FIG. 1'
- Every element described here must also appear in the drawings (and vice versa) — do not
  name components or steps that would not be shown in a corresponding figure
- Do NOT describe components in generic terms without figure ties and reference numerals

PATENT LANGUAGE CONVENTIONS (use throughout):
- 'comprises' instead of 'includes'
- 'wherein' to add technical conditions
- 'configured to' for component capabilities
- 'said' or 'the aforementioned' to refer to previously named elements
- 'in one embodiment...', 'in another embodiment...' for variations

TECHNICAL SPECIFICITY REQUIRED:
- Be highly specific about concrete mechanisms, data structures, algorithms, interfaces,
  and processing steps — avoid vague business language
- Scope all technical detail exclusively to the domain described in the invention details
  above. When those details actually describe an AI/ML invention, reference transformers,
  embeddings, RAG, tokenization, etc. as applicable; do not default to AI/ML (or any other)
  themes when the details do not support them
- Name specific schemas, data structures, and algorithms only when grounded in the
  invention details — do not invent domain-specific technical detail
- If the invention details are largely missing, marked 'N/A', or too sparse to enable a
  technical description, state that plainly instead of inventing plausible technical content
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

TASK: Write informal patent claims for a US provisional patent application.

NOTE: These are informal claims for a provisional — they establish intended scope.
They will be formalized by a patent attorney in the non-provisional application.
The USPTO sample does not require a specific number of claims — only that claims are
numbered consecutively in Arabic numerals starting at 1.

RECOMMENDED CONTENT (adapt count to the invention — typically 8–12 claims):
- At least one broad independent SYSTEM claim (widest version of the invention)
- At least one broad independent METHOD claim
- Dependent claims narrowing the system and method claims with specific technical detail
- Dependent claims covering notable AI model types, metadata schemas, or use cases where
  they add meaningful scope

Number all claims consecutively from 1 with no gaps or duplicates.

FORMATTING RULES (USPTO sample format — follow exactly):
- Put each claim on its own line, starting with the claim number (1., 2., 3., ...)
- Leave a blank line between consecutive claims
- Each claim must be exactly ONE complete sentence ending with a period
- Independent claims with multiple elements after 'comprising:' must list each element
  on its own indented line, separated by semicolons, with 'and' before the final element
- NEVER join multiple method steps on one line — each step gets its own indented line
- Example format (system claim):
  1. A system comprising:
     a processor configured to receive a document;
     a parser module 202 configured to identify structural elements in the document; and
     an indexing module 204 configured to store embeddings with structural metadata.
- Example format (method claim — one step per line):
  2. A method comprising:
     receiving a document through an ingestion module 200;
     parsing the document using a vision-language model 203 to extract hierarchical structure;
     generating structurally-aware chunks with parent-child metadata;
     indexing the chunks in a vector database 209; and
     executing a cascading retrieval operation using a cluster index 211.
- Independent system claims begin: 'A system comprising:'
- Independent method claims begin: 'A method comprising:'
- Dependent claims begin: 'The system of claim N, wherein...' or 'The method of claim N,
  further comprising...'
- Use 'comprising', 'wherein', 'configured to' throughout
- Each dependent claim adds ONE specific technical limitation
- Keep each claim concise — avoid run-on sentences with more than 4-5 elements
- Capitalize standard technical acronyms consistently with the detailed description,
  e.g. PDF, GPU, JSON, AI, API, LANCZOS, vLLM, OCR, RAG, LLM — never lowercase forms
  like 'pdf', 'gpu', 'json', 'ai', 'api', 'lanczos', or 'vllm'

Draft the claims now:"""


# ─────────────────────────────────────────────────────────────
#  Section 6: Abstract
# ─────────────────────────────────────────────────────────────

def get_abstract_prompt(invention: dict) -> str:
    """
    Returns the Gemini prompt for drafting the patent Abstract.

    USPTO requires: one paragraph, ≤150 words, no 'The present invention' opening.
    Content must state what is new in the art — not recap the invention like Summary.
    """
    context = _format_invention_context(invention)
    novel = invention.get("novel_mechanism", "Not specified")
    return f"""{context}

TASK: Write the Abstract for a US provisional patent application.

PURPOSE: Disclose what is NEW in the art in one paragraph — not a shortened Summary of the
Invention. A reader should learn the inventive advance and how it differs from prior art,
not receive a feature walkthrough or system overview.

USPTO REQUIREMENTS (strict):
- Exactly ONE paragraph — no line breaks
- Target 100-120 words; hard maximum 150 words (count carefully before finishing)
- Do NOT begin with 'The present invention' — prohibited by USPTO rules
- Third person; formal, technical patent language

CONTENT — NOVELTY FIRST (allocate most words here):
- Center the abstract on this specific technical novelty: {novel}
- Open with the inventive technical advance or distinguishing mechanism — not the field alone
- In one short clause, note the prior-art limitation the novelty overcomes; do not dwell on background
- Name only the minimum structure needed to explain WHY the mechanism is novel; omit exhaustive
  architecture, numbered method steps, and embodiment lists
- Close with the primary technical benefit that follows directly from that novelty

DO NOT write a summary. Avoid:
- 'The system comprises...' followed by a component inventory
- Step-by-step pipeline recaps (e.g. ingestion → parsing → indexing → retrieval)
- Restating every key component from the invention details
- Summary-style phrasing ('In one aspect...', lists of multiple advantages)
- Generic capability statements without the distinguishing mechanism
  ('an AI system that processes documents', 'a method for analyzing data')

Draft the abstract now (output ONLY the abstract text, no word count or commentary):"""


# ─────────────────────────────────────────────────────────────
#  Patent figures (Mermaid diagrams)
# ─────────────────────────────────────────────────────────────

FIGURES_SYSTEM = (
    "You are an expert US patent illustrator and technical writer. "
    "You produce black-and-white patent-style line-art diagrams as valid Mermaid syntax. "
    "Provisional applications have no required minimum number of figures — the applicant "
    "chooses how many drawings to include. "
    "Each figure MUST use the exact diagram type assigned to its figure number "
    "(FIG. 1: graph TD, FIG. 2: flowchart TD, FIG. 3: flowchart TD, FIG. 4+: classDiagram). "
    "FIG. 2 and FIG. 3 both use flowchart TD but MUST differ structurally "
    "(method/process steps vs data/message flow). "
    "Do NOT use graph LR or sequenceDiagram for any figure. "
    "Do NOT use flowchart TD for figures 4 or higher. "
    "Do NOT produce two figures with the same visual structure. "
    "Each figure MUST use a different structural layout — "
    "never repeat the same vertical linear chain of components across figures. "
    "All diagrams will be rendered on US letter paper (8.5×11 inches) with 1-inch margins "
    "in portrait orientation. Prefer tall/vertical layouts over wide/horizontal ones. "
    "Limit nodes per row to 4 in flowcharts. "
    "Wider diagrams will be unreadable when printed on letter-size paper. "
    "Each component must display its reference numeral as plain Arabic digits (no brackets). "
    "In flowchart/graph diagrams, include the numeral in the plain-text label, "
    "e.g. A[\"Ingestion module 200\"]. "
    "Do NOT use HTML tags like <br/>, <b>, or any HTML in Mermaid node labels — "
    "Mermaid runs in strict mode and HTML inside labels causes parse errors. "
    "Use plain text only; keep labels short if needed. "
    "Use reference numerals (200, 202, 204, ...) matching the detailed description exactly. "
    "NEVER assign the same numeral to two different parts — each numeral designates one part only. "
    "Keep diagrams simple: black borders on white fill, arrows for flow, no colors or styling. "
    "Output only valid JSON matching the requested schema."
)

MERMAID_NO_HTML_RULES = """
- Do NOT use HTML tags like <br/>, <br>, <b>, </b>, or any HTML in Mermaid node labels.
  Mermaid runs in strict mode — HTML inside labels will cause parse errors.
  Use plain text only. If you need a line break effect, use a shorter label instead.
  Put the reference numeral in the same plain-text label as the component name,
  e.g. A["Ingestion module 200"], not A["Ingestion module<br/>200"].
"""

MERMAID_GRAPH_TD_SUBGRAPH_RULE = (
    "For graph TD diagrams, every subgraph must contain at least 2 nodes. "
    "A subgraph with only 1 node destroys the top-down layout and creates a horizontal chain."
)

DIAGRAM_TYPE_DIVERSITY_RULES = """
DIAGRAM TYPE DIVERSITY (mandatory):
- FIG. 2 and FIG. 3 both use flowchart TD but MUST look structurally different: FIG. 2 shows
  method/process steps; FIG. 3 shows data/message flow between components with labeled arrows.
- Each figure MUST use different components or a different subset — do NOT repeat the same full list
  of components across all figures. Each figure illuminates a different aspect of the invention.
- Each figure must cover a DISTINCT aspect (architecture vs. method vs. data flow vs. data model) —
  NOT the same high-level overview repeated in different diagram types or layouts.
- Do NOT use sequenceDiagram — sequence diagrams are too wide for letter-size portrait paper.
"""

FIGURE_COMPONENT_SUBSET_RULE = (
    "Each figure MUST use different components or a different subset — do NOT repeat the same "
    "full list of components across all figures. Each figure illuminates a different aspect "
    "of the invention."
)

REFERENCE_NUMERAL_CONSISTENCY_RULE = """
CRITICAL: Reference numerals must be consistent across ALL figures.
Pick a master list of numerals and component names BEFORE writing any figure.
Every time numeral 204 appears in any figure, it must refer to the exact same
component with the exact same name. Do not reuse a numeral for a different component
in a different figure. Use the component names exactly as they appear in the
detailed description text.
"""

FIG_2_AND_3_REFERENCE_NUMERAL_RULES = """
REFERENCE NUMERALS IN FIG. 2 and FIG. 3:
- If you put a reference numeral in a node box, the node label MUST use the exact
  same component name as FIG. 1 (e.g., if 202 = "Document Structure Parsing Interface"
  in FIG. 1, then ANY node labeled 202 in FIG. 2 must also say "Document Structure
  Parsing Interface 202" — never a paraphrase or process-step description).
- Put the process step action in the ARROW LABEL between nodes, not in the node box.
  Example: A["Document Structure Parsing Interface 202"] -- "normalize and tokenize" --> B["LLM Structural Analysis Module 204"]
- Alternatively, use NO reference numerals in FIG. 2 nodes at all — just descriptive
  step names — since FIG. 2 is a method flowchart, not a component diagram.
  This is the preferred approach when showing decision branches and process steps.
"""

FIG_1_STRUCTURE_RULES = """
FIG. 1 — System Architecture (use graph TD):
- Use `graph TD` with 2–3 subgraph blocks, each containing MULTIPLE nodes (2–4 nodes per subgraph)
- DO NOT create a linear chain of single-node subgraphs — this renders horizontally regardless of direction
- Group components into logical TIERS stacked top-to-bottom: e.g. "Input Tier" (2 nodes), "Processing Tier" (3 nodes), "Output Tier" (2 nodes)
- Connections go BETWEEN tiers (a node in tier 1 connects to a node in tier 2), not subgraph-to-subgraph
- This creates a genuinely portrait-oriented diagram that fits letter paper
- Include reference numerals in plain-text node labels, e.g. A["Ingestion module 200"]

CORRECT structure example:
  graph TD
    subgraph InputTier ["Input Tier"]
      A[Component A 200]
      B[Component B 202]
    end
    subgraph ProcessTier ["Processing Tier"]
      C[Component C 204]
      D[Component D 206]
      E[Component E 208]
    end
    subgraph OutputTier ["Output Tier"]
      F[Component F 210]
      G[Component G 212]
    end
    A --> C
    B --> C
    C --> D
    D --> E
    E --> F
    E --> G

WRONG structure (do NOT do this — renders as horizontal pipeline):
  graph TD
    subgraph Layer1
      A[Node A]
    end
    subgraph Layer2
      B[Node B]
    end
    A --> B
"""

FIG_2_STRUCTURE_RULES = f"""
FIG. 2 — Method Flowchart (use flowchart TD):
- Use `flowchart TD`
- Must include at least one decision diamond (`{{{{...}}}}`) with branching paths (yes/no or condition-based)
- Show distinct START and END nodes
- Steps should reflect the actual method/process steps, NOT the same component list as FIG. 1
- Should depict WHAT THE SYSTEM DOES step-by-step, not what components exist
- Use action-oriented step descriptions on ARROW LABELS (e.g. "Receive document", "Extract structure")
{FIG_2_AND_3_REFERENCE_NUMERAL_RULES}
"""

FIG_3_STRUCTURE_RULES = f"""
FIG. 3 — Data Flow / Interaction (use flowchart TD):
- Use `flowchart TD` to show data flowing between major components vertically
- Use labeled arrows to show what data passes between components (e.g., `A -- "raw text" --> B`)
- Include at least one decision branch or parallel path to distinguish it from FIG. 2
- Maximum 6 nodes, laid out top-to-bottom
- This figure should show the DATA/MESSAGE flow, while FIG. 2 shows the METHOD/PROCESS steps — they must look structurally different
- Use a subset of key components — not all components from FIG. 1
- Focus on runtime data/message exchange between components, not static architecture or step-by-step method logic
{FIG_2_AND_3_REFERENCE_NUMERAL_RULES}
"""

FIG_4_PLUS_STRUCTURE_RULES = """
FIG. 4+ — Data Model / State (use classDiagram or stateDiagram-v2):
- Use `classDiagram` or `stateDiagram-v2` (not flowchart or graph)
- For classDiagram: show data entities with attributes and relationships — NOT a process flow
- For stateDiagram-v2: show states the system transitions through with labeled transitions
- Include only entities/states relevant to that aspect — a subset of the invention
"""

FIGURE_DIAGRAM_TYPE_REQUIREMENTS = """
MANDATORY DIAGRAM TYPE PER FIGURE (each figure MUST use the exact type specified):
1. FIG. 1 — `graph TD` with 2–3 tier subgraphs (2–4 nodes each); connections between tiers, not single-node subgraph chains (system architecture overview for letter-size portrait paper)
2. FIG. 2 — `flowchart TD` with at least one decision diamond (`{Decision?}`) showing branching logic (method/process flow)
3. FIG. 3 — `flowchart TD` with labeled data-flow arrows, max 6 nodes top-to-bottom; must differ structurally from FIG. 2 (data/message flow, not method steps)
4. FIG. 4 — `classDiagram` with at least 3 classes showing relationships (component/data model)

All diagrams will be rendered on US letter paper (8.5×11 inches) with 1-inch margins in portrait orientation.
Prefer tall/vertical layouts over wide/horizontal ones. Limit nodes per row to 4 in flowcharts.
Do NOT use sequenceDiagram — sequence diagrams are too wide for letter-size portrait paper.

Each figure MUST use the exact diagram type specified above. Do NOT use `graph LR` or `sequenceDiagram`.
Do NOT use `flowchart TD` for figure 4. Do NOT produce two figures with the same visual structure.
"""

FIGURE_STRUCTURE_RULES = f"""
PER-FIGURE STRUCTURAL RULES (mandatory — follow exactly for each figure number):
{FIGURE_DIAGRAM_TYPE_REQUIREMENTS}
{FIG_1_STRUCTURE_RULES}
{FIG_2_STRUCTURE_RULES}
{FIG_3_STRUCTURE_RULES}
{FIG_4_PLUS_STRUCTURE_RULES}
"""


def figure_structure_rules_for_number(figure_number: int) -> str:
    """Return structural rules for a single figure number."""
    rules_by_number = {
        1: FIG_1_STRUCTURE_RULES,
        2: FIG_2_STRUCTURE_RULES,
        3: FIG_3_STRUCTURE_RULES,
    }
    return rules_by_number.get(figure_number, FIG_4_PLUS_STRUCTURE_RULES)


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
- brief_description_of_drawings: str — one sentence per figure, each starting with
  "FIG. N is a ...", listing every figure in consecutive order and separated by blank lines
  (formal USPTO sample format — NOT one paragraph)
- figures: list of objects, each with:
  - number: int (consecutive Arabic numerals starting at 1)
  - title: str (short title, e.g. "System architecture")
  - brief_description: str (single sentence for the figure caption, starting with "FIG. N is...")
  - reference_numerals: object mapping numeral strings to component names (e.g. {{"200": "ingestion module", "202": "structural parser"}})
  - mermaid: str — valid Mermaid diagram for black-and-white patent figures

REQUIREMENTS:
{DIAGRAM_TYPE_DIVERSITY_RULES}
{FIGURE_COMPONENT_SUBSET_RULE}
{FIGURE_STRUCTURE_RULES}
- Provisional applications have no required minimum number of figures — the applicant
  chooses how many drawings to include. Where drawings are present, the brief description
  must list every figure by number with a statement of what it depicts.
- Generate only the number of figures requested in the user prompt. When multiple figures
  are requested, assign diagram types by figure number:
{FIGURE_DIAGRAM_TYPE_REQUIREMENTS}

REFERENCE NUMERAL RULES (mandatory — USPTO sample format):
{REFERENCE_NUMERAL_CONSISTENCY_RULE}
{FIG_2_AND_3_REFERENCE_NUMERAL_RULES}
- Extract numerals and component names from the detailed description and use them exactly
- Each reference numeral (200, 202, 204, ...) designates exactly ONE part across ALL figures
- NEVER reuse a numeral for a different part (e.g. do NOT label "Layout preservation 200" if
  200 is already the ingestion module)
- When a numeral appears in multiple figures, it must refer to the same component — but each
  figure may show only the subset of components relevant to that figure's aspect

- Mermaid rules (all diagram types):
{MERMAID_NO_HTML_RULES}
  - Each figure's mermaid must start with its diagram type on the first non-comment line
  - FIG. 1 and FIG. 4+: include reference numerals in every labeled component/node/class using
    exact component names from the detailed description
  - FIG. 2 and FIG. 3: follow the FIG. 2/3 reference numeral rules above — never paraphrase a
    FIG. 1 component name when using its numeral; put process/data descriptions on arrow labels
  - No classDef, no style directives, no colors, no subgraph styling
  - Maximum 12 nodes/participants/entities per diagram (FIG. 3: maximum 6 nodes)
  - Do NOT use sequenceDiagram — too wide for letter-size portrait paper
  - Limit nodes per row to 4 in flowcharts and graph diagrams
  - {MERMAID_GRAPH_TD_SUBGRAPH_RULE}
  - Node labels with numerals MUST use plain text with the exact FIG. 1 component name and numeral,
    e.g. A["Document Structure Parsing Interface 202"]
  - Do NOT use direction statements inside subgraphs
  - When using subgraphs in Mermaid, always give them a quoted display title using bracket
    syntax, e.g. `subgraph ingestion [Ingestion Layer]`. Never use bare IDs like
    `subgraph sg203` — these render as ugly labels.
- All diagrams will be rendered on US letter paper (8.5×11 inches) with 1-inch margins in portrait
  orientation. Prefer tall/vertical layouts over wide/horizontal ones.

- reference_numerals must use even numbers starting at 200 (200, 202, 204, ...) and match labels in mermaid
- The same reference numeral must designate the same component whenever it appears across figures
- brief_description_of_drawings: one sentence per figure, each starting with "FIG. N is a
  ...", separated by blank lines — NOT one combined paragraph
- brief_description_of_drawings must list every generated figure in consecutive numerical order

Output ONLY the JSON object, no markdown fences."""


def _figure_diagram_type_requirement(figure_number: int) -> str:
    """Return the mandatory Mermaid diagram type for a figure number."""
    if figure_number == 1:
        return (
            "`graph TD` with 2–3 tier subgraphs (2–4 nodes each); connections between tiers, "
            "not single-node subgraph chains (system architecture overview)"
        )
    if figure_number == 2:
        return (
            "`flowchart TD` with at least one decision diamond (`{Decision?}`) "
            "showing branching logic (method/process flow)"
        )
    if figure_number == 3:
        return (
            "`flowchart TD` with labeled data-flow arrows, max 6 nodes top-to-bottom "
            "(data/message flow — structurally distinct from FIG. 2 method steps)"
        )
    return (
        "`classDiagram` with at least 3 classes showing relationships "
        "(component/data model)"
    )


def get_single_figure_prompt(
    invention: dict,
    description_text: str,
    figure_number: int,
    total_figures: int,
) -> str:
    """
    Returns the prompt for generating a single patent figure as Mermaid JSON.
    """
    context = _format_invention_context(invention)
    description_block = ""
    if description_text.strip():
        description_block = f"""
DETAILED DESCRIPTION (use for consistency of names, steps, and reference numerals):
{description_text.strip()[:12000]}
"""

    diagram_type = _figure_diagram_type_requirement(figure_number)

    return f"""{context}
{description_block}

TASK: Generate FIG. {figure_number} of {total_figures} for a US provisional patent application
covering an AI/ML invention. You are generating figure {figure_number} of {total_figures} only.
Provisional applications have no required minimum number of figures — the applicant chose
{total_figures} drawing(s) for this application.

Return a JSON object with exactly this key:
- figure: object with:
  - number: int (must be {figure_number})
  - title: str (short title, e.g. "System architecture")
  - brief_description: str (single sentence for the figure caption, starting with "FIG. {figure_number} is...")
  - reference_numerals: object mapping numeral strings to component names (e.g. {{"200": "ingestion module", "202": "structural parser"}})
  - mermaid: str — valid Mermaid diagram for black-and-white patent figures

MANDATORY DIAGRAM TYPE FOR FIG. {figure_number}:
- FIG. {figure_number} MUST use {diagram_type}
- Do NOT use `graph LR` or `sequenceDiagram` for any figure
- Do NOT use `flowchart TD` for figures 4+
- Do NOT produce the same visual structure as other figures in the set

REQUIREMENTS:
{DIAGRAM_TYPE_DIVERSITY_RULES}
{FIGURE_COMPONENT_SUBSET_RULE}
{figure_structure_rules_for_number(figure_number)}
{REFERENCE_NUMERAL_CONSISTENCY_RULE}
- Extract reference numerals and component names from the detailed description and use them exactly
- Each reference numeral (200, 202, 204, ...) designates exactly ONE part across ALL figures
- This is figure {figure_number} of {total_figures} — cover a distinct aspect of the invention
  (architecture vs. method vs. interaction vs. data model) appropriate to this figure number
- Mermaid rules:
{MERMAID_NO_HTML_RULES}
  - The mermaid field must start with its diagram type on the first non-comment line
  - FIG. 1 and FIG. 4+: include reference numerals in every labeled node using exact component names
  - FIG. 2 and FIG. 3: follow the FIG. 2/3 reference numeral rules above — never paraphrase a
    FIG. 1 component name when using its numeral; put process/data descriptions on arrow labels
  - No classDef, no style directives, no colors, no subgraph styling
  - Maximum 12 nodes/participants/entities per diagram (FIG. 3: maximum 6 nodes)
  - Do NOT use sequenceDiagram — too wide for letter-size portrait paper
  - Limit nodes per row to 4 in flowcharts and graph diagrams
  - {MERMAID_GRAPH_TD_SUBGRAPH_RULE}
  - Node labels with numerals MUST use plain text with the exact FIG. 1 component name and numeral
  - Do NOT use direction statements inside subgraphs
  - When using subgraphs in Mermaid, always give them a quoted display title using bracket
    syntax, e.g. `subgraph ingestion [Ingestion Layer]`
- All diagrams will be rendered on US letter paper (8.5×11 inches) with 1-inch margins in portrait
  orientation. Prefer tall/vertical layouts over wide/horizontal ones.

Output ONLY the JSON object, no markdown fences."""


def get_regenerate_figure_prompt(
    invention: dict,
    description_text: str,
    figure_number: int,
    existing_figures: list[dict],
    used_diagram_types: list[str],
) -> str:
    """
    Returns the prompt for regenerating a single patent figure with a unique diagram type.
    """
    context = _format_invention_context(invention)
    description_block = ""
    if description_text.strip():
        description_block = f"""
DETAILED DESCRIPTION (use for consistency of names, steps, and reference numerals):
{description_text.strip()[:12000]}
"""

    other_figures_lines: list[str] = []
    for fig in sorted(existing_figures, key=lambda f: int(f.get("number", 0))):
        num = int(fig.get("number", 0))
        if num == figure_number:
            continue
        title = str(fig.get("title", "")).strip()
        mermaid = str(fig.get("mermaid", "")).strip()
        first_line = next(
            (line.strip() for line in mermaid.splitlines() if line.strip() and not line.strip().startswith("%%")),
            "(unknown)",
        )
        other_figures_lines.append(f"  - FIG. {num}: {title} — diagram type: {first_line}")

    other_figures_block = "\n".join(other_figures_lines) if other_figures_lines else "  (none)"
    used_types_str = ", ".join(used_diagram_types) if used_diagram_types else "(none yet)"

    return f"""{context}
{description_block}

TASK: Regenerate ONLY FIG. {figure_number} for a US provisional patent application.

OTHER EXISTING FIGURES (do NOT duplicate their diagram types or subject matter):
{other_figures_block}

DIAGRAM TYPES ALREADY IN USE (you MUST NOT reuse any of these):
{used_types_str}

{DIAGRAM_TYPE_DIVERSITY_RULES}
{figure_structure_rules_for_number(figure_number)}

Return a JSON object with exactly this key:
- figure: object with:
  - number: int (must be {figure_number})
  - title: str (short title, e.g. "System architecture")
  - brief_description: str (single sentence for the figure caption, starting with "FIG. {figure_number} is...")
  - reference_numerals: object mapping numeral strings to component names (e.g. {{"200": "ingestion module", "202": "structural parser"}})
  - mermaid: str — valid Mermaid diagram using a diagram type NOT in the used-types list above

REQUIREMENTS:
{MERMAID_NO_HTML_RULES}
{REFERENCE_NUMERAL_CONSISTENCY_RULE}
{figure_structure_rules_for_number(figure_number)}
- {FIGURE_COMPONENT_SUBSET_RULE}
- Regenerate FIG. {figure_number} only — cover a distinct aspect of the invention not already
  depicted by the other figures
- Use a Mermaid diagram type that is NOT already used by any other figure
- Extract reference numerals and component names from the detailed description and use them exactly
- Each reference numeral (200, 202, 204, ...) designates exactly ONE part across ALL figures
- Keep the diagram black-and-white with no classDef, style directives, or colors
- Maximum 12 nodes/participants per diagram
- {MERMAID_GRAPH_TD_SUBGRAPH_RULE}

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
