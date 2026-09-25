// Pass: render items into the final soul text and traced lines, in section order.

import type { Item, Library, Section, TracedLine } from '../types.js';
import { SECTION_ORDER } from '../types.js';

function blankLine(lib: Library): TracedLine {
  return { text: '', id: lib.chassis.blank.id, kind: 'blank' };
}

export function render(items: Item[], lib: Library): { soul: string; soulLines: TracedLine[] } {
  const bySection = new Map<Section, Item[]>();
  for (const item of items) {
    const list = bySection.get(item.section);
    if (list) {
      list.push(item);
    } else {
      bySection.set(item.section, [item]);
    }
  }

  const soulLines: TracedLine[] = [];
  let renderedAny = false;

  for (const section of SECTION_ORDER) {
    const sectionItems = bySection.get(section);
    if (!sectionItems || sectionItems.length === 0) continue;

    if (renderedAny) {
      soulLines.push(blankLine(lib));
    }
    renderedAny = true;

    const heading = lib.chassis.headings.find((h) => h.section === section);
    if (heading) {
      soulLines.push({ text: heading.text, id: heading.id, kind: 'heading' });
    }

    for (const item of sectionItems) {
      if (item.blankBefore) {
        soulLines.push(blankLine(lib));
      }
      const text = (item.format === 'bullet' ? '- ' : '') + item.text;
      const line: TracedLine = { text, id: item.id, kind: item.kind };
      if (item.sources) {
        line.sources = item.sources;
      }
      soulLines.push(line);
    }
  }

  const soul = soulLines.map((l) => l.text).join('\n');
  return { soul, soulLines };
}
