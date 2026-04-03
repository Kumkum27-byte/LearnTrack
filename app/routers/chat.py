from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.models.ai import AIConversation
from app.models.daily_log import DailyLog
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
    ).order_by(AIConversation.created_at.asc()).all()

    # Count user messages to determine which question to ask
    user_message_count = len([msg for msg in history if msg.role == "user"])

    conversation_text = ""
    for msg in history:
        conversation_text += f"{msg.role}: {msg.content}\n"

    # Determine which question to ask based on conversation count
    if user_message_count == 1:
        # Ask question 2: about difficulties
        prompt = f"""
        You are a productivity reflection coach.

        Conversation history: {conversation_text}

        The user has answered your first question about what went well.
        Now ask ONLY 1 new question about a difficulty, distraction, or challenge they faced.
        
        Be empathetic and encouraging.
        Keep it under 50 words.
        """
    elif user_message_count == 2:
        # Ask question 3: about improvement
        prompt = f"""
        You are a productivity reflection coach.

        Conversation history: {conversation_text}

        The user has answered two questions already.
        Now ask ONLY 1 final question about one small thing they could adjust tomorrow to improve.
        
        Be supportive and actionable.
        Keep it under 50 words.
        """
    else:
        # Continue conversation with support
        prompt = f"""
        You are a productivity reflection coach.

        Conversation history: {conversation_text}

        The user is continuing the reflection conversation.
        Provide supportive feedback, celebrate their progress, or give a brief actionable suggestion.
        
        Keep response under 60 words.
        """

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