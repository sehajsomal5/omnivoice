// Phonetic & STT Mishearing Repair Engine for Indian & Accented English
// Automatically repairs common Google Speech Recognition phoneme mistakes

export function repairSpokenText(text) {
  if (!text) return "";
  let s = text.toLowerCase();

  // 1. Repair numbers spoken as words (e.g. "two fifty" -> "250", "too hundred" -> "200")
  s = s
    .replace(/\b(?:to|too|two)\s+fifty\b/gi, '250')
    .replace(/\b(?:to|too|two)\s+hundred\s*(?:and)?\s*fifty\b/gi, '250')
    .replace(/\b(?:three|tree)\s+hundred\s*(?:and)?\s*fifty\b/gi, '350')
    .replace(/\b(?:four|for)\s+hundred\s*(?:and)?\s*fifty\b/gi, '450')
    .replace(/\b(?:one|won)\s+hundred\s*(?:and)?\s*twenty\b/gi, '120')
    .replace(/\b(?:one|won)\s+hundred\b/gi, '100')
    .replace(/\b(?:two|too|to)\s+hundred\b/gi, '200')
    .replace(/\b(?:three|tree)\s+hundred\b/gi, '300')
    .replace(/\b(?:four|for)\s+hundred\b/gi, '400')
    .replace(/\b(?:five)\s+hundred\b/gi, '500')
    .replace(/\b(?:six)\s+hundred\b/gi, '600')
    .replace(/\b(?:seven)\s+hundred\b/gi, '700')
    .replace(/\b(?:eight|ate)\s+hundred\b/gi, '800')
    .replace(/\b(?:nine)\s+hundred\b/gi, '900')
    .replace(/\b(?:one|a)\s+thousand\b/gi, '1000')
    .replace(/\b(?:two)\s+thousand\b/gi, '2000')
    .replace(/\b(?:five)\s+thousand\b/gi, '5000');

  // 2. Repair common STT mishearings for "Call Dad"
  s = s.replace(/\b(?:call\s+that|called\s+dad|call\s+dead|call\s+bad|calling\s+dad)\b/gi, 'call dad');
  s = s.replace(/\b(?:call\s+mum|call\s+mam|call\s+ma)\b/gi, 'call mom');

  // 3. Repair common STT mishearings for "Lunch" (Indian accents often heard as "launch" or "large")
  s = s.replace(/\b(?:on\s+launch|for\s+launch|spent.*launch)\b/gi, (m) => m.replace(/launch/i, 'lunch'));
  s = s.replace(/\b(?:on\s+large|spent.*large)\b/gi, (m) => m.replace(/large/i, 'lunch'));

  // 4. Repair common STT mishearings for "Remind me" / "Reminder"
  s = s.replace(/\b(?:remain\s+me|mind\s+me|re\s+minder|reminded\s+me|be\s+minded|free\s+mind|remind\s+her)\b/gi, 'remind me');
  s = s.replace(/\bre\s+minders?\b/gi, 'reminders');

  // 5. Repair "What are" heard as "Water"
  s = s.replace(/\bwater\s+(?:my|the|any|pending|are)\b/gi, 'what are my');
  s = s.replace(/\bwater\s+tasks\b/gi, 'what tasks');

  // 6. Repair "Spend" vs "Spent"
  s = s.replace(/\b(?:i\s+spend|i\s+friend|i\s+stand|eye\s+spent)\b/gi, 'i spent');

  // 7. Repair "Tasks" misheard as "Tax" or "Taks"
  s = s.replace(/\b(?:pending|my|completed|finished|any)\s+tax\b/gi, '$1 tasks');
  s = s.replace(/\bwhat\s+(?:are\s+)?tax\b/gi, 'what are tasks');

  // 8. Repair "Tomorrow" / "Today"
  s = s.replace(/\bto\s+morrow\b/gi, 'tomorrow');
  s = s.replace(/\bto\s+marrow\b/gi, 'tomorrow');
  s = s.replace(/\bto\s+day'?s?\b/gi, "today's");

  // 9. Repair "Rupees" / currency mishearings
  s = s.replace(/\b(?:roopies|roofies|roopay|rupeez)\b/gi, 'rupees');

  // 10. Repair "Pending" misheard as "Bending" / "Banding"
  s = s.replace(/\b(?:bending|banding)\s+(?:tasks?|todos?|kamm|work)\b/gi, 'pending tasks');

  // 11. Repair numbers spoken as single words ("twenty" -> 20, "fifty" -> 50, etc.)
  s = s.replace(/\b(?:twenty|twentie)\b/gi, '20')
       .replace(/\b(?:thirty)\b/gi, '30')
       .replace(/\b(?:forty|fourty)\b/gi, '40')
       .replace(/\b(?:fifty)\b/gi, '50')
       .replace(/\b(?:sixty)\b/gi, '60')
       .replace(/\b(?:seventy)\b/gi, '70')
       .replace(/\b(?:eighty)\b/gi, '80')
       .replace(/\b(?:ninety)\b/gi, '90');

  // 12. Repair time mishearings (e.g. "at 6:00" -> "at 6 PM", "at 6 o'clock" -> "at 6 PM")
  s = s.replace(/\b(\d{1,2})\s*o'?clock\b/gi, '$1 PM');

  // 13. Clean trailing punctuation
  s = s.replace(/[.,?!]+$/, '').trim();

  return s;
}
