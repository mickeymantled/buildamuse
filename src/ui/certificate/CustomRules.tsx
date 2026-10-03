import { useId, useRef } from 'react';
import type { CustomRule } from '../../compiler/types.js';
import { CopyButton } from '../components/CopyButton';
import { copy } from '../copy.js';
import type { CertCustomRules } from './model.js';

// One rule as a card: the action text with its copy button, and the setting to choose under it.
function RuleCard({ rule }: { rule: CustomRule }) {
  const actionId = useId();
  const actionRef = useRef<HTMLParagraphElement>(null);
  const c = copy.certificate;
  return (
    <div
      role="group"
      aria-labelledby={actionId}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface p-3"
    >
      <p
        id={actionId}
        ref={actionRef}
        className="min-w-0 text-sm font-semibold leading-5 text-text [overflow-wrap:anywhere]"
      >
        {rule.action}
      </p>
      <CopyButton
        text={rule.action}
        label={c.copyButton.label}
        copiedLabel={c.copyButton.copied}
        failedLabel={c.copyButton.failed}
        selectRef={actionRef}
        className="shrink-0"
      />
      <p className="col-span-2 min-w-0 text-sm leading-5 text-text [overflow-wrap:anywhere]">
        <span className="text-muted">{c.customRules.setting}</span> <span className="font-medium">{rule.setting}</span>
      </p>
    </div>
  );
}

// The ChatGPT dot's Custom Rules, stacked so they fit a narrow screen: the Settings path as the
// caption, one card per rule, then the note that goes with them.
export function CustomRules({ table }: { table: CertCustomRules }) {
  return (
    <div className="flex flex-col gap-3">
      {table.caption !== '' && (
        <p className="text-sm font-medium leading-5 text-text [overflow-wrap:anywhere]">{table.caption}</p>
      )}
      <ul role="list" className="flex list-none flex-col gap-3 p-0">
        {table.rows.map((rule, i) => (
          <li key={`${i}-${rule.gate}`}>
            <RuleCard rule={rule} />
          </li>
        ))}
      </ul>
      {table.note !== undefined && <p className="text-sm leading-5 text-text">{table.note.text}</p>}
    </div>
  );
}
