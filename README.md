# Gator Transfer Navigator

Upload a CCSF transcript, get a source-cited checklist for the **SFSU Computer Science B.S.** — what's done, what's missing, which units won't count, and a term-by-term plan to finish.

Built at the SF Hacks x GDG AI Hackathon, October 2, 2026. Tracks: **Build For SFSU** and **GDG Build with AI for Social Good**.

| | |
| --- | --- |
| **Live app** | https://transfer-web-938542856973.us-central1.run.app |
| **API** | https://transfer-api-938542856973.us-central1.run.app/api |

## The problem

43% of new CSU undergraduates are transfer students, and CCSF sends more of its transfers to SF State than to any other campus — about 39%, more than five times the next destination. But only 18% of community college students transfer within four years, and roughly 1 in 5 who do leave without a degree. Students lose whole terms to courses that never count, because the answer is buried in ASSIST PDFs, catalog pages and 20-minute counselor appointments.

**Who benefits at SFSU:** incoming transfer students, the SFSU transfer center and advisors, and departments that lose students to missing prerequisites.

## How it works

Gemini reads and explains. Plain Python decides.

1. **Gemini** converts the official ASSIST agreement and the SFSU Bulletin into two JSON lookup tables (once, offline — `scripts/build_tables.py`).
2. **Gemini** reads the uploaded transcript PDF or phone photo and returns structured JSON.
3. **Plain Python** matches each course against the ASSIST table and marks every requirement `done`, `missing`, `review` or `no_articulation`. The agreement's own grade rules are enforced here: C or better, and CR/NC not accepted for the major.
4. **Gemini** writes the semester plan, which Python then validates — any course not in the SFSU catalog is removed, and the sequence is checked against SFSU's official COMP ADT Roadmap along with per-term unit loads.

**The AI never decides whether a course counts.** That comes from the official ASSIST agreement, so a hallucination cannot change a student's credits.

## Stack

| Layer | Technology | Job |
| --- | --- | --- |
| AI | Gemini 2.5 Flash on **Vertex AI** | Reads the transcript, builds the tables, writes the plan |
| Backend | FastAPI on **Cloud Run** | `/analyze`, `/share`, `/plan/{id}` |
| Frontend | React + Vite on **Cloud Run** (nginx) | Upload page and results page |
| Data | **Firestore** | The locked course-match tables, plus shared plans |
| Built with | Google AI Studio, Gemini CLI | Prompt testing and development |

## Responsible AI

| Risk | What could go wrong | How the app handles it |
| --- | --- | --- |
| Hallucination | Gemini claims a course counts when it doesn't | Matching is deterministic Python against the ASSIST table; every ✅ cites its ASSIST page |
| Invented plan courses | The plan includes a course SFSU doesn't offer | `validate_plan()` removes any course not in the Bulletin list, and flags any plan that breaks the sequence in SFSU's official [COMP ADT Roadmap](https://bulletin.sfsu.edu/colleges/science-engineering/computer-science/bs-computer-science/adt-roadmap/) or exceeds 15 units in a term |
| Extraction errors | A misread grade or course code | The results page lists every extracted course so the student can spot mistakes; unreadable values stay blank, never guessed |
| Privacy (FERPA) | Transcripts are protected student records | Processed in memory and never stored or logged; names and IDs are not extracted; only results are saved, and only when the student clicks Share |
| Over-trust | A student skips the counselor entirely | A fixed "not official advising" banner; ⚠️ items route to a counselor; the share link is built for that meeting |
| Stale data | Agreements change each year | Each result shows the ASSIST year; a pilot would refresh tables every catalog year |
| Bias and access | Works only for clean PDFs or English | Accepts phone photos and plain-language explanations; next step is Spanish, Chinese and Tagalog output |
| Accessibility | Screen-reader users can't use color-only status | Each status has an icon and a text label, not just color |

## Scope

Covers **CCSF → SFSU Computer Science B.S.** for the current ASSIST year only, and says so on screen. ASSIST covers every California community college to every CSU and UC, so each new pathway is the same table conversion plus a human check.

## Endpoints

All application routes are namespaced under `/api`:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | liveness |
| `POST /api/analyze` | multipart transcript upload + `start_term`; returns the full analysis |
| `POST /api/share` | save a result, returns a share id |
| `GET /api/plans/{id}` | fetch a shared result |

## Layout

```
api/      FastAPI service: main.py, requirements.txt, Dockerfile
web/      React + Vite app, served by nginx on Cloud Run
scripts/  build_tables.py plus the two verified JSON lookup tables
```

## Running it

```bash
# Backend (needs: gcloud auth application-default login)
cd api && uvicorn main:app --reload --port 8000

# Course-match tables — generate, check every row by eye, then upload
python scripts/build_tables.py
python scripts/build_tables.py --upload

# Frontend — VITE_API_URL must end in /api
cd web && npm install
echo "VITE_API_URL=https://transfer-api-938542856973.us-central1.run.app/api" > .env.local
npm run dev
```

Deploy either half with `gcloud run deploy <service> --source .` from `api/` or `web/`.

The ASSIST agreement and SFSU Bulletin PDFs are not committed — `.gitignore` excludes all PDFs so a transcript can never be committed by accident. Download the agreement from [assist.org](https://assist.org) (CCSF → SFSU → Computer Science B.S.) and save the Bulletin page as a PDF.

## Not official advising

This is a source-backed second opinion, not advising. Confirm everything with an SFSU or CCSF counselor.

## License

MIT — see [LICENSE](LICENSE).
