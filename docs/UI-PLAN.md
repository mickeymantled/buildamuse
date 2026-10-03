# Build-a-Bot UI plan (M3, lead architecture)

Sources: docs/Build-a-Muse-Build-Spec.md "Screens" (stations, layout, state), docs/Build-a-Bot-v2-Brief.md Part E (target picker, packs, limits, gates, roles), QUESTIONS.md B1 to B10 and S9. Structure only: every user-facing string lives in `src/ui/copy.ts` (verbatim from the spec or brief where given) or comes from the library. UI decisions are logged as U-numbered entries in QUESTIONS.md.

## Stack

Vite + React + TypeScript, Tailwind CSS v4 through `@tailwindcss/vite`, Zustand for state. `src/ui/index.css` imports Tailwind and defines color tokens as CSS variables for light and dark (`prefers-color-scheme`). Mobile first: a single centered column, `max-w-[430px]`, design width 390px, 16px side padding, safe-area insets (`env(safe-area-inset-*)`), no horizontal page scroll (only the roster card row scrolls sideways). Touch targets at least 44px. Chip grids wrap with 8px gaps. System font stack.

## Screens and flow (`src/ui/flow.ts`)

`ScreenId = 'target' | 'roster' | 'base' | 'world' | 'packs' | 'limits' | 'gates' | 'stats' | 'peeves' | 'heart' | 'outfit' | 'roles' | 'name' | 'certificate'`.

Order: target, roster, base, world, packs, limits, gates, stats, peeves, heart, outfit, roles, name, certificate.

- `target` is required, no skip (Part E). `roster` offers two doors: Pick a starter (Use goes to `certificate`, Remix goes to `base` with the build loaded) or Build your own (goes to `base`).
- `limits` is shown only when a selected pack has limitChips; `gates` only when the selected packs expose any gate besides pay; `roles` only when the profile supportsRoles and the advanced toggle is on (off by default).
- Skip is allowed on world, packs, limits, gates, stats, peeves, heart, outfit, roles (spec: stations 2 to 6, extended to the new screens). A skipped screen keeps its defaults and is recorded in `skipped` (S9).
- `name` is the only text input. `certificate` is M4; in M3 it is a placeholder that shows the compiled bundle as plain text so the flow can be tested end to end.
- Progress dots show the stations from base to name that are visible for this build.

`nextScreen(state)`, `prevScreen(state)`, `visibleScreens(state)` are pure functions of the store state.

## Store (`src/ui/store.ts`, Zustand)

State:
```ts
{
  screen: ScreenId;
  from: 'roster' | 'blank' | 'remix' | null;
  target: TargetId | null; mode?: ChatgptMode; plan?: Plan;
  draft: {                      // the build being made; v2 fields, all optional until set
    base?: BaseId; chips: ChipId[]; stats?: Stats; peeves: PeeveId[];
    heart?: { hardPart: HardPartId; d1: DriveId; d2: DriveId };
    outfit?: OutfitId; name: string;
    packs: PackId[]; limits: Record<LimitId, number>; gates: Record<ActionId, GateSetting>; roles?: RoleId[];
  };
  touched: { proactive: boolean; packs: boolean; d2: boolean };
  advancedRoles: boolean;
  skipped: ScreenId[];
  lastBadge: BadgeId | null;
}
```
Actions (the only way screens change state):
- `setTarget(target, mode?, plan?)`, `setMode(mode)`, `setPlan(plan)`: chatgpt mode defaults to dot; plan applies to instructions only (default free).
- `useStarter(id)`, `remixStarter(id)`, `startBlank()`.
- `setBase(id)`: stats = base defaults (risk added at 2 if a Markets chip is already tapped, within the cap); remembers base.
- `toggleChip(id)`: cap 6. Tapping the first Markets chip adds risk at 2 (if the cap of 14 would be passed, risk starts at 1, and if still over, the highest of funny, chatty, proactive drops by 1; never blunt or warm below 1) (U1). Removing the last Markets chip removes risk (its points return). Tapping kids raises proactive by 1 if the user hasn't moved proactive and the cap allows. While `touched.packs` is false, packs are recomputed from chips with the migration map (`packsFromChips`, exported from src/compiler/migrate.ts), first three.
- `setStat(stat, level)`: 1..4, blunt and warm floor 1, total of present stats at most 14 (a move that would pass 14 is refused). Sets `touched.proactive` when stat is proactive.
- `togglePack(id)`: max 3; sets `touched.packs`; prunes limits and gates no longer exposed; prunes roles from another set.
- `setLimit(id, value)`: clamps to the limit's min..max and step.
- `setGate(action, setting)`: pay is locked to forbid (refused otherwise).
- `togglePeeve(id)`: cap 5.
- `setHardPart(id)`: heart = { hardPart, d1: that hard part's d1, d2: d2.blunt.<blunt> }.
- `setD1(driveId)`: the hard part's d1 or a tapped chip's d1Suggest. `setD2(driveId)`: any d2 drive; sets `touched.d2` (otherwise d2 follows blunt).
- `setOutfit(id)`, `setName(text)` (trimmed length 1..24 required to continue; input capped at 24).
- `setAdvancedRoles(on)`, `toggleRole(id)` (coordinator always included, one set).
- `go(screen)`, `next()`, `back()`, `skip()` (records the screen in `skipped`).
- `reset()`.

Derived (selectors, pure, memoized by a JSON key of the inputs):
- `previewBuild(state): Build` fills gaps with defaults so the preview strip always compiles: base defaults when no base yet (base `chaos` until one is chosen, U2), heart `calmer` with its d1 and d2 from blunt (U3), outfit `has_it_together` (U3), name copy.defaultName (U3).
- `compiled(state)`: `compile(previewBuild)` (pure, cheap), or an error object if validation fails (the UI never produces one, but the strip must not crash).
- `profileOf(state)`, `capOf(state)`, `isComplete(state)`.

## Components (`src/ui/components/`)

Each a small presentational component, no store access (screens wire them): `Screen` (title, subtitle, back, skip, footer button, progress dots), `Card` (selectable card, selected state, optional badge and sample line), `Chip` (pill: selected, dimmed, checked "already built in", disabled), `ChipGrid` (labeled groups, wrap, 8px gaps, a counter like "3/6"), `Slider` (1 to 4 scoop slider, 44px, shows the level's sample reply, a floor message slot), `Stepper` (number with min, max, step; never a text field), `Toggle3` (auto / approve / forbid segmented control with a locked state), `Pill` (badge pill), `ProgressDots`, `BottomSheet` (peek sheet), `Meter` (length vs cap).

## Copy (`src/ui/copy.ts`)

All UI strings in one exported object. Verbatim where the spec or brief gives them: "Pick a starter", "Build your own", the gates copy per target (Part E), the remix warning, the certificate lines (M4), "full" at the stat cap, "already built in". The spec's floor line names Muse ("every Muse comes with a little honesty and a little care already in."); per Part E ("your bot's personality") the UI says "bot" (U4). Strings the docs don't give are written as plainly as possible and listed in QUESTIONS for Brian.

## After M3

M4 changed this plan in places. The first paint is `Shell.tsx` with a presentational `TargetPicker`, and App loads lazily. A `remix` side screen sits between the certificate and base. The store gained `loadBuild`, `switchTarget`, `startRemix`, the paste, the Mine switch and link errors. `settle()` no longer prunes packs by profile, and drops roles only when a change removes their packs. See docs/M4-PLAN.md and the QUESTIONS W entries.
