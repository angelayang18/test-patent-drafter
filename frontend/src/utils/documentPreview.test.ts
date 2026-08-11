import { describe, expect, it } from "vitest";
import {
  draftPreviewSectionKeys,
  orderedPreviewSectionKeys,
} from "./documentPreview";

describe("draftPreviewSectionKeys", () => {
  it("uses an explicit sectionOrder for non-patent keys", () => {
    const sections = {
      purpose: "Purpose body",
      objectives: "Objectives body",
      empty_custom: "   ",
    };
    const sectionOrder = ["objectives", "purpose", "empty_custom", "missing"];

    expect(draftPreviewSectionKeys(sections, sectionOrder)).toEqual([
      "objectives",
      "purpose",
    ]);
  });

  it("preserves patent behavior when sectionOrder is omitted", () => {
    const sections = {
      field: "Field body",
      background: "Background body",
    };

    expect(draftPreviewSectionKeys(sections)).toEqual([
      "cross_reference",
      "field",
      "background",
      "summary",
      "description",
      "claims",
      "abstract",
    ]);
  });

  it("preserves grant sniffing when sectionOrder is omitted", () => {
    const sections = {
      executive_summary: "Summary body",
      methodology: "Method body",
      evaluation: "   ",
    };

    expect(draftPreviewSectionKeys(sections)).toEqual([
      "executive_summary",
      "methodology",
    ]);
  });
});

describe("orderedPreviewSectionKeys", () => {
  it("honors explicit sectionOrder and drops empty content", () => {
    const sections = {
      study_overview: "Overview",
      method_summary: "",
      sensitivity: "Sensitive",
    };

    expect(
      orderedPreviewSectionKeys(sections, [
        "method_summary",
        "sensitivity",
        "study_overview",
      ]),
    ).toEqual(["sensitivity", "study_overview"]);
  });

  it("preserves patent non-empty filtering when sectionOrder is omitted", () => {
    const sections = {
      field: "Field body",
      claims: "",
      abstract: "Abstract body",
    };

    expect(orderedPreviewSectionKeys(sections)).toEqual([
      "cross_reference",
      "field",
      "abstract",
    ]);
  });
});
