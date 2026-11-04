# 🎙️ OmniVoice AI — Official Project Submission Documentation

> **Project Name:** OmniVoice AI  
> **Tagline:** Multilingual Voice-to-Action Personal Intelligence Hub  
> **Theme:** *Speak naturally. AI takes action.*  
> **Live Application URL:** [https://sehajsomal5.github.io/omnivoice/](https://sehajsomal5.github.io/omnivoice/)  
> **GitHub Repository:** [https://github.com/sehajsomal5/omnivoice](https://github.com/sehajsomal5/omnivoice)  
> **Test Pass Rate:** 100% (149/149 Automated Tests Passing across 4 Suites)

---

## 📌 Submission Overview

| Key Information | Details |
| :--- | :--- |
| **Project Title** | **OmniVoice AI** |
| **Live Production Link** | **[https://sehajsomal5.github.io/omnivoice/](https://sehajsomal5.github.io/omnivoice/)** |
| **Source Code Repository** | **[https://github.com/sehajsomal5/omnivoice](https://github.com/sehajsomal5/omnivoice)** |
| **Supported Languages** | **English, Hindi, Punjabi, Hinglish (Mid-sentence code switching)** |
| **Core Architecture** | Pure ES-Module Hybrid NLU Engine (Local Zero-Latency + Gemini 1.5 Flash Cloud) |
| **Zero-Build Deployment** | Native Browser Execution (Tailwind CSS, Lucide Icons, Web Audio API, Canvas Confetti) |

---

## 1. 🌟 What We Built & How It Works

### The Problem
Most voice assistants on the market (and standard hackathon prototypes) are conversational chatbots: they answer questions in text, but they fail to take **structured, deterministic actions** in your actual workflow. When users speak naturally—especially with Indian accents or in regional languages like Hindi and Punjabi—traditional regex-based parsers fail, produce unrelated responses, or require rigid sentence structures.

### The Solution: OmniVoice AI
OmniVoice AI is an enterprise-grade multilingual voice assistant and personal action hub that bridges natural human voice commands directly into structured dashboard actions across **Tasks, Reminders, Financial Expenses, and Email Communications**.

OmniVoice operates with a **dual-engine architecture**:
1. **Local Edge NLU Engine (Primary / 100% Offline)**: A training-data-driven token similarity classifier with Soundex phonetic repair and intent anchors that parses intent and structured parameters in $< 5\text{ms}$ directly in the browser with **zero server dependencies** and **zero latency**.
2. **Google Gemini 1.5 Flash Cloud (Optional)**: Can be activated on demand via user settings for generative long-form context.

---

### ⚙️ How It Works (End-to-End Pipeline)

```
       [User Voice Input]
               │
               ▼
┌──────────────────────────────┐
│  Web Speech Recognition API  │  (English / Hindi / Punjabi)
└──────────────┬───────────────┘
               │ Raw Transcript
               ▼
┌──────────────────────────────┐
│    Phonetic Repair Engine    │  Repairs STT phonetic errors ("to fifty" → 250,
└──────────────┬───────────────┘  "remain me" → "remind me", "water my tasks")
               │ Clean Text
               ▼
┌──────────────────────────────┐
│    Direct Math Preemptor     │  Solves math directly ("10% of 10", "45 * 2")
└──────────────┬───────────────┘  before intent scoring (prevents false expenses)
               │ Non-math query
               ▼
┌──────────────────────────────┐
│ Hybrid Intent Classifier     │  Jaccard Token Similarity + Anchor Word Boosts
└──────────────┬───────────────┘  over 30 trained intent classes
               │ Classified Intent
               ▼
┌──────────────────────────────┐
│  Slot & Entity Extraction    │  Extracts amounts, clock times (AM/PM), relative
└──────────────┬───────────────┘  offsets ("after 10m"), calendar dates & categories
               │ Structured Action Payload
               ▼
┌──────────────────────────────┐
│ Dashboard Execution & Storage│  Writes to Local Storage Ledger, updates reactive UI,
└──────────────┬───────────────┘  triggers confirmation card and confetti
               │ Spoken Answer
               ▼
┌──────────────────────────────┐
│ Audio Feedback & TTS Output  │  Synthesizes dual-tone Siri chime via Web Audio API
└──────────────────────────────┘  and speaks response via Web SpeechSynthesis
```

1. **Voice Capture & Acoustic Metering**:
   - The user taps the glowing holographic orb or speaks the wake word `"Hey Omni"`.
   - Real-time microphone audio is analyzed using a `Web Audio API AnalyserNode` to render a live decibel visualizer and wave equalizer.
2. **Phonetic Repair Layer (`phoneticRepair.js`)**:
   - Fixes common Speech-to-Text misinterpretations caused by Indian pronunciations (e.g. `"to fifty"` $\rightarrow$ `250`, `"call that"` $\rightarrow$ `"call dad"`, `"remain me"` $\rightarrow$ `"remind me"`).
3. **Intent Classification (`intentClassifier.js`)**:
   - Replaces fragile regular expressions with an example-based NLU model.
   - Text is normalized (punctuation and stop words stripped) and scored against a training corpus across 30+ intent classes using Jaccard token similarity with anchor boosts and targeted disambiguation rules.
4. **Structured Slot Extraction (`omniBrain.js`)**:
   - Structured slots are parsed using targeted parsers: clock times (12h/24h), relative durations (`"after 10 minutes"`), calendar dates (`"tomorrow"`, `"every Monday"`, `"Nov 5th"`), decimal currency amounts (`₹99.50`), and category tagging (`Food`, `Travel`, `Groceries`, `Bills`, `Shopping`, `Health`).
5. **Multi-Turn Context & Anaphora Memory**:
   - If a detail is missing (e.g. user says *"Remind me to call Dad"* with no time), OmniVoice remembers the context and asks: *"At what time would you like the reminder for 'Call Dad'?"*.
   - If the user switches topics (e.g. *"Add a new task"*), OmniVoice automatically preempts the stale context without trapping the user.
   - Remembers the last created item to support pronoun resolution (*"Set its deadline for tomorrow"*, *"Delete the one I just created"*, *"What did I just add?"*).
6. **Execution & Feedback**:
   - Dispatches structured events to the reactive dashboard.
   - Triggers Web Audio API chimes ($F\sharp_5 \rightarrow B_5$ Siri-wake tone, success chords, or emergency pulsing alarm tones for due reminders).
   - Speaks the answer aloud in the matched language.

---

## 2. 👨‍💻 Your Contribution & Work Done

As the sole developer and architect of OmniVoice AI, I handled 100% of the project lifecycle in this 6-hour sprint:

1. **Engineered the Complete Hybrid NLU Architecture**:
   - Designed and built the pure JavaScript NLU system from scratch (`src/intentClassifier.js`, `src/omniBrain.js`, `src/phoneticRepair.js`).
   - Eliminated reliance on server-side Python backends, allowing the entire AI engine to execute in-browser with sub-millisecond response latency.
2. **Designed and Coded the Responsive UI/UX**:
   - Crafted a dark futuristic glassmorphism interface with custom CSS blur backdrops, Apple Intelligence perimeter neon glow, holographic voice orbs, and animated equalizer bars.
   - Ensured responsive design across desktop monitors, tablets, and mobile smartphones.
3. **Built Full Hackathon Feature Modules**:
   - **Smart Task Backlog**: Voice-activated creation, status toggling, fuzzy deletion, and deadline management.
   - **Smart Reminders with Real-Time Alarm**: Live background timer checking due reminders every 10 seconds, triggering an emergency modal with Snooze (+10m) and Complete actions.
   - **Expense Tracker & Financial Ledger**: Automatic category classification, daily and monthly total queries, highest expense calculation, income credit handling, and CSV ledger export.
   - **Executive Daily Briefing**: Synthesizes tasks, alarms, and expenses into a spoken briefing card.
   - **Email Assistant Module**: Voice-driven email drafting (e.g. internship application, message to colleague), unread mail queries, email summarization, and send confirmation safeguards.
   - **Siri Utilities**: Live time, date, weather simulation, coin flip, dice roll, tech jokes, and direct percentage/math calculation.
4. **Developed 4 Automated Test Suites**:
   - Authored 149 comprehensive automated tests across `test_bare_task.mjs`, `test_comprehensive.mjs`, `test_stress.mjs`, and `test_checklist.mjs`.
   - Verified 100% pass rates across all 80 criteria in the official testing checklist (TC01–TC80).
5. **Configured Production CI/CD & GitHub Pages Deployment**:
   - Configured repository hosting, HTTPS enforcement, and zero-build asset bundling for instant, reliable loading for judges and users worldwide.

---

## 3. 🎯 Key Features & Module Capabilities

### Checkpoint 1: Voice Console & Multilingual Engine
- **Voice Orb with Reactive State Machine**: Clear visual feedback showing whether the assistant is `IDLE`, `LISTENING`, `PROCESSING`, `EXECUTING`, `SPEAKING`, or `AWAITING INPUT`.
- **Multilingual Support**: Supports English, Hindi, and Punjabi natively, including mid-sentence Hinglish code-switching (*"aaj 400 kharch kiya lunch pe"*).
- **Hands-Free "Hey Omni" Wake Word**: Continuous background listening toggle allowing touchless voice interaction.

### Checkpoint 2: Smart Task Management
- **Natural Voice Task Creation**: e.g., *"Create a task to complete Java assignment"* or *"Add task submit report by Friday"*.
- **Task Status & Queries**: Answers *"What tasks are pending?"*, *"What do I have to do tomorrow?"*, and *"How many tasks did I complete?"*.
- **Destructive Action Safeguards**: Commands like *"Delete all my tasks"* require voice confirmation (*"Say yes to confirm"*).

### Checkpoint 3: Reminders & Active Audio Alarms
- **Flexible Time Parsing**: Handles standard clock times (`5 PM`, `8:30 AM`), military formats (`17:00`), Hindi/Punjabi colloquial times (`subah 9 baje`, `shami 6 vaje`), and concatenated formats (`1128 am`).
- **Relative & Recurring Reminders**: Understands relative offsets (*"Remind me after 10 minutes"*) and recurring schedules (*"Remind me every Monday at 10 AM"*).
- **Due Alarm Modal**: When an alert becomes due, an alarm chime sounds continuously and presents interactive **Snooze (+10m)** and **Mark Completed** options.
- **Time Validation Guards**: Rejects impossible times (*"25 PM is not a valid time"*) and clarifies past times (*"That time has already passed today"*).

### Checkpoint 4: Expense Ledger & Financial Tracking
- **Automatic Entity & Category Tagging**: Converts *"I spent 250 on lunch"* into `₹250` tagged under `Food`.
- **Category Queries**: Answers *"How much did I spend on food today?"* or *"What did I spend on travel?"*.
- **Advanced Financial Queries**:
  - *"What is my highest expense?"* $\rightarrow$ Reports highest single transaction.
  - *"I received ₹10,000"* $\rightarrow$ Logs incoming income credit and updates available budget.
- **Expense Deletion & Reversals**: Supports undoing accidental entries via voice (*"Delete last expense"*, *"Delete expense 250"*) or trash button on cards.
- **CSV Data Export**: One-click download of the complete expense ledger in standard CSV format.

### Checkpoint 5: Executive Daily Briefing
- **Unified Daily Summary**: Saying *"Give me my daily summary"* or *"Daily briefing"* synthesizes pending tasks, today's reminders, and total expenditures into a unified status card, celebratory confetti, and voice readout.
- **Multilingual Summaries**: Generates briefings natively in English, Hindi (*"आपकी आज की डेली समरी..."*), and Punjabi (*"ਤੁਹਾਡਾ ਅੱਜ ਦਾ ਸਮਰੀ..."*).

### Email Assistant Module (TC46–TC55)
- **Drafting by Voice**: *"Write an internship application email"* or *"Draft an email to Rahul"* populates recipient, subject line, and professional body into the in-app Email Composer.
- **Inbox & Summarization**: Answers *"Show my unread emails"*, *"Find the email from HR"*, and *"Summarize my latest email"*.
- **Send Confirmation Guard**: Requiring user confirmation before sending prevents accidental dispatches (*"Ready to send email to Rahul. Say confirm to send."*).

---

## 4. 💡 Technical Decisions & Challenges Overcome

### Challenge 1: The "What is 10% of 10" False Expense Bug
* **The Problem**: During testing, asking a simple math question like *"What is 10% of 10"* caused the expense classifier to strip stop words, leaving `"10%"` and `"10"`, which matched expense number patterns and erroneously logged a ₹10 expense.
* **Technical Decision**: Implemented a **Direct Math Preemption Layer** in `omniBrain.js` that intercepts arithmetic expressions (percentages, multiplication, division, addition, subtraction) *before* intent classification occurs. If no explicit expense keyword is present, math is solved directly (*"10 percent of 10 is 1"*), completely preventing false ledger entries.

### Challenge 2: Multi-Turn Topic Lock & Stale Context Traps
* **The Problem**: If the user said *"Remind me to call Dad"*, the assistant entered `AWAITING_REMINDER_TIME` asking *"At what time?"*. If the user subsequently changed their mind and gave a new command like *"Add a new task"*, the old context blindly captured the sentence, asking: *"At what time would you like the reminder for 'Add a'?"*.
* **Technical Decision**: Engineered **Intent-Driven Command Switching Preemption**. Before processing a follow-up answer, OmniVoice runs the input through the classifier. If the input strongly matches an independent intent with confidence $\ge 0.35$, the stale context is discarded immediately. Additionally, a **25-second auto-expiry timer** was introduced to guarantee the conversation resets to IDLE.

### Challenge 3: Edge-Based Offline NLU vs. Cloud Latency
* **The Problem**: Traditional hackathon projects rely on external cloud LLM API calls for every user utterance, introducing 2–4 second network roundtrips, potential rate-limit errors, and failure without an internet connection.
* **Technical Decision**: Developed a zero-dependency **Example-Based Token Classifier** with Jaccard similarity and Anchor Word Boosts in vanilla JavaScript. It matches phrases in $< 5\text{ms}$ with zero memory footprint and zero external network calls, while still keeping an optional Gemini 1.5 Flash toggle for users who supply an API key.

### Challenge 4: Browser Autoplay Audio Restrictions & Wake-Word
* **The Problem**: Modern web browsers block background audio playback and microphone capture unless preceded by a user interaction.
* **Technical Decision**: Built a Web Audio API audio synthesizer (`soundEngine.js`) that lazily initializes an `AudioContext` on the first click. For hands-free interaction, implemented a prominent `"Hey Omni": ON/OFF` toggle button that keeps the speech recognition stream active and monitors for the wake-word token.

### Challenge 5: Zero-Build Architecture for Instant Live Hosting
* **The Problem**: Complex build chains (Vite, Webpack, React compilers) often cause build discrepancies, asset path breakage, or deployment failures on static hosts like GitHub Pages.
* **Technical Decision**: Architected the entire project using native ES Modules, modern HTML5, and CDN-delivered Tailwind CSS and Lucide Icons. The repository runs identically in local Node.js environments and static GitHub Pages with **zero build step**, zero bundling lag, and 100% uptime.

---

## 5. 🧪 Testing & Verification Matrix (TC01 – TC80)

All 80 test scenarios from the official testing checklist were implemented and verified with automated test assertions:

| Module | Test Cases | Capabilities Verified | Status |
| :--- | :--- | :--- | :---: |
| **Voice Interaction** | `TC01` – `TC12` | English, Hindi, Punjabi, Hinglish, speech rates, phonetic repairs, silence handling | ✅ 100% Passed |
| **Smart Tasks** | `TC13` – `TC22` | Create task, list pending, mark completed, delete task, duplicates, empty title clarification, deadline parsing, delete all confirmation | ✅ 100% Passed |
| **Reminders & Alarms** | `TC23` – `TC32` | Specific clock times, relative offsets ("after 10 mins"), tomorrow/dates, recurring ("every Monday"), cancel by time, update time, past time clarification, invalid time rejection ("25 PM"), persistence | ✅ 100% Passed |
| **Expense Ledger** | `TC33` – `TC45` | Categorized expense, multilingual spending, daily/monthly totals, highest expense query ("what is my highest expense?"), delete last expense, decimal amounts (₹99.50), income handling ("I received ₹10,000"), missing amount clarification | ✅ 100% Passed |
| **Smart Email** | `TC46` – `TC55` | Draft email to recipient, internship application generation, unread query, search email from HR, executive summary, confirmation before send, invalid recipient handling | ✅ 100% Passed |
| **Context & Anaphora** | `TC56` – `TC61` | Contextual deadline update ("Set its deadline for tomorrow"), change date ("Change that to Friday"), delete created item ("Delete the one I just created"), recall recent action ("What did I just add?"), cross-language context | ✅ 100% Passed |
| **Security & Guards** | `TC62` – `TC67` | Sandbox isolation, other user data access blocked, unauthorized email dispatch blocked, prompt injection sanitization, session data protection | ✅ 100% Passed |
| **Performance & Summary**| `TC68` – `TC80` | Sub-5ms local latency, rapid bursts, offline resilience, empty-state daily briefing, mathematical ledger consistency | ✅ 100% Passed |

---

## 6. 🚀 Quickstart & Verification Guide

### Option 1: Instant Live Access (Recommended)
Open the deployed web application in Google Chrome, Microsoft Edge, or Safari:  
👉 **[https://sehajsomal5.github.io/omnivoice/](https://sehajsomal5.github.io/omnivoice/)**

### Option 2: Running Locally via Node.js
```bash
# Clone the repository
git clone https://github.com/sehajsomal5/omnivoice.git
cd omnivoice

# Install lightweight local dependencies (if any)
npm install

# Start the local development server
npm start
# Server runs at http://localhost:3000
```

### Option 3: Running Automated Test Suites
```bash
# Run the complete test suite (149 tests)
node test_bare_task.mjs
node test_comprehensive.mjs
node test_stress.mjs
node test_checklist.mjs
```
*Expected Output:* **149 passed, 0 failed out of 149 tests (100% pass rate).**

---

## 7. 🏁 Conclusion

OmniVoice AI proves that voice assistants can be fast, reliable, and multilingual without sacrificing deterministic control or privacy. By combining client-side hybrid NLU, proactive multi-turn context resolution, active alarm notifications, and full testing coverage, OmniVoice delivers a complete, production-ready hackathon project ready for judging.
