# @luon/act

Part of [Luon](https://www.luon.dev) — Direct reactive DOM core for Luon.

[Package guide](https://pkg.luon.dev/packages/act/) ·
[Source](https://github.com/predeve/luon-act) ·
[Developer tools](https://www.luon.dev/tools)

## Install

```bash
bun add @luon/act --registry https://pkg.luon.dev
```

## Who it is for

Luon Site authors who want to understand the renderer, plus View, UI, and low-level browser package authors using it directly.

## Core concepts

### Luon's renderer

Act occupies the position held by React and React DOM in a typical React application, while View provides Luon's public authoring syntax.

### Original implementation

Act is developed by Luon for native DOM rendering. It is not a React or Preact fork, wrapper, compatibility layer, or reduced bundle.

### Direct native DOM

JSX creates HTML and SVG nodes directly without a Virtual DOM or a permanent component tree to reconcile.

### Property tracking

state tracks the object properties read by an effect and updates only the dependent work.

### Explicit regions

act marks a reactive child, event, attribute, property, class, style, or HTML boundary without rebuilding the surrounding component.

### Deterministic cleanup

mount returns a close function and reactive regions dispose their effects when removed.

## Quick reference

### Reactive primitives

Pick the smallest primitive that owns the update.

| API | Use it for | Returns |
| --- | --- | --- |
| state(object) | Property-level reactive state | Reactive Proxy |
| act(read) | One reactive DOM value or region | Read value |
| effect(run) | Non-DOM reactive side effects | Stop function |
| batch(run) | Several related writes | Callback result |
| untrack(run) | Read without subscribing | Callback result |
| mount(child, root) | Own a complete DOM tree | Close function |

### DOM boundaries

Act writes native DOM values and keeps cleanup beside each region.

| Syntax | Native behavior |
| --- | --- |
| class / className | Strings, arrays, and condition objects |
| style | CSS text or a camelCase property object |
| onClick / onInput | Native addEventListener handlers |
| ref | Callback or current object lifecycle |
| html | Trusted innerHTML; no sanitization |
| portal(child, target) | Reactive children in another DOM root |

### Choose the authoring layer

Most application code belongs in View, while Act stays the engine.

| Need | Start with |
| --- | --- |
| Site screen, state, style, lifecycle | @luon/view |
| Ready-made Site component | @luon/ui |
| Renderer or low-level DOM component | @luon/act |
| Pages, APIs, tasks, build | @luon/runtime |

## Examples

### Mount a reactive counter

Low-level Act code marks only the text that needs to change.

```tsx
/** @jsxImportSource @luon/act */
import { act, mount, state } from "@luon/act";

const data = state({ count: 0 });
const close = mount(
  <button onClick={() => data.count++}>
    Count: {act(() => data.count)}
  </button>,
  document.querySelector("#app")!,
);

close();
```

### Update a native property and class

A reactive read can drive DOM properties and normalized class values.

```tsx
const form = state({ disabled: false, ready: true });

mount(
  <button
    class={act(() => ({ ready: form.ready }))}
    disabled={act(() => form.disabled)}
  >
    Save
  </button>,
  document.body,
);
```

### Batch related state writes

Dependent effects flush after the outer batch completes.

```ts
import { batch, effect, state } from "@luon/act";

const data = state({ first: "", last: "" });
effect(() => {
  document.title = [data.first, data.last].filter(Boolean).join(" ");
});

batch(() => {
  data.first = "Luon";
  data.last = "Act";
});
```

### Own an effect lifecycle

Stopping an effect removes every property dependency it recorded.

```ts
import { effect, state } from "@luon/act";

const data = state({ query: "" });
const stop = effect(() => {
  document.title = data.query || "Luon";
});

data.query = "Native DOM";
stop();
```

### Render a portal and clean it up

The portal keeps its reactive region under the parent mount lifecycle.

```tsx
/** @jsxImportSource @luon/act */
import { act, mount, portal, state } from "@luon/act";

const data = state({ open: true });
const close = mount(
  <main>
    <button onClick={() => data.open = !data.open}>Toggle</button>
    {portal(act(() => data.open ? <aside>Inspector</aside> : null), "#layer")}
  </main>,
  document.querySelector("#app")!,
);

close();
```

## API reference

### `state(value)`

Create a deeply tracked plain object or array Proxy.

### `act(read)`

Create an explicit reactive child, prop, event, or DOM region.

### `effect(run)`

Run immediately, track property reads, and return a stop function.

### `batch(run)`

Return the callback value after grouping dependent effect flushes.

### `untrack(run)`

Read reactive state without adding dependencies to the current effect.

### `mount(child, root)`

Connect a Child to an Element or Fragment and return its close function.

### `portal(child, target)`

Mount a reactive child into another element while retaining cleanup.

### `bindProps(element, props)`

Attach Act attributes, events, properties, and cleanup to existing DOM.

### `jsx / jsxs / Fragment`

Automatic JSX runtime entries used by Bun and TypeScript.

### `Child / Children`

Native nodes, primitives, reactive reads, and nested child arrays.

### `Component<Props>`

A function that accepts Act props and returns one Child.

### `Read<Value>`

The frozen reactive read contract returned by act.

### `Ref<Value>`

A callback or current object updated on connection and cleanup.

## Runtime flow

1. Bun transforms TSX into Act JSX calls.
2. Act components create native HTML and SVG nodes.
3. Reactive reads register their property dependencies.
4. Writes update only dependent effects and explicit DOM regions.
5. Removing a mounted region disposes its effects, nested regions, and refs.

## Boundaries

- Act is the official Luon Site renderer, not an experimental React bridge.
- Site authors normally write @luon/view source instead of manual act reads.
- state accepts plain objects and arrays; Date, Map, Set, DOM nodes, and class instances preserve their identity.
- The html prop writes trusted innerHTML and does not sanitize input.
- Routing, server execution, SSR, hydration, Hooks, Context, SyntheticEvent, and React source compatibility are outside this package.

## More documentation

- [Live Act examples](https://act.luon.dev)
- [View language](https://docs.luon.dev/frontend/view)
- [UI and styling](https://docs.luon.dev/frontend/ui)
