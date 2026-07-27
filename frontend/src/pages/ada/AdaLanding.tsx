import { Link } from "react-router-dom";
import { AdaAppShell } from "../../components/AdaAppShell";
import "../../styles/patent-drafter.css";
export default function AdaLanding() {
  return (
    <AdaAppShell
      step="input"
      showStepNav={false}
      mainClassName="max-w-5xl mx-auto px-margin-desktop py-16"
    >
      <div className="space-y-16">
        <div className="text-center space-y-8">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-3">
              ADA Bioanalytical Report Drafter
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
              Upload source documents, review extracted study details, draft report sections,
              and export a submission-ready document.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter max-w-2xl mx-auto">
            <Link
              to="/ada/input"
              className="p-8 rounded-xl border-2 border-secondary bg-secondary-container/10 hover:bg-secondary-container/20 transition-all text-left group"
            >
              <span className="material-symbols-outlined text-secondary text-4xl mb-4 block">
                description
              </span>
              <h2 className="font-title-lg text-title-lg text-primary mb-2">ADA Bioanalytical Report</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                4 steps: Input → Review → Draft → Export
              </p>
              <span className="inline-flex items-center gap-1 mt-4 font-label-md text-label-md text-secondary group-hover:underline">
                Start ADA draft
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
                5 steps: Input → Review → Draft → Figures → Export
              </p>
              <span className="inline-flex items-center gap-1 mt-4 font-label-md text-label-md text-primary group-hover:underline">
                Start patent draft
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </AdaAppShell>
  );
}
