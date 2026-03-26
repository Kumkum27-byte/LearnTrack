from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ai import AIConversation
from app.schemas.chat import ChatRequest
from app.services.ai import call_llm

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/{log_id}")
def chat_with_ai(log_id:int, request:ChatRequest, db: Session = Depends(get_db)):

    #save user msg
    user_message = AIConversation(
        log_id=log_id,
        role="user",
        content=request.message
    )

    db.add(user_message)
    db.commit()

    #fetch conversation history
    history = db.query(AIConversation).filter(
    AIConversation.log_id == log_id
    ).order_by(AIConversation.created_at.desc()).limit(6).all()

    history = list(reversed(history))

    conversation_text = ""

    for msg in history:
        conversation_text += f"{msg.role}: {msg.content}\n"

    prompt: str = f"""
    You are a productivity reflection coach.

    Continue the conversation.

    Conversation history: {conversation_text}

    Respond in under 80 words. """

    #call llm
    ai_reply = call_llm(prompt)

    #store AI reply
    ai_message = AIConversation(
        log_id=log_id,
        role="assistant",
        content=ai_reply
    )

    db.add(ai_message)
    db.commit()

    return{"reply": ai_reply}