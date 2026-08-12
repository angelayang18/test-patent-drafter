import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoResizeTextarea } from "./AutoResizeTextarea";

type ResizeObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

let resizeCallback: ResizeObserverCallback | null = null;
let mockScrollHeight = 200;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    resizeCallback = null;
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resizeCallback = null;
});

describe("AutoResizeTextarea", () => {
  beforeEach(() => {
    mockScrollHeight = 200;
    resizeCallback = null;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return mockScrollHeight;
      },
    });

    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          borderTopWidth: "1px",
          borderBottomWidth: "1px",
        }) as CSSStyleDeclaration,
    );
  });

  it("sets style.height not less than scrollHeight for multi-line values", () => {
    render(
      <AutoResizeTextarea
        aria-label="field"
        value={"line one\nline two\nline three\nline four"}
        onChange={() => {}}
      />,
    );

    const el = screen.getByRole("textbox");
    const applied = Number.parseFloat(el.style.height);

    expect(Number.isFinite(applied)).toBe(true);
    expect(applied).toBeGreaterThanOrEqual(el.scrollHeight);
    // border-box compensation: 200 scrollHeight + 1px + 1px borders
    expect(applied).toBe(202);
  });

  it("re-adjusts height when the field width changes", () => {
    render(
      <AutoResizeTextarea
        aria-label="field"
        value={"line one\nline two\nline three\nline four"}
        onChange={() => {}}
      />,
    );

    const el = screen.getByRole("textbox");
    expect(Number.parseFloat(el.style.height)).toBe(202);
    expect(resizeCallback).toBeTypeOf("function");

    // Initial observe notification (same content height).
    resizeCallback?.(
      [{ contentRect: { width: 400 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(Number.parseFloat(el.style.height)).toBe(202);

    // Narrower width wraps an extra line (24px), matching production measurements.
    mockScrollHeight = 224;
    resizeCallback?.(
      [{ contentRect: { width: 280 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    const applied = Number.parseFloat(el.style.height);
    expect(applied).toBeGreaterThanOrEqual(el.scrollHeight);
    expect(applied).toBe(226);
  });
});
