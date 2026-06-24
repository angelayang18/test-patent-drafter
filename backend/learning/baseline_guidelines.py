"""Default org-wide drafting guidelines seeded from the opAIda filing guide and USPTO guidance.

These rules apply before any attorney feedback corpus exists and serve as the foundation
for later distillation from submitted drafts.
"""

from __future__ import annotations

from drafter.prompts import PATENT_SECTIONS

GLOBAL_GUIDELINE_SECTION = "_global"

BASELINE_GLOBAL_GUIDELINES = """\
- Tell the story across sections: Background sets the problem, Summary bridges problem to solution, Detailed Description explains how and why features are advantageous.
- Provisional disclosure must satisfy 35 U.S.C. §112(a) (enablement, written description, best mode) for subject matter later claimed in a non-provisional, or priority to the provisional filing date may be lost.
- Define coined or special terms in the detailed description using "As used herein, [term] means [definition]" before relying on them in claims or elsewhere.
- Use breadth-preserving language when listing variants: "in certain embodiments, the system includes, but is not limited to..."
- Describe alternative embodiments to avoid overly narrow characterizations of the invention.
- Avoid background admissions that over-state prior art in ways an examiner could cite against the applicant.
- Use formal US provisional patent language: comprising, wherein, configured to, in one embodiment."""

BASELINE_SECTION_GUIDELINES: dict[str, str] = {
    "background": """\
- Set the stage with the unfulfilled technical need and significance of the problem.
- Describe prior-art limitations without naming specific patents, companies, or products.
- Do NOT describe the inventive solution anywhere in this section.
- Avoid over-stating prior art or making admissions that could be treated as prior art during prosecution.
- End with: "Accordingly, there remains a need for improved methods and systems that address these deficiencies.\"""",
    "summary": """\
- Explicitly connect the background problem to the inventive solution (problem → solution bridge).
- Characterize key technical benefits at a high level in prose — not a component inventory.
- Reference that the system and method are described in greater detail below.
- Do NOT use bullet points; write 2–3 prose paragraphs.""",
    "description": """\
- Open with a Definitions subsection when the invention uses coined terms ("As used herein...").
- State advantages of key described features, not only their structure or operation.
- Use breadth-preserving phrasing for alternative embodiments ("include, but are not limited to").
- Describe at least two concrete alternative embodiments.
- Disclose best mode where applicable under 35 U.S.C. §112(a).
- Tie every named component to a reference numeral and figure where applicable.""",
    "claims": """\
- Present the least restrictive independent claims first; group dependent claims with their parent.
- Ensure terms of art in claims are defined in the detailed description.
- Use comprising (not including), wherein, and configured to throughout.
- Each claim is one complete sentence; list elements after comprising: on indented lines.""",
    "field": """\
- Exactly one sentence naming the technical domain only.
- Begin with "The present invention relates to..." per the opAIda/deftio template.
- Do not describe the solution or novelty in this section.""",
    "abstract": """\
- One paragraph, 100–120 words target, 150-word maximum.
- Do NOT begin with "The present invention".
- Lead with the novel technical advance, not a Summary-style component inventory.""",
}


def get_baseline_guidelines(section: str) -> str:
    """Return baseline guidelines for a section, or empty string if none defined."""
    if section == GLOBAL_GUIDELINE_SECTION:
        return BASELINE_GLOBAL_GUIDELINES.strip()
    return BASELINE_SECTION_GUIDELINES.get(section, "").strip()


def merge_guidelines(baseline: str, learned: str) -> str:
    """Combine baseline and learned guidelines, deduplicating when learned replaces baseline."""
    baseline = baseline.strip()
    learned = learned.strip()
    if baseline and learned:
        return f"{baseline}\n{learned}"
    return learned or baseline


def all_baseline_sections() -> list[str]:
    """Return section keys that have baseline guidelines (including global)."""
    sections = list(PATENT_SECTIONS)
    if BASELINE_GLOBAL_GUIDELINES.strip():
        sections.insert(0, GLOBAL_GUIDELINE_SECTION)
    return sections
