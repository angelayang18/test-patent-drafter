import { useCallback, useMemo } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { GenericAppShell } from "../../components/GenericAppShell";
import { useGenericWorkflow } from "../../context/GenericWorkflowContext";
import { GENERIC_STEP_PATHS, isGenericStepAccessible } from "../../utils/genericStorage";
import {
  effectiveSectionIds,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

export default function GenericFigures() {
  const {
    templateId,
    template,
    details,
    sections,
    sectionSettings,
    figures,
    setFigures,
    updateFigure,
    gatherSourceText,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useGenericWorkflow();

  const paths = GENERIC_STEP_PATHS(templateId);
  const templateSectionIds = useMemo(
    () => template.sections.map((section) => section.id),
    [template.sections],
  );
  const sectionOrder = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(templateSectionIds, sectionSettings),
        sectionSettings,
      ),
    [templateSectionIds, sectionSettings],
  );

  const gatherCombinedText = useCallback(async () => {
    const { combined } = await gatherSourceText();
    const sectionText = Object.entries(sections)
      .filter(([, value]) => value?.trim())
      .map(([id, value]) => `--- ${id} ---\n${value}`)
      .join("\n\n");
    return [combined, sectionText].filter((part) => part.trim()).join("\n\n");
  }, [gatherSourceText, sections]);

  const isFiguresAccessible = useCallback(
    () => isGenericStepAccessible("figures", getWorkflowSnapshot()),
    [getWorkflowSnapshot],
  );

  return (
    <DocumentFiguresWorkflow
      title={`${template.name} Figures`}
      subtitle="Generate supporting diagrams as Mermaid source. Preview here—figures are embedded as PNG images when you export Word (.docx)."
      documentTypeLabel={template.name}
      documentTitle={details?.title ?? ""}
      documentLabel={`${template.name} Draft`}
      sections={sections}
      sectionOrder={sectionOrder}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      gatherCombinedText={gatherCombinedText}
      saveToStorage={saveToStorage}
      markStepComplete={() => markStepComplete("figures")}
      workflowResetting={workflowResetting}
      isFiguresAccessible={isFiguresAccessible}
      draftPath={paths.draft}
      exportPath={paths.export}
      renderShell={({ footer, children }) => (
        <GenericAppShell
          step="figures"
          mainClassName="overflow-y-auto max-w-[1200px] w-full mx-auto px-margin-desktop pt-10 pb-28"
          footer={footer}
        >
          {children}
        </GenericAppShell>
      )}
    />
  );
}
