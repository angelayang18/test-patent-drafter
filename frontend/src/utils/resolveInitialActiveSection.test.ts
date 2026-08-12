import { describe, expect, it } from "vitest";
import { resolveInitialActiveSection } from "./resolveInitialActiveSection";

describe("resolveInitialActiveSection", () => {
  const sectionIds = ["field", "background", "claims", "abstract"];

  it("returns the query section when it is a valid id", () => {
    expect(resolveInitialActiveSection(sectionIds, "claims")).toBe("claims");
  });

  it("falls back to the first section when the query is missing", () => {
    expect(resolveInitialActiveSection(sectionIds, null)).toBe("field");
    expect(resolveInitialActiveSection(sectionIds, undefined)).toBe("field");
  });

  it("falls back to the first section when the query is not a valid id", () => {
    expect(resolveInitialActiveSection(sectionIds, "not_a_section")).toBe("field");
  });
});
