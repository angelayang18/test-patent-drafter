/** External links and copy for US provisional filing guidance on the Export step. */

export const PROVISIONAL_FILING_DISCLAIMER =
  "This tool does not provide legal advice. Have a registered patent attorney review your draft before filing.";

export type FilingResourceLink = {
  label: string;
  href: string;
  description: string;
};

export const PROVISIONAL_FILING_RESOURCES: FilingResourceLink[] = [
  {
    label: "USPTO Patent Center",
    href: "https://patentcenter.uspto.gov/",
    description: "File your provisional application online.",
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
    description: "Current filing fees for provisional applications.",
  },
  {
    label: "Provisional patent template (deftio)",
    href: "https://github.com/deftio/provisional-patent-template",
    description:
      "Open-source US provisional specification layout and filled example (BSD-2). Useful to compare section tone and structure with your export.",
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
    title: "Confirm patentability basics",
    body: "Before filing, your invention should be novel (not fully described in prior art), useful, and non-obvious to someone skilled in the field. Prior art includes patents, papers, products, and public documentation — not only issued patents.",
  },
  {
    title: "Review figures and reference numerals",
    body: "Ensure every FIG. in the Brief Description appears in the Detailed Description with consistent numerals (200, 202, 204…). A person skilled in the art should be able to reproduce the invention from the text and drawings alone (35 U.S.C. §112(a) enablement).",
  },
  {
    title: "Include at least one claim",
    body: "Your export should include informal claims. They establish scope for a later non-provisional and are strongly recommended even though provisionals are not examined for patentability.",
  },
  {
    title: "Review with a patent attorney",
    body: "Have counsel check technical coverage, claim scope, and whether a provisional is the right strategy for your business.",
  },
  {
    title: "Prepare USPTO forms beyond this export",
    body: "Filing also requires an Application Data Sheet (ADS) and the official cover sheet (PTO/SB/16) with inventor and correspondence details. This app can add a simplified cover page when you fill in the fields above — confirm it matches the current USPTO PDF before submitting.",
  },
  {
    title: "File on Patent Center and pay the fee",
    body: "Upload your specification (DOCX or PDF), drawings, and required forms at Patent Center. After the USPTO accepts the filing, you may use “patent pending” on public materials.",
  },
  {
    title: "Calendar the 12-month conversion deadline",
    body: "A provisional establishes a filing date but expires 12 months after filing. You must file a non-provisional (or PCT) claiming priority to that date — this deadline is strict. Plan conversion with your attorney well before month 12.",
  },
];
