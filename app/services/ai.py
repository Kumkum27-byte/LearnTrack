import google.generativeai as genai
import logging
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.ai import AIConversation
from app.models.track import Track
from app.ML.clustering import get_user_cluster   # 🔥 NEW

logger = logging.getLogger(__name__)

# Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")


def call_llm(prompt: str) -> str:
    try:
        response = model.generate_content(prompt)

        if response and response.candidates:
            content = response.candidates[0].content
            if content and content.parts:
                text = content.parts[0].text
                return text.strip() if text else fallback_message()

        return fallback_message()

    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        return "AI temporarily unavailable."


def fallback_message():
    return "Nice work today. What went well for you in this session?"


# 🔥 MAIN FUNCTION (UPGRADED)
def start_ai_interaction(log, db: Session) -> str:
    try:
        track = db.query(Track).filter(Track.id == log.track_id).first()

        if not track:
            logger.warning(f"Track not found for log_id: {log.id}")
            return "Track information not found."

        # 🔥 STEP 1 — GET USER BEHAVIOR
        cluster_data = get_user_cluster(track.user_id)

        if "error" in cluster_data:
            cluster_name = "Unknown"
            insight = "User pattern not available"
            avg_completion = "N/A"
            max_streak = "N/A"
        else:
            cluster_name = cluster_data["cluster_name"]
            insight = cluster_data["insight"]
            avg_completion = cluster_data["avg_completion"]
            max_streak = cluster_data["max_streak"]

        # 🔥 STEP 2 — BUILD SMART PROMPT
        prompt = f"""
            User completed a productivity session.

            Track: {track.title}
            Minutes: {log.minutes_spent}
            Notes: {log.notes if log.notes else "No notes provided"}
            User Pattern: {insight}
            Average Completion Rate: {avg_completion}

            YOU ARE A RUTHLESS YET PRAISING PRODUCTIVITY MENTOR:
            ✅ You celebrate REAL effort and specific wins
            ✅ You call out excuses without mercy
            ✅ You challenge people to be their best
            ✅ You're honest, direct, and action-oriented
            ✅ You build respect while pushing hard
            ❌ No weak phrases like "I can't know your day"
            ❌ No generic advice - everything ties to THIS session
            ❌ No multiple questions at once

            YOUR FIRST QUESTION:
            - Acknowledge the session specifically (time spent, what they noted)
            - Praise one concrete thing about their effort
            - Ask ONLY ONE deep question about what was most challenging
            - Make them think hard and be honest
            - Keep it 2-3 sentences max
            
            Example style: "You locked in for {log.minutes_spent} minutes on {track.title} - that's the kind of focus that builds real momentum. But real talk: what moment during that session made you want to quit or gave you the most trouble?"
        """

        # 🔥 STEP 3 — CALL AI
        ai_response = call_llm(prompt)

        # 🔥 STEP 4 — STORE RESPONSE
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