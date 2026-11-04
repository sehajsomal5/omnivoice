import { OmniBrain } from './src/omniBrain.js';
const b = new OmniBrain();
const data = { tasks: [], reminders: [], expenses: [], budget: 5000 };

const cases = [
  ['add a new task',          'CLARIFY'],
  ['add task',                'CLARIFY'],
  ['add a task',              'CLARIFY'],
  ['new task',                'CLARIFY'],
  ['create a new task',       'CLARIFY'],
  ['add new task',            'CLARIFY'],
  ['add task submit report',  'TASK:Submit report'],
  ['add a new task call doctor', 'TASK:Call doctor'],
  ['create task buy milk',    'TASK:Buy milk'],
];

let pass = 0, fail = 0;
for (const [input, expected] of cases) {
  const r = await b.processInput(input, data, null);
  let got;
  if (r.isClarification) {
    got = 'CLARIFY';
  } else if (r.actions?.[0]?.title) {
    got = `TASK:${r.actions[0].title}`;
  } else {
    got = `OTHER:${r.spokenResponse?.slice(0, 40)}`;
  }
  const ok = expected.startsWith('CLARIFY') ? got === 'CLARIFY' : (got.startsWith('TASK:') && got.toLowerCase().includes(expected.split(':')[1].toLowerCase()));
  const mark = ok ? '✅' : '❌';
  if (ok) pass++; else fail++;
  console.log(`${mark} "${input}"`);
  if (!ok) console.log(`   expected: ${expected}`);
  console.log(`   got:      ${got}`);
}
console.log(`\n${pass}/${cases.length} passed`);
