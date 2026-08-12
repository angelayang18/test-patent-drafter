import { useCallback } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { AdaAppShell } from "../../components/AdaAppShell";
import { useAdaWorkflow } from "../../context/AdaWorkflowContext";
import { isAdaStepAccessible } from "../../utils/adaStorage";
import "../../styles/patent-drafter.css";

export default function AdaFigures() {
  const {
    adaDetails,
    sections,
    figures,
    setFigures,
    updateFigure,
    gatherSourceText,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useAdaWorkflow();

  const gatherCombinedText = useCallback(async () => {
    const { combined } = await gatherSourceText();
    const sectionText = Object.entries(sections)
      .filter(([, value]) => value?.trim())
      .map(([id, value]) => `--- ${id} ---\n${value}`)
      .join("\n\n");
    return [combined, sectionText].filter((part) => part.trim()).join("\n\n");
  }, [gatherSourceText, sections]);

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
      sections={sections}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      gatherCombinedText={gatherCombinedText}
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
