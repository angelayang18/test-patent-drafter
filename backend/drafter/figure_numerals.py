"""Validate and extract reference numerals for patent figure consistency."""

from __future__ import annotations

import re
from typing import Any

_NODE_LABEL_RE = re.compile(r'\["([^"]+)"\]')
_SUBGRAPH_TITLE_RE = re.compile(
    r'\b(subgraph\s+[\w-]+)\s*\["([^"]+)"\]',
    re.IGNORECASE,
)
_COMPONENT_SUFFIX = (
    r"(?:module|subsystem|engine|pipeline|index|reranker|parser|chunker|"
    r"extractor|classifier|generator|detector|processor|database|store|repository)"
)
_DESC_NUMERAL_RE = re.compile(
    rf"\b(?:(?:the|a|an)\s+)?((?:\w+\s+){{0,4}}{_COMPONENT_SUFFIX})\s+(\d{{3}})\b",
    re.IGNORECASE,
)
_STOP_WORDS = frozenset(
    {"the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "via"}
)
_GENERIC_COMPONENT_WORDS = frozenset(
    {"module", "subsystem", "engine", "pipeline", "index", "system", "unit"}
)
_SUB_COMPONENT_NUMERALS = frozenset({"203", "209", "211"})
_SUB_PARENT_MAP = {"203": "202", "209": "208", "211": "210"}
_NODE_DEF_LINE_RE = re.compile(r'^(\s*)(\w+)\["([^"]+)"\]\s*$')


def _label_parts(label: str) -> tuple[str, str | None]:
    """Return (component name, reference numeral) from a Mermaid node label."""
    parts = [part.strip() for part in label.split("<br/>") if part.strip()]
    if not parts:
        return label.strip(), None

    name = parts[0]
    numeral: str | None = None
    for part in reversed(parts[1:]):
        digits = re.sub(r"[^\d]", "", part)
        if digits.isdigit() and len(digits) >= 3:
            numeral = digits
            break
    if numeral is None and len(parts) == 1:
        trailing = re.search(r"\b(\d{3})\s*$", name)
        if trailing:
            numeral = trailing.group(1)
            name = name[: trailing.start()].strip()
    return name, numeral


def extract_mermaid_numerals(mermaid: str) -> dict[str, str]:
    """Map reference numeral strings to component names found in Mermaid labels."""
    numerals: dict[str, str] = {}
    for match in _NODE_LABEL_RE.finditer(mermaid):
        name, numeral = _label_parts(match.group(1))
        if not numeral:
            continue
        prior = numerals.get(numeral)
        if prior and _names_conflict(prior, name):
            numerals[numeral] = f"{prior}|CONFLICT|{name}"
        else:
            numerals[numeral] = name
    return numerals


def _collect_labeled_parts(mermaid: str) -> list[tuple[str, str, str]]:
    """Return (numeral, name, location) for every labeled node or subgraph title."""
    labeled: list[tuple[str, str, str]] = []
    for match in _NODE_LABEL_RE.finditer(mermaid):
        name, numeral = _label_parts(match.group(1))
        if numeral:
            labeled.append((numeral, name, "node"))
    for match in _SUBGRAPH_TITLE_RE.finditer(mermaid):
        name, numeral = _label_parts(match.group(2))
        if numeral:
            labeled.append((numeral, name, "subgraph title"))
    return labeled


def _strip_duplicate_subgraph_numerals(mermaid: str) -> str:
    """
    Remove subgraph title brackets when the same numeral labels a flow node.

    LLMs often duplicate modules as parallel column subgraph headers and main-flow
    boxes; dropping the titled subgraph header keeps nested sub-components valid.
    """

    node_numerals = set(extract_mermaid_numerals(mermaid).keys())
    if not node_numerals:
        return mermaid

    def replacer(match: re.Match[str]) -> str:
        prefix, title = match.group(1), match.group(2)
        _, numeral = _label_parts(title)
        if numeral and numeral in node_numerals:
            return prefix
        return match.group(0)

    return _SUBGRAPH_TITLE_RE.sub(replacer, mermaid)


def _inject_missing_top_level_nodes(
    mermaid: str,
    top_level: dict[str, str],
) -> str:
    """Append labeled boxes for FIG. 1 modules missing from FIG. 2 or FIG. 3."""
    present = set(extract_mermaid_numerals(mermaid).keys())
    missing = {
        numeral: name
        for numeral, name in top_level.items()
        if numeral not in present
    }
    if not missing:
        return mermaid

    additions: list[str] = []
    sorted_items = sorted(missing.items(), key=lambda item: int(item[0]))
    for numeral, name in sorted_items:
        node_id = f"auto{numeral}"
        additions.append(f'{node_id}["{name} {numeral}"]')

    if len(sorted_items) > 1:
        for index in range(len(sorted_items) - 1):
            left, right = sorted_items[index][0], sorted_items[index + 1][0]
            additions.append(f"auto{left} --> auto{right}")

    return mermaid.rstrip() + "\n" + "\n".join(additions)


def _map_node_ids_to_numerals(mermaid: str) -> dict[str, str]:
    """Map Mermaid node ids to reference numerals from bracket labels."""
    mapping: dict[str, str] = {}
    for match in re.finditer(r'(\w+)\["([^"]+)"\]', mermaid):
        _, numeral = _label_parts(match.group(2))
        if numeral:
            mapping[match.group(1)] = numeral
    return mapping


def _repair_fig1_subcomponent_hierarchy(mermaid: str) -> str:
    """
    Remove sub-components (203, 209, 211) from the main --> chain and nest them
    under their parent module in an untitled subgraph.
    """
    id_to_numeral = _map_node_ids_to_numerals(mermaid)
    sub_ids = {
        node_id
        for node_id, numeral in id_to_numeral.items()
        if numeral in _SUB_COMPONENT_NUMERALS
    }
    if not sub_ids:
        return mermaid

    numeral_to_id = {numeral: node_id for node_id, numeral in id_to_numeral.items()}
    sub_defs: dict[str, str] = {}
    out_lines: list[str] = []

    for line in mermaid.split("\n"):
        stripped = line.strip()
        if not stripped:
            out_lines.append(line)
            continue

        node_match = _NODE_DEF_LINE_RE.match(stripped)
        if node_match and node_match.group(2) in sub_ids:
            _, numeral = _label_parts(node_match.group(3))
            if numeral:
                sub_defs[numeral] = stripped
            continue

        if "-->" in stripped and not stripped.lower().startswith("subgraph"):
            filtered_tokens: list[str] = []
            for token in re.split(r"\s*-->\s*", stripped):
                piece = token.strip()
                if not piece:
                    continue
                node_id = piece.split("[")[0].strip()
                if node_id in sub_ids:
                    label_match = re.search(r'\["([^"]+)"\]', piece)
                    if label_match:
                        _, numeral = _label_parts(label_match.group(1))
                        if numeral:
                            sub_defs[numeral] = (
                                f'{node_id}["{label_match.group(1)}"]'
                            )
                    continue
                filtered_tokens.append(piece)
            if len(filtered_tokens) >= 2:
                indent = line[: len(line) - len(line.lstrip())]
                out_lines.append(indent + " --> ".join(filtered_tokens))
            continue

        out_lines.append(line)

    inserted: set[str] = set()
    final_lines: list[str] = []
    for line in out_lines:
        final_lines.append(line)
        stripped = line.strip()
        indent = line[: len(line) - len(line.lstrip())]

        for sub_numeral, parent in _SUB_PARENT_MAP.items():
            if sub_numeral in inserted:
                continue
            sub_line = sub_defs.get(sub_numeral)
            if not sub_line:
                continue
            parent_id = numeral_to_id.get(parent)
            if not parent_id or f'{parent_id}["' not in stripped:
                continue
            final_lines.append(f"{indent}subgraph sg{sub_numeral}")
            final_lines.append(f"{indent}    {sub_line}")
            final_lines.append(f"{indent}end")
            inserted.add(sub_numeral)

    return "\n".join(final_lines)


def _fig1_top_level_modules(fig1_mermaid: str) -> dict[str, str]:
    fig1_map = extract_mermaid_numerals(fig1_mermaid)
    return {
        numeral: name
        for numeral, name in fig1_map.items()
        if numeral not in _SUB_COMPONENT_NUMERALS and "|CONFLICT|" not in name
    }


def repair_figure_numerals(
    figures: list[dict[str, Any]],
    description_text: str = "",
) -> list[dict[str, Any]]:
    """
    Auto-fix common LLM figure issues before validation.

    - FIG. 1: drop subgraph titles that duplicate a main-flow node numeral
    - FIG. 1: pull sub-components 203/209/211 out of the main chain and nest under parents
    - FIG. 2/3: align labels with canonical names (no forced injection of all FIG. 1 modules)
    """
    fig1 = next((figure for figure in figures if int(figure.get("number", 0)) == 1), None)
    top_level: dict[str, str] = {}
    if fig1:
        fig1_mermaid = _strip_duplicate_subgraph_numerals(str(fig1.get("mermaid", "")))
        fig1_mermaid = _repair_fig1_subcomponent_hierarchy(fig1_mermaid)
        top_level = _fig1_top_level_modules(fig1_mermaid)
    else:
        fig1_mermaid = None

    canonical = build_canonical_numeral_map(figures, description_text)
    repaired: list[dict[str, Any]] = []

    for figure in figures:
        number = int(figure.get("number", 0))
        mermaid = str(figure.get("mermaid", ""))

        if number == 1 and fig1_mermaid is not None:
            mermaid = fig1_mermaid
        elif number in (2, 3) and canonical:
            mermaid = _apply_canonical_labels(mermaid, canonical)

        reference_numerals = dict(figure.get("reference_numerals") or {})
        for numeral, name in extract_mermaid_numerals(mermaid).items():
            if "|CONFLICT|" not in name:
                reference_numerals[numeral] = name

        repaired.append(
            {
                **figure,
                "mermaid": mermaid,
                "reference_numerals": reference_numerals,
            }
        )

    return repaired


def extract_description_numerals(description_text: str) -> dict[str, str]:
    """Build a canonical numeral map from the detailed description prose."""
    candidates: dict[str, list[str]] = {}
    for match in _DESC_NUMERAL_RE.finditer(description_text):
        name = _clean_component_name(match.group(1).strip())
        numeral = match.group(2)
        candidates.setdefault(numeral, []).append(name)

    numerals: dict[str, str] = {}
    for numeral, names in candidates.items():
        for name in sorted(set(names), key=len):
            prior = numerals.get(numeral)
            if prior is None or not _names_conflict(prior, name):
                numerals[numeral] = name
                break
    return numerals


def _clean_component_name(name: str) -> str:
    """Drop leading prepositions/articles accidentally captured before a component name."""
    cleaned = name.strip()
    prefix = re.compile(
        r"^(?:through|to|from|into|within|via|using|by|in|at|on|for|with|"
        r"and|or|wherein|where|while|when|that|which|the|a|an)\s+",
        re.IGNORECASE,
    )
    while True:
        stripped = prefix.sub("", cleaned, count=1)
        if stripped == cleaned:
            break
        cleaned = stripped
    return cleaned.strip()


def _normalize_component_name(name: str) -> str:
    """Normalize a label for comparison (strip step numbers, articles, extra spaces)."""
    normalized = re.sub(r"^\d+\.\s*", "", name.strip())
    normalized = re.sub(r"\b(?:the|a|an)\b", "", normalized, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", normalized.lower()).strip()


def _significant_tokens(name: str) -> set[str]:
    tokens = set(re.findall(r"[a-z0-9]+", _normalize_component_name(name)))
    return tokens - _STOP_WORDS - _GENERIC_COMPONENT_WORDS


def _names_conflict(a: str, b: str) -> bool:
    """True when two labels clearly refer to different parts."""
    if "|CONFLICT|" in a or "|CONFLICT|" in b:
        return True
    norm_a = _normalize_component_name(a)
    norm_b = _normalize_component_name(b)
    if norm_a == norm_b:
        return False
    if norm_a in norm_b or norm_b in norm_a:
        return False
    tokens_a = _significant_tokens(a)
    tokens_b = _significant_tokens(b)
    if tokens_a and tokens_b:
        overlap = tokens_a & tokens_b
        if overlap:
            shorter = min(len(tokens_a), len(tokens_b))
            if len(overlap) >= max(1, shorter // 2):
                return False
    return True


def _relabel_node(label: str, canonical: dict[str, str]) -> str:
    """Replace a mismatched node name with the canonical name for its numeral."""
    parts = [part.strip() for part in label.split("<br/>") if part.strip()]
    if not parts:
        return label

    name = parts[0]
    numeral_idx = None
    numeral: str | None = None
    for index, part in enumerate(parts[1:], start=1):
        digits = re.sub(r"[^\d]", "", part)
        if digits.isdigit() and len(digits) >= 3:
            numeral = digits
            numeral_idx = index
            break
    if not numeral or numeral not in canonical or numeral_idx is None:
        return label
    if _normalize_component_name(name) == _normalize_component_name(canonical[numeral]):
        return label

    return " ".join([canonical[numeral], *parts[numeral_idx:]])


def _apply_canonical_labels(mermaid: str, canonical: dict[str, str]) -> str:
    def replacer(match: re.Match[str]) -> str:
        label = match.group(1)
        updated = _relabel_node(label, canonical)
        if updated == label:
            return match.group(0)
        return f'["{updated}"]'

    return _NODE_LABEL_RE.sub(replacer, mermaid)


def build_canonical_numeral_map(
    figures: list[dict[str, Any]],
    description_text: str = "",
) -> dict[str, str]:
    """Merge description and FIG. 1 numerals into one canonical numeral-to-name map."""
    canonical = extract_description_numerals(description_text) if description_text else {}
    fig1 = next((figure for figure in figures if int(figure.get("number", 0)) == 1), None)
    if not fig1:
        return canonical

    for numeral, name in extract_mermaid_numerals(str(fig1.get("mermaid", ""))).items():
        if "|CONFLICT|" in name:
            continue
        prior = canonical.get(numeral)
        if prior is None or not _names_conflict(prior, name):
            canonical[numeral] = name
    return canonical


def reconcile_figure_labels(
    figures: list[dict[str, Any]],
    description_text: str = "",
) -> list[dict[str, Any]]:
    """Align FIG. 2/3 node labels with canonical names from the description and FIG. 1."""
    canonical = build_canonical_numeral_map(figures, description_text)
    if not canonical:
        return figures

    reconciled: list[dict[str, Any]] = []
    for figure in figures:
        number = int(figure.get("number", 0))
        if number == 1:
            reconciled.append(figure)
            continue

        mermaid = _apply_canonical_labels(str(figure.get("mermaid", "")), canonical)
        reference_numerals = dict(figure.get("reference_numerals") or {})
        figure_numerals = extract_mermaid_numerals(mermaid)
        for numeral in figure_numerals:
            if numeral in canonical:
                reference_numerals[numeral] = canonical[numeral]

        reconciled.append(
            {
                **figure,
                "mermaid": mermaid,
                "reference_numerals": reference_numerals,
            }
        )
    return reconciled


def validate_figure_numerals(
    figures: list[dict[str, Any]],
    description_text: str = "",
) -> list[str]:
    """
    Return human-readable validation errors for reference numeral consistency.

    Checks:
    - The same numeral never designates two different parts across all figures
    - FIG. 3 labels reuse module numerals from the description (no invented aliases)
    - Sub-components (203, 209, 211) are not placed as downstream steps after their parent
    """
    errors: list[str] = []
    global_map: dict[str, str] = {}
    canonical = extract_description_numerals(description_text) if description_text else {}

    for figure in figures:
        number = int(figure.get("number", 0))
        mermaid = str(figure.get("mermaid", ""))
        figure_map = extract_mermaid_numerals(mermaid)

        for numeral, name in figure_map.items():
            if "|CONFLICT|" in name:
                parts = name.split("|CONFLICT|")
                errors.append(
                    f"FIG. {number}: reference numeral {numeral} is used for both "
                    f'"{parts[0]}" and "{parts[1]}" — each numeral must designate only one part.'
                )
                continue

            if numeral in global_map and _names_conflict(global_map[numeral], name):
                errors.append(
                    f"FIG. {number}: numeral {numeral} labels \"{name}\" but was already "
                    f'used for "{global_map[numeral]}" in another figure.'
                )
            else:
                global_map[numeral] = name

            if canonical and numeral in canonical and _names_conflict(canonical[numeral], name):
                errors.append(
                    f"FIG. {number}: numeral {numeral} labels \"{name}\" but the detailed "
                    f'description uses {numeral} for "{canonical[numeral]}".'
                )

        if number == 1:
            errors.extend(_validate_fig1_hierarchy(mermaid, figure_map))
            errors.extend(_validate_fig1_double_representation(mermaid))

        errors.extend(_validate_duplicate_nodes(mermaid, number))

    errors.extend(_validate_figure_coverage(figures))

    return errors


def _validate_figure_coverage(figures: list[dict[str, Any]]) -> list[str]:
    """Figures may show different component subsets — no full-list coverage requirement."""
    return []


def _validate_fig1_double_representation(mermaid: str) -> list[str]:
    """Flag when the same reference numeral labels both a subgraph title and a flow node."""
    errors: list[str] = []
    by_numeral: dict[str, list[tuple[str, str]]] = {}

    for numeral, name, location in _collect_labeled_parts(mermaid):
        by_numeral.setdefault(numeral, []).append((name, location))

    for numeral, occurrences in sorted(by_numeral.items(), key=lambda item: int(item[0])):
        if len(occurrences) <= 1:
            continue
        if numeral in _SUB_COMPONENT_NUMERALS:
            continue
        labels = "; ".join(f'"{name}" ({location})' for name, location in occurrences)
        errors.append(
            f"FIG. 1: reference numeral {numeral} appears more than once ({labels}) — "
            f"each module must appear only once per diagram; do not duplicate modules "
            f"as both a subgraph header and a separate node."
        )

    return errors


def _validate_duplicate_nodes(mermaid: str, figure_number: int) -> list[str]:
    """Flag duplicate component boxes with the same label in one diagram."""
    errors: list[str] = []
    counts: dict[str, int] = {}

    for match in _NODE_LABEL_RE.finditer(mermaid):
        name, numeral = _label_parts(match.group(1))
        if not name:
            continue
        key = f"{_normalize_component_name(name)}|{numeral or ''}"
        counts[key] = counts.get(key, 0) + 1

    for key, count in counts.items():
        if count <= 1:
            continue
        name, numeral = key.split("|", maxsplit=1)
        display = f"{name} {numeral}".strip() if numeral else name
        errors.append(
            f"FIG. {figure_number}: component \"{display}\" appears {count} times "
            f"as separate boxes — each component must appear at most once per diagram."
        )

    return errors


def _validate_fig1_hierarchy(mermaid: str, figure_map: dict[str, str]) -> list[str]:
    """Flag sub-components shown as downstream steps after their parent module."""
    errors: list[str] = []
    lines = [line.strip() for line in mermaid.split("\n") if "-->" in line]

    node_order: list[str] = []
    for line in lines:
        for token in re.split(r"\s*-->\s*", line):
            node_id = token.strip().split("[")[0].strip()
            if node_id and node_id not in node_order:
                node_order.append(node_id)

    numeral_order = []
    for node_id in node_order:
        match = re.search(rf'{re.escape(node_id)}\["([^"]+)"\]', mermaid)
        if not match:
            continue
        _, numeral = _label_parts(match.group(1))
        if numeral:
            numeral_order.append(numeral)

    for sub, parent in _SUB_PARENT_MAP.items():
        if sub in numeral_order and parent in numeral_order:
            if numeral_order.index(sub) > numeral_order.index(parent):
                sub_name = figure_map.get(sub, sub)
                parent_name = figure_map.get(parent, parent)
                errors.append(
                    f"FIG. 1: {sub_name} ({sub}) appears downstream of {parent_name} ({parent}) "
                    f"in the main flow, but it is a sub-component of {parent_name} and must be "
                    f"nested inside it — not shown as a separate downstream step."
                )

    return errors


def format_numeral_validation_errors(errors: list[str]) -> str:
    """Format validation errors for LLM retry prompts."""
    from .prompts import FIG_2_AND_3_REFERENCE_NUMERAL_RULES

    if not errors:
        return ""
    bullet_lines = "\n".join(f"  - {err}" for err in errors)
    return (
        "\n\nREFERENCE NUMERAL ERRORS TO FIX (mandatory — USPTO requires unique numerals):\n"
        f"{bullet_lines}\n"
        "Regenerate all figures correcting these issues. "
        "Use ONLY numerals and names from the detailed description. "
        "In FIG. 1, nest sub-components (203, 209, 211) inside their parent module subgraphs when shown. "
        f"{FIG_2_AND_3_REFERENCE_NUMERAL_RULES}"
        "Each figure MUST use different components or a different subset — do NOT repeat the same "
        "full list of components across all figures. "
        "Never duplicate the same component as two separate boxes in one figure. "
        "FIG. 1 must use layered subgraphs — NOT a single vertical linear chain of all modules."
    )
