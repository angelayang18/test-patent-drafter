import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SectionCitationsPanel } from "./SectionCitationsPanel";

afterEach(() => {
  cleanup();
});

describe("SectionCitationsPanel", () => {
  it("makes pasted-text citation labels clickable and opens highlighted preview", async () => {
    const user = userEvent.setup();
    const excerpt = "novel mechanism uses transformer embeddings";
    const pastedBody = [
      "Prior art systems leave gaps.",
      `The ${excerpt} with tokenization.`,
      "Additional closing notes.",
    ].join(" ");

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Pasted text",
            location: "Paragraph 1",
            excerpt,
          },
        ]}
        pastedText={pastedBody}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    const labelButton = screen.getByRole("button", { name: "Pasted text" });
    expect(labelButton).toBeInTheDocument();

    await user.click(labelButton);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Pasted text" })).toBeInTheDocument();
    const mark = within(dialog).getByText(excerpt);
    expect(mark.tagName).toBe("MARK");
  });

  it("makes uploaded-file citation labels clickable", async () => {
    const user = userEvent.setup();
    const excerpt = "cosine similarity ranking";

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "notes.pdf",
            location: "Page 2",
            excerpt,
          },
        ]}
        uploadedFiles={[
          {
            id: "1",
            filename: "notes.pdf",
            sizeBytes: 1024,
            content: `Intro paragraph. The ${excerpt} over dense passages.`,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    await user.click(screen.getByRole("button", { name: "notes.pdf" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(excerpt).tagName).toBe("MARK");
  });

  it("makes website citation labels clickable", async () => {
    const user = userEvent.setup();
    const excerpt = "scraped website invention detail";
    const url = "https://example.com/docs";

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: url,
            location: "Paragraph 1",
            excerpt,
          },
        ]}
        cachedRemoteSources={{
          website: [{ url, content: `Lead-in. ${excerpt}. Trailing notes.` }],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    await user.click(screen.getByRole("button", { name: url }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Website" })).toBeInTheDocument();
    expect(within(dialog).getByText(excerpt).tagName).toBe("MARK");
  });

  it("leaves unmatched citation labels non-interactive", async () => {
    const user = userEvent.setup();
    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Your reviewed Problem Statement",
            location: "",
            excerpt: "some reviewed text",
          },
        ]}
        pastedText=""
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    expect(screen.getByText("Your reviewed Problem Statement")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Your reviewed Problem Statement" })).toBeNull();
  });

  it("makes Your reviewed field citation labels clickable when values are provided", async () => {
    const user = userEvent.setup();
    const excerpt = "reliable transit options during off-peak hours";
    const fieldBody = `Communities lack ${excerpt}, limiting access to jobs and care.`;

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Your reviewed Problem Statement",
            location: "Paragraph 1",
            excerpt,
          },
        ]}
        reviewFieldValues={{
          "Problem Statement": fieldBody,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    await user.click(
      screen.getByRole("button", { name: "Your reviewed Problem Statement" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Problem Statement" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(excerpt).tagName).toBe("MARK");
  });

  it("highlights full_excerpt in the preview when both excerpts are present", async () => {
    const user = userEvent.setup();
    const shortExcerpt =
      "The novel mechanism uses transformer embeddings with tokenization.";
    const fullExcerpt = [
      shortExcerpt,
      "A second sentence adds cosine similarity ranking over dense passages and",
      "continues with decoder synthesizer components for the full matched paragraph.",
    ].join(" ");
    const pastedBody = `Lead-in notes. ${fullExcerpt} Trailing notes.`;

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Pasted text",
            location: "Paragraph 1",
            excerpt: shortExcerpt,
            full_excerpt: fullExcerpt,
          },
        ]}
        pastedText={pastedBody}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    // List still shows the short quote.
    expect(screen.getByText(`“${shortExcerpt}”`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pasted text" }));

    const dialog = screen.getByRole("dialog");
    const mark = within(dialog).getByText((_content, element) => {
      return element?.tagName === "MARK" && (element.textContent ?? "").includes(fullExcerpt);
    });
    expect(mark.tagName).toBe("MARK");
    expect(mark.textContent).toBe(fullExcerpt);
    expect(mark.textContent?.length).toBeGreaterThan(shortExcerpt.length);
  });

  it("falls back to short excerpt for preview highlight when full_excerpt is missing", async () => {
    const user = userEvent.setup();
    const excerpt = "legacy payload short excerpt only";

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Pasted text",
            location: "Paragraph 1",
            excerpt,
          },
        ]}
        pastedText={`Intro. The ${excerpt} appears here. Outro.`}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    await user.click(screen.getByRole("button", { name: "Pasted text" }));

    const dialog = screen.getByRole("dialog");
    const mark = within(dialog).getByText(excerpt);
    expect(mark.tagName).toBe("MARK");
  });

  it("falls back to short excerpt when full_excerpt is empty", async () => {
    const user = userEvent.setup();
    const excerpt = "empty full_excerpt should not break preview";

    render(
      <SectionCitationsPanel
        citations={[
          {
            label: "Pasted text",
            location: "Paragraph 1",
            excerpt,
            full_excerpt: "",
          },
        ]}
        pastedText={`Lead-in. ${excerpt}. Trailing.`}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Source citations/i }));
    await user.click(screen.getByRole("button", { name: "Pasted text" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(excerpt).tagName).toBe("MARK");
  });
});
