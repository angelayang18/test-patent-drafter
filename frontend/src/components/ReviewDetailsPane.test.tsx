import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewDetailsPane } from "./ReviewDetailsPane";

afterEach(() => {
  cleanup();
});

describe("ReviewDetailsPane", () => {
  it("renders title, description, children, and regenerate-all control", async () => {
    const user = userEvent.setup();
    const onRegenerateAll = vi.fn();

    render(
      <ReviewDetailsPane
        title="Extracted Grant Details"
        description="Edit fields below."
        onRegenerateAll={onRegenerateAll}
        regeneratingAll={false}
        isBusy={false}
      >
        <p>Field body</p>
      </ReviewDetailsPane>,
    );

    expect(screen.getByText("Extracted Grant Details")).toBeInTheDocument();
    expect(screen.getByText("Edit fields below.")).toBeInTheDocument();
    expect(screen.getByText("Field body")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Regenerate all/i }));
    expect(onRegenerateAll).toHaveBeenCalledTimes(1);
  });

  it("disables regenerate-all while busy", () => {
    render(
      <ReviewDetailsPane
        title="Details"
        description="Desc"
        onRegenerateAll={() => {}}
        regeneratingAll
        isBusy
      >
        <div />
      </ReviewDetailsPane>,
    );

    expect(screen.getByRole("button", { name: /Regenerate all/i })).toBeDisabled();
  });
});
