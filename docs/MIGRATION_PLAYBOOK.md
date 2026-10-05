# Ext JS to React Migration Playbook

How to move a large Ext JS application (Ext 4/6/7, Sencha Cmd builds, hundreds of `Ext.define` classes) to React without a rewrite freeze. Everything here is exercised by the code in this repository; file references point at the working example.

---

## 1. Principles

1. **No big bang.** The Ext shell keeps running in production the whole time. React arrives one screen at a time behind a flag, and every screen can be flipped back without a deploy.
2. **The shell owns the platform.** Login, session, routing, the z-index stack and global events stay in Ext until the very end. React modules are guests that receive everything through an explicit `HostContext` (`packages/bridge/src/contracts/hostContext.ts`) and never read Ext globals.
3. **Contracts before components.** Each piece of data or event that crosses the boundary gets a type and a runtime schema first. Both sides fail loudly when the contract drifts.
4. **Parity first, improvements second.** A migrated screen must behave like the legacy one (sorting, null handling, date formats, validation messages) before anyone redesigns it. Redesigns happen after the flag is at 100% and the legacy class is deleted.

---

## 2. Inventory and dependency mapping

Before touching React, build a machine-readable picture of the Ext code base.

| Step | How | Output |
| --- | --- | --- |
| Class inventory | Parse every `Ext.define(name, body)` with the TypeScript compiler API (same technique as `codemods/src/extModelToZod.ts`). Record `extend`, `alias`/`xtype`, `mixins`, `requires`, `controller`, `viewModel`, `stores`. | `classes.json` |
| Usage edges | Resolve `xtype` strings in `items`, `Ext.create('...')`, `Ext.widget('...')`, `requires`, `uses`, store `model` names and `controller`/`viewModel` aliases into class-to-class edges. Sencha Cmd's `bootstrap.json` is a useful cross-check. | dependency graph |
| Runtime edges | Grep `Ext.getCmp`, `Ext.ComponentQuery.query`, `up()`/`down()` selectors, `Ext.GlobalEvents.fireEvent`/`on` and `fireEvent` names. These are invisible to static `requires` and are where most surprises live. | event and query catalog |
| Overrides | List every `Ext.override` and `override:` class. Each one is global behaviour React will not inherit. | override register |
| Ownership and traffic | Join with analytics (screen views) and the bug tracker. | heat map |

Score each screen on *fan-in* (how many classes depend on it), *fan-out* (how much framework surface it uses), traffic and defect rate.

## 3. Prioritisation: leaves first

Start with **leaf screens**: low fan-in, moderate traffic, self-contained data. They prove the pipeline (bridge, flags, CI, telemetry) at low risk.

1. A read-mostly leaf (here: the **Dashboard** summary, default `react` in `legacy-extjs/src/app/rollout.js`). It reads the legacy store through `useExtStore`, so React ships before it owns any data.
2. A CRUD leaf with a grid and a form (here: **Tasks**, default `legacy`, React available behind the flag).
3. Screens with heavy cross-talk only after the event contracts exist.
4. The shell itself (navigation, session, layout) last. It is the strangler's final cut.

Explicitly park screens that are not worth migrating (here: **Reports**, `reactAvailable: false`). The flag router never mounts React for them, regardless of URL overrides.

## 4. The strangler-fig architecture

```
Ext shell (Viewport, routing, auth, z-index, GlobalEvents)
  └─ module host container
       ├─ legacy view (xtype)                      when flag = legacy
       └─ Bridge.ReactHost (xtype: reacthost)      when flag = react
            └─ React root, created by mountXWidget(el, hostContext)
```

* **`Bridge.ReactHost`** (`packages/bridge/src/reactHost.ts`) is a normal Ext component. It mounts a widget into its own element after render, forwards `setProps` as `update`, forwards Ext layout `resize`, and unmounts in `onDestroy`. Lazy `load()` results that arrive after destroy are discarded (token check), so fast navigation cannot leak a React root into a detached node.
* **Framework-agnostic contract.** The Ext side only knows `MountFn = (el, props) => { update, unmount, resize? }`. React, Vue or a web component can sit behind it. The shell bundle never imports React; the widget bundle is fetched with a dynamic `import()` only when a flag selects it.
* **Navigation is the lifecycle.** The shell destroys the previous module (`removeAll(true)`) on every route change, so React unmounting is driven by Ext's own lifecycle. No parallel bookkeeping.

## 5. Coexistence

### 5.1 Shared auth and session
The shell logs in. The token goes into `Ext.Ajax.defaultHeaders` *and* into `HostContext.session`. React's API client (`react-app/src/api/taskApi.ts`) sends the same bearer token; it never owns a login flow, refresh timer or logout. When the token rotates, the shell calls `handle.update(nextHostContext)`.

### 5.2 Data: two data layers, one writer
During the transition there are two caches: the Ext store (legacy views, shared app-level store) and TanStack Query (React views).

* **Read legacy data from React** with `useExtStore(store, map)` (`packages/bridge/src/useExtStore.ts`). It wraps `useSyncExternalStore`, subscribes to `datachanged/refresh/update/load/add/remove/clear`, and rebuilds an immutable snapshot because Ext records mutate in place. The mapper converts records to contract DTOs (`legacyRecordToTask`).
* **Keep a single writer per entity.** Saves from either UI become a `task:saved` event; the shell controller is the only code that writes it back into the legacy store (`ShellController.onTaskSaved`). React updates its query cache from the same event (`upsertTask`). No component writes into the other framework's cache directly.

### 5.3 Events: typed bus with a legacy adapter
`createEventBus<BridgeEvent>()` is a discriminated-union bus (`packages/bridge/src/contracts/events.ts`); adding a variant is a compile error everywhere it is not handled. `connectLegacyBus` maps Ext's string events with positional arguments to typed events and back:

* inbound mappers validate with the generated Zod schema; contract violations are reported and dropped instead of crashing a listener;
* events never echo: an event that crossed from Ext is not forwarded back, and a legacy event fired by the bridge is not re-ingested;
* a throwing subscriber is isolated from the others and from the Ext caller.

### 5.4 CSS isolation
* Every React selector is scoped under `.rw-root`; Ext rules all start with `.x-`. Neither side uses element selectors at the top level.
* Shared **design tokens** (`--app-accent`, `--app-selection`, ...) are declared by the Ext theme on `:root`. Widget CSS reads them with fallbacks (`var(--app-accent, #2563eb)`), so an embedded widget matches the legacy theme while the standalone app has its own palette.
* Widget CSS ships inside the bundle (`?inline`) and is reference-counted: injected on first mount, removed when the last widget unmounts.
* If a legacy theme has aggressive global rules (`* { box-sizing: content-box }`, `table td` resets), mount the widget in a shadow root instead; the `MountFn` contract does not change.

### 5.5 z-index: Ext floating windows vs React portals
Ext's `ZIndexManager` hands out increasing z-indexes starting around 19000. React portals with a hard-coded `z-index: 1000` disappear behind any Ext window. The host passes `zIndex.next()` (backed by `Ext.WindowManager.next()`), and the React modal service (`react-app/src/ui/ModalProvider.tsx`) asks for a value at open time, so a React dialog opened from inside an Ext window stacks above it, and an Ext window opened afterwards stacks above the dialog. Portals render into `document.body`, outside `.rw-root`, so the portal wrapper re-applies the scoping class.

### 5.6 i18n key reuse
The legacy catalog becomes the shared catalog (`packages/bridge/locales/*.json`). `createTranslator` keeps Ext's `{0}` placeholder semantics, so strings are reused verbatim and translators are not asked to retranslate. React validation messages map Zod issue codes onto the legacy `validation.*` keys. A parity test asserts every locale has identical keys.

Watch out for Ext classes that evaluate translations at define time (class bodies run once at load). Translate in `initComponent` or through bindings instead.

## 6. Ext to React concept map

| Ext JS | React equivalent | Notes from this repo |
| --- | --- | --- |
| `Ext.define` class + `extend` | ES modules, function components, plain functions | Inheritance chains become composition. Mixins become hooks or utilities. |
| `config` + `apply*`/`update*` | props, `useMemo` for derived values, `useEffect` for side effects | `apply` = normalise input; `update` = react to change. |
| `xtype` / `alias` | component import | Strings become imports, so dead code becomes detectable. |
| `Ext.data.Model` (fields, validators) | TypeScript interface + Zod schema | Generated by `codemods/` (section 8). `calculate`/`persist:false` fields become selectors (`isTaskOverdue`). |
| `Ext.data.Store` + proxy | TanStack Query (`useQuery`, `useMutation`, `setQueryData`) | Validate responses at the boundary. Local sort/filter become `useMemo` or table state. |
| Store events (`load`, `datachanged`) | query state (`isPending`, `isFetching`) and re-renders | During coexistence: `useExtStore`. |
| `ViewModel` `data` + `bind` | `useState` / props | One-way bind = prop; two-way bind = controlled input + `onChange`. |
| `ViewModel` `formulas` | derived values (`useMemo`) or selectors | Never store derived state. |
| `ViewController` | custom hooks + event handlers | `listen.global` becomes `useBusEvent`; `lookupReference` becomes props or refs. |
| `Ext.GlobalEvents` / controller `fireEvent` | typed event bus | Discriminated unions instead of string names. |
| `Ext.ComponentQuery`, `up()`, `down()`, `getCmp` | props, context, refs | A query is usually an undeclared dependency; make it a prop. |
| `Ext.grid.Panel` | TanStack Table (headless) or AG Grid | TanStack for ordinary grids; AG Grid when you need Ext-class features (locking, grouping, buffered rendering, pivot). |
| `Ext.form.Panel` + field validation | React Hook Form + Zod resolver | Same schema as the API contract. |
| `Ext.Msg` / `Ext.window.Window` | modal service (`useConfirm`) via portal | Promise-based, z-index from the host. |
| `Ext.app.Application` / routes | shell routing until the end, then React Router | Do not run two routers over the same URL space. |
| Sencha Cmd build, `requires` | Vite, ES imports, code splitting | The widget is a separate library build (`vite build --mode widget`). |

## 7. Testing strategy

| Layer | What | Where |
| --- | --- | --- |
| Contracts | Generated schema matches the Ext model; interface and schema infer identical types; legacy Date values serialise without timezone drift; locale key parity. | `codemods/test`, `packages/bridge/test/contracts.test.ts` |
| Drift guard | Re-running the codemod against the legacy model must reproduce the checked-in contract byte for byte, so a field added in Ext fails CI until React is updated. | `codemods/test/extModelToZod.test.ts` |
| Interop | Event bus semantics, legacy adapter echo suppression and contract rejection, `useExtStore` reactivity, `ReactHost` mount/update/resize/destroy and late-load cancellation. | `packages/bridge/test` |
| Legacy behaviour | ExtLite class system, stores, MVVM and grid, so parity tests compare against known behaviour. | `legacy-extjs/test` |
| Component | React module behaviour with a mocked API: sort, filter, validation messages, save events, cross-UI updates, unsaved-change guard. | `react-app/src/tasks/TasksModule.test.tsx`, `react-app/test/widget.test.tsx` |
| Parity screenshots | Same fixture data, same viewport, `?ui.tasks=legacy` vs `?ui.tasks=react`, captured with Playwright and diffed per region (grid body, form). Diffs are reviewed, not auto-failed, until the React styling is intentionally aligned. | CI job (not included) |
| End-to-end | One smoke path per module in both modes, driven by the flag URL parameter. | CI job (not included) |

## 8. Codemods

Hand-porting hundreds of models is where typos creep in. `codemods/src/extModelToZod.ts` uses the TypeScript compiler API to statically evaluate an `Ext.define` model body and emit:

* a Zod schema (field types, `allowNull`, `presence`/`length`/`range`/`inclusion`/`format`/`email` validators),
* a matching TypeScript interface (inclusion lists become literal unions),
* a `Defaults` object for `defaultValue` (kept out of the schema so form input and output types stay identical),
* a list of derived fields (`calculate`, `persist: false`) that must become selectors.

It refuses to guess: non-literal bodies throw with a line number, unknown types map to `unknown` with a warning, unmapped validators are reported. Run it with `npm run codegen`.

Other codemods worth writing on a real project: `xtype` usage report, `Ext.String.format` key extraction, store-to-query-hook skeletons, ViewModel `bind` to props inventory.

## 9. Rollout and rollback

Resolution order (`packages/bridge/src/featureFlags.ts`):

1. `killSwitch` in the rollout config: forces legacy for everyone.
2. `reactAvailable: false`: the module has no React implementation (or it has not reached parity).
3. `?ui.<module>=react|legacy`: per-module override for QA and support.
4. `?ui=react|legacy`: global override.
5. `localStorage["ui:<module>"]`: per-user choice from the shell toggle.
6. rollout default.

Every resolution returns a `reason`, which the shell logs and shows in the status bar, so support can tell exactly why a user saw a given UI.

Rollout stages per module: internal (URL flag) → opt-in toggle → default-on for a cohort → default-on for everyone → delete the legacy view and its classes. Rollback at any stage is a config change: flip the kill switch, the next navigation mounts the legacy view.

In production the rollout object comes from the flag service at shell boot rather than from a source file.

## 10. Metrics

| Metric | Why | Target used here |
| --- | --- | --- |
| Shell initial JS (gzip) | Legacy users must not pay for React they do not use. | React only in a lazy chunk; legacy entry stays framework-free. |
| Widget chunk size (gzip) | Cost of first React navigation. | ~113 kB gzip for React + TanStack + RHF + Zod; tracked per release. |
| Time to interactive per module | Compare legacy vs React for the same route. | React must be no slower than legacy before default-on. |
| Error rate per module and mode | `widget:error` events from the error boundary carry the widget name. | Equal or lower than legacy. |
| Flag resolution reasons | How many users are on overrides vs defaults. | Overrides trending to zero before deleting legacy. |
| Legacy surface | Count of `Ext.define` classes and LOC still shipped. | Monotonically decreasing. |

## 11. Pitfalls learned

* **Dates.** Ext converts date fields to local `Date` objects. `toISOString()` shifts them across midnight for users east or west of UTC. Format with local getters (`formatIsoDate`).
* **Null sorting.** Ext comparators and table libraries disagree about where nulls go. Pick one rule and enforce it on both sides (nulls last here, via `sortUndefined: 'last'`).
* **In-place mutation.** Ext records mutate; React needs new references. Snapshot in the adapter, never hand raw records to React components.
* **Renderers return HTML.** Ext column renderers concatenate strings into `innerHTML`. Ported renderers must become JSX; any remaining HTML string is an XSS review item.
* **`change` events fire on programmatic `setValue` in Ext.** Logic hooked to `change` often runs on load. In React the equivalent logic belongs in the submit or explicit handler.
* **Define-time evaluation.** Class bodies (including `T('key')` calls and shared array/object configs) run once at load and are shared by all instances.
* **ComponentQuery coupling.** `up('panel').down('grid')` hides dependencies; those become props during migration, which is also when you find the circular ones.
* **z-index and focus traps.** Ext modal masks capture focus; React dialogs must take focus explicitly and give it back.
* **Duplicate React.** Two copies of React (for example a test library pulling a newer peer) break hooks with "invalid hook call". Pin React at the workspace root and check `npm ls react`.
* **Unmount timing.** Unmount React roots in `onDestroy`, before Ext removes the element, and guard against double destroy and late async loads.
* **Library-mode builds** do not replace `process.env.NODE_ENV`; define it, or React ships its development build.
* **Two routers.** Keep URL ownership in the shell until the shell itself is migrated.
