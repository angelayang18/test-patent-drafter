import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewSourceMaterialPanel } from "./ReviewSourceMaterialPanel";

afterEach(() => {
  cleanup();
});

describe("ReviewSourceMaterialPanel", () => {
  it("shows empty state when no sources or guidance", () => {
    render(
      <ReviewSourceMaterialPanel
        uploadedFiles={[]}
        cachedRemoteSources={{}}
        relevantContentNotes=""
        irrelevantContentNotes=""
        pastedText=""
      />,
    );

    expect(screen.getByText("Source Material")).toBeInTheDocument();
    expect(screen.getByText(/No source material found/i)).toBeInTheDocument();
  });

  it("lists relevance guidance, pasted text, and uploaded files", () => {
    render(
      <ReviewSourceMaterialPanel
        uploadedFiles={[
          { id: "1", filename: "notes.pdf", sizeBytes: 2048, content: "PDF body" },
        ]}
        cachedRemoteSources={{}}
        relevantContentNotes="Focus on claims"
        irrelevantContentNotes=""
        pastedText="Pasted invention text"
      />,
    );

    expect(screen.getByText("Relevance guidance")).toBeInTheDocument();
    expect(screen.getByText(/relevant notes for extraction/i)).toBeInTheDocument();
    expect(screen.getByText("Pasted text")).toBeInTheDocument();
    expect(screen.getByText("notes.pdf")).toBeInTheDocument();
  });

  it("lists confluence and website sources from cache", () => {
    render(
      <ReviewSourceMaterialPanel
        uploadedFiles={[]}
        cachedRemoteSources={{
          confluence: {
            url: "https://example.atlassian.net",
            spaceKey: "ENG",
            content: "Confluence page body",
          },
          website: [{ url: "https://example.com/docs", content: "Website body" }],
        }}
        relevantContentNotes=""
        irrelevantContentNotes=""
        pastedText=""
      />,
    );

    expect(screen.getByText(/Confluence · ENG/)).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/docs")).toBeInTheDocument();
  });

  it("opens pasted-text preview on visibility click", async () => {
    const user = userEvent.setup();
    render(
      <ReviewSourceMaterialPanel
        uploadedFiles={[]}
        cachedRemoteSources={{}}
        relevantContentNotes=""
        irrelevantContentNotes=""
        pastedText="Hello preview"
      />,
    );

    await user.click(screen.getByLabelText("Preview pasted text"));
    expect(screen.getByText("Hello preview")).toBeInTheDocument();
  });

  it("renders optional footer slot", () => {
    render(
      <ReviewSourceMaterialPanel
        uploadedFiles={[]}
        cachedRemoteSources={{}}
        relevantContentNotes=""
        irrelevantContentNotes=""
        pastedText=""
        footer={<button type="button">Add source material</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Add source material" })).toBeInTheDocument();
  });
});
