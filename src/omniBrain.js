// omniBrain.js — OmniVoice NLU Engine v3
//
// ARCHITECTURE (new):
//   1. IntentClassifier  → "What does the user want?"  (training-data similarity, NO intent regex)
//   2. Slot Extractor    → "What are the specific details?" (amounts, times, dates, titles)
//   3. Response Builder  → Builds spoken reply + action objects
//
// Regex is ONLY used in the Slot Extractor for structured data like:
//   • Numbers (amounts)   — have a fixed format: digits
//   • Times               — have a fixed format: "5 PM", "8:30 am"
//   • Dates               — have a fixed format: "tomorrow", "Monday"
//   These are not "understanding language" — they're parsing known patterns. Regex is correct here.
//
// Intent understanding is fully handled by IntentClassifier (example-based).

import { repairSpokenText } from './phoneticRepair.js';
import { IntentClassifier } from './intentClassifier.js';

export class OmniBrain {
  constructor(options = {}) {
    this.apiKey = options.apiKey
      || (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_gemini_api_key') : '')
      || '';
    this.classifier = new IntentClassifier();
  }

  setApiKey(key) {
    this.apiKey = key;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('omni_gemini_api_key', key);
    }
  }

  // ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────
  async processInput(transcript, currentData = {}, context = null) {
    // Try Gemini cloud first if key is configured
    if (this.apiKey && this.apiKey.trim().length > 10) {
      try {
        const cloud = await this.callGemini(transcript, currentData, context);
        if (cloud && (cloud.actions || cloud.isClarification)) return cloud;
      } catch (err) {
        console.warn('Gemini cloud error, using local engine:', err);
      }
    }
    return this.localProcess(transcript, currentData, context);
  }

  // ─── GEMINI CLOUD PATH (unchanged) ────────────────────────────────────────
  async callGemini(transcript, currentData, context) {
    const todayStr = new Date().toISOString().split('T')[0];
    const totalSpentToday = (currentData.expenses || [])
      .filter(e => !e.date || e.date === todayStr)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalSpentMonth = (currentData.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const pendingTasks = (currentData.tasks || []).filter(t => !t.completed);
    const reminders = currentData.reminders || [];

    const systemPrompt = `
You are OmniVoice, an elite AI Personal Assistant.
Current date: ${todayStr}.
Today's spent: ₹${totalSpentToday}. Month total: ₹${totalSpentMonth}.
Pending tasks (${pendingTasks.length}): ${JSON.stringify(pendingTasks.map(t => ({ title: t.title, dueDate: t.dueDate })))}.
Reminders (${reminders.length}): ${JSON.stringify(reminders.map(r => ({ title: r.title, date: r.date, time: r.time })))}.
Active Conversation Context: ${JSON.stringify(context || null)}.
User speech: "${transcript}".

CRITICAL RULES:
1. If user wants to set a reminder but DID NOT specify a time, ask for the time (isClarification=true).
2. If Active Conversation Context is AWAITING_REMINDER_TIME, parse the time and complete the reminder.
3. If user says "add task" or "add a new task" with NO task name after it, ask what task (isClarification=true).
4. NEVER create a TASK when the user is asking a question.
5. For all query intents, set isQuery=true.

Return VALID JSON ONLY:
{
  "detectedLanguage": "English" | "Hindi" | "Punjabi" | "Hinglish",
  "isQuery": boolean,
  "isSummary": boolean,
  "isClarification": boolean,
  "followUpContext": object | null,
  "spokenResponse": "Direct spoken answer",
  "actions": [
    {
      "type": "EXPENSE" | "TASK" | "REMINDER" | "QUERY_TASKS" | "QUERY_COMPLETED_TASKS" | "QUERY_TOMORROW" | "QUERY_REMINDERS_TODAY" | "QUERY_EXPENSES_TODAY" | "QUERY_EXPENSES_MONTH" | "DAILY_SUMMARY" | "DELETE_TASK" | "COMPLETE_TASK" | "CLEAR_COMPLETED",
      "amount": number,
      "category": "Food" | "Travel" | "Shopping" | "Bills" | "Groceries" | "Health" | "Other",
      "note": "Description",
      "title": "Title",
      "dueDate": "Today" | "Tomorrow" | "Friday" | "YYYY-MM-DD",
      "time": "5:00 PM",
      "priority": "High" | "Normal"
    }
  ]
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  // ─── LOCAL ENGINE ─────────────────────────────────────────────────────────
  localProcess(text, data, context) {
    const raw   = repairSpokenText(text).trim();
    const lower = raw.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const lang  = this.detectLanguage(raw);

    const tasks     = data.tasks     || [];
    const expenses  = data.expenses  || [];
    const reminders = data.reminders || [];
    const budget    = data.budget    || 5000;

    // Helpers
    const todayExp  = () => expenses.filter(e => !e.date || e.date === today);
    const todayTotal= () => todayExp().reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const monthTotal= () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const makeQuery  = (spoken, actionObj)   => ({ detectedLanguage: lang, isQuery: true,  isClarification: false, isSummary: false, followUpContext: null, spokenResponse: spoken, actions: [actionObj] });
    const makeAction = (spoken, ...acts)     => ({ detectedLanguage: lang, isQuery: false, isClarification: false, isSummary: false, followUpContext: null, spokenResponse: spoken, actions: acts });
    const makeClarify= (spoken, ctx)         => ({ detectedLanguage: lang, isQuery: false, isClarification: true,  isSummary: false, followUpContext: ctx,  spokenResponse: spoken, actions: [] });

    // 0. Cancellation keywords
    if (/^(cancel|never\s*mind|stop|forget\s*it|chhoro|hatao)$/i.test(raw.trim())) {
      return makeAction("Cancelled.", { type: 'CANCEL' });
    }

    // ── STEP 1: MULTI-TURN CONTEXT RESOLUTION ─────────────────────────────
    if (context?.active) {
      // Check if user switched topics with a distinct command instead of replying
      const { intent: candidateIntent, confidence: candidateConfidence } = this.classifier.classify(raw);
      const isSwitchingCommand = (
        (candidateIntent === 'ADD_TASK' && !context.intent.includes('TASK')) ||
        (candidateIntent === 'ADD_REMINDER' && context.intent !== 'AWAITING_REMINDER_TIME' && context.intent !== 'AWAITING_REMINDER_DETAILS') ||
        (candidateIntent === 'LOG_EXPENSE' && !context.intent.includes('EXPENSE')) ||
        (candidateIntent === 'DAILY_SUMMARY') ||
        (candidateIntent === 'QUERY_TIME') ||
        (candidateIntent === 'QUERY_WEATHER') ||
        (candidateIntent === 'QUERY_TASKS') ||
        (candidateIntent === 'QUERY_EXPENSES_TODAY') ||
        (candidateIntent === 'EASTER_EGG')
      ) && candidateConfidence >= 0.35;

      if (!isSwitchingCommand) {
        if (context.intent === 'AWAITING_REMINDER_TIME') {
          const { time: parsedTime, date: parsedDate } = this.extractTimeDate(raw);
          if (!parsedTime) {
            // Check if input clearly looks like another command
            if (candidateConfidence >= 0.35 && candidateIntent !== 'GREETING') {
              // Preempt stale context and fall through to process command
            } else {
              const rawTitle = context.partialData?.title;
              const title = (rawTitle && rawTitle.toLowerCase() !== 'add a' && rawTitle.length > 2) ? rawTitle : 'Reminder';
              return makeClarify(
                `At what time would you like the reminder for "${title}"? (e.g. 5 PM or 10:30 AM)`,
                context
              );
            }
          } else {
            const rawTitle = context.partialData?.title;
            const title = (rawTitle && rawTitle.toLowerCase() !== 'add a' && rawTitle.length > 2) ? rawTitle : 'Reminder';
            const d = parsedDate || context.partialData?.date || 'Today';
            const t = parsedTime;
            return makeAction(
              lang.includes('Hindi') ? `हो गया! "${title}" का रिमाइंडर ${d} को ${t} के लिए सेट।` : `Done! Reminder "${title}" set for ${d} at ${t}.`,
              { type: 'REMINDER', title, date: d, time: t, timestamp: Date.now() }
            );
          }
        }
        if (context.intent === 'AWAITING_REMINDER_DETAILS') {
          const { time: parsedTime, date: parsedDate } = this.extractTimeDate(raw);
          let title = this.extractTitle(raw, 'ADD_REMINDER') || raw.replace(/\b(at\s+)?\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm|baje|vaje|o'?clock)?\b/gi, '').trim();
          title = title.replace(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '').trim();
          const cleanTitle = (title || 'Reminder').charAt(0).toUpperCase() + (title || 'Reminder').slice(1);
          const d = parsedDate || context.partialData?.date || 'Today';
          const t = parsedTime || context.partialData?.time;

          if (!t) {
            return makeClarify(
              `At what time would you like the reminder for "${cleanTitle}"?`,
              { active: true, intent: 'AWAITING_REMINDER_TIME', partialData: { title: cleanTitle, date: d } }
            );
          }
          return makeAction(
            lang.includes('Hindi') ? `हो गया! "${cleanTitle}" का रिमाइंडर ${d} को ${t} के लिए सेट।` : `Reminder set: "${cleanTitle}" for ${d} at ${t}.`,
            { type: 'REMINDER', title: cleanTitle, date: d, time: t, timestamp: Date.now() }
          );
        }
        if (context.intent === 'AWAITING_TASK_TITLE') {
          const title = raw.charAt(0).toUpperCase() + raw.slice(1);
          return makeAction(`Done! Task added: "${title}".`, { type: 'TASK', title, dueDate: 'Today', priority: 'Normal' });
        }
        if (context.intent === 'AWAITING_EXPENSE_AMOUNT') {
          const amount = this.extractAmount(raw);
          if (amount) {
            const { note, category } = context.partialData;
            return makeAction(`Saved ₹${amount} for ${note} under ${category}.`, { type: 'EXPENSE', amount, category, note, date: today });
          }
        }
      }
    }

    // ── STEP 2: DETECT COMPOUND COMMAND ("spent 200 and remind me at 5") ──
    const compoundResult = this.tryCompound(raw, lang, today);
    if (compoundResult) return compoundResult;

    // ── STEP 3: CLASSIFY INTENT ───────────────────────────────────────────
    const { intent } = this.classifier.classify(raw);

    // ── STEP 4: EXTRACT SLOTS ─────────────────────────────────────────────
    const amount   = this.extractAmount(raw);
    const { time, date } = this.extractTimeDate(raw);
    const category = this.extractCategory(lower);

    // ── STEP 5: ROUTE BY INTENT ───────────────────────────────────────────

    // ── GREETING ──
    if (intent === 'GREETING') {
      return makeQuery(
        "I'm OmniVoice! Try: \"I spent 200 on lunch\", \"add task call doctor\", \"remind me at 5 PM\", \"what time is it\", or \"daily summary\".",
        { type: 'QUERY_TASKS' }
      );
    }

    // ── SIRI UTILITY: QUERY TIME ──
    if (intent === 'QUERY_TIME') {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const mer = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const timeStr = `${hours}:${minutes} ${mer}`;
      const spoken = lang.includes('Hindi') ? `अभी समय ${timeStr} है।` : `It's currently ${timeStr}.`;
      return makeQuery(spoken, { type: 'QUERY_TIME', time: timeStr });
    }

    // ── SIRI UTILITY: QUERY DATE ──
    if (intent === 'QUERY_DATE') {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const spoken = lang.includes('Hindi') ? `आज ${dateStr} है।` : `Today is ${dateStr}.`;
      return makeQuery(spoken, { type: 'QUERY_DATE', date: dateStr });
    }

    // ── SIRI UTILITY: CALCULATOR / MATH ──
    if (intent === 'CALCULATOR') {
      const math = this.evaluateMath(raw);
      if (math) {
        return makeQuery(math.spoken, { type: 'CALCULATOR', expression: math.expr, result: math.ans });
      }
      return makeQuery("I can calculate addition, subtraction, multiplication, division, and percentages! Try: 'What is 15 percent of 2000?'", { type: 'CALCULATOR' });
    }

    // ── SIRI UTILITY: WEATHER ──
    if (intent === 'QUERY_WEATHER') {
      const spoken = lang.includes('Hindi')
        ? `आज आपके इलाके में मौसम सुहावना और साफ है, तापमान लगभग 24 डिग्री सेल्सियस है।`
        : `It's currently 24°C with pleasant, partly cloudy skies. Great day to demo AI! ☀️`;
      return makeQuery(spoken, { type: 'QUERY_WEATHER', temperature: '24°C', condition: 'Partly Cloudy' });
    }

    // ── SIRI UTILITY: EASTER EGGS, COIN FLIP, DICE ──
    if (intent === 'EASTER_EGG') {
      if (/\b(coin|toss|heads|tails)\b/i.test(raw)) {
        const side = Math.random() < 0.5 ? 'Heads' : 'Tails';
        return makeQuery(`I flipped a coin. It's ${side}! 🪙`, { type: 'COIN_FLIP', result: side });
      }
      if (/\b(dice|die|roll)\b/i.test(raw)) {
        const num = Math.floor(Math.random() * 6) + 1;
        return makeQuery(`You rolled a ${num}! 🎲`, { type: 'DICE_ROLL', result: num });
      }
      if (/\b(siri|better\s+than\s+siri)\b/i.test(raw)) {
        return makeQuery("Siri is legendary, but can she track your Punjabi expenses and parse Indian clock times offline? OmniVoice is proud of its roots! 🚀", { type: 'EASTER_EGG' });
      }
      if (/\b(who\s+(made|created|built)|creator)\b/i.test(raw)) {
        return makeQuery("I was built by Balkirat Singh as an enterprise multilingual voice assistant for the hackathon! 🏆", { type: 'EASTER_EGG' });
      }
      const jokes = [
        "Why don't programmers like nature? It has too many bugs! 🐛",
        "Why did the voice assistant cross the road? To get better reception! 📶",
        "There are 10 types of people in the world: those who understand binary, and those who don't. 💻"
      ];
      const joke = jokes[Math.floor(Math.random() * jokes.length)];
      return makeQuery(joke, { type: 'JOKE' });
    }

    // ── DAILY SUMMARY (CP5) ──
    if (intent === 'DAILY_SUMMARY') {
      const pending   = tasks.filter(t => !t.completed).length;
      const spent     = todayTotal();
      const todayRems = reminders.filter(r => !r.date || r.date.toLowerCase() === 'today' || r.date === today);
      const spoken    = lang === 'Punjabi'
        ? `ਤੁਹਾਡਾ ਅੱਜ ਦਾ ਸਮਰੀ: ₹${spent} ਖਰਚ, ${pending} ਕੰਮ ਪੈਂਡਿੰਗ, ${todayRems.length} ਰੀਮਾਈਂਡਰ।`
        : lang.includes('Hindi')
          ? `आपकी आज की डेली समरी: आज ₹${spent} खर्च, ${pending} पेंडिंग टास्क, ${todayRems.length} रिमाइंडर।`
          : `Daily summary: Spent ₹${spent} today. ${pending} pending task${pending !== 1 ? 's' : ''}, ${todayRems.length} reminder${todayRems.length !== 1 ? 's' : ''} scheduled.`;
      return { detectedLanguage: lang, isQuery: true, isSummary: true, isClarification: false, followUpContext: null,
        spokenResponse: spoken, summaryData: { spent, pending, remindersCount: todayRems.length, remainingBudget: Math.max(0, budget - monthTotal()) },
        actions: [{ type: 'DAILY_SUMMARY' }] };
    }

    // ── QUERY: COMPLETED TASKS ──
    if (intent === 'QUERY_COMPLETED_TASKS') {
      const done = tasks.filter(t => t.completed);
      const spoken = done.length === 0
        ? "You haven't completed any tasks yet. Keep going!"
        : `You've completed ${done.length} task${done.length !== 1 ? 's' : ''}: ${done.slice(0, 4).map(t => t.title).join(', ')}.`;
      return makeQuery(spoken, { type: 'QUERY_COMPLETED_TASKS', count: done.length });
    }

    // ── QUERY: TOMORROW ──
    if (intent === 'QUERY_TOMORROW') {
      const tTasks = tasks.filter(t => !t.completed && t.dueDate?.toLowerCase().includes('tomorrow'));
      const tRems  = reminders.filter(r => r.date?.toLowerCase().includes('tomorrow'));
      const items  = [...tTasks.map(t => t.title), ...tRems.map(r => r.title)];
      const spoken = items.length === 0
        ? (lang.includes('Hindi') ? 'कल के लिए कोई काम शेड्यूल नहीं है।' : "Nothing scheduled for tomorrow. You're free!")
        : (lang.includes('Hindi') ? `कल के लिए ${items.length} काम हैं: ${items.join(', ')}।` : `For tomorrow: ${items.join(', ')}.`);
      return makeQuery(spoken, { type: 'QUERY_TOMORROW', count: items.length });
    }

    // ── QUERY: REMINDERS ──
    if (intent === 'QUERY_REMINDERS') {
      const rems = reminders.filter(r => !r.date || r.date.toLowerCase() === 'today' || r.date === today);
      const spoken = rems.length === 0
        ? (lang.includes('Hindi') ? 'आज के लिए कोई रिमाइंडर नहीं है।' : 'No reminders for today.')
        : (lang.includes('Hindi')
            ? `आज के लिए ${rems.length} रिमाइंडर: ${rems.map(r => r.title + (r.time ? ' at ' + r.time : '')).join(', ')}।`
            : `You have ${rems.length} reminder${rems.length !== 1 ? 's' : ''} today: ${rems.map(r => r.title + (r.time ? ' at ' + r.time : '')).join(', ')}.`);
      return makeQuery(spoken, { type: 'QUERY_REMINDERS_TODAY', count: rems.length });
    }

    // ── QUERY: TASKS ──
    if (intent === 'QUERY_TASKS') {
      const pending = tasks.filter(t => !t.completed);
      const list = pending.slice(0, 4).map((t, i) => `${i + 1}. ${t.title}${t.dueDate && t.dueDate !== 'Today' ? ' (due ' + t.dueDate + ')' : ''}`).join(', ');
      const spoken = pending.length === 0
        ? (lang.includes('Hindi') ? 'बधाई हो, कोई पेंडिंग काम नहीं है!' : 'No pending tasks. All caught up!')
        : (lang.includes('Hindi') ? `${pending.length} पेंडिंग काम: ${list}।` : `You have ${pending.length} pending task${pending.length !== 1 ? 's' : ''}: ${list}.`);
      return makeQuery(spoken, { type: 'QUERY_TASKS', count: pending.length });
    }

    // ── QUERY: EXPENSES TODAY ──
    if (intent === 'QUERY_EXPENSES_TODAY') {
      // Category-specific? (e.g. "how much on food today")
      const catHit = this.extractCategoryQuery(lower);
      if (catHit) {
        const filtered = todayExp().filter(e => e.category?.toLowerCase() === catHit.toLowerCase());
        const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const spoken = filtered.length === 0
          ? `No ${catHit} expenses recorded for today.`
          : `You spent ₹${total} on ${catHit} today (${filtered.length} item${filtered.length !== 1 ? 's' : ''}).`;
        return makeQuery(spoken, { type: 'QUERY_EXPENSES_TODAY', category: catHit, total });
      }
      const total = todayTotal();
      const count = todayExp().length;
      const spoken = lang.includes('Hindi')
        ? `आज का कुल खर्च ₹${total} है (${count} खर्चे)।`
        : `Today's total is ₹${total} across ${count} item${count !== 1 ? 's' : ''}.`;
      return makeQuery(spoken, { type: 'QUERY_EXPENSES_TODAY', total, count });
    }

    // ── QUERY: EXPENSES MONTH ──
    if (intent === 'QUERY_EXPENSES_MONTH') {
      const total = monthTotal();
      const remaining = Math.max(0, budget - total);
      const spoken = lang.includes('Hindi')
        ? `इस महीने का कुल खर्च ₹${total} है। बजट में ₹${remaining} बाकी।`
        : `This month's total is ₹${total}. ₹${remaining} remaining in your ₹${budget} budget.`;
      return makeQuery(spoken, { type: 'QUERY_EXPENSES_MONTH', total, remaining });
    }

    // ── QUERY: BALANCE ──
    if (intent === 'QUERY_BALANCE') {
      const spent     = todayTotal();
      const remaining = Math.max(0, budget - monthTotal());
      const spoken = lang.includes('Hindi')
        ? `आज आपने ₹${spent} खर्च किए। बजट में ₹${remaining} बाकी हैं।`
        : `Spent ₹${spent} today. ₹${remaining} remaining in your ₹${budget} budget.`;
      return makeQuery(spoken, { type: 'QUERY_EXPENSES_MONTH', total: spent, remaining });
    }

    // ── ACTION: COMPLETE TASK ──
    if (intent === 'COMPLETE_TASK') {
      const title = this.extractTitle(raw, 'COMPLETE_TASK');
      if (title) {
        return makeAction(`Marked "${title}" as completed! Great job! 🎉`, { type: 'COMPLETE_TASK', title });
      }
    }

    // ── ACTION: DELETE ──
    if (intent === 'DELETE_TASK') {
      const title = this.extractTitle(raw, 'DELETE_TASK');
      if (title) {
        return makeAction(`Deleted "${title}".`, { type: 'DELETE_TASK', title });
      }
    }

    // ── ACTION: ADD REMINDER ──
    if (intent === 'ADD_REMINDER') {
      const title = this.extractTitle(raw, 'ADD_REMINDER');

      // Case 1: Bare reminder command (e.g. "help me add a reminder", "set a reminder", "remind me")
      if (!title) {
        const question = lang.includes('Hindi')
          ? 'किस चीज़ का रिमाइंडर लगाना है?'
          : 'What would you like me to remind you about?';
        return makeClarify(question, {
          active: true,
          intent: 'AWAITING_REMINDER_DETAILS',
          partialData: { date: date || 'Today', time: time || null }
        });
      }

      // Case 2: Title provided, but no time (e.g. "remind me to call dad")
      if (!time) {
        const dateLabel = date || 'Today';
        const question = lang.includes('Hindi')
          ? `"${title}" का रिमाइंडर किस समय के लिए?`
          : `At what time would you like the reminder for "${title}"?`;
        return makeClarify(question, { active: true, intent: 'AWAITING_REMINDER_TIME', partialData: { title, date: dateLabel } });
      }

      // Case 3: Title and time both provided
      const dateLabel = date || 'Today';
      const spoken = lang.includes('Hindi')
        ? `हो गया! "${title}" का रिमाइंडर ${dateLabel} को ${time} के लिए सेट।`
        : `Reminder set: "${title}" for ${dateLabel} at ${time}.`;
      return makeAction(spoken, { type: 'REMINDER', title, date: dateLabel, time, timestamp: Date.now() });
    }

    // ── ACTION: LOG EXPENSE ──
    if (intent === 'LOG_EXPENSE') {
      if (!amount) {
        // Ask for amount — multi-turn slot filling
        const item = this.extractNote(raw, null, null);
        return makeClarify(`How much did you spend on ${item || 'that'}?`,
          { active: true, intent: 'AWAITING_EXPENSE_AMOUNT', partialData: { note: item || 'Expense', category } });
      }
      const note = this.extractNote(raw, amount, category);
      const spoken = lang.includes('Hindi')
        ? `हो गया! ₹${amount} ${note} के लिए ${category} में सेव।`
        : `Saved ₹${amount} for ${note} under ${category}.`;
      return makeAction(spoken, { type: 'EXPENSE', amount, category, note, date: today });
    }

    // ── ACTION: ADD TASK ──
    if (intent === 'ADD_TASK') {
      const title = this.extractTitle(raw, 'ADD_TASK');
      if (!title) {
        // No task name given — ask for it
        const question = lang.includes('Hindi') ? 'कौन सा टास्क जोड़ना है?' : 'What task would you like to add?';
        return makeClarify(question, { active: true, intent: 'AWAITING_TASK_TITLE', partialData: {} });
      }
      const dueDate  = date || 'Today';
      const priority = /\b(urgent|important|asap|zaroori|high)\b/i.test(raw) ? 'High' : 'Normal';
      const spoken   = lang.includes('Hindi') ? `हो गया! "${title}" टास्क जोड़ दिया।` : `Done! Task added: "${title}".`;
      return makeAction(spoken, { type: 'TASK', title, dueDate, priority });
    }

    // ── FALLBACK ──
    return makeQuery(
      "Sorry, I didn't catch that. Try: \"I spent 200 on lunch\", \"add task call doctor\", \"set reminder at 5 PM\", \"show my tasks\", or \"daily summary\".",
      { type: 'QUERY_TASKS' }
    );
  }

  // ─── LANGUAGE DETECTION ───────────────────────────────────────────────────
  detectLanguage(text) {
    if (/[\u0A00-\u0A7F]|(rupaye|kite|lagg|gaye|yaad|karwayo|shami|savere|veere|dasso|kinna|kamm|ajj)/i.test(text)) return 'Punjabi';
    if (/[\u0900-\u097F]|(rupaye|kharcha|yaad|dilana|karna|aaj|kal|kitna|mera|subah|paise|batao|kya)/i.test(text)) return 'Hindi / Hinglish';
    return 'English';
  }

  // ─── SLOT EXTRACTORS ──────────────────────────────────────────────────────
  // These use regex appropriately: they extract STRUCTURED DATA (numbers, times, dates).
  // This is what regex is good for — fixed-format patterns, not natural language understanding.

  extractAmount(text) {
    // Match: "₹200", "rs 200", "200 rupees", "200" (bare number after expense words)
    const m = text.match(/(?:(?:rs\.?\s*|₹\s*|inr\s*)(\d+(?:\.\d{1,2})?))|(?:(\d+(?:\.\d{1,2})?)\s*(?:rupees?|rupaye|rs\b|inr\b))|(?:(\d+(?:\.\d{1,2})?)(?!\s*(?:am|pm|baje|vaje|:\d{2})))/i);
    if (!m) return null;
    const val = parseFloat(m[1] ?? m[2] ?? m[3]);
    return isNaN(val) ? null : val;
  }

  extractTimeDate(text) {
    let time = null;

    // Pattern 1: HH:MM, HH.MM, or HH MM with optional AM/PM (e.g. '12 38 pm', '12:38 pm', '12.38 pm', '4:30', '11 15 am', '11:28 a.m.')
    const m1 = text.match(/\b(\d{1,2})[:.\s](\d{2})\s*(a\.?m\.?|p\.?m\.?|baje|vaje)?\b/i);
    if (m1) {
      const h = parseInt(m1[1]);
      const min = m1[2];
      let mer = (m1[3] || '').replace(/\./g, '').toUpperCase();
      if (h >= 0 && h <= 23 && parseInt(min) >= 0 && parseInt(min) <= 59) {
        if (!mer || (mer !== 'AM' && mer !== 'PM')) {
          mer = h >= 12 ? 'PM' : (h >= 7 && h <= 11 ? 'AM' : 'PM');
        }
        const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        time = `${displayH}:${min} ${mer}`;
      }
    }

    // Pattern 2: Concatenated 3-4 digits like '1128 am' or '1128 a.m.' or '930 pm'
    if (!time) {
      const mConcatenated = text.match(/\b(\d{1,2})(\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/i);
      if (mConcatenated) {
        const h = parseInt(mConcatenated[1]);
        const min = mConcatenated[2];
        const mer = mConcatenated[3].replace(/\./g, '').toUpperCase();
        if (h >= 1 && h <= 12 && parseInt(min) >= 0 && parseInt(min) <= 59) {
          time = `${h}:${min} ${mer}`;
        }
      }
    }

    // Pattern 3: Single hour with AM/PM, baje/vaje, or o'clock (e.g. '5 pm', '12 pm', '7 am', '5 baje', '5 o clock', '6 a.m.')
    if (!time) {
      const m2 = text.match(/\b(\d{1,2})\s*(?:o'?clock\s*)?(a\.?m\.?|p\.?m\.?|baje|vaje|o'?clock)?\b/i);
      if (m2) {
        const h = parseInt(m2[1]);
        let mer = (m2[2] || '').replace(/\./g, '').toUpperCase();
        if (h >= 1 && h <= 12) {
          if (!mer || mer === 'BAJE' || mer === 'VAJE' || mer.includes('CLOCK')) {
            mer = h >= 7 && h <= 11 ? 'AM' : 'PM';
          }
          time = `${h}:00 ${mer}`;
        }
      }
    }

    // Date: "tomorrow", "monday", etc.
    const dateMatch = text.match(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|kal|parso)\b/i);
    let date = null;
    if (dateMatch) {
      const d = dateMatch[1].toLowerCase();
      if (d === 'kal') date = 'Tomorrow';
      else if (d === 'parso') date = 'Day after tomorrow';
      else date = d.charAt(0).toUpperCase() + d.slice(1);
    }
    return { time, date };
  }

  extractCategory(lower) {
    if (/\b(lunch|dinner|breakfast|food|coffee|tea|chai|burger|pizza|restaurant|eat|snack|meal)\b/.test(lower)) return 'Food';
    if (/\b(uber|cab|taxi|petrol|fuel|auto|metro|bus|travel|flight|ola|rapido)\b/.test(lower))               return 'Travel';
    if (/\b(groceries|grocery|sabzi|fruits|milk|doodh|supermarket|vegetables)\b/.test(lower))                return 'Groceries';
    if (/\b(bill|recharge|wifi|electricity|rent|subscription|netflix)\b/.test(lower))                        return 'Bills';
    if (/\b(shopping|clothes|shoes|amazon|flipkart|zara|myntra)\b/.test(lower))                              return 'Shopping';
    if (/\b(medicine|doctor|pharmacy|hospital|clinic)\b/.test(lower))                                        return 'Health';
    return 'Other';
  }

  extractCategoryQuery(lower) {
    // Returns a category name if the query is category-specific, else null
    if (/\b(food|lunch|dinner|breakfast|coffee|chai|eat)\b/.test(lower))   return 'Food';
    if (/\b(travel|uber|cab|taxi|petrol|fuel|bus)\b/.test(lower))           return 'Travel';
    if (/\b(groceries|grocery|sabzi|fruits|milk)\b/.test(lower))            return 'Groceries';
    if (/\b(bill|electricity|rent|wifi|subscription)\b/.test(lower))        return 'Bills';
    if (/\b(shopping|clothes|shoes|amazon)\b/.test(lower))                  return 'Shopping';
    if (/\b(medicine|doctor|pharmacy|hospital)\b/.test(lower))              return 'Health';
    return null;
  }

  extractTitle(text, intent) {
    let t = text;

    // 1. Strip polite/conversational prefixes
    t = t.replace(/\b(hey\s+(?:omni|voice|ai)|please|help\s+me(\s+to)?|can\s+you(\s+please)?|could\s+you(\s+please)?|i\s+want\s+to|i\s+need\s+to|i'd\s+like\s+to|would\s+like\s+to|mujhe)\b/gi, '');

    // 2. Strip intent-specific command wrappers
    if (intent === 'ADD_TASK') {
      t = t.replace(/\b(add|create|make|put|enter|log)\s+(a\s+)?(new\s+)?task\s*(to\s+|for\s+)?\b/gi, '');
      t = t.replace(/\b(add|create)\s+(a\s+)?(new\s+)?todo\s*/gi, '');
      t = t.replace(/\b(new\s+task|task)\b/gi, '');
    } else if (intent === 'ADD_REMINDER') {
      t = t.replace(/\b(remind\s+me(\s+(to|that))?|(?:add|set|create|schedule|make|put)\s+(?:a\s+)?(?:new\s+)?reminder(?:\s+(?:for|to|that))?|new\s+reminder(?:\s+(?:for|to))?|reminder\s*:|reminder)\b/gi, '');
    } else if (intent === 'COMPLETE_TASK') {
      t = t.replace(/\b(mark|set)\s+(task\s+|todo\s+)?(.+?)\s+(as\s+)?(done|complete|completed|finished)\b/gi, (_, _m, _pre, capture) => capture || '');
      t = t.replace(/\b(complete|finish)\s+(task\s+|todo\s+)?\b/gi, '');
    } else if (intent === 'DELETE_TASK') {
      t = t.replace(/\b(delete|remove|cancel|erase|hatao|mita\s+do)\s+(task\s+|todo\s+|reminder\s+)?(called\s+|named\s+)?\b/gi, '');
    }

    // 3. Strip time/date/trailing prepositions
    t = t
      .replace(/\b(at\s+)?\d{1,4}(?:[:.\s]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|baje|vaje|o'?clock)(?:\.|\b)?/gi, '')
      .replace(/\b(on\s+)?(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|kal|parso)\b/gi, '')
      .replace(/\b(please|on|at|for|by|before|after|urgently|urgent|important|asap)\b/gi, '')
      .replace(/^[.\s,:-]+|[.\s,:-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(to|that|for|and|a|an)\s+/i, '')
      .trim();

    // 4. Strip any dangling action keywords leftover (e.g. "add a", "create a new", "set a")
    t = t.replace(/^(add|create|set|make|put|schedule|remind)\s+(a\s+)?(new\s+)?(reminder|task)?\s*/i, '').trim();

    // 5. Refuse trivial/meaningless filler phrases
    const fillerWords = new Set([
      'this', 'that', 'something', 'a reminder', 'reminder', 'a task', 'task', 'it', 'me', 'one',
      'add a', 'add', 'create', 'set', 'new', 'add a new', 'create a new', 'set a new', 'a new', 'new reminder', 'new task'
    ]);
    if (!t || t.length < 2 || fillerWords.has(t.toLowerCase())) return null;

    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  extractNote(text, amount, category) {
    let note = text
      .replace(/\b(i\s+)?(spent|paid|bought|add\s+expense|log\s+expense|expense|track)\s*/gi, '')
      .replace(/\b(rs\.?|₹|inr|rupees?|rupaye)\s*/gi, '')
      .replace(/\d+(?:\.\d{1,2})?\s*/g, '')
      .replace(/\b(on|for|ka|ke|de|at|in|the)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(and|or)\s+/i, '')
      .trim();
    if (!note || note.length < 2) note = category || 'Expense';
    return note.charAt(0).toUpperCase() + note.slice(1);
  }

  evaluateMath(text) {
    const lower = text.toLowerCase();
    // Percent: "X percent of Y" or "X% of Y"
    const mPct = lower.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s*(?:of)?\s*(\d+(?:\.\d+)?)/);
    if (mPct) {
      const p = parseFloat(mPct[1]);
      const total = parseFloat(mPct[2]);
      const ans = Math.round(((p / 100) * total) * 100) / 100;
      return { expr: `${p}% of ${total}`, ans, spoken: `${p} percent of ${total} is ${ans}.` };
    }
    // Divide: "X divided by Y"
    const mDiv = lower.match(/(\d+(?:\.\d+)?)\s*(?:divided\s+by|\/)\s*(\d+(?:\.\d+)?)/);
    if (mDiv) {
      const a = parseFloat(mDiv[1]);
      const b = parseFloat(mDiv[2]);
      if (b === 0) return { expr: `${a} / 0`, ans: 'Undefined', spoken: "Cannot divide by zero." };
      const ans = Math.round((a / b) * 100) / 100;
      return { expr: `${a} / ${b}`, ans, spoken: `${a} divided by ${b} is ${ans}.` };
    }
    // Multiply: "X times Y" or "X multiplied by Y"
    const mMul = lower.match(/(\d+(?:\.\d+)?)\s*(?:multiplied\s+by|times|\*|x)\s*(\d+(?:\.\d+)?)/);
    if (mMul) {
      const a = parseFloat(mMul[1]);
      const b = parseFloat(mMul[2]);
      const ans = Math.round(a * b * 100) / 100;
      return { expr: `${a} × ${b}`, ans, spoken: `${a} times ${b} is ${ans}.` };
    }
    // Plus: "X plus Y"
    const mPlus = lower.match(/(\d+(?:\.\d+)?)\s*(?:plus|\+)\s*(\d+(?:\.\d+)?)/);
    if (mPlus) {
      const a = parseFloat(mPlus[1]);
      const b = parseFloat(mPlus[2]);
      const ans = Math.round((a + b) * 100) / 100;
      return { expr: `${a} + ${b}`, ans, spoken: `${a} plus ${b} is ${ans}.` };
    }
    // Minus: "X minus Y"
    const mMinus = lower.match(/(\d+(?:\.\d+)?)\s*(?:minus|-)\s*(\d+(?:\.\d+)?)/);
    if (mMinus) {
      const a = parseFloat(mMinus[1]);
      const b = parseFloat(mMinus[2]);
      const ans = Math.round((a - b) * 100) / 100;
      return { expr: `${a} - ${b}`, ans, spoken: `${a} minus ${b} is ${ans}.` };
    }
    return null;
  }

  // ─── COMPOUND COMMAND DETECTOR ────────────────────────────────────────────
  // "spent 200 on lunch and remind me to call dad at 5 pm"
  tryCompound(raw, lang, today) {
    // Split on "and/aur/te" only when followed by a recognizable action keyword
    const parts = raw.split(/\s+(?:and|aur|te|\+)\s+(?=(?:remind\s+me|set\s+reminder|add\s+reminder|add\s+task|create\s+task|spent|spend|paid|kharcha|kharch))/i);
    if (parts.length < 2) return null;

    const actions = [], confirmations = [];
    for (const part of parts) {
      const { intent } = this.classifier.classify(part);
      const amount   = this.extractAmount(part);
      const { time, date } = this.extractTimeDate(part);
      const category = this.extractCategory(part.toLowerCase());

      if (intent === 'LOG_EXPENSE' && amount) {
        const note = this.extractNote(part, amount, category);
        actions.push({ type: 'EXPENSE', amount, category, note, date: today });
        confirmations.push(`₹${amount} for ${note}`);
      } else if (intent === 'ADD_REMINDER') {
        const title   = this.extractTitle(part, 'ADD_REMINDER') || 'reminder';
        const t       = time || '6:00 PM';
        const d       = date || 'Today';
        actions.push({ type: 'REMINDER', title, date: d, time: t, timestamp: Date.now() });
        confirmations.push(`reminder "${title}" at ${t}`);
      } else if (intent === 'ADD_TASK') {
        const title = this.extractTitle(part, 'ADD_TASK');
        if (title) {
          actions.push({ type: 'TASK', title, dueDate: date || 'Today', priority: 'Normal' });
          confirmations.push(`task "${title}"`);
        }
      }
    }

    if (actions.length < 1) return null;
    const spoken = lang.includes('Hindi')
      ? `हो गया! ${confirmations.join(' और ')} सेव हो गए।`
      : `Done! Saved: ${confirmations.join(' and ')}.`;
    return { detectedLanguage: lang, isQuery: false, isClarification: false, isSummary: false, followUpContext: null, spokenResponse: spoken, actions };
  }
}
