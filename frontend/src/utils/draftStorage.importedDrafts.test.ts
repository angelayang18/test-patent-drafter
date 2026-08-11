import { describe, expect, it } from "vitest";
import {
  importedDraftMarkers,
  injectImportedDraftBlock,
  pastedTextHasImportedDraft,
  stripImportedDraftBlock,
  wrapImportedDraftBlock,
} from "./draftStorage";

describe("imported draft markers", () => {
  it("builds titled start/end markers from a single helper", () => {
    expect(importedDraftMarkers("abc-123", "Transit Hub")).toEqual({
      start: "--- Imported Draft: Transit Hub [id=abc-123] ---",
      end: "--- End Imported Draft: Transit Hub [id=abc-123] ---",
    });
  });

  it("round-trips wrap → detect → strip for a draft id", () => {
    const draftId = "draft-uuid-1";
    const body = "## Summary\n\nAn invention about reliable night transit.";
    const wrapped = wrapImportedDraftBlock(draftId, body, "Night Transit");

    expect(wrapped).toContain(
      "--- Imported Draft: Night Transit [id=draft-uuid-1] ---",
    );
    expect(wrapped).toContain(
      "--- End Imported Draft: Night Transit [id=draft-uuid-1] ---",
    );
    expect(wrapped).toContain(body);

    const withOther = `User notes\n\n${wrapped}\n\nMore notes`;
    expect(pastedTextHasImportedDraft(withOther, draftId)).toBe(true);

    const stripped = stripImportedDraftBlock(withOther, draftId);
    expect(pastedTextHasImportedDraft(stripped, draftId)).toBe(false);
    expect(stripped).toBe("User notes\n\nMore notes");
    expect(stripped).not.toContain("[id=draft-uuid-1]");
  });

  it("inject replaces an existing block for the same draft id", () => {
    const draftId = "draft-uuid-2";
    const first = wrapImportedDraftBlock(draftId, "First body", "Alpha");
    const second = wrapImportedDraftBlock(draftId, "Second body", "Alpha");

    const injected = injectImportedDraftBlock("Preface", draftId, first);
    expect(pastedTextHasImportedDraft(injected, draftId)).toBe(true);
    expect(injected).toContain("First body");

    const replaced = injectImportedDraftBlock(injected, draftId, second);
    expect(replaced).toContain("Second body");
    expect(replaced).not.toContain("First body");
    expect(replaced).toContain("Preface");
  });

  it("detect/strip locate markers by id even when title is unknown to callers", () => {
    const draftId = "id-only-lookup";
    const block = wrapImportedDraftBlock(draftId, "Body text", "Some Title");
    expect(pastedTextHasImportedDraft(block, draftId)).toBe(true);
    expect(stripImportedDraftBlock(block, draftId)).toBe("");
  });
});
