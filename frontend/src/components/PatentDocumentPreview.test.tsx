import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatentDocumentPreview } from "./PatentDocumentPreview";

vi.mock("./MermaidPreview", () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("PatentDocumentPreview", () => {
  it("renders non-patent sections when sectionOrder is provided", () => {
    render(
      <PatentDocumentPreview
        inventionTitle="Engagement Alpha"
        sections={{
          purpose: "This SOW defines the engagement purpose.",
          objectives: "Deliver the agreed objectives.",
        }}
        sectionOrder={["purpose", "objectives", "scope_of_work"]}
        documentLabel="Statement of Work Draft"
      />,
    );

    expect(screen.getByText("Statement of Work Draft")).toBeInTheDocument();
    expect(screen.getByText("PURPOSE / INTRODUCTION & BACKGROUND")).toBeInTheDocument();
    expect(screen.getByText("This SOW defines the engagement purpose.")).toBeInTheDocument();
    expect(screen.getByText("OBJECTIVES")).toBeInTheDocument();
    expect(screen.getByText("Deliver the agreed objectives.")).toBeInTheDocument();
    expect(
      screen.queryByText("Sections will appear here as they are drafted."),
    ).not.toBeInTheDocument();
  });

  it("shows empty state for unknown keys when sectionOrder is omitted", () => {
    render(
      <PatentDocumentPreview
        inventionTitle="Engagement Alpha"
        sections={{
          purpose: "This SOW defines the engagement purpose.",
          objectives: "Deliver the agreed objectives.",
        }}
      />,
    );

    expect(
      screen.getByText("Sections will appear here as they are drafted."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This SOW defines the engagement purpose."),
    ).not.toBeInTheDocument();
  });

  it("preserves patent section rendering when sectionOrder is omitted", () => {
    render(
      <PatentDocumentPreview
        inventionTitle="Widget System"
        sections={{
          field: "The present invention relates to widgets.",
          abstract: "A widget system is disclosed.",
        }}
      />,
    );

    expect(screen.getByText("Provisional Patent Application Draft")).toBeInTheDocument();
    expect(screen.getByText("FIELD")).toBeInTheDocument();
    expect(
      screen.getByText("The present invention relates to widgets."),
    ).toBeInTheDocument();
    expect(screen.getByText("ABSTRACT")).toBeInTheDocument();
    expect(screen.getByText("A widget system is disclosed.")).toBeInTheDocument();
  });

  it("preserves grant sniffing when sectionOrder is omitted", () => {
    render(
      <PatentDocumentPreview
        inventionTitle="Community Grant"
        sections={{
          executive_summary: "This proposal seeks funding.",
          methodology: "We will use mixed methods.",
        }}
      />,
    );

    expect(screen.getByText("EXECUTIVE SUMMARY")).toBeInTheDocument();
    expect(screen.getByText("This proposal seeks funding.")).toBeInTheDocument();
    expect(screen.getByText("METHODOLOGY")).toBeInTheDocument();
    expect(screen.getByText("We will use mixed methods.")).toBeInTheDocument();
    expect(
      screen.queryByText("Sections will appear here as they are drafted."),
    ).not.toBeInTheDocument();
  });
});
