import { Link } from "react-router-dom";
import { GrantAppShell } from "../../components/GrantAppShell";
import { RfpProcessStepper } from "../../components/RfpProcessStepper";
import {
  FIT_TAG_CLASSES,
  FUNDING_OPPORTUNITIES,
} from "../../constants/fundingOpportunities";
import { GRANT_STEP_PATHS } from "../../utils/grantStorage";
import "../../styles/patent-drafter.css";

export default function GrantLanding() {
  return (
    <GrantAppShell
      step="input"
      showStepNav={false}
      mainClassName="max-w-5xl mx-auto px-margin-desktop py-16"
    >
      <div className="space-y-16">
        <div className="text-center space-y-8">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-3">
              Grant Application Drafter
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
              Upload source documents, review extracted project details, draft application sections,
              and export a submission-ready document.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter max-w-2xl mx-auto">
            <Link
              to={GRANT_STEP_PATHS.input}
              className="p-8 rounded-xl border-2 border-secondary bg-secondary-container/10 hover:bg-secondary-container/20 transition-all text-left group"
            >
              <span className="material-symbols-outlined text-secondary text-4xl mb-4 block">
                volunteer_activism
              </span>
              <h2 className="font-title-lg text-title-lg text-primary mb-2">Grant Application</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                4 steps: Input → Review → Draft → Export
              </p>
              <span className="inline-flex items-center gap-1 mt-4 font-label-md text-label-md text-secondary group-hover:underline">
                Start grant draft
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </span>
            </Link>

            <Link
              to="/"
              className="p-8 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary/40 transition-all text-left group"
            >
              <span className="material-symbols-outlined text-primary text-4xl mb-4 block">
                description
              </span>
              <h2 className="font-title-lg text-title-lg text-primary mb-2">Patent Draft</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                US provisional patent with figures and USPTO export
              </p>
              <span className="inline-flex items-center gap-1 mt-4 font-label-md text-label-md text-primary group-hover:underline">
                Go to patent workflow
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </span>
            </Link>
          </div>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="font-headline-md text-headline-md text-primary">Funding Opportunities</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Curated programs relevant to opAIda&apos;s AI and biomedical research focus.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {FUNDING_OPPORTUNITIES.map((opportunity) => (
              <a
                key={`${opportunity.agency}-${opportunity.program}`}
                href={opportunity.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-6 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary/40 transition-all bento-card text-left group"
              >
                <span className="inline-flex self-start rounded-full px-2.5 py-0.5 font-label-sm text-label-sm bg-surface-container-high text-on-surface-variant mb-3">
                  {opportunity.agency}
                </span>
                <h3 className="font-title-md text-title-md text-primary mb-1">
                  {opportunity.program}
                </h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-2">
                  {opportunity.amount}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4 flex-1">
                  {opportunity.description}
                </p>
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${FIT_TAG_CLASSES[opportunity.fit]}`}
                  >
                    {opportunity.fit}
                  </span>
                  <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary group-hover:underline shrink-0">
                    View program
                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="font-headline-md text-headline-md text-primary">RFP Process</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Six steps for federal contract opportunities at a glance.
            </p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 sm:p-8">
            <RfpProcessStepper />
          </div>
        </section>
      </div>
    </GrantAppShell>
  );
}
