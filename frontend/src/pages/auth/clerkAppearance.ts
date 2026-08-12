/**
 * Gives the Clerk form real card definition (white surface + border +
 * shadow) against AuthLayout's light gray panel, and matches the app's
 * navy/M3 tokens so it reads as part of the product rather than an embedded
 * third-party widget. Explicit heights/gaps throughout keep the vertical
 * rhythm consistent instead of relying on Clerk's default spacing.
 *
 * Not strictly typed against @clerk/types here since it's a transitive
 * dependency under pnpm's non-flat node_modules and may not be directly
 * importable; SignIn/SignUp still validate the shape at the call site.
 */
export const clerkAuthPageAppearance = {
  variables: {
    colorPrimary: "#00375e",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-8 sm:p-10 gap-y-6",

    header: "gap-y-1.5 text-left",
    headerTitle: "font-headline-md text-headline-md text-on-surface",
    headerSubtitle: "font-body-sm text-body-sm text-on-surface-variant",

    socialButtons: "gap-3",
    socialButtonsBlockButton:
      "h-11 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors",
    socialButtonsBlockButtonText: "font-label-md text-label-md text-on-surface",
    socialButtonsProviderIcon: "w-[18px] h-[18px]",

    dividerRow: "my-1",
    dividerLine: "bg-outline-variant",
    dividerText: "font-body-sm text-body-sm text-on-surface-variant px-3",

    formFieldLabelRow: "mb-1.5",
    formFieldLabel: "font-label-md text-label-md text-on-surface",
    formFieldInput:
      "h-11 px-3.5 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-colors",
    formFieldInputShowPasswordButton: "text-on-surface-variant hover:text-on-surface",

    formButtonPrimary:
      "h-11 mt-2 bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md normal-case rounded-lg transition-colors",

    footer: "bg-transparent border-t border-outline-variant mt-2 pt-6",
    footerAction: "gap-1 justify-center",
    footerActionText: "font-body-sm text-body-sm text-on-surface-variant",
    footerActionLink: "font-label-md text-label-md text-primary hover:text-primary/80",
  },
};
