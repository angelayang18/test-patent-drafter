import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import GrantFigures from "./GrantFigures";

const { generateGenericFigures, setFigures } = vi.hoisted(() => ({
  generateGenericFigures: vi.fn().mockResolvedValue({
    figures: [
      {
        number: 1,
        sectionId: "methodology",
        title: "Overview",
        brief_description: "System overview diagram.",
        reference_numerals: {},
        mermaid: "flowchart TD\nA-->B",
      },
    ],
  }),
  setFigures: vi.fn(),
}));

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>(
    "../../services/api",
  );
  return {
    ...actual,
    generateGenericFigures,
    regenerateGenericFigure: vi.fn(),
    renderFigurePng: vi.fn(),
  };
});

vi.mock("../../components/GrantAppShell", () => ({
  GrantAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/DocumentPreviewModal", () => ({
  DocumentPreviewModal: () => null,
}));

vi.mock("../../components/MermaidPreview", () => ({
  default: () => <div data-testid="mermaid-preview" />,
}));

vi.mock("../../utils/figurePngPrerender", () => ({
  figuresSignature: () => "sig",
  prerenderFigurePngs: vi.fn(async () => ({})),
}));

vi.mock("../../utils/grantStorage", async () => {
  const actual = await vi.importActual<typeof import("../../utils/grantStorage")>(
    "../../utils/grantStorage",
  );
  return {
    ...actual,
    isGrantStepAccessible: () => true,
  };
});

vi.mock("../../context/GrantWorkflowContext", () => ({
  useGrantWorkflow: () => ({
    grantDetails: { project_title: "Climate Project" },
    sections: { methodology: "We will deploy sensors and analyze telemetry." },
    sectionSettings: {
      methodology: { order: 3, included: true, needsFigure: true },
    },
    figures: [],
    setFigures,
    updateFigure: vi.fn(),
    saveToStorage: vi.fn(),
    getWorkflowSnapshot: () => ({
      grantDetails: { project_title: "Climate Project" },
      sections: { methodology: "We will deploy sensors and analyze telemetry." },
      sectionSettings: {
        methodology: { order: 3, included: true, needsFigure: true },
      },
      figures: [],
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
      completedSteps: ["input", "review", "draft"],
    }),
    markStepComplete: vi.fn(),
    workflowResetting: false,
  }),
}));

afterEach(() => {
  cleanup();
  generateGenericFigures.mockClear();
  setFigures.mockClear();
});

describe("GrantFigures", () => {
  it("calls generateGenericFigures for a flagged section when Generate diagram is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grant/figures"]}>
        <Routes>
          <Route path="/grant/figures" element={<GrantFigures />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Generate diagram/i }));

    expect(generateGenericFigures).toHaveBeenCalledTimes(1);
    expect(generateGenericFigures).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        documentTypeLabel: "Grant Application",
        documentTitle: "Climate Project",
        sections: [
          expect.objectContaining({
            sectionId: "methodology",
            sectionName: "Methodology",
            sectionContent: "We will deploy sensors and analyze telemetry.",
          }),
        ],
      }),
    );
  });
});
