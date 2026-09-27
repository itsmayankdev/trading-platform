# Trading Platform

## Local development

Use the single startup script from the repository root:

```bash
bash start-dev.sh
```

It will:

1. Create the local Python `.venv` if needed.
2. Install backend dependencies only when `requirements.txt` changes.
3. Start local Postgres and Redis from `infra/docker-compose.yml`.
4. Wait for those services to become ready.
5. Start FastAPI on `http://127.0.0.1:8000`.
6. Verify the FastAPI health endpoint before starting the frontend.
7. Start Next.js on `http://localhost:3000`.

Open:

```
http://localhost:3000/dashboard
```

Press `Ctrl+C` to stop the local FastAPI and Next.js processes. Postgres and Redis remain running so the next startup is fast.

### Manual startup

Backend:

```bash
source .venv/bin/activate
python -m uvicorn backend.app.main:app --reload
```

Frontend, in a second terminal:

```bash
cd frontend
npm run dev
```

### Troubleshooting

If Pattern Search returns a server error in development, the FastAPI response now includes the underlying exception type/message and the backend terminal logs the full traceback. This avoids the previous generic `Pattern search failed` message that hid the real root cause.

Do not install Python packages into the system interpreter. Keep backend packages inside the project `.venv`.
