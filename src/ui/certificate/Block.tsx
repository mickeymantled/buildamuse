import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { CopyButton } from '../components/CopyButton';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import type { CertBlock, CertGroup } from './model.js';

// Long text wraps and breaks inside a word, so a block never scrolls the page sideways.
export const PRE =
  'whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-5 text-text [overflow-wrap:anywhere]';

export const SECONDARY_BUTTON = cx(
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text',
  FOCUS,
);

export interface BlockProps {
  block: CertBlock;
  /** 2 for a block on its own, 3 for a block under a group heading. */
  level: 2 | 3;
  /** Set on the first block a Show more reveals, so focus can move to it. */
  headingRef?: Ref<HTMLHeadingElement>;
}

// A titled pre with its copy button. The title and the button share the top row, so the button is
// in reach without scrolling past a long block.
export function Block({ block, level, headingRef }: BlockProps) {
  const titleId = useId();
  const preRef = useRef<HTMLPreElement>(null);
  const Heading = level === 2 ? 'h2' : 'h3';
  const c = copy.certificate.copyButton;
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
    >
      <Heading
        id={titleId}
        ref={headingRef}
        tabIndex={headingRef === undefined ? undefined : -1}
        className="min-w-0 text-base font-semibold leading-6 text-text outline-none [overflow-wrap:anywhere]"
      >
        {block.title}
      </Heading>
      <CopyButton
        text={block.text}
        label={c.label}
        copiedLabel={c.copied}
        failedLabel={c.failed}
        selectRef={preRef}
        className="shrink-0"
      />
      {block.path !== undefined && (
        <p className="col-span-2 min-w-0 text-xs leading-4 text-muted [overflow-wrap:anywhere]">{block.path}</p>
      )}
      <pre ref={preRef} className={cx('col-span-2 min-w-0', PRE)}>
        {block.text}
      </pre>
    </div>
  );
}

// What goes after a group's first personality block: the Mine switch.
export interface MineSlot {
  groupKey: string;
  node: ReactNode;
}

export interface GroupProps {
  group: CertGroup;
  /** One line under the group heading. */
  hint?: string;
  mineSlot?: MineSlot;
}

// One group of blocks: an optional heading, the role note that leads it, the blocks, and Show more
// when the group shows only its first few.
export function Group({ group, hint, mineSlot }: GroupProps) {
  const [expanded, setExpanded] = useState(false);
  const revealed = useRef<HTMLHeadingElement>(null);
  const limit = group.showFirst;
  const folded = limit !== undefined && !expanded && group.blocks.length > limit;
  const shown = folded ? group.blocks.slice(0, limit) : group.blocks;
  const level = group.heading === undefined ? 2 : 3;
  const mineAt = mineSlot?.groupKey === group.key ? group.blocks.findIndex((b) => b.kind === 'personality') : -1;

  // The button is gone once it is tapped, so focus goes to the first block it revealed.
  useEffect(() => {
    if (expanded) revealed.current?.focus();
  }, [expanded]);

  return (
    <div className="flex flex-col gap-4">
      {group.heading !== undefined && (
        <h2 className="text-lg font-semibold leading-6 text-text [overflow-wrap:anywhere]">{group.heading}</h2>
      )}
      {hint !== undefined && <p className="text-sm leading-5 text-text">{hint}</p>}
      {group.lead !== undefined && <p className="text-sm leading-5 text-text">{group.lead.text}</p>}
      {shown.map((block, i) => (
        <Fragment key={block.key}>
          <Block block={block} level={level} headingRef={expanded && i === limit ? revealed : undefined} />
          {i === mineAt && mineSlot?.node}
        </Fragment>
      ))}
      {folded && (
        <button type="button" onClick={() => setExpanded(true)} className={SECONDARY_BUTTON}>
          {copy.certificate.showMore}
        </button>
      )}
    </div>
  );
}
