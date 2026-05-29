# Patent Drafter

An internal tool for drafting US provisional patent applications. Upload invention documents, extract structured invention details with an LLM, generate patent sections and figures, review the draft, and export to DOCX or PDF.

## Features

- **Multi-source input** — Upload PDF, DOCX, or PPTX files; connect to Confluence; scrape web pages; or paste freeform text
- **AI extraction** — Automatically extracts invention title, technical field, problem, solution, novel mechanism, embodiments, and key components
- **Parallel section agents** — Six isolated LLM agents draft sections simultaneously (no cross-section context); follows the US provisional filing template from the Patent Filing Guide
- **Figure generation** — Creates Mermaid-based patent figures with PNG rendering
- **Review & edit** — Review and refine extracted details and drafted sections before export
- **Export** — Download the finished application as `.docx` or `.pdf`

## Workflow

1. **Input** — Add source documents and invention context
2. **Review** — Verify and edit extracted invention details
3. **Draft** — Parallel agents generate all specification sections at once (per-section regenerate supported)
4. **Figures** — Generate and preview patent figures
5. **Export** — Download the final document

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Python 3.11, FastAPI, Pydantic v2 |
| AI | OpenAI-compatible LLM API |
| Documents | PyMuPDF, python-docx, python-pptx |
| Integrations | Confluence REST API, BeautifulSoup |
| Export | python-docx, fpdf2, Mermaid |

## Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- `@mermaid-js/mermaid-cli` for local Mermaid→PNG export (`npm install -g @mermaid-js/mermaid-cli`, provides `mmdc`)
- An OpenAI-compatible LLM endpoint (see `.env.example`)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/angelayang18/opaida-test-patent-drafter.git
cd opaida-test-patent-drafter
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|----------|-------------|
| `LLM_BASE_URL` | Base URL for the OpenAI-compatible API |
| `LLM_MODEL` | Model name to use for drafting |
| `LLM_API_KEY` | API key (leave empty if not required) |
| `CONFLUENCE_BASE_URL` | Confluence wiki base URL |
| `CONFLUENCE_USERNAME` | Confluence account email |
| `CONFLUENCE_API_TOKEN` | Confluence API token |
| `CONFLUENCE_CLOUD_ID` | Atlassian cloud ID |
| `BACKEND_HOST` | Backend bind host (default: `127.0.0.1`) |
| `BACKEND_PORT` | Backend port (default: `8000`) |

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at `http://127.0.0.1:8000`. Health check: `GET /health`.

For figure PNG export, install the Mermaid CLI globally (used before the Kroki fallback):

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

Open `http://localhost:5173` in your browser. The Vite dev server proxies `/api` requests to the backend.

## Project Structure

```
patent-drafter/
├── backend/
│   ├── main.py              # FastAPI app and routes
│   ├── drafter/             # LLM extraction, section drafting, figures
│   ├── parsers/             # PDF, DOCX, PPTX, Confluence, web scraping
│   ├── exporter/            # DOCX, PDF, and Mermaid rendering
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/           # Input, Review, Draft, Figures, Export
│       ├── components/      # Shared UI components
│       ├── context/         # Workflow state management
│       └── services/        # API client
├── .env.example
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload PDF, DOCX, or PPTX files |
| `POST` | `/connect/confluence` | Fetch content from Confluence |
| `POST` | `/scrape` | Scrape text from a URL |
| `POST` | `/extract` | Extract invention details (grouped parallel LLM by default; see `EXTRACT_MODE`) |
| `POST` | `/extract/field` | Re-extract a single invention field |
| `POST` | `/draft` | Draft one section (single agent) |
| `POST` | `/draft/all` | Draft multiple sections in parallel (one agent per section) |
| `POST` | `/figures/generate` | Generate patent figure definitions |
| `POST` | `/figures/render` | Render a Mermaid diagram to PNG |
| `POST` | `/export/docx` | Export patent application as DOCX |
| `POST` | `/export/pdf` | Export patent application as PDF |

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
