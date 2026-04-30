from app.routers.auth import router as auth
from app.routers.transactions import router as transactions
from app.routers.invoices import router as invoices
from app.routers.invoice_templates import router as invoice_templates
from app.routers.installments import router as installments
from app.routers.receivables import router as receivables
from app.routers.recurrences import router as recurrences
from app.routers.months import router as months

__all__ = ["auth", "transactions", "invoice_templates", "invoices", "installments", "receivables", "recurrences", "months"]
