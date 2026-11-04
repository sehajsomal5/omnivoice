/**
 * COMPREHENSIVE OmniBrain Test Suite
 * Tests EVERY possible user utterance pattern and weak point
 */
import { OmniBrain } from './src/omniBrain.js';
const brain = new OmniBrain();
const todayStr = new Date().toISOString().split('T')[0];

const data = {
  budget: 5000,
  tasks: [
    { title: 'Buy groceries', completed: false, dueDate: 'Today' },
    { title: 'Call dentist', completed: true, dueDate: 'Today' },
    { title: 'Submit report', completed: true, dueDate: 'Today' },
    { title: 'Team meeting', completed: false, dueDate: 'Tomorrow' },
    { title: 'Pay electricity bill', completed: false, dueDate: 'Friday' },
  ],
  expenses: [
    { amount: 250, category: 'Food', note: 'Lunch', date: todayStr },
    { amount: 100, category: 'Travel', note: 'Cab', date: todayStr },
    { amount: 260, category: 'Food', note: 'Dinner', date: todayStr },
    { amount: 500, category: 'Shopping', note: 'Clothes', date: todayStr },
  ],
  reminders: [
    { title: 'Call dad', date: 'Today', time: '6:00 PM' },
    { title: 'Team standup', date: 'Tomorrow', time: '10:00 AM' },
  ]
};

let passed = 0, failed = 0;

async function test(label, input, checks) {
  const r = await brain.processInput(input, data);
  const errors = [];
  for (const [key, expected] of Object.entries(checks)) {
    if (key === 'actionType') {
      const got = r.actions?.[0]?.type;
      if (got !== expected) errors.push(`actionType: expected "${expected}", got "${got}"`);
    } else if (key === 'isQuery') {
      if (r.isQuery !== expected) errors.push(`isQuery: expected ${expected}, got ${r.isQuery}`);
    } else if (key === 'isClarification') {
      if (r.isClarification !== expected) errors.push(`isClarification: expected ${expected}, got ${r.isClarification}`);
    } else if (key === 'notActionType') {
      const got = r.actions?.[0]?.type;
      if (got === expected) errors.push(`notActionType: should NOT be "${expected}", but got "${got}"`);
    } else if (key === 'spokenContains') {
      if (!r.spokenResponse?.toLowerCase().includes(expected.toLowerCase()))
        errors.push(`spoken should contain "${expected}", got: "${r.spokenResponse}"`);
    } else if (key === 'spokenNotContains') {
      if (r.spokenResponse?.toLowerCase().includes(expected.toLowerCase()))
        errors.push(`spoken should NOT contain "${expected}", got: "${r.spokenResponse}"`);
    } else if (key === 'followUpIntent') {
      if (r.followUpContext?.intent !== expected) errors.push(`followUpIntent: expected "${expected}", got "${r.followUpContext?.intent}"`);
    }
  }

  if (errors.length === 0) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    console.log(`     Input: "${input}"`);
    errors.forEach(e => console.log(`     → ${e}`));
    console.log(`     Spoken: "${r.spokenResponse}"`);
    console.log(`     Actions: ${JSON.stringify(r.actions)}`);
    failed++;
  }
}

console.log('\n=== CHECKPOINT 2: TASK QUERIES ===');
await test('pending tasks query', 'do I have pending tasks', { actionType: 'QUERY_TASKS', isQuery: true });
await test('pending tasks - what', 'what are my pending tasks', { actionType: 'QUERY_TASKS', isQuery: true });
await test('pending tasks - show', 'show me my tasks', { actionType: 'QUERY_TASKS', isQuery: true });
await test('pending tasks - today', 'what are my tasks today', { actionType: 'QUERY_TASKS', isQuery: true });
await test('pending tasks - list', 'list my tasks', { actionType: 'QUERY_TASKS', isQuery: true });
await test('how many pending', 'how many tasks do I have', { actionType: 'QUERY_TASKS', isQuery: true });
await test('any tasks left', 'any tasks left', { actionType: 'QUERY_TASKS', isQuery: true });
await test('completed tasks count', 'how many tasks did I complete today', { actionType: 'QUERY_COMPLETED_TASKS', isQuery: true });
await test('completed tasks - what', 'what tasks have I completed', { actionType: 'QUERY_COMPLETED_TASKS', isQuery: true });
await test('completed tasks - done', 'tasks I am done with', { actionType: 'QUERY_COMPLETED_TASKS', isQuery: true });
await test('tomorrow tasks', 'what do I have tomorrow', { actionType: 'QUERY_TOMORROW', isQuery: true });
await test('tomorrow tasks - 2', 'what tasks do I have for tomorrow', { actionType: 'QUERY_TOMORROW', isQuery: true });

console.log('\n=== CHECKPOINT 2: TASK ACTIONS ===');
await test('add task with text', 'add task buy milk', { actionType: 'TASK', isQuery: false, spokenNotContains: 'buy milk buy milk' });
await test('add task - create', 'create a task submit assignment', { actionType: 'TASK', isQuery: false });
await test('add task - new', 'new task prepare presentation', { actionType: 'TASK', isQuery: false });
await test('add task - remember', 'remind me to call doctor tomorrow', { notActionType: 'TASK' }); // should be REMINDER
await test('no task from question', 'do I have any task', { notActionType: 'TASK', isQuery: true });
await test('no task from "how many"', 'how many tasks do I have', { notActionType: 'TASK', isQuery: true });
await test('delete task', 'delete task buy groceries', { actionType: 'DELETE_TASK' });
await test('mark task complete', 'mark buy groceries as done', { actionType: 'COMPLETE_TASK' });
await test('mark task complete - 2', 'complete task buy groceries', { actionType: 'COMPLETE_TASK' });

console.log('\n=== CHECKPOINT 3: REMINDER QUERIES ===');
await test('reminders today', 'what reminders do I have today', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });
await test('reminders today - 2', 'show me my reminders', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });
await test('any reminders', 'any reminders for today', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });
await test('do i have reminders', 'do I have any reminders', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });

console.log('\n=== CHECKPOINT 3: REMINDER ACTIONS ===');
await test('add reminder with time', 'set reminder call mom at 7 PM', { actionType: 'REMINDER', isQuery: false });
await test('add reminder - ask time', 'set reminder call dad', { isClarification: true, followUpIntent: 'AWAITING_REMINDER_TIME' });
await test('add reminder - remind me', 'remind me to take medicine', { isClarification: true, followUpIntent: 'AWAITING_REMINDER_TIME' });
await test('add reminder tomorrow time', 'add reminder team meeting tomorrow at 10 AM', { actionType: 'REMINDER' });

console.log('\n=== CHECKPOINT 4: EXPENSE QUERIES ===');
await test('today total', 'how much did I spend today', { actionType: 'QUERY_EXPENSES_TODAY', isQuery: true });
await test('today total - 2', 'what is today\'s total', { actionType: 'QUERY_EXPENSES_TODAY', isQuery: true });
await test('today total - 3', 'today\'s expenses', { actionType: 'QUERY_EXPENSES_TODAY', isQuery: true });
await test('month total', 'how much did I spend this month', { actionType: 'QUERY_EXPENSES_MONTH', isQuery: true });
await test('month total - 2', 'show monthly expenses', { actionType: 'QUERY_EXPENSES_MONTH', isQuery: true });
await test('balance today', 'what is todays balance', { isQuery: true, spokenContains: 'remaining' });
await test('my balance', 'what is my balance', { isQuery: true, spokenContains: 'remaining' });
await test('budget left', 'how much budget is left', { isQuery: true, spokenContains: 'remaining' });
await test('food filter', 'how much did I spend on food today', { actionType: 'QUERY_EXPENSES_TODAY', spokenContains: 'Food' });
await test('travel filter', 'how much did I spend on travel', { spokenContains: 'Travel' });
await test('lunch filter', 'how much did I spend on lunch', { spokenContains: 'Food' });

console.log('\n=== CHECKPOINT 4: EXPENSE ACTIONS ===');
await test('add expense full', 'I spent 250 rupees on lunch', { actionType: 'EXPENSE', isQuery: false });
await test('add expense - paid', 'paid 100 for cab', { actionType: 'EXPENSE', isQuery: false });
await test('add expense - rupees', 'spent 500 on clothes', { actionType: 'EXPENSE', isQuery: false });
await test('add expense - symbol', 'spent ₹300 on groceries', { actionType: 'EXPENSE', isQuery: false });
await test('no task from expense query', 'how much did I spend', { notActionType: 'TASK', isQuery: true });

console.log('\n=== CHECKPOINT 5: DAILY SUMMARY ===');
await test('daily summary', 'give me my daily summary', { actionType: 'DAILY_SUMMARY', isQuery: true });
await test('daily summary - 2', 'daily report', { actionType: 'DAILY_SUMMARY', isQuery: true });
await test('summary command', 'summary', { actionType: 'DAILY_SUMMARY', isQuery: true });
await test('overview', 'show me an overview', { actionType: 'DAILY_SUMMARY', isQuery: true });

console.log('\n=== EDGE CASES: NO FALSE TASK CREATION ===');
await test('question no task', 'what is todays balance', { notActionType: 'TASK', isQuery: true });
await test('question no task 2', 'how much money do I have', { notActionType: 'TASK', isQuery: true });
await test('question no task 3', 'am I on budget', { notActionType: 'TASK', isQuery: true });
await test('question no task 4', 'tell me my expenses', { notActionType: 'TASK', isQuery: true });
await test('question no task 5', 'what did I spend today', { notActionType: 'TASK', isQuery: true });
await test('question no task 6', 'show my spending', { notActionType: 'TASK', isQuery: true });
await test('question no task 7', 'show my reminders', { notActionType: 'TASK', isQuery: true });
await test('question no task 8', 'check my tasks', { notActionType: 'TASK', isQuery: true });

console.log('\n=== MULTI-TURN CLARIFICATION ===');
await test('missing task title', 'add task', { isClarification: true, followUpIntent: 'AWAITING_TASK_TITLE' });
await test('missing task title 2', 'add a task', { isClarification: true, followUpIntent: 'AWAITING_TASK_TITLE' });
await test('missing task title 3', 'new task', { isClarification: true, followUpIntent: 'AWAITING_TASK_TITLE' });

console.log('\n=== GREETINGS & HELP ===');
await test('hello', 'hello', { isQuery: true, notActionType: 'TASK' });
await test('hi', 'hi', { isQuery: true, notActionType: 'TASK' });
await test('who are you', 'who are you', { isQuery: true, notActionType: 'TASK' });

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
