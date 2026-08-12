import { useCallback, useMemo } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { AdaAppShell } from "../../components/AdaAppShell";
import { useAdaWorkflow } from "../../context/AdaWorkflowContext";
import { ADA_SECTION_IDS, ADA_SECTION_LABELS } from "../../types/patent";
import { isAdaStepAccessible } from "../../utils/adaStorage";
import {
  effectiveSectionIds,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

export default function AdaFigures() {
  const {
    adaDetails,
    sections,
    sectionSettings,
    figures,
    setFigures,
    updateFigure,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useAdaWorkflow();

  const sectionIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(ADA_SECTION_IDS, sectionSettings),
        sectionSettings,
      ),
    [sectionSettings],
  );

  const isFiguresAccessible = useCallback(
    () => isAdaStepAccessible("figures", getWorkflowSnapshot()),
    [getWorkflowSnapshot],
  );

  return (
    <DocumentFiguresWorkflow
      title="ADA Figures"
      subtitle="Generate supporting diagrams as Mermaid source. Preview here—figures are embedded as PNG images when you export Word (.docx)."
      documentTypeLabel="ADA Bioanalytical Report"
      documentTitle={adaDetails?.study_title ?? ""}
      documentLabel="ADA Bioanalytical Report Draft"
      sectionSettings={sectionSettings}
      sectionIds={sectionIds}
      sections={sections}
      defaultLabels={ADA_SECTION_LABELS}
      sectionOrder={sectionIds}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      saveToStorage={saveToStorage}
      markStepComplete={() => markStepComplete("figures")}
      workflowResetting={workflowResetting}
      isFiguresAccessible={isFiguresAccessible}
      draftPath="/ada/draft"
      exportPath="/ada/export"
      renderShell={({ footer, children }) => (
        <AdaAppShell
          step="figures"
          mainClassName="overflow-y-auto max-w-[1200px] w-full mx-auto px-margin-desktop pt-10 pb-28"
          footer={footer}
        >
          {children}
        </AdaAppShell>
      )}
    />
  );
}
