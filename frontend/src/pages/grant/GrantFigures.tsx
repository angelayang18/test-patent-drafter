import { useCallback } from "react";
import { DocumentFiguresWorkflow } from "../../components/DocumentFiguresWorkflow";
import { GrantAppShell } from "../../components/GrantAppShell";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import { isGrantStepAccessible } from "../../utils/grantStorage";
import "../../styles/patent-drafter.css";

export default function GrantFigures() {
  const {
    grantDetails,
    sections,
    figures,
    setFigures,
    updateFigure,
    gatherSourceText,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    workflowResetting,
  } = useGrantWorkflow();

  const gatherCombinedText = useCallback(async () => {
    const { combined } = await gatherSourceText();
    const sectionText = Object.entries(sections)
      .filter(([, value]) => value?.trim())
      .map(([id, value]) => `--- ${id} ---\n${value}`)
      .join("\n\n");
    return [combined, sectionText].filter((part) => part.trim()).join("\n\n");
  }, [gatherSourceText, sections]);

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
      sections={sections}
      figures={figures}
      setFigures={setFigures}
      updateFigure={updateFigure}
      gatherCombinedText={gatherCombinedText}
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
