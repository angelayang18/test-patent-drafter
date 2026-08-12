import { useAuth } from "@clerk/clerk-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import {
  listCommunityDocumentTypeTemplates,
  type CommunityDocumentTypeTemplate,
} from "../services/api";
import {
  communitySectionsToCustom,
  sharedByLabel,
  type CreateDocumentTypeSeed,
} from "../utils/communityDocumentTypes";
import {
  generateDocumentTypeTemplateId,
  saveDocumentTypeTemplate,
  type DocumentTypeTemplate,
} from "../utils/documentTypeTemplates";
import "../styles/patent-drafter.css";

const SECTION_PREVIEW_COLLAPSE_THRESHOLD = 6;

function SectionPreview({
  sections,
}: {
  sections: CommunityDocumentTypeTemplate["sections"];
}) {
  const normalized = communitySectionsToCustom(sections);
  const [expanded, setExpanded] = useState(
    normalized.length <= SECTION_PREVIEW_COLLAPSE_THRESHOLD,
  );

  if (normalized.length === 0) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">No sections listed.</p>
    );
  }

  const showToggle = normalized.length > SECTION_PREVIEW_COLLAPSE_THRESHOLD;

  return (
    <div className="space-y-2">
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="font-label-sm text-label-sm text-secondary hover:underline"
          aria-expanded={expanded}
        >
          {expanded
            ? "Hide sections"
            : `Preview sections (${normalized.length})`}
        </button>
      )}
      {(expanded || !showToggle) && (
        <ol className="list-decimal list-inside space-y-1 font-body-sm text-body-sm text-on-surface">
          {normalized.map((section) => (
            <li key={section.id}>
              <span className="font-medium">{section.name}</span>
              {section.description.trim() ? (
                <span className="text-on-surface-variant"> — {section.description}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function SharedDocumentTypes() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [communityTemplates, setCommunityTemplates] = useState<
    CommunityDocumentTypeTemplate[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = await getToken();
        if (!token || cancelled) {
          if (!cancelled) {
            setCommunityTemplates([]);
            setLoading(false);
          }
          return;
        }
        const listed = await listCommunityDocumentTypeTemplates(token);
        if (!cancelled) {
          setCommunityTemplates(listed);
        }
      } catch {
        if (!cancelled) {
          setCommunityTemplates([]);
          setLoadError("Could not load shared document types.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const sharedTemplates = useMemo(
    () => communityTemplates.filter((template) => !template.mine),
    [communityTemplates],
  );

  const handleAddToMyList = (template: CommunityDocumentTypeTemplate) => {
    const localTemplate: DocumentTypeTemplate = {
      id: generateDocumentTypeTemplateId(template.name),
      name: template.name,
      description: template.description?.trim() || undefined,
      sections: communitySectionsToCustom(template.sections),
      createdAt: new Date().toISOString(),
      basedOn: sharedByLabel(template.created_by_name),
    };
    try {
      saveDocumentTypeTemplate(localTemplate);
      navigate("/");
    } catch (err) {
      console.warn("Could not add shared template to my list", err);
    }
  };

  const handleCloneCustomize = (template: CommunityDocumentTypeTemplate) => {
    const createSeed: CreateDocumentTypeSeed = {
      name: template.name,
      description: template.description?.trim() || undefined,
      sections: communitySectionsToCustom(template.sections),
      basedOn: sharedByLabel(template.created_by_name),
    };
    navigate("/", { state: { createSeed } });
  };

  return (
    <AppShell
      step="input"
      showStepNav={false}
      mainClassName="max-w-6xl mx-auto px-margin-desktop py-12"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary hover:underline"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to document types
          </Link>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-3">
              Shared document types
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
              Browse templates shared by your team. Add one as-is or clone it to customize.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
        ) : loadError ? (
          <p className="font-body-md text-body-md text-error">{loadError}</p>
        ) : sharedTemplates.length === 0 ? (
          <div className="p-6 rounded-xl border border-outline-variant bg-surface-container-lowest">
            <p className="font-body-md text-body-md text-on-surface">
              No shared document types yet.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
              When a teammate shares a document type, it will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sharedTemplates.map((template) => (
              <div
                key={template.id}
                data-testid={`community-template-card-${template.id}`}
                className="p-5 rounded-xl border border-outline-variant bg-surface-container-lowest space-y-4"
              >
                <div>
                  <span className="material-symbols-outlined text-primary text-3xl mb-3 block">
                    group
                  </span>
                  <h2 className="font-title-md text-title-md text-primary mb-1">
                    {template.name}
                  </h2>
                  {template.description?.trim() ? (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {template.description.trim()}
                    </p>
                  ) : null}
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {sharedByLabel(template.created_by_name)}
                  </p>
                </div>

                <SectionPreview sections={template.sections} />

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAddToMyList(template)}
                    className="px-3 py-2 rounded-lg border border-outline-variant font-label-sm text-label-sm text-on-surface hover:bg-surface-container-high transition-all active:scale-95"
                  >
                    Add to my list
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCloneCustomize(template)}
                    className="px-3 py-2 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container transition-all active:scale-95"
                  >
                    Clone &amp; customize
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
