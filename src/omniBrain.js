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

    // ── STEP 1: MULTI-TURN CONTEXT RESOLUTION ─────────────────────────────
    if (context?.active) {
      if (context.intent === 'AWAITING_REMINDER_TIME') {
        const { time: parsedTime, date: parsedDate } = this.extractTimeDate(raw);
        if (!parsedTime) {
          // If no time was detected in the reply, ask specifically for time instead of inventing one!
          const title = context.partialData.title || 'Reminder';
          return makeClarify(
            `At what time would you like the reminder for "${title}"? (e.g. 5 PM or 10:30 AM)`,
            context
          );
        }
        const title = context.partialData.title || 'Reminder';
        const d = parsedDate || context.partialData.date || 'Today';
        const t = parsedTime;
        return makeAction(
          lang.includes('Hindi') ? `हो गया! "${title}" का रिमाइंडर ${d} को ${t} के लिए सेट।` : `Done! Reminder "${title}" set for ${d} at ${t}.`,
          { type: 'REMINDER', title, date: d, time: t, timestamp: Date.now() }
        );
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
        "I'm OmniVoice! Try: \"I spent 200 on lunch\", \"add task call doctor\", \"remind me at 5 PM\", \"show my tasks\", or \"daily summary\".",
        { type: 'QUERY_TASKS' }
      );
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

    // Pattern 1: HH:MM, HH.MM, or HH MM with optional AM/PM (e.g. '12 38 pm', '12:38 pm', '12.38 pm', '4:30', '11 15 am')
    const m1 = text.match(/\b(\d{1,2})[:.\s](\d{2})\s*(am|pm|baje|vaje)?\b/i);
    if (m1) {
      const h = parseInt(m1[1]);
      const min = m1[2];
      let mer = (m1[3] || '').toUpperCase();
      if (h >= 1 && h <= 23 && parseInt(min) >= 0 && parseInt(min) <= 59) {
        if (!mer || (mer !== 'AM' && mer !== 'PM')) {
          mer = h >= 7 && h <= 11 ? 'AM' : 'PM';
        }
        const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        time = `${displayH}:${min} ${mer}`;
      }
    }

    // Pattern 2: Single hour with AM/PM, baje/vaje, or o'clock (e.g. '5 pm', '12 pm', '7 am', '5 baje', '5 o clock')
    if (!time) {
      const m2 = text.match(/\b(\d{1,2})\s*(?:o'?clock\s*)?(am|pm|baje|vaje|o'?clock)?\b/i);
      if (m2) {
        const h = parseInt(m2[1]);
        let mer = (m2[2] || '').toUpperCase();
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
    t = t.replace(/\b(hey\s+(?:omni|voice|ai)|please|help\s+me(\s+to)?|can\s+you(\s+please)?|could\s+you(\s+please)?|i\s+want\s+to|i\s+need\s+to|mujhe)\b/gi, '');

    // 2. Strip intent-specific command wrappers
    if (intent === 'ADD_TASK') {
      t = t.replace(/\b(add|create|make|put|enter|log)\s+(a\s+)?(new\s+)?task\s*(to\s+|for\s+)?\b/gi, '');
      t = t.replace(/\b(add|create)\s+(a\s+)?(new\s+)?todo\s*/gi, '');
      t = t.replace(/\bnew\s+task\b/gi, '');
    } else if (intent === 'ADD_REMINDER') {
      t = t.replace(/\b(remind\s+me(\s+(to|that))?|set\s+(a\s+)?reminder(\s+(for|to|that))?|add\s+(a\s+)?reminder(\s+(for|to|that))?|create\s+(a\s+)?reminder(\s+(for|to|that))?|new\s+reminder(\s+(for|to))?|schedule\s+(a\s+)?reminder(\s+(for|to))?|reminder\s*:|reminder)\b/gi, '');
    } else if (intent === 'COMPLETE_TASK') {
      t = t.replace(/\b(mark|set)\s+(task\s+|todo\s+)?(.+?)\s+(as\s+)?(done|complete|completed|finished)\b/gi, (_, _m, _pre, capture) => capture || '');
      t = t.replace(/\b(complete|finish)\s+(task\s+|todo\s+)?\b/gi, '');
    } else if (intent === 'DELETE_TASK') {
      t = t.replace(/\b(delete|remove|cancel|erase|hatao|mita\s+do)\s+(task\s+|todo\s+|reminder\s+)?(called\s+|named\s+)?\b/gi, '');
    }

    // 3. Strip time/date/trailing prepositions
    t = t
      .replace(/\b(at\s+)?\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm|baje|vaje|o'?clock)?\b/gi, '')
      .replace(/\b(on\s+)?(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|kal|parso)\b/gi, '')
      .replace(/\b(please|on|at|for|by|before|after|urgently|urgent|important|asap)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(to|that|for|and|a|an)\s+/i, '')
      .trim();

    // 4. Refuse trivial/meaningless filler phrases
    const fillerWords = new Set(['this', 'that', 'something', 'a reminder', 'reminder', 'a task', 'task', 'it', 'me', 'one']);
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
