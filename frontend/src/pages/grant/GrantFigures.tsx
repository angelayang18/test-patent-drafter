import { useCallback, useMemo } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { GrantAppShell } from "../../components/GrantAppShell";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import { GRANT_SECTION_IDS, GRANT_SECTION_LABELS } from "../../types/patent";
import { isGrantStepAccessible } from "../../utils/grantStorage";
import {
  effectiveSectionIds,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

export default function GrantFigures() {
  const {
    grantDetails,
    sections,
    sectionSettings,
    figures,
    setFigures,
    updateFigure,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useGrantWorkflow();

  const sectionIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(GRANT_SECTION_IDS, sectionSettings),
        sectionSettings,
      ),
    [sectionSettings],
  );

  const isFiguresAccessible = useCallback(
    () => isGrantStepAccessible("figures", getWorkflowSnapshot()),
    [getWorkflowSnapshot],
  );

  return (
    <DocumentFiguresWorkflow
      title="Grant Figures"
      subtitle="Generate supporting diagrams as Mermaid source. Preview here—figures are embedded as PNG images when you export Word (.docx)."
      documentTypeLabel="Grant Application"
      documentTitle={grantDetails?.project_title ?? ""}
      documentLabel="Grant Application Draft"
      sectionSettings={sectionSettings}
      sectionIds={sectionIds}
      sections={sections}
      defaultLabels={GRANT_SECTION_LABELS}
      sectionOrder={sectionIds}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      saveToStorage={saveToStorage}
      markStepComplete={() => markStepComplete("figures")}
      workflowResetting={workflowResetting}
      isFiguresAccessible={isFiguresAccessible}
      draftPath="/grant/draft"
      exportPath="/grant/export"
      renderShell={({ footer, children }) => (
        <GrantAppShell
          step="figures"
          mainClassName="overflow-y-auto max-w-[1200px] w-full mx-auto px-margin-desktop pt-10 pb-28"
          footer={footer}
        >
          {children}
        </GrantAppShell>
      )}
    />
  );
}
