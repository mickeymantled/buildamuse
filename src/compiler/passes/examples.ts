// Pass: build the four "How this sounds" example items from resolved picks.

import type { Build, Item, Library, Resolved } from '../types.js';

export function exampleItems(build: Build, lib: Library, resolved: Resolved): Item[] {
  return [
    {
      id: lib.examples.greetingMe.id,
      text: 'Me: ' + lib.examples.greetingMe.text,
      kind: 'example',
      section: 'examples',
      format: 'plain',
    },
    {
      id: resolved.greeting.id,
      text: 'You: ' + resolved.greeting.you,
      kind: 'example',
      section: 'examples',
      format: 'plain',
    },
    {
      id: resolved.domain.id,
      text: 'Me: ' + resolved.domain.me,
      kind: 'example',
      section: 'examples',
      format: 'plain',
      blankBefore: true,
    },
    {
      id: resolved.domain.id,
      text: 'You: ' + (build.stats.blunt >= 3 ? resolved.domain.youBlunt : resolved.domain.youGentle),
      kind: 'example',
      section: 'examples',
      format: 'plain',
    },
  ];
}
