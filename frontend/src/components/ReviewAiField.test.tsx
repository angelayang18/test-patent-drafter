import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewAiField } from "./ReviewAiField";

afterEach(() => {
  cleanup();
});

describe("ReviewAiField", () => {
  it("renders label, AI-Generated badge, hint, and children", () => {
    render(
      <ReviewAiField label="Project Title" hint="Working title" onRegenerate={() => {}} regenerating={false}>
        <textarea aria-label="field" />
      </ReviewAiField>,
    );

    expect(screen.getByText("Project Title")).toBeInTheDocument();
    expect(screen.getByText("AI-Generated")).toBeInTheDocument();
    expect(screen.getByText("Working title")).toBeInTheDocument();
    expect(screen.getByLabelText("field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate with AI/i })).toBeInTheDocument();
  });

  it("invokes onRegenerate and shows loading label", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const { rerender } = render(
      <ReviewAiField label="Field" onRegenerate={onRegenerate} regenerating={false}>
        <div />
      </ReviewAiField>,
    );

    await user.click(screen.getByRole("button", { name: /Regenerate with AI/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(
      <ReviewAiField label="Field" onRegenerate={onRegenerate} regenerating>
        <div />
      </ReviewAiField>,
    );
    expect(screen.getByRole("button", { name: /Regenerating/i })).toBeDisabled();
  });

  it("renders extraActions alongside regenerate", () => {
    render(
      <ReviewAiField
        label="Title"
        onRegenerate={() => {}}
        regenerating={false}
        extraActions={<button type="button">Suggest titles</button>}
      >
        <div />
      </ReviewAiField>,
    );

    expect(screen.getByRole("button", { name: "Suggest titles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate with AI/i })).toBeInTheDocument();
  });
});
