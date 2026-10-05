from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import get_current_user
from app.services.dates import app_today
from app.services.financial_assistant import financial_snapshot
from app.services.openai_assistant import AssistantUnavailable, answer_question

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class AssistantQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=600)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)

    @field_validator("question")
    @classmethod
    def question_has_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Pergunta vazia")
        return value.strip()


class AssistantAnswer(BaseModel):
    answer: str
    as_of: date
    coverage_start: date


@router.post("/ask", response_model=AssistantAnswer)
def ask_assistant(
    payload: AssistantQuestion,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = app_today()
    snapshot = financial_snapshot(db, current_user.id, today)
    try:
        answer = answer_question(payload.question, [turn.model_dump() for turn in payload.history], snapshot)
    except AssistantUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AssistantAnswer(answer=answer, as_of=today, coverage_start=date.fromisoformat(snapshot["coverage_start"]))
