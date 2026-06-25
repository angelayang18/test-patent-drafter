const MIRROR_STYLE_PROPS = [
  "direction",
  "boxSizing",
  "width",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

/**
 * Compute a viewport-relative DOMRect for the selected range inside a textarea.
 */
export function getTextareaSelectionRect(
  textarea: HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number,
): DOMRect {
  const mirror = document.createElement("div");
  document.body.appendChild(mirror);

  const mirrorStyle = mirror.style;
  const computed = window.getComputedStyle(textarea);

  mirrorStyle.position = "absolute";
  mirrorStyle.visibility = "hidden";
  mirrorStyle.whiteSpace = "pre-wrap";
  mirrorStyle.wordWrap = "break-word";
  mirrorStyle.top = "0";
  mirrorStyle.left = "-9999px";

  for (const prop of MIRROR_STYLE_PROPS) {
    mirrorStyle.setProperty(prop, computed.getPropertyValue(prop));
  }

  mirrorStyle.width = `${textarea.clientWidth}px`;

  const value = textarea.value;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd) || ".";
  const after = value.slice(selectionEnd);

  mirror.textContent = "";
  mirror.append(document.createTextNode(before));
  const marker = document.createElement("span");
  marker.textContent = selected;
  mirror.append(marker);
  mirror.append(document.createTextNode(after));

  const textareaRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  document.body.removeChild(mirror);

  const top =
    textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
  const left =
    textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;

  return new DOMRect(left, top, markerRect.width, markerRect.height);
}

export interface TextareaSelectionRange {
  start: number;
  end: number;
  text: string;
  anchorRect: DOMRect;
}

/**
 * Read a non-empty textarea selection, or null when none is active.
 */
export function readTextareaSelection(
  textarea: HTMLTextAreaElement,
): TextareaSelectionRange | null {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === selectionEnd) {
    return null;
  }

  const text = value.slice(selectionStart, selectionEnd);
  if (!text.trim()) {
    return null;
  }

  const domSelection = window.getSelection();
  if (domSelection && !domSelection.isCollapsed) {
    const anchorNode = domSelection.anchorNode;
    const focusNode = domSelection.focusNode;
    const withinTextarea =
      textarea.contains(anchorNode) ||
      textarea.contains(focusNode) ||
      anchorNode === textarea ||
      focusNode === textarea;
    if (!withinTextarea && domSelection.toString().trim().length > 0) {
      return null;
    }
  }

  return {
    start: selectionStart,
    end: selectionEnd,
    text,
    anchorRect: getTextareaSelectionRect(textarea, selectionStart, selectionEnd),
  };
}
