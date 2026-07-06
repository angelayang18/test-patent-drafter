export type FundingFit =
  | "Strongest Fit"
  | "Strong Fit"
  | "Good Fit"
  | "Fit with Compliance Prep";

export type FundingOpportunity = {
  agency: string;
  program: string;
  amount: string;
  description: string;
  fit: FundingFit;
  href: string;
};

export const FUNDING_OPPORTUNITIES: FundingOpportunity[] = [
  {
    agency: "NIH",
    program: "SBIR/STTR",
    amount: "Phase I up to $400K · Phase II up to $2M",
    description:
      "AI tools for biomedical research — best immediate entry point for small companies",
    fit: "Strongest Fit",
    href: "https://seed.nih.gov",
  },
  {
    agency: "NIH",
    program: "Bridge to Artificial Intelligence (Bridge2AI)",
    amount: "$130M initiative",
    description: "AI-ready biomedical datasets for specific health challenges",
    fit: "Strong Fit",
    href: "https://commonfund.nih.gov/bridge2ai",
  },
  {
    agency: "NIH/NSF",
    program: "Smart Health & Biomedical Research (SCH)",
    amount: "Up to $1.2M over 4 years",
    description: "High-risk, high-reward interdisciplinary AI for health",
    fit: "Strong Fit",
    href: "https://www.nsf.gov/program/SCH",
  },
  {
    agency: "NIH",
    program: "NIBIB AI/ML Program",
    amount: "Varies",
    description:
      "AI/ML at the intersection of engineering and biomedicine — clinical decision support",
    fit: "Good Fit",
    href: "https://nibib.nih.gov/programs/machine-learning",
  },
  {
    agency: "NCI",
    program: "AI for Cancer Research",
    amount: "Varies",
    description: "AI for drug design, cancer biology, and clinical trial analytics",
    fit: "Good Fit",
    href: "https://www.cancer.gov/about-nci/organization/cbiit",
  },
  {
    agency: "HUD",
    program: "Ginnie Mae AI RFP",
    amount: "Federal contract",
    description:
      "AI acquisition under HUD Acquisition Instruction 26-02 — monitor SAM.gov",
    fit: "Fit with Compliance Prep",
    href: "https://www.ginniemae.gov/about_us/what_we_do/Pages/procurement_contracts.aspx",
  },
];

export const RFP_PROCESS_STEPS: string[] = [
  "Register on SAM.gov",
  "Get on a Contract Vehicle",
  "Monitor for RFPs",
  "Evaluate the Opportunity (Bid/No-Bid)",
  "Write the Proposal",
  "Submit and Follow Up",
];

export const FIT_TAG_CLASSES: Record<FundingFit, string> = {
  "Strongest Fit": "bg-secondary-container/30 text-secondary border border-secondary/30",
  "Strong Fit": "bg-primary/10 text-primary border border-primary/20",
  "Good Fit": "bg-surface-container-high text-on-surface-variant border border-outline-variant",
  "Fit with Compliance Prep": "bg-amber-500/10 text-amber-700 border border-amber-500/30",
};
