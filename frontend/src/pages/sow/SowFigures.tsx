import { useCallback, useMemo } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { SowAppShell } from "../../components/SowAppShell";
import { useSowWorkflow } from "../../context/SowWorkflowContext";
import { SOW_SECTION_IDS, SOW_SECTION_LABELS } from "../../types/patent";
import { isSowStepAccessible } from "../../utils/sowStorage";
import {
  effectiveSectionIds,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

export default function SowFigures() {
  const {
    sowDetails,
    sections,
    sectionSettings,
    figures,
    setFigures,
    updateFigure,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useSowWorkflow();

  const sectionIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(SOW_SECTION_IDS, sectionSettings),
        sectionSettings,
      ),
    [sectionSettings],
  );

  const isFiguresAccessible = useCallback(
    () => isSowStepAccessible("figures", getWorkflowSnapshot()),
    [getWorkflowSnapshot],
  );

  return (
    <DocumentFiguresWorkflow
      title="SOW Figures"
      subtitle="Generate supporting diagrams as Mermaid source. Preview here—figures are embedded as PNG images when you export Word (.docx)."
      documentTypeLabel="Statement of Work"
      documentTitle={sowDetails?.engagement_title ?? ""}
      documentLabel="Statement of Work Draft"
      sectionSettings={sectionSettings}
      sectionIds={sectionIds}
      sections={sections}
      defaultLabels={SOW_SECTION_LABELS}
      sectionOrder={sectionIds}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      saveToStorage={saveToStorage}
      markStepComplete={() => markStepComplete("figures")}
      workflowResetting={workflowResetting}
      isFiguresAccessible={isFiguresAccessible}
      draftPath="/sow/draft"
      exportPath="/sow/export"
      renderShell={({ footer, children }) => (
        <SowAppShell
          step="figures"
          mainClassName="overflow-y-auto max-w-[1200px] w-full mx-auto px-margin-desktop pt-10 pb-28"
          footer={footer}
        >
          {children}
        </SowAppShell>
      )}
    />
  );
}
