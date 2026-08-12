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
  const defaultLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of template.sections) {
      map[section.id] = section.name;
    }
    return map;
  }, [template.sections]);
  const sectionIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(templateSectionIds, sectionSettings),
        sectionSettings,
      ),
    [templateSectionIds, sectionSettings],
  );

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
      sectionSettings={sectionSettings}
      sectionIds={sectionIds}
      sections={sections}
      defaultLabels={defaultLabels}
      sectionOrder={sectionIds}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
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
