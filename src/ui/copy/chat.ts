// Preview chat strings (M5 slice 5.3 owns this file). Spread into copy in src/ui/copy.ts.
// The label is Brian's wording word for word (QUESTIONS B22) and the withheld line is the plan's
// (docs/M5-PLAN.md section 3). The rest is plain wording for Brian to confirm. The probe messages
// on the chips come from the library (probes 1 to 3, X1), never from here.
// Every function takes numbers or strings only and builds one template literal, so the copy walker
// in test/ui-copy.test.ts can call it with sample arguments.

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// "3 seconds", "2 minutes", "1 hour". Seconds the proxy sends are rounded up to the next whole unit.
function waitText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'a little while';
  const s = Math.ceil(seconds);
  if (s < 60) return plural(s, '1 second', `${s} seconds`);
  const m = Math.ceil(s / 60);
  if (m < 60) return plural(m, '1 minute', `${m} minutes`);
  const h = Math.ceil(m / 60);
  return plural(h, '1 hour', `${h} hours`);
}

export const chatCopy = {
  chat: {
    heading: 'Try your bot',
    // B22, verbatim.
    label: "Close to what your bot will do. Your real bot also has its runtime's built-in rules.",
    chipsHint: 'Tap a message to see how your bot answers.',
    askLabel: 'Ask your own',
    // X2: the box opens after the first reply to a chip.
    askLocked: 'Try one of the messages above first. Then you can ask your own.',
    counter: (n: number, max: number) => `${n}/${max}`,
    counterLabel: (n: number, max: number) => `${n} of ${max} characters`,
    send: 'Send',
    logLabel: 'Messages with your bot',
    you: 'You',
    bot: 'Your bot',
    thinking: 'Your bot is thinking',
    // Plan section 3, verbatim.
    withheld: "That reply repeated your bot's setup, so it was held back.",
    refused: "Your bot won't answer that one.",
    rateLimited: (seconds: number) => `That is a lot of messages. Try again in ${waitText(seconds)}.`,
    rateLimitedNoTime: 'That is a lot of messages. Try again a little later.',
    busy: 'Your bot is busy right now. Try again in a moment.',
    unavailable: "The preview isn't available right now. Your install steps above still work.",
    capReached: (max: number) => `That is all ${max} messages for this visit.`,
  },
};
