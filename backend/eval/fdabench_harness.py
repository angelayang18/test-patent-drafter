"""FDAbench-Full quality benchmarking harness.

Exercises the production generic drafting pipeline
(``draft_generic_sections_parallel``) against a cached sample of
FDAbench2026/FDAbench-Full report-split tasks.

Each task ships pre-computed ``sql_result``, ``frozen_web_search``, and
``frozen_vector_search`` evidence, so no live SQL or search tools are needed.
SQL_ACCURACY is graded via ``llm_judge`` (faithful reporting of the given
result), not the dataset's ``exact_match`` — we do not execute SQL.

Usage (from the ``backend/`` directory)::

    python -m eval.fdabench_harness
"""

from __future__ import annotations

import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

# Ensure backend/ is on sys.path when run as ``python -m eval.fdabench_harness``.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

load_dotenv(_BACKEND_ROOT.parent / ".env")

from drafter.generic_sections import (  # noqa: E402
    draft_generic_section,
    draft_generic_sections_parallel,
)
from drafter.llm_client import generate_json  # noqa: E402

log = logging.getLogger("eval.fdabench")

EVAL_DIR = Path(__file__).resolve().parent
DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"
SAMPLE_CACHE_PATH = DATA_DIR / "fdabench_sample.json"
RESULTS_JSON_PATH = RESULTS_DIR / "fdabench_results.json"
SUMMARY_MD_PATH = RESULTS_DIR / "fdabench_summary.md"

HF_ROWS_URL = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=FDAbench2026/FDAbench-Full&config=report&split=train"
    "&offset=0&length=15"
)
SAMPLE_SIZE = 15

# Spot-checked against cached sample rows (FDA0001–FDA0003 and beyond): ground
# truth reports consistently use these five ## headers, including Key Connections.
REPORT_SECTIONS = [
    {
        "id": "executive_summary",
        "name": "Executive Summary",
        "description": (
            "One-paragraph high-level summary of the key finding and why it matters."
        ),
    },
    {
        "id": "data_analysis",
        "name": "Data Analysis Results",
        "description": "Detailed analysis of the given SQL/data finding.",
    },
    {
        "id": "external_context",
        "name": "External Context & Insights",
        "description": (
            "Integrate the external web and vector search findings with the data "
            "finding to provide industry/domain context."
        ),
    },
    {
        "id": "key_connections",
        "name": "Key Connections",
        "description": (
            "Synthesize how the SQL/data finding connects to the external web and "
            "vector-search evidence; draw explicit links between quantitative results "
            "and domain context."
        ),
    },
    {
        "id": "conclusions",
        "name": "Conclusions",
        "description": (
            "Actionable conclusions and recommendations based on the full analysis."
        ),
    },
]

DIMENSION_ORDER = (
    "SQL_ACCURACY",
    "EXTERNAL_INTEGRATION",
    "LOGICAL_REASONING",
    "COMPLETENESS",
)

JUDGE_SYSTEM = (
    "You are grading a candidate analytical report against a rubric dimension. "
    "The candidate does not need to match the reference report verbatim — score how well "
    "it satisfies the stated criteria. Return JSON with exactly two keys: "
    "'score' (float 0.0-1.0) and 'justification' (one or two sentences)."
)

SQL_ACCURACY_NOTE = (
    "Note: this system does not independently execute SQL — the SQL result below was "
    "given to it as input evidence; grade only whether the candidate faithfully and "
    "accurately reports it."
)


def fetch_and_cache_sample(*, force: bool = False) -> dict[str, Any]:
    """Fetch HF rows (or load cache) and return the raw datasets-server JSON."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SAMPLE_CACHE_PATH.exists() and not force:
        log.info("Loading cached sample from %s", SAMPLE_CACHE_PATH)
        with SAMPLE_CACHE_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)

    log.info("Fetching FDAbench sample from HuggingFace datasets-server…")
    response = requests.get(HF_ROWS_URL, timeout=60)
    response.raise_for_status()
    payload = response.json()
    with SAMPLE_CACHE_PATH.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    log.info("Cached %d rows to %s", len(payload.get("rows") or []), SAMPLE_CACHE_PATH)
    return payload


def extract_task_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Unwrap datasets-server ``rows`` entries into plain task dicts."""
    rows: list[dict[str, Any]] = []
    for item in payload.get("rows") or []:
        row = item.get("row") if isinstance(item, dict) else None
        if isinstance(row, dict):
            rows.append(row)
    return rows[:SAMPLE_SIZE]


def _search_entries(frozen: Any) -> list[dict[str, Any]]:
    if not isinstance(frozen, dict):
        return []
    searches = frozen.get("searches") or []
    return [s for s in searches if isinstance(s, dict)]


def build_combined_text(task: dict[str, Any]) -> str:
    """Format task evidence using ``--- {label} ---`` chunk headers."""
    parts: list[str] = []
    query = str(task.get("query") or "").strip()
    parts.append(f"--- Task Query ---\n{query}")

    db_type = str(task.get("db_type") or task.get("database_type") or "unknown").strip()
    sql_result = str(task.get("sql_result") or "").strip()
    parts.append(f"--- SQL Result ({db_type}) ---\n{sql_result}")

    for search in _search_entries(task.get("frozen_web_search")):
        label = str(search.get("query") or "untitled").strip() or "untitled"
        summary = str(search.get("context_summary") or "").strip()
        parts.append(f"--- Web Search: {label} ---\n{summary}")

    for search in _search_entries(task.get("frozen_vector_search")):
        label = str(search.get("query") or "untitled").strip() or "untitled"
        summary = str(search.get("context_summary") or "").strip()
        parts.append(f"--- Vector Search: {label} ---\n{summary}")

    return "\n\n".join(parts)


def _document_title(task_id: str) -> str:
    """Title for the drafting agent — strip ambiguous ``FDA`` prefix from task IDs."""
    return f"Data Analysis Report (Task #{task_id.lstrip('FDA') or task_id})"


def draft_report(task_id: str, combined_text: str) -> tuple[str, dict[str, str]]:
    """Draft body sections in parallel, then Conclusions from their prior content.

    Conclusions uses ``prior_draft`` built from the other four sections so it is not
    starved when retrieval seeded on a synthesis-style description returns empty.
    """
    title = _document_title(task_id)
    body_sections = [s for s in REPORT_SECTIONS if s["id"] != "conclusions"]
    conclusions_section = next(s for s in REPORT_SECTIONS if s["id"] == "conclusions")

    content_by_section, _citations = draft_generic_sections_parallel(
        document_title=title,
        sections=body_sections,
        combined_text=combined_text,
    )

    prior_context = "\n\n".join(
        f"## {sec['name']}\n\n{content_by_section.get(sec['id'], '')}"
        for sec in body_sections
    )
    conclusions_content, _ = draft_generic_section(
        document_title=title,
        section_id="conclusions",
        name=conclusions_section["name"],
        description=conclusions_section["description"],
        prior_draft=prior_context,
        combined_text=combined_text,
    )
    content_by_section["conclusions"] = conclusions_content

    blocks: list[str] = []
    for sec in REPORT_SECTIONS:
        sid = sec["id"]
        name = sec["name"]
        body = (content_by_section.get(sid) or "").strip()
        blocks.append(f"## {name}\n\n{body}")
    return "\n\n".join(blocks), content_by_section


def _clamp_score(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, value))


def grade_dimension(
    *,
    query: str,
    dimension_name: str,
    dimension: dict[str, Any],
    ground_truth_report: str,
    our_report: str,
) -> dict[str, Any]:
    """LLM-judge one rubric dimension; return score + justification."""
    criteria = str(dimension.get("criteria") or "").strip()
    note = f"{SQL_ACCURACY_NOTE}\n\n" if dimension_name == "SQL_ACCURACY" else ""
    user = (
        f"{note}"
        f"Task: {query}\n\n"
        f"Dimension: {dimension_name}\n"
        f"Criteria: {criteria}\n\n"
        f"Reference report (for context, not a template to copy):\n"
        f"{ground_truth_report}\n\n"
        f"Candidate report:\n"
        f"{our_report}"
    )
    result = generate_json(JUDGE_SYSTEM, user)
    score = _clamp_score(result.get("score"))
    justification = str(result.get("justification") or "").strip()
    return {
        "score": score,
        "justification": justification,
        "weight": float(dimension.get("weight") or 0.0),
        "verification_used": "llm_judge",
        "dataset_verification": str(dimension.get("verification") or ""),
    }


def grade_report(
    task: dict[str, Any],
    our_report: str,
) -> dict[str, Any]:
    """Grade all rubric dimensions and compute weighted score."""
    query = str(task.get("query") or "")
    ground_truth = str(task.get("ground_truth_report") or "")
    rubric = task.get("rubric") if isinstance(task.get("rubric"), dict) else {}
    dims = rubric.get("evaluation_dimensions") if isinstance(rubric, dict) else {}
    if not isinstance(dims, dict):
        dims = {}

    dimension_scores: dict[str, Any] = {}
    weighted = 0.0
    for name in DIMENSION_ORDER:
        dim = dims.get(name)
        if not isinstance(dim, dict):
            log.warning("Missing rubric dimension %s for %s", name, task.get("task_id"))
            dimension_scores[name] = {
                "score": 0.0,
                "justification": "Dimension missing from rubric.",
                "weight": 0.0,
                "verification_used": "llm_judge",
                "dataset_verification": "",
            }
            continue
        graded = grade_dimension(
            query=query,
            dimension_name=name,
            dimension=dim,
            ground_truth_report=ground_truth,
            our_report=our_report,
        )
        dimension_scores[name] = graded
        weighted += graded["weight"] * graded["score"]

    return {
        "weighted_score": weighted,
        "dimensions": dimension_scores,
        "scoring_note": (
            "SQL_ACCURACY scored via llm_judge on faithful reporting of the given "
            "sql_result — not dataset exact_match (no SQL execution)."
        ),
    }


def evaluate_task(task: dict[str, Any]) -> dict[str, Any]:
    """Draft + grade a single FDAbench task."""
    task_id = str(task.get("task_id") or task.get("instance_id") or "unknown")
    log.info("=== Task %s ===", task_id)
    combined_text = build_combined_text(task)
    our_report, content_by_section = draft_report(task_id, combined_text)
    grading = grade_report(task, our_report)
    return {
        "task_id": task_id,
        "query": task.get("query"),
        "db_type": task.get("db_type"),
        "our_report": our_report,
        "content_by_section": content_by_section,
        "ground_truth_report": task.get("ground_truth_report"),
        "grading": grading,
    }


def aggregate_results(task_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute mean weighted score and mean per-dimension scores."""
    if not task_results:
        return {
            "n_tasks": 0,
            "mean_weighted_score": 0.0,
            "mean_dimension_scores": {d: 0.0 for d in DIMENSION_ORDER},
        }

    weighted_scores = [
        float(r["grading"]["weighted_score"]) for r in task_results
    ]
    mean_weighted = sum(weighted_scores) / len(weighted_scores)

    mean_dims: dict[str, float] = {}
    for name in DIMENSION_ORDER:
        scores = [
            float(r["grading"]["dimensions"][name]["score"])
            for r in task_results
            if name in r["grading"]["dimensions"]
        ]
        mean_dims[name] = sum(scores) / len(scores) if scores else 0.0

    return {
        "n_tasks": len(task_results),
        "mean_weighted_score": mean_weighted,
        "mean_dimension_scores": mean_dims,
        "section_structure": [s["name"] for s in REPORT_SECTIONS],
        "scoring_note": (
            "SQL_ACCURACY uses llm_judge (faithful reporting of given sql_result), "
            "not dataset exact_match."
        ),
    }


def write_summary_md(
    summary: dict[str, Any],
    task_results: list[dict[str, Any]],
) -> None:
    """Write a short human-readable markdown table for supervisor review."""
    lines: list[str] = [
        "# FDAbench-Full Harness Summary",
        "",
        f"**Tasks evaluated:** {summary['n_tasks']}",
        f"**Mean weighted score:** {summary['mean_weighted_score']:.4f}",
        "",
        "## Mean per-dimension scores",
        "",
        "| Dimension | Mean score |",
        "| --- | ---: |",
    ]
    for name in DIMENSION_ORDER:
        score = summary["mean_dimension_scores"].get(name, 0.0)
        lines.append(f"| {name} | {score:.4f} |")

    lines.extend(
        [
            "",
            "## Notes",
            "",
            f"- Section structure used: {', '.join(summary['section_structure'])}",
            f"- {summary['scoring_note']}",
            "",
            "## Per-task scores",
            "",
            "| task_id | weighted | SQL_ACCURACY | EXTERNAL_INTEGRATION "
            "| LOGICAL_REASONING | COMPLETENESS |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for r in task_results:
        dims = r["grading"]["dimensions"]
        lines.append(
            "| {tid} | {w:.4f} | {sql:.4f} | {ext:.4f} | {log:.4f} | {comp:.4f} |".format(
                tid=r["task_id"],
                w=r["grading"]["weighted_score"],
                sql=dims["SQL_ACCURACY"]["score"],
                ext=dims["EXTERNAL_INTEGRATION"]["score"],
                log=dims["LOGICAL_REASONING"]["score"],
                comp=dims["COMPLETENESS"]["score"],
            )
        )
    lines.append("")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_MD_PATH.write_text("\n".join(lines), encoding="utf-8")
    log.info("Wrote summary to %s", SUMMARY_MD_PATH)


def spot_check_gt_headers(tasks: list[dict[str, Any]], n: int = 5) -> None:
    """Log ground-truth ## headers for the first n tasks (structure confirmation)."""
    header_re = re.compile(r"^#{1,3} .+$", re.MULTILINE)
    for task in tasks[:n]:
        tid = task.get("task_id")
        gt = str(task.get("ground_truth_report") or "")
        headers = header_re.findall(gt)
        log.info("GT headers for %s: %s", tid, headers)


def main() -> int:
    """Run the harness end-to-end."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    payload = fetch_and_cache_sample()
    tasks = extract_task_rows(payload)
    if not tasks:
        log.error("No tasks found in sample payload.")
        return 1

    log.info("Loaded %d tasks; spot-checking GT structure…", len(tasks))
    spot_check_gt_headers(tasks)

    task_results: list[dict[str, Any]] = []
    for i, task in enumerate(tasks, start=1):
        log.info("Progress: %d/%d", i, len(tasks))
        try:
            task_results.append(evaluate_task(task))
        except Exception:
            log.exception("Task %s failed; continuing.", task.get("task_id"))
            task_results.append(
                {
                    "task_id": str(task.get("task_id") or "unknown"),
                    "query": task.get("query"),
                    "db_type": task.get("db_type"),
                    "our_report": "",
                    "content_by_section": {},
                    "ground_truth_report": task.get("ground_truth_report"),
                    "grading": {
                        "weighted_score": 0.0,
                        "dimensions": {
                            name: {
                                "score": 0.0,
                                "justification": "Task failed during draft/grade.",
                                "weight": 0.25,
                                "verification_used": "llm_judge",
                                "dataset_verification": "",
                            }
                            for name in DIMENSION_ORDER
                        },
                        "scoring_note": (
                            "SQL_ACCURACY scored via llm_judge — not exact_match."
                        ),
                        "error": True,
                    },
                }
            )

    summary = aggregate_results(task_results)
    output = {
        "summary": summary,
        "tasks": task_results,
    }
    with RESULTS_JSON_PATH.open("w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)
    log.info("Wrote full results to %s", RESULTS_JSON_PATH)

    write_summary_md(summary, task_results)

    print("\n=== FDAbench harness complete ===")
    print(f"Tasks: {summary['n_tasks']}")
    print(f"Mean weighted score: {summary['mean_weighted_score']:.4f}")
    print("Mean per-dimension scores:")
    for name, score in summary["mean_dimension_scores"].items():
        print(f"  {name}: {score:.4f}")
    print(f"Results: {RESULTS_JSON_PATH}")
    print(f"Summary: {SUMMARY_MD_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
