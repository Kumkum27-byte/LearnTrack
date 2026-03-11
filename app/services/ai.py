import google.generativeai as genai
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.ai import AIConversation
from app.models.track import Track

# Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)

# Use faster model
model = genai.GenerativeModel("gemini-1.5-flash")
 

def call_llm(prompt: str) -> str:
    try:
        response = model.generate_content(prompt)

        if response and response.candidates:
            text = response.candidates[0].content.parts[0].text
            return text.strip()

        return "Nice work today. What did you learn from this session?"

    except Exception as e:
        print("Gemini error:", e)
        return "AI temporarily unavailable."


def start_ai_interaction(log, db: Session) -> str:

    track = db.query(Track).filter(Track.id == log.track_id).first()

    prompt = f"""
A user just completed a learning session.

Track: {track.title}
Minutes spent: {log.minutes_spent}
Notes: {log.notes}

You are a friendly productivity coach.

Ask 3 short reflective questions.
Encourage consistency.
Maximum 100 words.
"""

    ai_response = call_llm(prompt)

    conversation = AIConversation(
        log_id=log.id,
        user_id=track.user_id,
        role="assistant",
        content=ai_response,
        status="completed"
    )

    db.add(conversation)
    db.commit()

    return ai_response