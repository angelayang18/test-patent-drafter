import { RFP_PROCESS_STEPS } from "../constants/fundingOpportunities";

export function RfpProcessStepper() {
  return (
    <>
      {/* Vertical layout on mobile */}
      <div className="md:hidden space-y-5">
        {RFP_PROCESS_STEPS.map((step, index) => (
          <div key={step} className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
              {index + 1}
            </div>
            <p className="font-label-md text-label-md text-on-surface pt-1">{step}</p>
          </div>
        ))}
      </div>

      {/* Horizontal layout on desktop */}
      <div className="hidden md:grid md:grid-cols-6 gap-2">
        {RFP_PROCESS_STEPS.map((step, index) => (
          <div key={step} className="relative flex flex-col items-center text-center">
            {index > 0 && (
              <div
                className="absolute top-4 right-1/2 w-full h-px bg-outline-variant -translate-y-1/2"
                aria-hidden
              />
            )}
            <div className="relative z-10 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm shrink-0">
              {index + 1}
            </div>
            <p className="font-label-sm text-label-sm text-on-surface mt-3 leading-snug px-1">
              {step}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
