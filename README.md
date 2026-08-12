# Report Drafter

An internal opAIda tool for drafting structured documents with an LLM. Choose a document type on the home screen, add source material (uploads, Confluence, web pages, or freeform text), extract structured details, generate sections, review the draft, and export to DOCX or PDF.

Supported builtin types: **Patent Provisional**, **Grant Application**, **SOW Contract**, and **ADA Bioanalytical Report**. You can also create **custom templates** with your own section list. The GitHub repository is `report-drafter` (a local checkout may still use an older folder name such as `patent-drafter`).

## Features

- **Home / type picker** — Select a builtin document type or create a custom template; optionally include, exclude, and reorder sections before starting
- **Multi-source input** — Upload PDF, DOCX, or PPTX files; connect to Confluence; scrape web pages; or paste freeform text; resume drafts from a local library
- **Type-specific AI extraction** — Extracts structured fields for patents, grants, SOWs, ADA reports, or custom templates
- **Parallel section agents** — Isolated LLM agents draft sections (single-section and draft-all modes); patents follow the US provisional filing template with baseline USPTO/opAIda drafting rules
- **Figures (all types)** — Mermaid-based diagrams with PNG rendering on Draft → Figures → Export for patent, grant, SOW, ADA, and custom templates
- **Clerk authentication** — Sign-in required for the app; backend verifies Clerk session JWTs via JWKS
- **Community document types** — Browse shared templates at `/shared-document-types`; opt-in share when creating a custom type
- **USPTO ODP cross-reference** (patent Export) — Suggest related prior applications for an applicant via the USPTO Open Data Portal API
- **Review & edit** — Verify and refine extracted details and drafted sections before export; selection-based regenerate supported
- **Attorney feedback & org-wide learning** (patent) — Per-section notes on Draft and global notes on Export; optional submission of finalized drafts to a SQLite corpus that distills org-wide guidelines (baseline rules apply even before the first submission)
- **QA report** (patent) — Invention QA checks before export
- **Export** — Download the finished document as `.docx` or `.pdf`; patent exports support an optional cover sheet (PTO/SB/16-style); figures embed as PNG drawing sheets when present
- **Filing guide** (patent) — Header **Filing guide** (info icon) opens step-by-step US provisional submission instructions, checklists, and USPTO links

## Workflows

Shared pattern for every document type:

1. **Home** — Choose type (or custom template) and section settings
2. **Input** — Add source documents and context
3. **Review** — Verify and edit extracted details
4. **Draft** — Generate sections (per-section regenerate supported)
5. **Figures** — Generate and preview Mermaid diagrams (embedded as PNG on export)
6. **Export** — Download DOCX/PDF

| Type | Steps |
|------|--------|
| Patent Provisional | Input → Review → Draft → Figures → Export |
| Grant Application | Input → Review → Draft → Figures → Export |
| SOW Contract | Input → Review → Draft → Figures → Export |
| ADA Bioanalytical Report | Input → Review → Draft → Figures → Export |
| Custom template | Input → Review → Draft → Figures → Export |

Legacy patent routes (`/review`, `/draft`, `/figures`, `/export`) redirect to `/patent/...`.

## Patent submission process

The patent workflow drafts a **US provisional patent application specification**. It does **not** file with the USPTO for you and does **not** provide legal advice. Have a registered patent attorney review your draft before filing.

Open **Filing guide** in the app header for the full walkthrough (filing package, fee tiers, checklist, Patent Center steps, and links). The summary below matches that guide.

### End-to-end path

1. **Research & draft** — Prior art search, confirm novelty, draft specification and drawings with §112(a) enablement. Use this app through Export.
2. **Assemble package** — Specification PDF, drawings PDF (if any), ADS or PTO/SB/16 cover sheet data, correct entity fee.
3. **Submit** — [Patent Center](https://patentcenter.uspto.gov/) → Provisions → Provisional Application; validate PDFs, pay, save receipt.
4. **Follow up** — “Patent pending” after acceptance; file non-provisional before month 12.

### What you file with the USPTO

| Item | Required? |
|------|-----------|
| Written specification (description) | Yes |
| Cover sheet (PTO/SB/16) or ADS data | Yes |
| Filing fee | Yes |
| Drawings | Strongly recommended when figures explain the invention |
| Claims | Optional for provisional; informal claims strongly recommended |

### Provisional vs. non-provisional (short)

| | Provisional | Non-provisional |
|---|-------------|-----------------|
| Examined | No | Yes |
| Becomes a patent | No | Yes, if granted |
| Formal claims at filing | No | Yes |
| Typical fee | Lower (micro/small/standard tiers — verify [fee schedule](https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule)) | Much higher |
| Duration | 12 months unless converted | Up to 20 years if granted |

### Workflow in this app (patent)

1. **Input** → **Review** → **Draft** (optional per-section attorney feedback) → **Figures** → **Export** (optional cover sheet fields and global attorney feedback; optionally contribute finalized draft to org corpus)
2. **File externally** on Patent Center with the package above

### Before you file (checklist)

- [ ] Prior art search documented ([Patent Public Search](https://ppubs.uspto.gov/pubwebapp/), [Google Patents](https://patents.google.com/))
- [ ] Specification enables reproduction (§112(a)) — how the invention works, not only outcomes
- [ ] Drawings labeled and referenced in the detailed description
- [ ] Informal claims included
- [ ] ADS or [PTO/SB/16](https://www.uspto.gov/sites/default/files/documents/sb0016.pdf) verified
- [ ] Entity tier and fee confirmed on fee schedule
- [ ] Text-searchable PDFs (not scans)
- [ ] Calendar: month 11 and month 12 deadlines

### Patent Center (summary)

1. Account at [my.uspto.gov](https://my.uspto.gov/) → [Patent Center](https://patentcenter.uspto.gov/)
2. **File New Submission → Provisions → Provisional Application for Patent**
3. ADS / cover sheet → upload specification PDF → upload drawings PDF → validate → pay → submit
4. Save application number and receipt

### References

Compare exports to the [deftio provisional template example PDF](https://github.com/deftio/provisional-patent-template/blob/master/Prov-Patent-Template-Example.pdf). USPTO: [provisional overview](https://www.uspto.gov/patents/basics/types-patent-applications/provisional-application-patent), [Inventors Assistance Center](https://www.uspto.gov/learning-and-resources/support/contact-us/inventors-assistance-center).

## Authentication (Clerk)

Sign-in is required. Create a Clerk application, then configure:

1. **Backend** (repo root `.env`): `CLERK_SECRET_KEY`, `CLERK_JWKS_URL`
2. **Frontend** (`frontend/.env` — Vite only reads env from the frontend root): `VITE_CLERK_PUBLISHABLE_KEY`

See `.env.example` and `frontend/.env.example` for key names (never commit real secrets). JWKS URL is derived from your Clerk Frontend API domain (Dashboard → API Keys).

Protected API routes expect a Bearer session JWT; the backend verifies it with PyJWT against the Clerk JWKS endpoint.

## Community document-type templates

Custom templates can be **shared with the team** (opt-in checkbox when creating). Authenticated users can browse shared types at **Shared document types** (`/shared-document-types`) and start a draft from a community template. Related APIs: `GET/POST /document-types/community`, `POST /document-types/suggest-sections`.

## USPTO Open Data Portal (related applications)

On patent **Export**, the app can suggest cross-reference candidates for an applicant name via USPTO ODP. Set `USPTO_ODP_API_KEY` in the root `.env` (obtain from [data.uspto.gov](https://data.uspto.gov/) with a USPTO.gov account / ID.me). This is a lookup aid only—it does not establish legal relatedness (priority, continuation, etc.). Endpoint: `POST /export/suggest-related-applications`.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite, React Router, Tailwind CSS (CDN) |
| Backend | Python 3.11, FastAPI, Pydantic v2 |
| AI | OpenAI-compatible LLM API |
| Documents | PyMuPDF, python-docx, python-pptx |
| Integrations | Confluence REST API, BeautifulSoup |
| Export | python-docx, fpdf2, Mermaid (`mmdc` and/or Kroki) |

## Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- `@mermaid-js/mermaid-cli` for local Mermaid→PNG export (`npm install -g @mermaid-js/mermaid-cli`, provides `mmdc`) — used by patent figure export; Kroki is the fallback
- An OpenAI-compatible LLM endpoint (see `.env.example`)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/opaida-ai/report-drafter.git
cd report-drafter
```

### 2. Configure environment variables

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Edit both files with your values (key **names** only in the examples—never commit real secrets):

| Variable | Description |
|----------|-------------|
| `LLM_BASE_URL` | Base URL for the OpenAI-compatible API |
| `LLM_MODEL` | Model name to use for drafting |
| `LLM_API_KEY` | API key (leave empty if not required) |
| `LLM_TIMEOUT_SECONDS` | Per-request LLM timeout in seconds (default: `180`) |
| `LLM_CONNECT_TIMEOUT_SECONDS` | Socket connect timeout in seconds (default: `30`) |
| `LLM_MAX_RETRIES` | Retries after the first failed attempt (default: `2`) |
| `LLM_RETRY_BACKOFF_SECONDS` | Initial retry backoff; doubles each retry (default: `5`) |
| `LLM_HEALTH_PROBE_TIMEOUT_SECONDS` | Timeout for `/health` LLM reachability probe (default: `10`) |
| `EXTRACT_MODE` | Extraction strategy: `grouped` (default), `single`, or `parallel` |
| `EXTRACT_MAX_SOURCE_CHARS` | Short-doc ceiling for extraction (default: `80000`); longer sources use retrieve-then-extract |
| `MMDC_PATH` | Optional path to `mmdc` if not on `PATH` |
| `KROKI_BASE_URL` | Optional Kroki base URL for Mermaid PNG (default: `https://kroki.io`) |
| `LEARNING_ENABLED` | Enable org-wide learning corpus and guideline retrieval (default: `true`) |
| `LEARNING_DB_PATH` | SQLite path for learning corpus (default: `backend/data/learning.db`) |
| `SECTION_REFLECTION_ENABLED` | Enable critique-and-revise loop on section drafts (default: `true`) |
| `CONFLUENCE_BASE_URL` | Confluence wiki base URL |
| `CONFLUENCE_USERNAME` | Confluence account email |
| `CONFLUENCE_API_TOKEN` | Confluence API token |
| `CONFLUENCE_CLOUD_ID` | Atlassian cloud ID |
| `CLERK_SECRET_KEY` | Clerk secret key for backend session verification |
| `CLERK_JWKS_URL` | Clerk JWKS URL for verifying session JWTs |
| `USPTO_ODP_API_KEY` | USPTO Open Data Portal API key (related-application suggestions on patent Export) |
| `BACKEND_HOST` | Suggested backend bind host (default: `127.0.0.1`; set via uvicorn CLI) |
| `BACKEND_PORT` | Suggested backend port (default: `8000`; set via uvicorn CLI) |

Frontend env (`frontend/.env` — copy from `frontend/.env.example`):

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (required for sign-in) |
| `VITE_API_URL` | Backend origin (default: `http://localhost:8000`) |

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at `http://127.0.0.1:8000`. Health check: `GET /health`.

For patent figure PNG export, install the Mermaid CLI globally (used before the Kroki fallback):

```bash
npm install -g @mermaid-js/mermaid-cli
pnpm exec puppeteer browsers install chrome-headless-shell   # first-time headless Chrome for mmdc
```

Verify with `mmdc --version`. Optional: set `MMDC_PATH` in `.env` if `mmdc` is not on your PATH.

### 4. Start the frontend

In a separate terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser. The frontend calls the backend at `VITE_API_URL` (default `http://localhost:8000`).

## Project Structure

```
report-drafter/
├── backend/
│   ├── main.py                 # FastAPI app and routes
│   ├── drafter/                # Extraction, section drafting, figures (patent + grant/sow/ada/generic)
│   ├── learning/               # Baseline guidelines, feedback corpus, distillation
│   ├── parsers/                # PDF, DOCX, PPTX, Confluence, web scraping
│   ├── exporter/               # DOCX/PDF exporters and Mermaid rendering
│   ├── eval/                   # Backend evaluation harness (not exposed in UI)
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.tsx        # Document-type picker
│       │   ├── Input.tsx … Export.tsx   # Patent workflow
│       │   ├── grant/          # Grant Application (+ Figures)
│       │   ├── sow/            # SOW Contract (+ Figures)
│       │   ├── ada/            # ADA Bioanalytical Report (+ Figures)
│       │   ├── generic/        # Custom templates (+ Figures)
│       │   └── SharedDocumentTypes.tsx  # Community templates browse
│       ├── components/         # AppShell, filing guide, attorney feedback, section editors
│       ├── constants/          # Document types, patent submission guide copy
│       ├── context/            # Per-type workflow state
│       └── services/           # API client
├── .env.example
└── README.md
```

## API Endpoints

### Health & input

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (includes optional LLM probe) |
| `POST` | `/upload` | Upload PDF, DOCX, or PPTX files |
| `POST` | `/connect/confluence` | Fetch content from Confluence |
| `POST` | `/scrape` | Scrape text from a URL |
| `POST` | `/regenerate/selection` | Regenerate a selected span of drafted text |

### Patent

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extract` | Extract invention details |
| `POST` | `/extract/field` | Re-extract a single invention field |
| `POST` | `/extract/titles` | Suggest patent titles |
| `POST` | `/draft` | Draft one section |
| `POST` | `/draft/all` | Draft multiple sections in parallel |
| `POST` | `/figures/generate` | Generate patent figure definitions |
| `POST` | `/figures/generate/generic` | Generate figures for grant/SOW/ADA/custom |
| `POST` | `/figures/regenerate-one` | Regenerate a single patent figure |
| `POST` | `/figures/regenerate-one/generic` | Regenerate a single non-patent figure |
| `POST` | `/figures/render` | Render a Mermaid diagram to PNG |
| `POST` | `/export/prerender-figures` | Pre-render figures for export |
| `POST` | `/export/suggest-related-applications` | USPTO ODP related-application suggestions |
| `GET` | `/document-types/community` | List shared community document-type templates |
| `POST` | `/document-types/community` | Publish a document-type template to the community |
| `POST` | `/document-types/suggest-sections` | Suggest sections for a custom document type |
| `POST` | `/qa-report` | Run invention QA report |
| `POST` | `/export/docx` | Export patent application as DOCX |
| `POST` | `/export/pdf` | Export patent application as PDF |
| `POST` | `/learning/submit` | Store attorney-reviewed draft and feedback |
| `POST` | `/learning/submissions/{id}/approve` | Approve a learning submission |
| `GET` | `/learning/guidelines` | List distilled org-wide drafting guidelines |

### Grant / SOW / ADA

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extract/grant` | Extract grant details |
| `POST` | `/extract/grant/field` | Re-extract a single grant field |
| `POST` | `/draft/grant` | Draft one grant section |
| `POST` | `/draft/grant/all` | Draft all grant sections |
| `POST` | `/export/grant/docx` | Export grant as DOCX |
| `POST` | `/export/grant/pdf` | Export grant as PDF |
| `POST` | `/extract/sow` | Extract SOW details |
| `POST` | `/extract/sow/field` | Re-extract a single SOW field |
| `POST` | `/draft/sow` | Draft one SOW section |
| `POST` | `/draft/sow/all` | Draft all SOW sections |
| `POST` | `/export/sow/docx` | Export SOW as DOCX |
| `POST` | `/export/sow/pdf` | Export SOW as PDF |
| `POST` | `/extract/ada` | Extract ADA report details |
| `POST` | `/extract/ada/field` | Re-extract a single ADA field |
| `POST` | `/draft/ada` | Draft one ADA section |
| `POST` | `/draft/ada/all` | Draft all ADA sections |
| `POST` | `/export/ada/docx` | Export ADA report as DOCX |
| `POST` | `/export/ada/pdf` | Export ADA report as PDF |

### Custom templates (generic)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extract/titles/generic` | Suggest titles for a custom template |
| `POST` | `/extract/titles/generic/citations` | Suggest title citations for a custom template |
| `POST` | `/draft/generic` | Draft one custom section |
| `POST` | `/draft/generic/all` | Draft all custom sections |
| `POST` | `/export/generic/docx` | Export custom document as DOCX |
| `POST` | `/export/generic/pdf` | Export custom document as PDF |

## Development

Build the frontend for production:

```bash
cd frontend
pnpm build
pnpm preview
```

Run backend tests:

```bash
cd backend
python -m pytest tests/
```
