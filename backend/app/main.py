import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, installments, invoice_templates, invoices, months, receivables, recurrences, transactions

load_dotenv()

app = FastAPI(title="Finance Tracker API", version="0.1.0")

origins_env = os.getenv("CORS_ORIGINS", "")
origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth)
app.include_router(transactions)
app.include_router(invoice_templates)
app.include_router(invoices)
app.include_router(installments)
app.include_router(receivables)
app.include_router(recurrences)
app.include_router(months)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
