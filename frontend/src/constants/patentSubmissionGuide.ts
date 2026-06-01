/** US provisional patent submission guidance (UI guide panel + README source of truth). */

export const PROVISIONAL_FILING_DISCLAIMER =
  "This tool does not provide legal advice. Have a registered patent attorney review your draft before filing.";

export const FILING_GUIDE_INTRO =
  "Follow the phases below in order: research and draft your specification (this app helps with the draft), assemble the USPTO filing package, submit on Patent Center, then track the 12-month conversion deadline.";

/** High-level phases shown at the top of the filing guide panel. */
export const FILING_GUIDE_PHASES = [
  {
    title: "Research & draft",
    body: "Prior art search, confirm novelty, draft specification and drawings with enough technical detail for enablement (§112(a)). Export DOCX/PDF from this app.",
  },
  {
    title: "Assemble package",
    body: "Cover sheet (PTO/SB/16) or ADS data, specification PDF, drawings PDF, correct entity size and fee. Attorney review recommended.",
  },
  {
    title: "Submit",
    body: "File electronically on Patent Center, validate PDFs, pay fee, save receipt and application number.",
  },
  {
    title: "Follow up",
    body: "After acceptance you may use “patent pending.” Calendar month 11 (start non-provisional) and month 12 (hard deadline).",
  },
] as const;

export type FilingPackageItem = {
  name: string;
  required: boolean;
  notes: string;
};

/** Documents and data the USPTO expects for a typical provisional filing. */
export const USPTO_FILING_PACKAGE: FilingPackageItem[] = [
  {
    name: "Written specification (description)",
    required: true,
    notes:
      "Full technical narrative: title, field, background, summary, detailed description. Must enable a skilled person to reproduce the invention. Usually one text-searchable PDF.",
  },
  {
    name: "Drawings",
    required: false,
    notes:
      "Strongly recommended when figures help explain the invention. Label as Figure 1, Figure 2, etc., and reference each figure in the specification. Separate PDF is common.",
  },
  {
    name: "Cover sheet (PTO/SB/16) or Application Data Sheet (ADS)",
    required: true,
    notes:
      "Inventor name(s) and residence, invention title, correspondence name/address/email. Enter in Patent Center (ADS) or upload the official PTO/SB/16 PDF. This app can add a simplified cover page in your export — verify against the current USPTO form before filing.",
  },
  {
    name: "Claims",
    required: false,
    notes:
      "Not required for a provisional, but informal claims are strongly recommended to define scope for a later non-provisional.",
  },
  {
    name: "Filing fee payment",
    required: true,
    notes:
      "Paid at submission based on micro, small, or standard entity status. Confirm amount on the USPTO fee schedule the day you file.",
  },
];

export type ComparisonRow = {
  topic: string;
  provisional: string;
  nonProvisional: string;
};

export const PROVISIONAL_VS_NONPROVISIONAL: ComparisonRow[] = [
  { topic: "USPTO examination", provisional: "No", nonProvisional: "Yes" },
  { topic: "Published publicly", provisional: "No", nonProvisional: "Yes (typically ~18 months after filing)" },
  { topic: "Becomes an issued patent", provisional: "No — placeholder only", nonProvisional: "Yes, if allowed" },
  { topic: "Formal claims at filing", provisional: "No (informal recommended)", nonProvisional: "Yes" },
  { topic: "Inventor oath / declaration", provisional: "No", nonProvisional: "Yes" },
  { topic: "Typical US filing fee", provisional: "See fee tiers below", nonProvisional: "Much higher; see fee schedule" },
  { topic: "How long it lasts", provisional: "12 months unless converted", nonProvisional: "Up to 20 years from filing if granted" },
];

export type EntityFeeTier = {
  entity: string;
  whoQualifies: string;
  /** Illustrative; always verify on USPTO fee schedule */
  provisionalFeeNote: string;
};

export const PROVISIONAL_FEE_TIERS: EntityFeeTier[] = [
  {
    entity: "Micro entity",
    whoQualifies:
      "Inventors meeting USPTO income and prior-application limits; not obligated to assign to a large entity.",
    provisionalFeeNote: "Lowest tier (often around $65 for provisional — verify current schedule).",
  },
  {
    entity: "Small entity",
    whoQualifies:
      "Independent inventors, small businesses (generally fewer than 500 employees), and qualifying nonprofits.",
    provisionalFeeNote: "Mid tier (often around $130 for provisional — verify current schedule).",
  },
  {
    entity: "Standard (large) entity",
    whoQualifies: "Large companies and applicants that do not qualify for reduced fees.",
    provisionalFeeNote: "Full tier (often around $325 for provisional — verify current schedule).",
  },
];

export type FilingResourceLink = {
  label: string;
  href: string;
  description: string;
};

export const PROVISIONAL_FILING_RESOURCES: FilingResourceLink[] = [
  {
    label: "USPTO Patent Center",
    href: "https://patentcenter.uspto.gov/",
    description: "Required portal to file new provisional applications electronically.",
  },
  {
    label: "USPTO account (MyUSPTO)",
    href: "https://my.uspto.gov/",
    description: "Create an account before your first Patent Center submission.",
  },
  {
    label: "PTO/SB/16 cover sheet (PDF)",
    href: "https://www.uspto.gov/sites/default/files/documents/sb0016.pdf",
    description: "Official provisional cover sheet — compare with the cover page in your export.",
  },
  {
    label: "USPTO provisional overview",
    href: "https://www.uspto.gov/patents/basics/types-patent-applications/provisional-application-patent",
    description: "What a provisional is and what you must include.",
  },
  {
    label: "USPTO fee schedule",
    href: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
    description: "Confirm provisional filing fee for your entity tier on the day you pay.",
  },
  {
    label: "Patent Public Search (prior art)",
    href: "https://ppubs.uspto.gov/pubwebapp/",
    description: "Search issued US patents and published applications.",
  },
  {
    label: "Google Patents",
    href: "https://patents.google.com/",
    description: "Broader prior-art search including international filings.",
  },
  {
    label: "USPTO Inventors Assistance Center",
    href: "https://www.uspto.gov/learning-and-resources/support/contact-us/inventors-assistance-center",
    description: "USPTO help for filing questions (not legal advice).",
  },
  {
    label: "Provisional patent template (deftio)",
    href: "https://github.com/deftio/provisional-patent-template",
    description:
      "Open-source US provisional specification layout and filled example (BSD-2). Compare section tone and structure with your export.",
  },
  {
    label: "Filled example (PDF)",
    href: "https://github.com/deftio/provisional-patent-template/blob/master/Prov-Patent-Template-Example.pdf",
    description: "Reference document for formatting and completeness before filing.",
  },
];

export type FilingNextStep = {
  title: string;
  body: string;
};

export const PROVISIONAL_FILING_NEXT_STEPS: FilingNextStep[] = [
  {
    title: "Conduct a prior art search",
    body: "Search Patent Public Search and Google Patents (and technical papers if relevant). For each close match, note the patent/publication number and how your invention differs. This informs drafting and later claim scope.",
  },
  {
    title: "Confirm patentability basics",
    body: "Before filing, your invention should be novel (not fully described in prior art), useful, and non-obvious to someone skilled in the field. Prior art includes patents, papers, products, and public documentation — not only issued patents.",
  },
  {
    title: "Finalize the specification and drawings",
    body: "Include field, background, summary, and a detailed description with enough technical detail that a skilled person can reproduce the invention (35 U.S.C. §112(a)). Every figure in the Brief Description should appear in the Detailed Description with consistent reference numerals.",
  },
  {
    title: "Include at least one informal claim",
    body: "Claims are optional for provisionals but strongly recommended. They define the scope you will pursue in a later non-provisional.",
  },
  {
    title: "Review with a patent attorney",
    body: "Have counsel check enablement, claim scope, inventorship (everyone who conceived the invention must be named), and whether a provisional fits your strategy.",
  },
  {
    title: "Prepare USPTO forms and PDFs",
    body: "Complete ADS fields in Patent Center or PTO/SB/16. Convert specification and drawings to text-searchable PDFs. Determine micro / small / standard entity status and the fee amount from the current fee schedule.",
  },
  {
    title: "File on Patent Center and pay the fee",
    body: "Upload documents, run validation, pay online, and submit. Save the filing receipt and application number (format like 63/123,456 for provisionals).",
  },
  {
    title: "Calendar the 12-month conversion deadline",
    body: "You must file a non-provisional (or PCT) claiming priority before the provisional expires 12 months after filing. This deadline cannot be extended.",
  },
];

export const PATENT_CENTER_FILING_STEPS: string[] = [
  "Create a USPTO account at my.uspto.gov if you do not have one.",
  "Sign in to patentcenter.uspto.gov → File New Submission → Provisions → Provisional Application for Patent.",
  "Enter bibliographic data in the Application Data Sheet (ADS): inventors, residences, invention title, correspondence — or attach completed PTO/SB/16.",
  "Upload the specification as a single text-searchable PDF (export from this app, then convert to PDF if needed).",
  "Upload drawings as a separate PDF if not embedded; use Figure 1, Figure 2 labels matching the specification.",
  "Review the document list: specification (required), drawings (if any), cover sheet/ADS data (required).",
  "Run Patent Center validation; fix PDF compatibility or font issues if reported.",
  "Select entity status (micro / small / standard), pay the provisional filing fee, and submit.",
  "Download and save the filing receipt, payment confirmation, and assigned application number.",
];

export const PRE_FILING_CHECKLIST: string[] = [
  "Prior art search completed; similar references documented with differences noted",
  "Specification includes all sections with §112(a) enablement (how the invention works, not only what it does)",
  "Drawings prepared, labeled, and referenced in the detailed description",
  "At least one informal claim included",
  "Inventor names and correspondence verified (ADS or PTO/SB/16)",
  "Entity size (micro / small / standard) determined; fee amount confirmed on USPTO fee schedule",
  "Specification and drawings are text-searchable PDFs (not scanned images)",
  "Attorney review completed or consciously waived with documented risk acceptance",
  "Calendar reminders: month 11 (start non-provisional), month 12 (hard deadline)",
];

export type GuideSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  warning?: string;
};

export const PATENT_SUBMISSION_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "overview",
    title: "What is a provisional patent?",
    paragraphs: [
      "A provisional patent application (PPA) is a lower-cost filing with the USPTO under 35 U.S.C. §111(b). It secures an official priority (filing) date while giving you 12 months to refine the invention, test the market, or seek funding before a full non-provisional application.",
      "A provisional is never examined, never published, and never becomes a patent on its own. You must file a non-provisional (or PCT) claiming priority within 12 months or the provisional is abandoned.",
    ],
    bullets: [
      "Establishes your US filing date when the USPTO accepts the application",
      "You may use “Patent Pending” on public materials after acceptance",
      "Lower filing fee than a non-provisional; no formal claims or oath required at provisional filing",
      "Informal claims and a thorough specification are still strongly recommended",
    ],
  },
  {
    id: "specification",
    title: "What the specification must contain",
    paragraphs: [
      "There is no single USPTO template for provisionals, but the written description must meet 35 U.S.C. §112(a) enablement: a person skilled in the relevant field can make and use the invention from your text and drawings without undue experimentation.",
      "Describe structure, steps, inputs/outputs, and what is technically novel compared to known approaches. Avoid outcome-only language (“improves efficiency”) without explaining how.",
      "You cannot amend a provisional after filing. Include alternative embodiments and important details now.",
    ],
    bullets: [
      "Title of the invention",
      "Field of the invention (technical domain)",
      "Background / problem the prior art leaves unsolved",
      "Summary of the invention",
      "Detailed description of embodiments (most important section)",
      "Brief description of drawings (if figures are included)",
      "Claims (informal for provisional; still recommended)",
      "Abstract (optional for provisional; 150 words max if used)",
    ],
  },
  {
    id: "prior-art",
    title: "Prior art search (before filing)",
    paragraphs: [
      "Search before you file to reduce risk and improve drafting. You are not required to submit prior art with a provisional, but understanding the landscape helps your attorney and future non-provisional claims.",
    ],
    bullets: [
      "USPTO Patent Public Search and Google Patents for patents and applications",
      "Technical papers, product docs, and standards in your field for non-patent prior art",
      "For each relevant reference: document number, title, and a short note on how your invention differs",
      "Search terms: combine your core technical mechanism with the problem domain (not only product marketing names)",
    ],
  },
  {
    id: "mistakes",
    title: "Critical mistakes to avoid",
    bullets: [
      "Specification too vague to enable reproduction (especially for software and AI inventions)",
      "Missing the 12-month non-provisional deadline (no extensions)",
      "Public disclosure before filing without a strategy (can forfeit foreign rights)",
      "Wrong or incomplete inventorship",
      "Believing the provisional alone grants patent rights — conversion is required",
      "Filing on paper without checking surcharges — electronic filing via Patent Center is standard",
    ],
    warning:
      "If you publicly disclose the invention and miss the non-provisional deadline, you may permanently lose US patent rights. Consult counsel on disclosure timing.",
  },
  {
    id: "timeline",
    title: "Timeline after filing",
    bullets: [
      "Day 0: USPTO assigns a filing date when the application is accepted",
      "Months 1–10: Refine product, gather prior art for IDS, plan non-provisional claims",
      "Month 11: Begin non-provisional drafting (often 4–6 weeks with counsel)",
      "Before month 12: File non-provisional claiming benefit of the provisional (or PCT for international)",
      "Month 12: Provisional expires if not converted",
    ],
  },
  {
    id: "after-filing",
    title: "After you file",
    paragraphs: [
      "Save your application number and receipt. Check status in Patent Center. The non-provisional must explicitly claim priority to the provisional in the ADS, include formal claims, inventor oath/declaration, and usually an Information Disclosure Statement (IDS) listing known prior art.",
      "For international protection, a PCT application generally must be filed within 12 months of the priority date.",
    ],
  },
  {
    id: "this-tool",
    title: "Where this app fits",
    paragraphs: [
      "Patent Drafter produces a draft specification and optional cover-page fields. It does not submit to the USPTO. Use the Export step for DOCX/PDF, fill cover sheet fields if desired, then complete filing on Patent Center as described above.",
    ],
    bullets: [
      "Input → Review → Draft → Figures → Export",
      "Compare exports to the deftio provisional example PDF for structure and completeness",
    ],
  },
];
