import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeCoreFieldEmptiness,
  ReviewEmptyFieldsBanner,
} from "./ReviewEmptyFieldsBanner";

afterEach(() => {
  cleanup();
});

describe("computeCoreFieldEmptiness", () => {
  it("detects all-empty, some-empty, and none-empty", () => {
    expect(computeCoreFieldEmptiness(["", "  ", ""])).toEqual({
      allCoreFieldsEmpty: true,
      someCoreFieldsEmpty: false,
    });
    expect(computeCoreFieldEmptiness(["a", "", "b"])).toEqual({
      allCoreFieldsEmpty: false,
      someCoreFieldsEmpty: true,
    });
    expect(computeCoreFieldEmptiness(["a", "b"])).toEqual({
      allCoreFieldsEmpty: false,
      someCoreFieldsEmpty: false,
    });
  });
});

describe("ReviewEmptyFieldsBanner", () => {
  it("shows the blocking alert when all core fields are empty", () => {
    render(
      <ReviewEmptyFieldsBanner
        allCoreFieldsEmpty
        someCoreFieldsEmpty={false}
        detailNoun="grant detail"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please fill in at least one grant detail before drafting.",
    );
    expect(screen.queryByText(/still empty/i)).not.toBeInTheDocument();
  });

  it("shows the advisory banner when some core fields are empty", () => {
    render(
      <ReviewEmptyFieldsBanner
        allCoreFieldsEmpty={false}
        someCoreFieldsEmpty
        detailNoun="invention detail"
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Some invention details are still empty/i)).toBeInTheDocument();
  });

  it("renders nothing when all core fields are filled", () => {
    const { container } = render(
      <ReviewEmptyFieldsBanner
        allCoreFieldsEmpty={false}
        someCoreFieldsEmpty={false}
        detailNoun="SOW detail"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
