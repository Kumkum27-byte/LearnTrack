import google.generativeai as genai
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.ai import AIConversation


# 🔐 Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)

model = genai.GenerativeModel("gemini-1.5-flash")


def call_llm(prompt: str) -> str:
    try:
        response = model.generate_content(prompt)

        if hasattr(response, "text") and response.text:
            return response.text.strip()

        return "I'm here to support you. How did today's effort feel?"

    except Exception as e:
        print("Gemini API Error:", e)
        return "AI is temporarily unavailable. Keep going, you're doing great!"


def start_ai_interaction(log, db: Session) -> str:

    prompt = f"""
    User completed a daily log.

    Track: {log.track.title}
    Minutes Spent: {log.minutes_spent}
    Notes: {log.notes}

    Act as a friendly AI productivity coach.
    Ask 2 short reflective questions.
    Keep response under 120 words.
    Be motivating but not robotic.
    """

    # 🤖 Call Gemini
    ai_response = call_llm(prompt)

    # 💾 Store in AIConversation table
    conversation = AIConversation(
        log_id=log.id,
        user_id=log.user_id,
        role="assistant",
        content=ai_response,
        status="completed"
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return ai_response