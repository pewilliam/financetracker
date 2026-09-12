import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.rate_limit import RateLimitMiddleware
from app.routers import auth, budgets, categories, installments, invoice_templates, invoices, months, receivables, recurrences, simulations, transactions, wallets

app = FastAPI(title="Finance Tracker API", version="0.1.0")

origins_env = os.getenv("CORS_ORIGINS", "")
origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]
if not origins:
    origins = ["http://localhost:5173"]

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
)

app.include_router(auth)
app.include_router(transactions)
app.include_router(categories)
app.include_router(budgets)
app.include_router(invoice_templates)
app.include_router(invoices)
app.include_router(installments)
app.include_router(receivables)
app.include_router(recurrences)
app.include_router(months)
app.include_router(simulations)
app.include_router(wallets)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
