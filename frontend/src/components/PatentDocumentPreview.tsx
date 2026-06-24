import {
  EMPTY_FILING_INFO,
  PATENT_SECTION_IDS,
  type FilingInfo,
  type PatentFigure,
  type PatentSectionId,
} from "../types/patent";
import MermaidPreview from "./MermaidPreview";
import {
  crossReferenceBody,
  draftPreviewSectionKeys,
  orderedPreviewSectionKeys,
  SECTIONS_REQUIRING_PAGE_BREAK_BEFORE,
  sectionDisplayTitle,
  parseNumberedListItemHeader,
  splitParagraphs,
} from "../utils/documentPreview";

export interface PatentDocumentPreviewProps {
  inventionTitle?: string;
  filingInfo?: FilingInfo | null;
  sections: Record<string, string>;
  pendingSectionIds?: PatentSectionId[];
  figures?: PatentFigure[];
  includeEmptySections?: boolean;
  onSectionClick?: (sectionId: PatentSectionId) => void;
}

function hasCoverSheetData(
  inventionTitle: string | undefined,
  filingInfo: FilingInfo | null | undefined,
): boolean {
  const title = inventionTitle?.trim();
  if (!title) return false;
  const info = filingInfo ?? EMPTY_FILING_INFO;
  return Boolean(
    info.inventor_name.trim() ||
      info.inventor_city.trim() ||
      info.correspondence_name.trim() ||
      info.correspondence_address.trim(),
  );
}

export function PatentDocumentPreview({
  inventionTitle,
  filingInfo,
  sections,
  pendingSectionIds = [],
  figures = [],
  includeEmptySections = true,
  onSectionClick,
}: PatentDocumentPreviewProps) {
  const pending = new Set(pendingSectionIds);
  const sectionKeys = includeEmptySections
    ? draftPreviewSectionKeys(sections)
    : orderedPreviewSectionKeys(sections).filter(
        (key) => Boolean(sections[key]?.trim()) || pending.has(key as PatentSectionId),
      );

  const hasAnyContent =
    sectionKeys.some((key) => sections[key]?.trim()) || figures.length > 0;
  const showCoverSheet = hasCoverSheetData(inventionTitle, filingInfo);
  const info = filingInfo ?? EMPTY_FILING_INFO;
  const residence = [info.inventor_city, info.inventor_state, info.inventor_country]
    .filter((part) => part.trim())
    .join(", ");

  const renderDrawingSheets = (afterKey: string) => {
    if (!figures.length) return null;
    const briefIndex = sectionKeys.indexOf("brief_description_of_drawings");
    const insertAfterBrief = afterKey === "brief_description_of_drawings";
    if (!insertAfterBrief) return null;
    if (briefIndex === -1 || sectionKeys[briefIndex] !== afterKey) return null;

    const totalSheets = figures.length;
    return figures.map((figure, index) => (
      <section
        key={`drawing-sheet-${figure.number}`}
        className="patent-drawing-sheet border-t border-outline-variant/30 pt-8"
      >
        <p className="text-center font-body-sm text-body-sm text-on-surface mb-6">
          {index + 1}/{totalSheets}
        </p>
        <MermaidPreview source={figure.mermaid} />
      </section>
    ));
  };

  return (
    <article className="patent-document-preview bg-white text-on-surface shadow-lg border border-outline-variant/40 rounded-sm mx-auto max-w-[720px] px-12 py-14">
      {showCoverSheet && (
        <section className="text-center border-b border-outline-variant/50 pb-8 mb-10">
          <p className="font-label-sm text-label-sm uppercase tracking-[0.12em] text-on-surface mb-6">
            Provisional Application for Patent Cover Sheet (PTO/SB/16)
          </p>
          <div className="text-left space-y-4 font-body-md text-body-md">
            <p>
              <span className="font-label-md text-label-md">Title of the invention: </span>
              {inventionTitle?.trim()}
            </p>
            <p>
              <span className="font-label-md text-label-md">Inventor: </span>
              {info.inventor_name.trim() || "[Inventor name]"}
              {residence ? `, residing at ${residence}` : ", residing at [City, State, Country]"}
            </p>
            <p>
              <span className="font-label-md text-label-md">Correspondence address: </span>
              {info.correspondence_name.trim() || info.inventor_name.trim() || "[Name]"}
            </p>
            {(info.correspondence_address.trim() || "[Correspondence address]")
              .split("\n")
              .map((line, index) => (
                <p key={`correspondence-${index}`} className="pl-4">
                  {line.trim()}
                </p>
              ))}
            {info.correspondence_email.trim() && (
              <p>
                <span className="font-label-md text-label-md">Email: </span>
                {info.correspondence_email.trim()}
              </p>
            )}
          </div>
        </section>
      )}

      {!showCoverSheet && (
        <header className="text-center border-b border-outline-variant/50 pb-8 mb-10">
          <p className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Provisional Patent Application Draft
          </p>
          <h1 className="font-headline-lg text-headline-lg text-primary leading-tight">
            {inventionTitle?.trim() || "Untitled Invention"}
          </h1>
        </header>
      )}

      {!hasAnyContent ? (
        <p className="font-body-md text-body-md text-on-surface-variant text-center py-12">
          Sections will appear here as they are drafted.
        </p>
      ) : (
        <div className="space-y-10">
          {sectionKeys.map((key) => {
            const body =
              key === "cross_reference"
                ? crossReferenceBody(filingInfo)
                : (sections[key] ?? "");
            const isPending = pending.has(key as PatentSectionId);
            const isEmpty = !body.trim();
            const paragraphs = splitParagraphs(body);
            const isDraftSection = (PATENT_SECTION_IDS as readonly string[]).includes(key);
            const sectionClickHandler =
              isDraftSection && onSectionClick ? onSectionClick : undefined;
            const clickable = sectionClickHandler !== undefined;
            const needsPageBreak = SECTIONS_REQUIRING_PAGE_BREAK_BEFORE.has(key);

            return (
              <div key={key}>
                <section
                  id={`preview-section-${key}`}
                  className={`${needsPageBreak ? "patent-page-break-before pt-8" : ""} ${
                    clickable ? "group cursor-pointer" : ""
                  }`}
                  onClick={
                    sectionClickHandler
                      ? () => sectionClickHandler(key as PatentSectionId)
                      : undefined
                  }
                  onKeyDown={
                    sectionClickHandler
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            sectionClickHandler(key as PatentSectionId);
                          }
                        }
                      : undefined
                  }
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <h2
                    className={`patent-section-heading font-title-lg text-title-lg text-primary mb-4 uppercase ${
                      clickable ? "group-hover:text-secondary transition-colors" : ""
                    }`}
                  >
                    {sectionDisplayTitle(key)}
                  </h2>

                  {isPending ? (
                    <div className="flex items-center gap-3 py-4 text-on-surface-variant">
                      <span className="material-symbols-outlined loading-spin text-primary text-[20px]">
                        progress_activity
                      </span>
                      <p className="font-body-md text-body-md italic">Generating this section…</p>
                    </div>
                  ) : isEmpty ? (
                    <p className="font-body-sm text-body-sm text-outline italic">
                      Not yet drafted
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {paragraphs.map((paragraph, index) => {
                        const listHeader = parseNumberedListItemHeader(paragraph);
                        const claimIndent =
                          key === "claims" &&
                          (/^\d+\./.test(paragraph) || /^\s{2,}\S/.test(paragraph))
                            ? "pl-8"
                            : "";
                        return (
                          <p
                            key={`${key}-${index}`}
                            className={`font-body-md text-body-md leading-relaxed text-on-surface ${claimIndent}`}
                          >
                            {listHeader ? (
                              <>
                                <span
                                  className={`font-label-md text-label-md text-on-surface ${
                                    key === "description"
                                      ? "underline underline-offset-2"
                                      : ""
                                  }`}
                                >
                                  {listHeader.prefix}
                                  {listHeader.title}
                                </span>
                                {listHeader.separator}
                                {listHeader.body}
                              </>
                            ) : (
                              paragraph
                            )}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </section>

                {renderDrawingSheets(key)}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
