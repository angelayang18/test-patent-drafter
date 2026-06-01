import {
  FILING_GUIDE_INTRO,
  FILING_GUIDE_PHASES,
  PATENT_CENTER_FILING_STEPS,
  PATENT_SUBMISSION_GUIDE_SECTIONS,
  PRE_FILING_CHECKLIST,
  PROVISIONAL_FEE_TIERS,
  PROVISIONAL_FILING_DISCLAIMER,
  PROVISIONAL_FILING_NEXT_STEPS,
  PROVISIONAL_FILING_RESOURCES,
  PROVISIONAL_VS_NONPROVISIONAL,
  USPTO_FILING_PACKAGE,
} from "../constants/patentSubmissionGuide";

interface PatentSubmissionGuidePanelProps {
  open: boolean;
  onClose: () => void;
}

export function PatentSubmissionGuidePanel({ open, onClose }: PatentSubmissionGuidePanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex">
      <button
        type="button"
        aria-label="Close filing guide"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="patent-submission-guide-title"
        className="w-full max-w-2xl bg-surface-container-lowest h-full shadow-2xl flex flex-col border-l border-outline-variant"
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-outline-variant bg-surface-bright shrink-0 gap-4">
          <div>
            <h2
              id="patent-submission-guide-title"
              className="font-headline-md text-headline-md text-primary"
            >
              How to file a US provisional patent
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-md">
              End-to-end guidance for any invention — not legal advice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant shrink-0"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-10">
          <p className="font-body-sm text-body-sm text-on-surface-variant rounded-lg bg-secondary-container/15 border border-secondary/20 px-4 py-3">
            {PROVISIONAL_FILING_DISCLAIMER}
          </p>

          <section className="space-y-4">
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              {FILING_GUIDE_INTRO}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FILING_GUIDE_PHASES.map((phase, i) => (
                <div
                  key={phase.title}
                  className="rounded-lg border border-outline-variant bg-surface-container-low/40 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <h3 className="font-label-md text-label-md text-on-surface">{phase.title}</h3>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    {phase.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-title-lg text-title-lg text-primary">What you file with the USPTO</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Typical provisional submission package:
            </p>
            <ul className="space-y-3">
              {USPTO_FILING_PACKAGE.map((item) => (
                <li
                  key={item.name}
                  className="rounded-lg border border-outline-variant px-4 py-3 bg-surface-bright"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`font-label-md text-label-md shrink-0 ${
                        item.required ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {item.required ? "Required" : "Recommended"}
                    </span>
                    <span className="font-label-md text-label-md text-on-surface">{item.name}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">
                    {item.notes}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 overflow-x-auto">
            <h3 className="font-title-lg text-title-lg text-primary">
              Provisional vs. non-provisional
            </h3>
            <table className="w-full min-w-[480px] text-left border-collapse font-body-sm text-body-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="py-2 pr-3 font-label-md text-label-md text-on-surface-variant">
                    Topic
                  </th>
                  <th className="py-2 pr-3 font-label-md text-label-md text-primary">Provisional</th>
                  <th className="py-2 font-label-md text-label-md text-on-surface">
                    Non-provisional
                  </th>
                </tr>
              </thead>
              <tbody className="text-on-surface-variant">
                {PROVISIONAL_VS_NONPROVISIONAL.map((row) => (
                  <tr key={row.topic} className="border-b border-outline-variant/60">
                    <td className="py-2.5 pr-3 font-medium text-on-surface">{row.topic}</td>
                    <td className="py-2.5 pr-3">{row.provisional}</td>
                    <td className="py-2.5">{row.nonProvisional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-3">
            <h3 className="font-title-lg text-title-lg text-primary">Filing fees by entity size</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Amounts change — confirm on the USPTO fee schedule before you pay. File electronically
              on Patent Center to avoid paper surcharges.
            </p>
            <ul className="space-y-3">
              {PROVISIONAL_FEE_TIERS.map((tier) => (
                <li
                  key={tier.entity}
                  className="rounded-lg border border-outline-variant px-4 py-3 bg-surface-container-low/30"
                >
                  <p className="font-label-md text-label-md text-on-surface">{tier.entity}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {tier.whoQualifies}
                  </p>
                  <p className="font-body-sm text-body-sm text-secondary mt-2">{tier.provisionalFeeNote}</p>
                </li>
              ))}
            </ul>
          </section>

          {PATENT_SUBMISSION_GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={`guide-${section.id}`} className="space-y-3">
              <h3 className="font-title-lg text-title-lg text-primary">{section.title}</h3>
              {section.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 48)}
                  className="font-body-md text-body-md text-on-surface-variant leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="list-disc pl-5 space-y-2 font-body-sm text-body-sm text-on-surface-variant">
                  {section.bullets.map((item) => (
                    <li key={item.slice(0, 48)}>{item}</li>
                  ))}
                </ul>
              )}
              {section.warning && (
                <p className="font-body-sm text-body-sm text-error rounded-lg bg-error-container/15 border border-error/25 px-4 py-3">
                  {section.warning}
                </p>
              )}
            </section>
          ))}

          <section className="space-y-4">
            <h3 className="font-title-lg text-title-lg text-primary">Before you file — checklist</h3>
            <ul className="space-y-2">
              {PRE_FILING_CHECKLIST.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 font-body-sm text-body-sm text-on-surface-variant"
                >
                  <span
                    className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5"
                    aria-hidden
                  >
                    check_box_outline_blank
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="font-title-lg text-title-lg text-primary">Step-by-step to filing</h3>
            <div className="space-y-5">
              {PROVISIONAL_FILING_NEXT_STEPS.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <h4 className="font-label-md text-label-md text-on-surface">{step.title}</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-title-lg text-title-lg text-primary">Patent Center — click path</h3>
            <ol className="list-decimal pl-5 space-y-2 font-body-sm text-body-sm text-on-surface-variant">
              {PATENT_CENTER_FILING_STEPS.map((step) => (
                <li key={step} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-4">
            <h3 className="font-title-lg text-title-lg text-primary">Official resources</h3>
            <ul className="space-y-4">
              {PROVISIONAL_FILING_RESOURCES.map((resource) => (
                <li key={resource.href}>
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-label-md text-label-md text-secondary hover:text-primary underline underline-offset-2"
                  >
                    {resource.label}
                  </a>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {resource.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
