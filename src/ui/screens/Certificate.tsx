import type { CompileResult } from '../../compiler/types.js';
import { copy } from '../copy.js';
import { compiled, isCompileError, useBuilder } from '../store.js';
import { Station } from './Station.js';

const PRE =
  'whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-5 text-text [overflow-wrap:anywhere]';

function Block({ label, text }: { label: string; text: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold text-text">{label}</h2>
      <pre className={PRE}>{text}</pre>
    </section>
  );
}

// M3 placeholder: the bundle as plain text. Copy buttons and the share link are M4.
// A file or spoken item that repeats the soul or the seed is left out, since those have their own block.
function Bundle({ r }: { r: CompileResult }) {
  const c = copy.certificate;
  return (
    <div className="flex flex-col gap-4">
      <Block label={c.name} text={r.buildName} />
      <Block label={c.soul} text={r.soul} />
      <Block label={c.seed} text={r.seed} />
      {r.skills.length > 0 && (
        <Block label={c.skills} text={r.skills.map((k) => `${k.name}\n${k.sentence}`).join('\n\n')} />
      )}
      {r.files
        .filter((f) => f.content !== r.soul)
        .map((f) => (
          <Block key={f.path} label={`${f.label} (${f.path})`} text={f.content} />
        ))}
      {r.spoken
        .filter((s) => s.text !== r.seed)
        .map((s, i) => (
          <Block key={`${i}-${s.label}`} label={s.label} text={s.text} />
        ))}
      {r.customRules.length > 0 && (
        <Block
          label={c.rules}
          text={r.customRules.map((x) => `${x.action}\n${x.setting}`).join('\n\n')}
        />
      )}
      {r.description !== undefined && <Block label={c.description} text={r.description} />}
      {r.conversationStarters !== undefined && r.conversationStarters.length > 0 && (
        <Block label={c.starters} text={r.conversationStarters.join('\n')} />
      )}
      {r.installSteps.length > 0 && (
        <Block label={c.steps} text={r.installSteps.map((x, i) => `${i + 1}. ${x}`).join('\n')} />
      )}
      {r.notes.length > 0 && <Block label={c.notes} text={r.notes.join('\n')} />}
      {r.warnings.length > 0 && <Block label={c.warnings} text={r.warnings.join('\n')} />}
    </div>
  );
}

export function Certificate() {
  const result = useBuilder((s) => compiled(s));
  return (
    <Station screen="certificate" hideNext>
      {isCompileError(result) ? (
        <pre role="alert" className={PRE}>
          {result.error}
        </pre>
      ) : (
        <Bundle r={result} />
      )}
    </Station>
  );
}
