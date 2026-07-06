export type HudChecklistItem = { id: string; label: string };

export type HudChecklistSection = {
  code: string;
  title: string;
  items: HudChecklistItem[];
};

export const HUD_COMPLIANCE_SECTIONS: HudChecklistSection[] = [
  {
    code: "AS-2602",
    title: "Privacy & Data",
    items: [
      { id: "as-2602-data-handling", label: "Data handling procedures" },
      { id: "as-2602-privacy-by-design", label: "Privacy by design statement" },
      { id: "as-2602-records-management", label: "Records management plan" },
    ],
  },
  {
    code: "AS-2603",
    title: "AI Transparency",
    items: [
      { id: "as-2603-system-diagram", label: "System diagram and data flow diagram" },
      { id: "as-2603-sbom", label: "SBOM (Software Bill of Materials)" },
      { id: "as-2603-model-card", label: "Model card and training data provenance" },
      { id: "as-2603-unbiased-statement", label: "Unbiased AI compliance statement" },
      { id: "as-2603-bias-evaluation", label: "Bias evaluation results" },
      { id: "as-2603-human-oversight", label: "Human oversight description" },
      { id: "as-2603-assurance-packet", label: "HUD AI Assurance Packet" },
    ],
  },
  {
    code: "AS-2604",
    title: "Vendor Lock-In",
    items: [
      { id: "as-2604-portability", label: "Portability plan" },
      { id: "as-2604-open-standards", label: "Open standards documentation" },
      { id: "as-2604-licensing", label: "Licensing disclosure" },
      { id: "as-2604-transition", label: "Transition support plan" },
    ],
  },
  {
    code: "AS-2605",
    title: "Testing & Monitoring",
    items: [
      { id: "as-2605-methodology", label: "Testing and monitoring methodology" },
      { id: "as-2605-benchmarks", label: "Performance benchmarks" },
      { id: "as-2605-bias-detection", label: "Bias detection procedures" },
    ],
  },
  {
    code: "AS-2606",
    title: "High-Impact AI (if applicable)",
    items: [
      { id: "as-2606-pre-deployment", label: "Pre-deployment testing plan" },
      { id: "as-2606-civil-rights", label: "Civil rights impact assessment" },
      { id: "as-2606-logging", label: "Logging architecture" },
      { id: "as-2606-incident-response", label: "Incident response plan" },
    ],
  },
];

export const HUD_CHECKLIST_TOTAL_ITEMS = HUD_COMPLIANCE_SECTIONS.reduce(
  (sum, section) => sum + section.items.length,
  0,
);
