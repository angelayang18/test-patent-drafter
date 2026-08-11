import { describe, expect, it } from "vitest";
import {
  buildReviewFieldValues,
  resolveCitationPreviewSource,
} from "./resolveCitationPreviewSource";

describe("resolveCitationPreviewSource", () => {
  it("resolves pasted text labels", () => {
    const result = resolveCitationPreviewSource("Pasted text", {
      pastedText: "Hello from paste",
    });
    expect(result).toEqual({
      title: "Pasted text",
      subtitle: "Text entered on the Input step",
      content: "Hello from paste",
    });
  });

  it("resolves website URL labels from cache", () => {
    const result = resolveCitationPreviewSource("https://example.com/a", {
      cachedRemoteSources: {
        website: [{ url: "https://example.com/a", content: "Site body" }],
      },
    });
    expect(result).toEqual({
      title: "Website",
      subtitle: "https://example.com/a",
      content: "Site body",
    });
  });

  it("resolves Confluence page-title labels from cached multi-page content", () => {
    const result = resolveCitationPreviewSource("Architecture Notes", {
      cachedRemoteSources: {
        confluence: {
          url: "https://example.atlassian.net",
          spaceKey: "ENG",
          content: [
            "--- Overview ---\nHigh level summary.",
            "--- Architecture Notes ---\nDetail about the system.",
          ].join("\n\n"),
        },
      },
    });
    expect(result).toEqual({
      title: "Architecture Notes",
      subtitle: "Confluence · ENG",
      content: "Detail about the system.",
    });
  });

  it("prefers uploaded filename matches", () => {
    const result = resolveCitationPreviewSource("deck.pptx", {
      uploadedFiles: [
        { filename: "deck.pptx", content: "Slide text", sizeBytes: 2048 },
      ],
      pastedText: "unrelated",
    });
    expect(result?.title).toBe("deck.pptx");
    expect(result?.content).toBe("Slide text");
  });

  it("resolves Your reviewed field labels from reviewFieldValues", () => {
    const fieldBody =
      "Communities lack reliable transit options during off-peak hours, limiting access to jobs and care.";
    const result = resolveCitationPreviewSource("Your reviewed Problem Statement", {
      reviewFieldValues: {
        "Problem Statement": fieldBody,
      },
    });
    expect(result).toEqual({
      title: "Problem Statement",
      subtitle: "From your reviewed answers",
      content: fieldBody,
    });
  });

  it("returns null for unmatched Your reviewed labels", () => {
    expect(
      resolveCitationPreviewSource("Your reviewed Title", {
        pastedText: "something",
        reviewFieldValues: {
          "Problem Statement": "A non-empty reviewed answer for another field.",
        },
      }),
    ).toBeNull();
  });

  it("returns null when the reviewed field value is empty", () => {
    expect(
      resolveCitationPreviewSource("Your reviewed Problem Statement", {
        reviewFieldValues: {
          "Problem Statement": "   ",
        },
      }),
    ).toBeNull();
  });

  it("returns null when reviewFieldValues omits the field", () => {
    expect(
      resolveCitationPreviewSource("Your reviewed Problem Statement", {
        reviewFieldValues: {},
      }),
    ).toBeNull();
  });

  it("resolves Imported Draft labels from pastedText markers", () => {
    const draftId = "abc-123";
    const title = "Night Transit Hub";
    const body = "## Summary\n\nReliable off-peak routing for care access.";
    const pastedText = [
      "--- Imported Draft: Night Transit Hub [id=abc-123] ---",
      body,
      "--- End Imported Draft: Night Transit Hub [id=abc-123] ---",
    ].join("\n");

    const result = resolveCitationPreviewSource(
      `Imported Draft: ${title} [id=${draftId}]`,
      { pastedText },
    );

    expect(result).toEqual({
      title: "Night Transit Hub",
      subtitle: "Imported draft",
      content: body,
    });
  });

  it("returns null for malformed imported-draft-looking labels", () => {
    const pastedText = [
      "--- Imported Draft: Night Transit Hub [id=abc-123] ---",
      "Body content",
      "--- End Imported Draft: Night Transit Hub [id=abc-123] ---",
    ].join("\n");

    expect(
      resolveCitationPreviewSource("Imported Draft: Missing Id Only", {
        pastedText,
      }),
    ).toBeNull();
    expect(
      resolveCitationPreviewSource("Imported Draft: [id=]", { pastedText }),
    ).toBeNull();
    expect(
      resolveCitationPreviewSource(
        "Imported Draft: Ghost Draft [id=does-not-exist]",
        { pastedText },
      ),
    ).toBeNull();
    expect(
      resolveCitationPreviewSource(
        "End Imported Draft: Night Transit Hub [id=abc-123]",
        { pastedText },
      ),
    ).toBeNull();
  });
});

describe("buildReviewFieldValues", () => {
  it("maps non-empty fields by citation label and joins array values", () => {
    expect(
      buildReviewFieldValues(
        {
          problem_statement: "Problem Statement",
          key_components: "Key Components",
          invention_title: "Invention Title",
        },
        {
          problem_statement: "Need reliable transit options for night-shift workers.",
          key_components: ["Sensor hub", "Routing engine"],
          invention_title: "   ",
        },
      ),
    ).toEqual({
      "Problem Statement": "Need reliable transit options for night-shift workers.",
      "Key Components": "Sensor hub\nRouting engine",
    });
  });
});
