import google.generativeai as genai
import logging
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.ai import AIConversation
from app.models.track import Track

logger = logging.getLogger(__name__)

# Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")


def call_llm(prompt: str) -> str:
    try:
        response = model.generate_content(prompt)

        if response and response.candidates and len(response.candidates) > 0:
            content = response.candidates[0].content
            if content and content.parts and len(content.parts) > 0:
                text = content.parts[0].text
                return text.strip() if text else "Nice work today. What did you learn from this session?"

        return "Nice work today. What did you learn from this session?"

    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        return "AI temporarily unavailable."


def start_ai_interaction(log, db: Session) -> str:
    try:
        track = db.query(Track).filter(Track.id == log.track_id).first()

        if not track:
            logger.warning(f"Track not found for log_id: {log.id}")
            return "Track information not found."

        prompt = f"""
        The user completed a productivity log.

        Track: {log.track.title}
        Minutes Spent: {log.minutes_spent}
        Notes: {log.notes}

        You are an AI productivity reflection coach.

        Ask ONLY 1 question about what went well during this session.
        
        Make it warm, encouraging, and specific to their session.
        Keep it under 50 words.
        Sound supportive and natural, avoid robotic tone.
        """

        ai_response = call_llm(prompt)

        conversation = AIConversation(
            log_id=log.id,
            user_id=track.user_id,
            role="assistant",
            content=ai_response
        )

        db.add(conversation)
        db.commit()

        return ai_response

    except Exception as e:
        logger.error(f"AI interaction error: {str(e)}")
        db.rollback()
        return "Unable to process your session right now."