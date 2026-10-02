// Pass: render items into the final soul text and traced lines, in section order.

import type { Item, Library, RenderOptions, Section, TracedLine } from '../types.js';
import { SECTION_ORDER } from '../types.js';

function blankLine(lib: Library): TracedLine {
  return { text: '', id: lib.chassis.blank.id, kind: 'blank' };
}

// An override in opts wins (null suppresses the heading); otherwise the library default.
function headingFor(
  section: Section,
  lib: Library,
  opts?: RenderOptions,
): { id: string; text: string } | null | undefined {
  const overrides = opts?.headings;
  if (overrides && Object.hasOwn(overrides, section)) {
    const override = overrides[section];
    if (override !== undefined) return override;
  }
  return lib.chassis.headings.find((h) => h.section === section);
}

export function render(
  items: Item[],
  lib: Library,
  opts?: RenderOptions,
): { soul: string; soulLines: TracedLine[] } {
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

  // Items in a section missing from the order are not rendered.
  for (const section of opts?.order ?? SECTION_ORDER) {
    const sectionItems = bySection.get(section);
    if (!sectionItems || sectionItems.length === 0) continue;

    if (renderedAny) {
      soulLines.push(blankLine(lib));
    }
    renderedAny = true;

    const heading = headingFor(section, lib, opts);
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
