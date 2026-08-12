import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultInvention, PATENT_SECTION_IDS } from "../types/patent";
import Draft from "./Draft";

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/AttorneyFeedbackPanel", () => ({
  AttorneyFeedbackPanel: () => null,
}));

vi.mock("../components/PatentNotesSidebar", () => ({
  PatentNotesSidebar: () => null,
}));

vi.mock("../components/DocumentPreviewModal", () => ({
  DocumentPreviewModal: () => null,
}));

vi.mock("../components/SectionCitationsPanel", () => ({
  SectionCitationsPanel: () => null,
}));

vi.mock("../components/SectionManagerModal", () => ({
  SectionManagerModal: () => null,
}));

vi.mock("../components/SelectionRegeneratePopover", () => ({
  SelectionRegeneratePopover: () => null,
}));

vi.mock("../utils/draftStorage", async () => {
  const actual = await vi.importActual<typeof import("../utils/draftStorage")>(
    "../utils/draftStorage",
  );
  return {
    ...actual,
    isWorkflowStepAccessible: () => true,
    hasDraftSections: () => true,
  };
});

vi.mock("../context/PatentWorkflowContext", () => ({
  usePatentWorkflow: () => ({
    workflowMode: "patent",
    invention: { ...defaultInvention, invention_title: "Test Invention" },
    grantDetails: null,
    sections: Object.fromEntries(PATENT_SECTION_IDS.map((id) => [id, `${id} content`])),
    filingInfo: {},
    attorneyFeedback: {},
    approvedExemplars: {},
    sectionCitations: {},
    sectionSettings: {},
    setAttorneyFeedback: vi.fn(),
    setApprovedExemplar: vi.fn(),
    setSectionCitations: vi.fn(),
    setSectionSettings: vi.fn(),
    captureAiInitialSections: vi.fn(),
    setSection: vi.fn(),
    setSections: vi.fn(),
    saveToStorage: vi.fn(),
    getWorkflowSnapshot: () => ({
      invention: { ...defaultInvention, invention_title: "Test Invention" },
      grantDetails: null,
      uploadedFiles: [],
      inputSources: {
        relevantContentNotes: "",
        irrelevantContentNotes: "",
        confluenceUrl: "",
        confluenceSpaceKey: "",
        confluenceToken: "",
        websiteUrls: [],
        pastedText: "",
      },
      sections: Object.fromEntries(PATENT_SECTION_IDS.map((id) => [id, `${id} content`])),
      figures: [],
      brief_description_of_drawings: "",
      workflowMode: "patent",
      completedSteps: ["input", "review", "draft"],
    }),
    markStepComplete: vi.fn(),
    autoDraftPending: false,
    clearAutoDraftPending: vi.fn(),
    workflowResetting: false,
    gatherSourceText: vi.fn(async () => ({ sources: [], warnings: [] })),
    uploadedFiles: [],
    inputSources: {
      relevantContentNotes: "",
      irrelevantContentNotes: "",
      confluenceUrl: "",
      confluenceSpaceKey: "",
      confluenceToken: "",
      websiteUrls: [],
      pastedText: "",
    },
    cachedRemoteSources: {},
  }),
}));

afterEach(() => {
  cleanup();
});

describe("Draft section query param", () => {
  it("sets the initial active section from ?section= on mount", () => {
    render(
      <MemoryRouter initialEntries={["/patent/draft?section=claims"]}>
        <Routes>
          <Route path="/patent/draft" element={<Draft />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Claims" })).toBeInTheDocument();
    expect(screen.getByText(/Document Section 5 of 6/i)).toBeInTheDocument();
  });

  it("falls back to the first section when ?section= is invalid", () => {
    render(
      <MemoryRouter initialEntries={["/patent/draft?section=not_real"]}>
        <Routes>
          <Route path="/patent/draft" element={<Draft />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Field of the Invention" })).toBeInTheDocument();
  });
});
