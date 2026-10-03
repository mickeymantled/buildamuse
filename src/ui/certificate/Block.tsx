import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { CopyButton } from '../components/CopyButton';
import type { CopyButtonProps } from '../components/CopyButton';
import { FOCUS, cx } from '../components/cx';
import { ChevronIcon } from '../components/icons';
import { copy } from '../copy.js';
import type { CertBlock, CertGroup } from './model.js';

// Long text wraps and breaks inside a word, so a block never scrolls the page sideways.
export const PRE =
  'whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-5 text-text [overflow-wrap:anywhere]';

// A block over FOLD_OVER lines as the reader sees them is folded to FOLD_TO lines and the top half of
// the next, under a fade. The rest stays in the page and Copy still copies all of it.
export const FOLD_OVER = 12;
const FOLD_TO = 8;
const LINE_REM = 1.25; // leading-5
const BOX_REM = 1.625; // p-3 top and bottom plus the 1px borders; the pre is border-box
const FOLDED_HEIGHT = `${(FOLD_TO + 0.5) * LINE_REM + BOX_REM}rem`;

// The pre wraps, so a long line shows as several. About 44 characters fit the 430px column and about
// 37 fit a 375px phone, so 40 is the middle. Layout is not measured: the count has to hold with no
// layout engine, and a block near the edge may fold or stay open one line early either way.
const CHARS_PER_LINE = 40;

export function visibleLineCount(text: string): number {
  return text
    .replace(/\n+$/, '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
}

export const SECONDARY_BUTTON = cx(
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text',
  FOCUS,
);

// A CopyButton whose accessible name names what it copies. CopyButton has no name prop, so the name
// is set on its button after render. It starts with the visible "Copy", so the two agree.
export function NamedCopy({ name, ...props }: CopyButtonProps & { name: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrap.current?.querySelector('button')?.setAttribute('aria-label', name);
  }, [name]);
  return (
    <div ref={wrap} className="flex shrink-0">
      <CopyButton {...props} />
    </div>
  );
}

export interface BlockProps {
  block: CertBlock;
  /** 2 for a block on its own, 3 for a block under a group heading. */
  level: 2 | 3;
  /** Set on the first block a Show more reveals, so focus can move to it. */
  headingRef?: Ref<HTMLHeadingElement>;
}

// A titled pre with its copy button. The title and the button share the top row, so the button is
// in reach without scrolling past a long block. A long block is folded until Show full text.
export function Block({ block, level, headingRef }: BlockProps) {
  const titleId = useId();
  const preId = useId();
  const preRef = useRef<HTMLPreElement>(null);
  const [open, setOpen] = useState(false);
  const Heading = level === 2 ? 'h2' : 'h3';
  const c = copy.certificate.copyButton;
  const foldable = visibleLineCount(block.text) > FOLD_OVER;
  const folded = foldable && !open;
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
      <NamedCopy
        name={copy.certificateUi.copyBlock(block.title)}
        text={block.text}
        label={c.label}
        copiedLabel={c.copied}
        failedLabel={c.failed}
        selectRef={preRef}
      />
      {block.path !== undefined && (
        <p className="col-span-2 min-w-0 text-xs leading-4 text-muted [overflow-wrap:anywhere]">{block.path}</p>
      )}
      <div className="relative col-span-2 min-w-0">
        <pre
          id={preId}
          ref={preRef}
          className={cx(PRE, folded && 'overflow-hidden')}
          style={folded ? { maxHeight: FOLDED_HEIGHT } : undefined}
        >
          {block.text}
        </pre>
        {folded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-px bottom-px h-14 rounded-b-xl bg-[linear-gradient(to_top,var(--surface),transparent)]"
          />
        )}
      </div>
      {foldable && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={preId}
          onClick={() => setOpen(!open)}
          className={cx(SECONDARY_BUTTON, 'col-span-2 gap-2')}
        >
          <span>{copy.certificateUi.showFullText}</span>
          <ChevronIcon dir="down" className={cx('shrink-0 motion-safe:transition-transform', open && 'rotate-180')} />
        </button>
      )}
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
