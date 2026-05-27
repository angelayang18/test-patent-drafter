import type {
  FiguresResult,
  InventionDetails,
  PatentDraft,
  PatentFigure,
} from "../types/patent";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? import.meta.env.REACT_APP_API_URL ?? "http://localhost:8000";

export type { InventionDetails, PatentDraft, PatentFigure, FiguresResult };

export interface SourceContent {
  title?: string;
  url?: string;
  filename?: string;
  content: string;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string | { msg: string }[] };
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg).join(", ");
    }
  } catch {
    // Response body is not JSON.
  }
  return response.statusText || "Request failed";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function uploadDocuments(files: File[]): Promise<SourceContent[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const data = await requestJson<{ files: { filename: string; text_content: string }[] }>(
    "/upload",
    {
      method: "POST",
      body: formData,
    },
  );

  return data.files.map((file) => ({
    filename: file.filename,
    content: file.text_content,
  }));
}

export async function connectConfluence(
  url: string,
  spaceKey: string,
  token: string,
): Promise<SourceContent[]> {
  const data = await requestJson<{ pages: { title: string; content: string }[] }>(
    "/connect/confluence",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        space_key: spaceKey,
        api_token: token,
      }),
    },
  );

  return data.pages.map((page) => ({
    title: page.title,
    content: page.content,
  }));
}

export async function scrapeUrl(url: string): Promise<SourceContent> {
  const data = await requestJson<{ url: string; content: string }>("/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  return {
    url: data.url,
    content: data.content,
  };
}

export async function extractInvention(combinedText: string): Promise<InventionDetails> {
  return requestJson<InventionDetails>("/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ combined_text: combinedText }),
  });
}

export type ExtractableInventionField = keyof InventionDetails;

export async function extractInventionField(
  combinedText: string,
  field: ExtractableInventionField,
  current?: InventionDetails,
): Promise<Partial<InventionDetails>> {
  return requestJson<Partial<InventionDetails>>("/extract/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      field,
      current: current ?? null,
    }),
  });
}

export async function draftSection(
  invention: InventionDetails,
  section: string,
): Promise<string> {
  const data = await requestJson<{ section: string; content: string }>("/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      section,
    }),
  });

  return data.content;
}

export async function generateFigures(
  invention: InventionDetails,
  descriptionText = "",
): Promise<FiguresResult> {
  return requestJson<FiguresResult>("/figures/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      description_text: descriptionText,
    }),
  });
}

export async function renderFigurePng(mermaid: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/figures/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mermaid }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportDocx(draft: PatentDraft): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections: draft.sections,
      figures: draft.figures,
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportPdf(draft: PatentDraft): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections: draft.sections,
      figures: draft.figures,
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
}

export { ApiError, API_BASE_URL };
