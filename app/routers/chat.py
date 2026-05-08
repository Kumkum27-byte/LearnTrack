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

    # Get session data for context
    from app.models.daily_log import DailyLog
    from app.models.track import Track
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    track = db.query(Track).filter(Track.id == log.track_id).first() if log else None
    
    session_context = ""
    if log and track:
        session_context = f"Session: {track.title} for {log.minutes_spent} minutes. Notes: {log.notes or 'None'}"

    # Determine which question to ask based on conversation count
    if user_message_count == 1:
        # Q2: Analyze their challenge answer, praise it, ask about what went well
        prompt = f"""
        You are a RUTHLESS YET PRAISING productivity mentor.
        
        Session: {session_context}
        
        Conversation so far:
        {conversation_text}

        ANALYSIS & NEXT QUESTION:
        - They just told you about a challenge they faced
        - Acknowledge what they said specifically (show you listened)
        - Appreciate their honesty
        - NOW ask ONE follow-up: What was something that actually went WELL or felt smooth during the session?
        - Make it conversational, like a real coach digging deeper
        - Keep it short (2-3 sentences max)
        - Challenge them to find the win, even if small
        
        Example: "Okay, I hear you on the focus breaks thing - that's real. But flip it: what part of those {log.minutes_spent} minutes actually felt strong? Where did you find flow?"
        """
    elif user_message_count == 2:
        # Q3: Analyze both answers, praise growth awareness, ask about what they'd change
        prompt = f"""
        You are a RUTHLESS YET PRAISING productivity mentor.
        
        Session: {session_context}
        
        Conversation so far:
        {conversation_text}

        ANALYSIS & NEXT QUESTION:
        - They've told you about: (1) a challenge, (2) what went well
        - They're showing honest self-awareness - that's good
        - Praise the pattern you're seeing in their answers
        - NOW ask ONE follow-up: What's ONE specific thing you'd change for tomorrow to make the next session even better?
        - Make it practical and within their control
        - Challenge them to be concrete (not vague)
        - Keep it short (2-3 sentences max)
        
        Example: "Good - you're being real about what tripped you up and what clicked. Now the hard part: if you did this exact session again tomorrow, what ONE adjustment would make it tighter?"
        """
    elif user_message_count == 3:
        # Q4: Deep dive - connect all answers, ask about mindset/consistency
        prompt = f"""
        You are a RUTHLESS YET PRAISING productivity mentor.
        
        Session: {session_context}
        
        Conversation so far:
        {conversation_text}

        ANALYSIS & NEXT QUESTION:
        - They've shared their challenge, their win, and their improvement idea
        - This is solid self-reflection - acknowledge the growth
        - Praise their willingness to level up
        - NOW ask the final pushback: What's ONE thing about your mindset or approach that needs to change to make THIS a consistent win, not a one-time thing?
        - Make it about systems and habits, not willpower
        - Challenge them to think bigger than tomorrow
        - Keep it short (2-3 sentences max)
        
        Example: "You know what clicked, what didn't, and how to fix it. That's the awareness winners have. But here's the real question: what belief or routine change would make this the norm for you, not the exception?"
        """
    else:
        # Closing: Synthesize everything, give actionable takeaway
        prompt = f"""
        You are a RUTHLESS YET PRAISING productivity mentor giving final coaching.
        
        Session: {session_context}
        
        Conversation so far:
        {conversation_text}

        FINAL COACHING HIT:
        - Synthesize what you've learned from this whole conversation
        - Connect their challenge → their win → their improvement → their mindset shift
        - Give them ONE specific, concrete action for their next session
        - Make them feel challenged but capable
        - Praise their willingness to dig deep and be honest
        - Keep it powerful but brief (3-4 sentences max)
        
        Example: "Here's what I see: you know where you slip, where you shine, and how to improve. That's the mentality of someone who gets better. For tomorrow: [specific action]. Lock in. You've got this."
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


@router.get("/{log_id}")
def get_chat_history(log_id: int, db: Session = Depends(get_db)):
    """Fetch conversation history for a specific log"""
    try:
        history = db.query(AIConversation).filter(
            AIConversation.log_id == log_id
        ).order_by(AIConversation.created_at.asc()).all()
        
        return {
            "history": [
                {
                    "role": msg.role,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None
                }
                for msg in history
            ]
        }
    except Exception as e:
        return {
            "history": [],
            "error": str(e)
        }