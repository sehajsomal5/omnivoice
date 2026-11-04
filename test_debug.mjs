import { OmniBrain } from './src/omniBrain.js';
const brain = new OmniBrain();
const r = await brain.processInput("what reminders do I have today", {
  budget: 5000, tasks: [], expenses: [],
  reminders: [{ title: 'Call dad', date: 'Today', time: '6:00 PM' }]
});
console.log('actionType:', r.actions?.[0]?.type);
console.log('spoken:', r.spokenResponse);
