import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QAReportPanel } from "./QAReportPanel";
import type { QAReportEntry } from "../services/api";

afterEach(() => {
  cleanup();
});

const report: QAReportEntry[] = [
  {
    section: "field",
    category: "Format",
    status: "pass",
    messages: ["Looks good"],
  },
  {
    section: "claims",
    category: "Format",
    status: "warn",
    messages: ["Claims may need renumbering"],
  },
  {
    section: "abstract",
    category: "Format",
    status: "fail",
    messages: ["Abstract is empty"],
  },
];

describe("QAReportPanel", () => {
  it("calls onSelectSection for warn and fail rows with the section id", async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();

    render(<QAReportPanel report={report} onSelectSection={onSelectSection} />);

    await user.click(screen.getByRole("button", { name: /CLAIMS/i }));
    expect(onSelectSection).toHaveBeenCalledWith("claims");

    await user.click(screen.getByRole("button", { name: /ABSTRACT/i }));
    expect(onSelectSection).toHaveBeenCalledWith("abstract");
    expect(onSelectSection).toHaveBeenCalledTimes(2);
  });

  it("keeps pass rows non-interactive", () => {
    const onSelectSection = vi.fn();
    render(<QAReportPanel report={report} onSelectSection={onSelectSection} />);

    expect(screen.queryByRole("button", { name: /FIELD/i })).not.toBeInTheDocument();
    expect(screen.getByText("FIELD")).toBeInTheDocument();
    expect(screen.queryAllByText("Fix in Draft")).toHaveLength(2);
  });

  it("renders without onSelectSection and does not crash", () => {
    render(<QAReportPanel report={report} />);

    expect(screen.getByText("CLAIMS")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Fix in Draft")).not.toBeInTheDocument();
  });
});
