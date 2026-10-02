# SFSU TransferMap

Focused merge of the original TransferMap UI and the SF Hacks SFSU backend.
This version intentionally supports one evidence-backed pathway: CCSF → SFSU Computer Science B.S.

## API paths

All application endpoints are namespaced under `/api`:

- `GET /api/health`
- `POST /api/analyze` — multipart transcript upload plus `start_term`
- `POST /api/share`
- `GET /api/plans/{id}`

The frontend uses `VITE_API_URL` (see `web/.env.example`).

## Run locally

```bash
cd api
uvicorn main:app --reload

cd web
npm install
npm run dev
```

The backend requires Google Application Default Credentials, Vertex AI access, and the two Firestore table documents used by the SFSU pathway.
