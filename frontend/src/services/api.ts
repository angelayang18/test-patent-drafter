import type {
  FiguresResult,
  GrantDetails,
  InventionDetails,
  PatentDraft,
  PatentFigure,
  RegenerateFigureResult,
  SectionCitation,
  SOWDetails,
  ADADetails,
} from "../types/patent";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? import.meta.env.REACT_APP_API_URL ?? "http://localhost:8000";

export type {
  InventionDetails,
  GrantDetails,
  SOWDetails,
  ADADetails,
  PatentDraft,
  PatentFigure,
  FiguresResult,
  RegenerateFigureResult,
  SectionCitation,
};

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
    const data = (await response.json()) as {
      error?: string;
      detail?: string | { msg: string }[] | { error?: string; detail?: string };
    };
    if (typeof data.detail === "string" && data.error) {
      return `${data.error}: ${data.detail}`;
    }
    if (typeof data.error === "string" && typeof data.detail === "string") {
      return `${data.error}: ${data.detail}`;
    }
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg).join(", ");
    }
    if (
      data.detail &&
      typeof data.detail === "object" &&
      "detail" in data.detail &&
      typeof data.detail.detail === "string"
    ) {
      const nested = data.detail as { error?: string; detail: string };
      return nested.error ? `${nested.error}: ${nested.detail}` : nested.detail;
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

/** Upload and parse a single file (for per-file progress UI). */
export async function uploadDocument(file: File): Promise<SourceContent> {
  const [result] = await uploadDocuments([file]);
  if (!result) {
    throw new ApiError("No content returned from upload.", 422);
  }
  return result;
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

export interface ExtractionNotes {
  relevantNotes?: string;
  irrelevantNotes?: string;
}

export function extractionNotesFromSources(sources: {
  relevantContentNotes?: string;
  irrelevantContentNotes?: string;
}): ExtractionNotes {
  return {
    relevantNotes: sources.relevantContentNotes,
    irrelevantNotes: sources.irrelevantContentNotes,
  };
}

export interface ExtractionResult<T> {
  details: T;
  citations: Record<string, SectionCitation[]>;
}

function splitExtractionResponse<T extends object>(
  raw: T & { citations?: Record<string, SectionCitation[]> },
): ExtractionResult<T> {
  const { citations = {}, ...rest } = raw;
  return {
    details: rest as T,
    citations,
  };
}

export async function extractInvention(
  combinedText: string,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<InventionDetails>> {
  const raw = await requestJson<InventionDetails & { citations?: Record<string, SectionCitation[]> }>(
    "/extract",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        relevant_notes: notes?.relevantNotes?.trim() ?? "",
        irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
      }),
    },
  );
  return splitExtractionResponse(raw);
}

export type ExtractableInventionField = keyof InventionDetails;

export async function extractInventionField(
  combinedText: string,
  field: ExtractableInventionField,
  current?: InventionDetails,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<Partial<InventionDetails>>> {
  const raw = await requestJson<
    Partial<InventionDetails> & { citations?: Record<string, SectionCitation[]> }
  >("/extract/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      field,
      current: current ?? null,
      relevant_notes: notes?.relevantNotes?.trim() ?? "",
      irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
    }),
  });
  return splitExtractionResponse(raw);
}

export async function extractGrant(
  combinedText: string,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<GrantDetails>> {
  const raw = await requestJson<GrantDetails & { citations?: Record<string, SectionCitation[]> }>(
    "/extract/grant",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        relevant_notes: notes?.relevantNotes?.trim() ?? "",
        irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
      }),
    },
  );
  return splitExtractionResponse(raw);
}

export type ExtractableGrantField = keyof GrantDetails;

export async function extractGrantField(
  combinedText: string,
  field: ExtractableGrantField,
  current?: GrantDetails,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<Partial<GrantDetails>>> {
  const raw = await requestJson<
    Partial<GrantDetails> & { citations?: Record<string, SectionCitation[]> }
  >("/extract/grant/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      field,
      current: current ?? null,
      relevant_notes: notes?.relevantNotes?.trim() ?? "",
      irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
    }),
  });
  return splitExtractionResponse(raw);
}

export async function extractSow(
  combinedText: string,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<SOWDetails>> {
  const raw = await requestJson<SOWDetails & { citations?: Record<string, SectionCitation[]> }>(
    "/extract/sow",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        relevant_notes: notes?.relevantNotes?.trim() ?? "",
        irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
      }),
    },
  );
  return splitExtractionResponse(raw);
}

export type ExtractableSowField = keyof SOWDetails;

export async function extractSowField(
  combinedText: string,
  field: ExtractableSowField,
  current?: SOWDetails,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<Partial<SOWDetails>>> {
  const raw = await requestJson<
    Partial<SOWDetails> & { citations?: Record<string, SectionCitation[]> }
  >("/extract/sow/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      field,
      current: current ?? null,
      relevant_notes: notes?.relevantNotes?.trim() ?? "",
      irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
    }),
  });
  return splitExtractionResponse(raw);
}

export async function extractAda(
  combinedText: string,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<ADADetails>> {
  const raw = await requestJson<ADADetails & { citations?: Record<string, SectionCitation[]> }>(
    "/extract/ada",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        relevant_notes: notes?.relevantNotes?.trim() ?? "",
        irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
      }),
    },
  );
  return splitExtractionResponse(raw);
}

export type ExtractableAdaField = keyof ADADetails;

export async function extractAdaField(
  combinedText: string,
  field: ExtractableAdaField,
  current?: ADADetails,
  notes?: ExtractionNotes,
): Promise<ExtractionResult<Partial<ADADetails>>> {
  const raw = await requestJson<
    Partial<ADADetails> & { citations?: Record<string, SectionCitation[]> }
  >("/extract/ada/field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      field,
      current: current ?? null,
      relevant_notes: notes?.relevantNotes?.trim() ?? "",
      irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
    }),
  });
  return splitExtractionResponse(raw);
}

export async function suggestTitles(
  combinedText: string,
  documentKind: "patent" | "grant" | "sow" | "ada",
  current?: string,
  notes?: ExtractionNotes,
): Promise<string[]> {
  const data = await requestJson<{ titles: string[] }>("/extract/titles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      document_kind: documentKind,
      current: current?.trim() ? current.trim() : null,
      relevant_notes: notes?.relevantNotes?.trim() ?? "",
      irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
    }),
  });
  return data.titles;
}

export async function suggestGenericTitles(
  combinedText: string,
  documentTypeLabel: string,
  current?: string,
  notes?: ExtractionNotes,
): Promise<{ titles: string[]; citations: SectionCitation[] }> {
  const data = await requestJson<{ titles: string[]; citations?: SectionCitation[] }>(
    "/extract/titles/generic",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        document_type_label: documentTypeLabel,
        current: current?.trim() ? current.trim() : null,
        relevant_notes: notes?.relevantNotes?.trim() ?? "",
        irrelevant_notes: notes?.irrelevantNotes?.trim() ?? "",
      }),
    },
  );
  return { titles: data.titles, citations: data.citations ?? [] };
}

export async function getGenericTitleCitations(
  combinedText: string,
  documentTypeLabel: string,
  title: string,
): Promise<SectionCitation[]> {
  const data = await requestJson<{ citations?: SectionCitation[] }>(
    "/extract/titles/generic/citations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        combined_text: combinedText,
        document_type_label: documentTypeLabel,
        title: title.trim(),
      }),
    },
  );
  return data.citations ?? [];
}

export async function regenerateSelection(
  combinedText: string,
  fullFieldText: string,
  selectedText: string,
  instruction?: string,
): Promise<string> {
  return requestJson<{ result: string }>("/regenerate/selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      combined_text: combinedText,
      full_field_text: fullFieldText,
      selected_text: selectedText,
      instruction: instruction ?? "",
    }),
  }).then((d) => d.result);
}

export type CustomSectionsPayload = Record<
  string,
  { name: string; description: string }
>;

export interface DraftSectionOptions {
  priorDraft?: string;
  attorneyFeedback?: string;
  combinedText?: string;
  customSections?: CustomSectionsPayload;
}

export async function draftSection(
  invention: InventionDetails,
  section: string,
  options?: DraftSectionOptions,
): Promise<{ content: string; citations: SectionCitation[] }> {
  const data = await requestJson<{
    section: string;
    content: string;
    citations?: SectionCitation[];
  }>("/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      section,
      prior_draft: options?.priorDraft?.trim() ?? "",
      attorney_feedback: options?.attorneyFeedback?.trim() ?? "",
      combined_text: options?.combinedText ?? "",
      custom_sections: options?.customSections ?? {},
    }),
  });

  return { content: data.content, citations: data.citations ?? [] };
}

/** Draft multiple sections in parallel (one backend agent per section). */
export async function draftAllSections(
  invention: InventionDetails,
  sections?: string[],
  attorneyFeedback?: Record<string, string>,
  combinedText?: string,
  customSections?: CustomSectionsPayload,
): Promise<{
  sections: Record<string, string>;
  citations: Record<string, SectionCitation[]>;
}> {
  const data = await requestJson<{
    sections: Record<string, string>;
    citations?: Record<string, SectionCitation[]>;
  }>("/draft/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      ...(sections?.length ? { sections } : {}),
      attorney_feedback: attorneyFeedback ?? {},
      combined_text: combinedText ?? "",
      custom_sections: customSections ?? {},
    }),
  });

  return { sections: data.sections, citations: data.citations ?? {} };
}

export async function draftGrantSection(
  grant: GrantDetails,
  section: string,
  options?: DraftSectionOptions,
): Promise<{ content: string; citations: SectionCitation[] }> {
  const data = await requestJson<{
    section: string;
    content: string;
    citations?: SectionCitation[];
  }>("/draft/grant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...grant,
      section,
      prior_draft: options?.priorDraft?.trim() ?? "",
      attorney_feedback: options?.attorneyFeedback?.trim() ?? "",
      combined_text: options?.combinedText ?? "",
      custom_sections: options?.customSections ?? {},
    }),
  });

  return { content: data.content, citations: data.citations ?? [] };
}

export async function draftAllGrantSections(
  grant: GrantDetails,
  sections?: string[],
  combinedText?: string,
  customSections?: CustomSectionsPayload,
  reviewerFeedback?: Record<string, string>,
): Promise<{
  sections: Record<string, string>;
  citations: Record<string, SectionCitation[]>;
}> {
  const data = await requestJson<{
    sections: Record<string, string>;
    citations?: Record<string, SectionCitation[]>;
  }>("/draft/grant/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...grant,
      ...(sections?.length ? { sections } : {}),
      attorney_feedback: reviewerFeedback ?? {},
      combined_text: combinedText ?? "",
      custom_sections: customSections ?? {},
    }),
  });

  return { sections: data.sections, citations: data.citations ?? {} };
}

export async function draftSowSection(
  sow: SOWDetails,
  section: string,
  options?: DraftSectionOptions,
): Promise<{ content: string; citations: SectionCitation[] }> {
  const data = await requestJson<{
    section: string;
    content: string;
    citations?: SectionCitation[];
  }>("/draft/sow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sow,
      section,
      prior_draft: options?.priorDraft?.trim() ?? "",
      attorney_feedback: options?.attorneyFeedback?.trim() ?? "",
      combined_text: options?.combinedText ?? "",
      custom_sections: options?.customSections ?? {},
    }),
  });

  return { content: data.content, citations: data.citations ?? [] };
}

export async function draftAllSowSections(
  sow: SOWDetails,
  sections?: string[],
  combinedText?: string,
  customSections?: CustomSectionsPayload,
  reviewerFeedback?: Record<string, string>,
): Promise<{
  sections: Record<string, string>;
  citations: Record<string, SectionCitation[]>;
}> {
  const data = await requestJson<{
    sections: Record<string, string>;
    citations?: Record<string, SectionCitation[]>;
  }>("/draft/sow/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sow,
      ...(sections?.length ? { sections } : {}),
      attorney_feedback: reviewerFeedback ?? {},
      combined_text: combinedText ?? "",
      custom_sections: customSections ?? {},
    }),
  });

  return { sections: data.sections, citations: data.citations ?? {} };
}

export async function draftAdaSection(
  ada: ADADetails,
  section: string,
  options?: DraftSectionOptions,
): Promise<{ content: string; citations: SectionCitation[] }> {
  const data = await requestJson<{
    section: string;
    content: string;
    citations?: SectionCitation[];
  }>("/draft/ada", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...ada,
      section,
      prior_draft: options?.priorDraft?.trim() ?? "",
      attorney_feedback: options?.attorneyFeedback?.trim() ?? "",
      combined_text: options?.combinedText ?? "",
      custom_sections: options?.customSections ?? {},
    }),
  });

  return { content: data.content, citations: data.citations ?? [] };
}

export async function draftAllAdaSections(
  ada: ADADetails,
  sections?: string[],
  combinedText?: string,
  customSections?: CustomSectionsPayload,
  reviewerFeedback?: Record<string, string>,
): Promise<{
  sections: Record<string, string>;
  citations: Record<string, SectionCitation[]>;
}> {
  const data = await requestJson<{
    sections: Record<string, string>;
    citations?: Record<string, SectionCitation[]>;
  }>("/draft/ada/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...ada,
      ...(sections?.length ? { sections } : {}),
      attorney_feedback: reviewerFeedback ?? {},
      combined_text: combinedText ?? "",
      custom_sections: customSections ?? {},
    }),
  });

  return { sections: data.sections, citations: data.citations ?? {} };
}

export interface LearningSubmitPayload extends InventionDetails {
  sections: Record<string, string>;
  aiInitialSections?: Record<string, string>;
  attorneyFeedback?: Record<string, string>;
  attorneyFeedbackGlobal?: string;
  includeInCorpus?: boolean;
}

export async function submitLearningCorpus(
  payload: LearningSubmitPayload,
): Promise<{ success: boolean; stored: boolean; submission_id?: number }> {
  return requestJson<{ success: boolean; stored: boolean; submission_id?: number }>(
    "/learning/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invention_title: payload.invention_title,
        technical_field: payload.technical_field,
        problem_being_solved: payload.problem_being_solved,
        core_technical_solution: payload.core_technical_solution,
        novel_mechanism: payload.novel_mechanism,
        alternative_embodiments: payload.alternative_embodiments,
        key_components: payload.key_components,
        sections: payload.sections,
        ai_initial_sections: payload.aiInitialSections ?? {},
        attorney_feedback: payload.attorneyFeedback ?? {},
        attorney_feedback_global: payload.attorneyFeedbackGlobal?.trim() ?? "",
        include_in_corpus: payload.includeInCorpus ?? true,
      }),
    },
  );
}

export async function approveLearningExemplar(
  submissionId: number,
  section: string,
): Promise<{ success: boolean; approved: boolean }> {
  return requestJson<{ success: boolean; approved: boolean }>(
    `/learning/submissions/${submissionId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    },
  );
}

export async function generateFigures(
  invention: InventionDetails,
  descriptionText = "",
  numFigures = 3,
): Promise<FiguresResult> {
  return requestJson<FiguresResult>("/figures/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      description_text: descriptionText,
      num_figures: numFigures,
    }),
  });
}

export async function regenerateFigure(
  figureNumber: number,
  invention: InventionDetails,
  descriptionText: string,
  existingFigures: PatentFigure[],
): Promise<RegenerateFigureResult> {
  return requestJson<RegenerateFigureResult>("/figures/regenerate-one", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invention,
      figure_number: figureNumber,
      description_text: descriptionText,
      existing_figures: existingFigures,
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

export async function prerenderExportFigures(
  figures: PatentDraft["figures"],
): Promise<Record<string, string>> {
  const data = await requestJson<{ figure_pngs: Record<string, string> }>(
    "/export/prerender-figures",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figures }),
    },
  );
  return data.figure_pngs ?? {};
}

function exportPayloadBody(draft: PatentDraft): string {
  return JSON.stringify({
    sections: draft.sections,
    figures: draft.figures,
    invention_title: draft.invention_title ?? "",
    filing_info: draft.filing_info ?? null,
    ...(draft.figure_pngs && Object.keys(draft.figure_pngs).length > 0
      ? { figure_pngs: draft.figure_pngs }
      : {}),
    section_labels: draft.section_labels ?? {},
  });
}

export interface QAReportEntry {
  section: string;
  status: string;
  messages: string[];
}

export async function fetchQAReport(
  sections: Record<string, string>,
  invention?: InventionDetails,
): Promise<QAReportEntry[]> {
  return requestJson<QAReportEntry[]>("/qa-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections, invention: invention ?? null }),
  });
}

export async function exportDocx(draft: PatentDraft): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: exportPayloadBody(draft),
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
    body: exportPayloadBody(draft),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportGrantDocx(
  sections: Record<string, string>,
  projectTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/grant/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      project_title: projectTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportGrantPdf(
  sections: Record<string, string>,
  projectTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/grant/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      project_title: projectTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportSowDocx(
  sections: Record<string, string>,
  engagementTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/sow/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      engagement_title: engagementTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportSowPdf(
  sections: Record<string, string>,
  engagementTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/sow/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      engagement_title: engagementTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportAdaDocx(
  sections: Record<string, string>,
  studyTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/ada/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      study_title: studyTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportAdaPdf(
  sections: Record<string, string>,
  studyTitle?: string,
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/ada/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      study_title: studyTitle ?? "",
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export interface GenericSectionDefPayload {
  id: string;
  name: string;
  description?: string;
}

export async function draftGenericSection(
  documentTitle: string,
  section: GenericSectionDefPayload,
  options?: { priorDraft?: string; attorneyFeedback?: string; combinedText?: string },
): Promise<{ content: string; citations: SectionCitation[] }> {
  const data = await requestJson<{
    section: string;
    content: string;
    citations?: SectionCitation[];
  }>("/draft/generic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_title: documentTitle,
      section_id: section.id,
      name: section.name,
      description: section.description ?? "",
      prior_draft: options?.priorDraft?.trim() ?? "",
      attorney_feedback: options?.attorneyFeedback?.trim() ?? "",
      combined_text: options?.combinedText ?? "",
    }),
  });

  return { content: data.content, citations: data.citations ?? [] };
}

export async function draftAllGenericSections(
  documentTitle: string,
  sections: GenericSectionDefPayload[],
  combinedText?: string,
  reviewerFeedback?: Record<string, string>,
): Promise<{
  sections: Record<string, string>;
  citations: Record<string, SectionCitation[]>;
}> {
  const data = await requestJson<{
    sections: Record<string, string>;
    citations?: Record<string, SectionCitation[]>;
  }>("/draft/generic/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_title: documentTitle,
      sections: sections.map((section) => ({
        id: section.id,
        name: section.name,
        description: section.description ?? "",
      })),
      attorney_feedback: reviewerFeedback ?? {},
      combined_text: combinedText ?? "",
    }),
  });

  return { sections: data.sections, citations: data.citations ?? {} };
}

export async function exportGenericDocx(
  sections: Record<string, string>,
  documentTitle?: string,
  sectionOrder?: string[],
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/generic/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      document_title: documentTitle ?? "",
      section_order: sectionOrder ?? [],
      section_labels: sectionLabels ?? {},
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export async function exportGenericPdf(
  sections: Record<string, string>,
  documentTitle?: string,
  sectionOrder?: string[],
  sectionLabels?: Record<string, string>,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export/generic/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections,
      document_title: documentTitle ?? "",
      section_order: sectionOrder ?? [],
      section_labels: sectionLabels ?? {},
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
