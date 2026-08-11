import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listDocumentTypeTemplates,
  saveDocumentTypeTemplate,
  type DocumentTypeTemplate,
} from "../utils/documentTypeTemplates";
import Home from "./Home";

const TEMPLATES_KEY = "patent-drafter-custom-document-types";

function emptyInputSources() {
  return {
    relevantContentNotes: "",
    irrelevantContentNotes: "",
    confluenceUrl: "",
    confluenceSpaceKey: "",
    confluenceToken: "",
    websiteUrls: [] as string[],
    pastedText: "",
  };
}

function mockPatentWorkflow() {
  return {
    sectionSettings: {},
    setSectionSettings: vi.fn(),
    workflowResetting: false,
    getWorkflowSnapshot: () => ({
      invention: null,
      grantDetails: null,
      uploadedFiles: [],
      inputSources: emptyInputSources(),
      sections: {},
      figures: [],
      brief_description_of_drawings: "",
      workflowMode: "patent" as const,
    }),
    saveNamedDraft: vi.fn(),
    clearWorkflow: vi.fn(),
    saveToStorage: vi.fn(),
  };
}

function mockGrantLikeWorkflow(detailsKey: "grantDetails" | "sowDetails" | "adaDetails") {
  return {
    sectionSettings: {},
    setSectionSettings: vi.fn(),
    workflowResetting: false,
    getWorkflowSnapshot: () => ({
      [detailsKey]: null,
      uploadedFiles: [],
      inputSources: emptyInputSources(),
      sections: {},
    }),
    saveNamedDraft: vi.fn(),
    clearWorkflow: vi.fn(),
    saveToStorage: vi.fn(),
  };
}

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => null),
    isLoaded: true,
    isSignedIn: true,
  }),
  useUser: () => ({
    user: {
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
    },
  }),
}));

vi.mock("../services/api", async () => {
  const actual = await vi.importActual<typeof import("../services/api")>("../services/api");
  return {
    ...actual,
    listCommunityDocumentTypeTemplates: vi.fn(async () => []),
    publishDocumentTypeTemplate: vi.fn(async () => ({
      id: "community_test",
      created_at: "2026-01-01T00:00:00.000Z",
    })),
  };
});

vi.mock("../context/PatentWorkflowContext", () => ({
  usePatentWorkflow: () => mockPatentWorkflow(),
}));

vi.mock("../context/GrantWorkflowContext", () => ({
  useGrantWorkflow: () => mockGrantLikeWorkflow("grantDetails"),
}));

vi.mock("../context/SowWorkflowContext", () => ({
  useSowWorkflow: () => mockGrantLikeWorkflow("sowDetails"),
}));

vi.mock("../context/AdaWorkflowContext", () => ({
  useAdaWorkflow: () => mockGrantLikeWorkflow("adaDetails"),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

const CUSTOM_TEMPLATE: DocumentTypeTemplate = {
  id: "custom_my_report_1",
  name: "My Custom Report",
  description: "A custom document type",
  sections: [
    { id: "intro", name: "Introduction", description: "", order: 0 },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Home custom document type delete", () => {
  beforeEach(() => {
    localStorage.clear();
    saveDocumentTypeTemplate(CUSTOM_TEMPLATE);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("shows a delete icon only on custom template cards, not built-in types", () => {
    render(<Home />);

    const builtinIds = [
      "PATENT_PROVISIONAL",
      "GRANT_APPLICATION",
      "SOW_CONTRACT",
      "ADA_BIOANALYTICAL_REPORT",
    ];
    for (const id of builtinIds) {
      const card = screen.getByTestId(`builtin-type-card-${id}`);
      expect(within(card).queryByLabelText(/^Delete /)).toBeNull();
      expect(within(card).queryByText("delete")).toBeNull();
    }

    expect(screen.getByTestId(`delete-template-${CUSTOM_TEMPLATE.id}`)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Delete ${CUSTOM_TEMPLATE.name}` }),
    ).toBeInTheDocument();
  });

  it("confirms before deleting and removes the template from localStorage and the list", async () => {
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByText(CUSTOM_TEMPLATE.name)).toBeInTheDocument();
    expect(listDocumentTypeTemplates()).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: `Delete ${CUSTOM_TEMPLATE.name}` }),
    );

    const confirm = screen.getByTestId("delete-template-confirm");
    expect(confirm).toHaveTextContent(
      `Are you sure you want to delete '${CUSTOM_TEMPLATE.name}'? This can't be undone.`,
    );

    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(screen.queryByText(CUSTOM_TEMPLATE.name)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`custom-template-card-${CUSTOM_TEMPLATE.id}`)).toBeNull();
    expect(listDocumentTypeTemplates()).toHaveLength(0);
    expect(localStorage.getItem(TEMPLATES_KEY)).toBe("[]");
  });

  it("resets selection away from a deleted custom template", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByTestId(`custom-template-card-${CUSTOM_TEMPLATE.id}`));
    expect(
      screen.getByTestId(`custom-template-card-${CUSTOM_TEMPLATE.id}`),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("button", { name: `Delete ${CUSTOM_TEMPLATE.name}` }),
    );
    await user.click(
      within(screen.getByTestId("delete-template-confirm")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(screen.queryByTestId(`custom-template-card-${CUSTOM_TEMPLATE.id}`)).toBeNull();
    expect(screen.getByTestId("builtin-type-card-PATENT_PROVISIONAL")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("cancels delete without removing the template", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: `Delete ${CUSTOM_TEMPLATE.name}` }),
    );
    await user.click(
      within(screen.getByTestId("delete-template-confirm")).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(screen.queryByTestId("delete-template-confirm")).toBeNull();
    expect(screen.getByText(CUSTOM_TEMPLATE.name)).toBeInTheDocument();
    expect(listDocumentTypeTemplates()).toHaveLength(1);
  });
});
