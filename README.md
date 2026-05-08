# LearnTrack 🚀

A productivity tracking app with an **AI Productivity Coach** that analyzes your sessions and helps you build consistency through ruthless yet praising mentorship.

## Features

### 📊 Core Functionality
- **Track Productivity Sessions** - Log time spent on goals/habits with detailed notes
- **Habit Streaks** - Build and maintain streaks on your tracked goals
- **Session History** - View all your past logs with timestamps and performance data
- **User Authentication** - Secure signup & login system

### 🤖 AI Productivity Coach
The revolutionary multi-turn AI coach that works like ChatGPT/Gemini:
- **One Question at a Time** - Coach asks focused questions, not info dumps
- **Ruthless Yet Praising** - Celebrates real effort while calling out excuses
- **Analyzes Your Answers** - Each AI response acknowledges what you said before asking the next question
- **Builds on Context** - Uses your actual session data (time spent, notes, track title)
- **Progressive Coaching Flow:**
  - Q1: What was most challenging about this session?
  - Q2: What went WELL during the session?
  - Q3: What ONE thing would you change for tomorrow?
  - Q4: What mindset/routine change makes this consistent?
  - Q5+: Final coaching hit with actionable takeaways

### 📈 Smart Analytics
- **User Clustering** - AI groups users by behavior patterns (Procrastinators, Consistent Grinders, etc.)
- **Streak Risk Alerts** - Real-time alerts when your streak is at risk
- **Performance Insights** - Personalized feedback based on your behavior cluster
- **EDA & Habit Prediction** - ML models for habit completion prediction

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- SQLAlchemy + SQLite (Database)
- Google Generative AI (Gemini for AI Coach)
- scikit-learn (Clustering & ML)

**Frontend:**
- HTML/CSS/JavaScript
- Interactive chat interface
- Dark theme support

## Getting Started

### Prerequisites
- Python 3.8+
- Google Gemini API key

### Installation
```bash
git clone https://github.com/Kumkum27-byte/LearnTrack.git
cd LearnTrack
python -m venv myenv
source myenv/Scripts/activate  # Windows
pip install -r requirements.txt
```

### Environment Setup
Create a `.env` file in the root directory:
```
GEMINI_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///./test.db
```

### Run the App
```bash
uvicorn app.main:app --reload
```
Visit `http://127.0.0.1:8000/frontend/index.html`

## Project Structure
```
LearnTrack/
├── app/
│   ├── main.py           # FastAPI app setup
│   ├── database.py       # Database configuration
│   ├── core/             # Config & security
│   ├── models/           # SQLAlchemy models (User, Track, DailyLog, AIConversation)
│   ├── routers/          # API endpoints
│   ├── schemas/          # Pydantic schemas
│   ├── services/         # AI coach logic
│   └── ML/               # ML models (clustering, prediction, EDA)
├── frontend/             # HTML/CSS/JS
├── requirements.txt      # Dependencies
└── README.md
```

## API Endpoints

### Authentication
- `POST /auth/signup` - Create new account
- `POST /auth/login` - Login user

### Tracking
- `POST /log/` - Create new session log
- `GET /log/` - Get all logs for user
- `GET /track/` - Get user's tracked goals

### AI Coach
- `POST /chat/{log_id}` - Send message to AI coach for a session
- `GET /chat/{log_id}` - Get conversation history

### Analytics
- `GET /cluster/` - Get user's behavior cluster
- `GET /streak-risk/` - Get streak risk alerts

## How the AI Coach Works

1. **Session Complete** → User logs productivity session
2. **Initial Question** → AI Coach asks first question with session-specific praise
3. **User Answers** → User responds thoughtfully
4. **AI Analyzes** → Coach acknowledges answer and asks follow-up
5. **Progressive Coaching** → Questions get deeper each turn
6. **Final Takeaway** → Concrete action for next session

**The Magic:** Unlike generic AI, each response shows it understood what you said. It's ruthless about excuses but genuine in celebrating effort.

## Future Features
- [ ] Multi-language support
- [ ] Mobile app
- [ ] Social accountability (friend streaks)
- [ ] Gamification & rewards
- [ ] Advanced habit analytics
- [ ] Custom AI coaching styles

## License
MIT License - see LICENSE file

## Contributing
Pull requests welcome! Feel free to fork and improve.

---

**Built with ❤️ for productivity enthusiasts who want real mentorship, not robots.**

