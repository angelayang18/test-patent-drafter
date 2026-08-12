import { useCallback } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { SowAppShell } from "../../components/SowAppShell";
import { useSowWorkflow } from "../../context/SowWorkflowContext";
import { isSowStepAccessible } from "../../utils/sowStorage";
import "../../styles/patent-drafter.css";

export default function SowFigures() {
  const {
    sowDetails,
    sections,
    figures,
    setFigures,
    updateFigure,
    gatherSourceText,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useSowWorkflow();

  const gatherCombinedText = useCallback(async () => {
    const { combined } = await gatherSourceText();
    const sectionText = Object.entries(sections)
      .filter(([, value]) => value?.trim())
      .map(([id, value]) => `--- ${id} ---\n${value}`)
      .join("\n\n");
    return [combined, sectionText].filter((part) => part.trim()).join("\n\n");
  }, [gatherSourceText, sections]);

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
      sections={sections}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      gatherCombinedText={gatherCombinedText}
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
