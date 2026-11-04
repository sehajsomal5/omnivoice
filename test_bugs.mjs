import { OmniBrain } from './src/omniBrain.js';
const brain = new OmniBrain();
const todayStr = new Date().toISOString().split('T')[0];
const data = {
  budget: 5000,
  tasks: [
    { title: 'Buy groceries', completed: false, dueDate: 'Today' },
    { title: 'Call dentist', completed: true, dueDate: 'Today' },
    { title: 'Submit report', completed: true, dueDate: 'Today' },
  ],
  expenses: [
    { amount: 250, category: 'Food', note: 'Lunch', date: todayStr },
    { amount: 100, category: 'Travel', note: 'Cab', date: todayStr },
    { amount: 260, category: 'Food', note: 'Dinner', date: todayStr },
  ],
  reminders: [{ title: 'Call dad', date: 'Today', time: '6:00 PM' }]
};

async function test(label, input) {
  const r = await brain.processInput(input, data);
  console.log(`\n[${label}]`);
  console.log('  Input   :', input);
  console.log('  Spoken  :', r.spokenResponse);
  console.log('  Actions :', JSON.stringify(r.actions));
  console.log('  isQuery :', r.isQuery);
}

await test('Bug1 food filter',    'how much did I spend on food today');
await test('Bug1 travel filter',  'how much did I spend on travel today');
await test('Bug2 today balance',  'what is todays balance');
await test('Bug2 my balance',     'what is my balance');
await test('Bug3 completed tasks','how many tasks did i complete today');
await test('Query pending',       'do I have pending tasks');
await test('No false task',       'what are my tasks today');
await test('Expenses today',      'show me today expenses');
