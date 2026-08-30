from app.routers.auth import router as auth
from app.routers.transactions import router as transactions
from app.routers.invoices import router as invoices
from app.routers.invoice_templates import router as invoice_templates
from app.routers.installments import router as installments
from app.routers.receivables import router as receivables
from app.routers.recurrences import router as recurrences
from app.routers.months import router as months
from app.routers.simulations import router as simulations
from app.routers.categories import router as categories
from app.routers.budgets import router as budgets

__all__ = ["auth", "transactions", "categories", "budgets", "invoice_templates", "invoices", "installments", "receivables", "recurrences", "months", "simulations"]
