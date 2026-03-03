import requests
import os
from dotenv import load_dotenv
from app.core.config import settings
from app.models.ai import AIConversation

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")

API_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2"

headers = {
    "Authorization": f"Bearer {HF_TOKEN}"
}


def call_llm(prompt: str):
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 200,
            "temperature": 0.7
        }
    }

    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        result = response.json()

        # Model loading case
        if isinstance(result, dict) and "error" in result:
            return "AI model is loading. Try again."

        return result[0]["generated_text"]

    except Exception as e:
        return f"Error: {str(e)}"


def start_ai_interaction(log, db):
    prompt = f"""
    User completed a log:
    track: {log.track.title}
    date: {log.date}
    minutes_spent: {log.minutes_spent}
    notes: {log.notes}

    Act as a friendly AI coach.
    Ask short reflective questions.
    """

    # 1️⃣ Save user/system prompt
    user_entry = AIConversation(
        log_id=log.id,
        user_id=log.track.user_id,
        role="user",
        content=prompt
    )
    db.add(user_entry)
    db.commit()

    # 2️⃣ Generate AI reply
    ai_response = call_llm(prompt)

    # 3️⃣ Save AI response
    ai_entry = AIConversation(
        log_id=log.id,
        user_id=log.track.user_id,
        role="assistant",
        content=ai_response
    )
    db.add(ai_entry)
    db.commit()

    return ai_response