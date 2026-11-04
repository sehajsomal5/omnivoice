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
    } else if (key === 'multiActionCount') {
      if ((r.actions?.length || 0) < expected)
        errors.push(`actions length expected >= ${expected}, got ${r.actions?.length}`);
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

console.log('\n=== HINDI / HINGLISH SPEECH PATTERNS ===');
await test('Hindi: today expense', 'aaj kitna kharcha hua', { actionType: 'QUERY_EXPENSES_TODAY', isQuery: true });
await test('Hindi: balance left', 'mera balance kitna bacha', { isQuery: true });
await test('Hindi: pending tasks', 'pending kaam batao', { actionType: 'QUERY_TASKS', isQuery: true });
await test('Hindi: reminders today', 'aaj ke reminders dikhao', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });
await test('Hindi: tomorrow schedule', 'kal kya karna hai', { actionType: 'QUERY_TOMORROW', isQuery: true });
await test('Hindi: add expense', 'lunch pe 200 rupaye kharch kiye', { actionType: 'EXPENSE', isQuery: false });
await test('Hindi: add reminder', 'subah 9 baje meeting ka reminder lagao', { actionType: 'REMINDER', isQuery: false });
await test('Hindi: daily summary', 'aaj ki summary batao', { actionType: 'DAILY_SUMMARY', isQuery: true });

console.log('\n=== PUNJABI SPEECH PATTERNS ===');
await test('Punjabi: today expense', 'ajj kinna kharcha hoya', { actionType: 'QUERY_EXPENSES_TODAY', isQuery: true });
await test('Punjabi: balance', 'kinne paise bache', { isQuery: true });
await test('Punjabi: tasks', 'pending kamm dasso', { actionType: 'QUERY_TASKS', isQuery: true });
await test('Punjabi: reminders', 'ajj de reminder dasso', { actionType: 'QUERY_REMINDERS_TODAY', isQuery: true });

console.log('\n=== STT PHONETIC REPAIRS ===');
await test('Phonetic: to fifty', 'spent to fifty on lunch', { actionType: 'EXPENSE', spokenContains: '250' });
await test('Phonetic: too hundred', 'spent too hundred on coffee', { actionType: 'EXPENSE', spokenContains: '200' });
await test('Phonetic: water my tasks', 'water my tasks', { actionType: 'QUERY_TASKS', isQuery: true });
await test('Phonetic: remain me', 'remain me to call dad at 6 PM', { actionType: 'REMINDER' });
await test('Phonetic: call that', 'set reminder call that at 7 PM', { actionType: 'REMINDER', spokenContains: 'call dad' });

console.log('\n=== ADVANCED EXPENSE / CATEGORY VARIATIONS ===');
await test('Expense: groceries query', 'what did I spend on groceries', { spokenContains: 'Groceries' });
await test('Expense: uber query', 'how much did I spend on uber', { spokenContains: 'Travel' });
await test('Expense: travel query', 'what are my travel expenses', { spokenContains: 'Travel' });
await test('Expense: remaining money', 'how much money is left in my budget', { isQuery: true, spokenContains: 'remaining' });

console.log('\n=== ADVANCED TASK / REMINDER VARIATIONS ===');
await test('Tasks: did I complete', 'did I complete any task today', { actionType: 'QUERY_COMPLETED_TASKS', isQuery: true });
await test('Tasks: have I finished', 'have I finished any tasks', { actionType: 'QUERY_COMPLETED_TASKS', isQuery: true });
await test('Tasks: how many still need', 'how many tasks do I still need to do', { actionType: 'QUERY_TASKS', isQuery: true });
await test('Reminders: tomorrow at time', 'remind me to buy milk tomorrow at 8 AM', { actionType: 'REMINDER' });
await test('Reminders: set reminder tomorrow time title', 'set a reminder for tomorrow 5 PM submit project', { actionType: 'REMINDER' });
await test('Tasks: delete task', 'delete task call dentist', { actionType: 'DELETE_TASK' });
await test('Tasks: mark done', 'mark team meeting done', { actionType: 'COMPLETE_TASK' });
await test('Tasks: add task with dueDate', 'add task design logo tomorrow', { actionType: 'TASK' });

console.log('\n=== COMPOUND MULTI-ACTIONS (Slide 2 Requirement) ===');
await test('Compound: expense and reminder', 'spent 150 rs on breakfast and remind me to submit form at 4 pm', { multiActionCount: 2 });

console.log(`\n${'='.repeat(50)}`);
console.log(`STRESS TEST RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
