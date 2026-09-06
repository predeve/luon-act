export type Memo<Value> = (() => Value) & { dispose(): void };

type Dep = Set<Runner>;
type Key = PropertyKey | typeof iterate;

type Runner = {
  active: boolean;
  deps: Set<Dep>;
  run: () => void;
  invalidate?: () => void;
};

const iterate = Symbol("iterate");
const targets = new WeakMap<object, Map<Key, Dep>>();
const proxies = new WeakMap<object, object>();
const values = new WeakMap<object, object>();
const queued = new Set<Runner>();

let current: Runner | undefined;
let depth = 0;
let flushing = false;

function observable(value: object) {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function raw<Value>(value: Value): Value {
  if (!value || typeof value !== "object") return value;
  return (values.get(value) || value) as Value;
}

function dep(target: object, key: Key) {
  let map = targets.get(target);
  if (!map) targets.set(target, map = new Map());
  let found = map.get(key);
  if (!found) map.set(key, found = new Set());
  return found;
}

function track(target: object, key: Key) {
  if (!current?.active) return;
  const found = dep(target, key);
  found.add(current);
  current.deps.add(found);
}

function clean(run: Runner) {
  for (const found of run.deps) found.delete(run);
  run.deps.clear();
}

function execute(run: Runner) {
  if (!run.active) return;
  clean(run);
  const previous = current;
  current = run;
  try {
    run.run();
  } finally {
    current = previous;
  }
}

function flush() {
  if (flushing || depth) return;
  flushing = true;
  const errors: unknown[] = [];
  try {
    while (queued.size) {
      const runs = [...queued];
      queued.clear();
      for (const run of runs) {
        try { execute(run); } catch (error) { errors.push(error); }
      }
    }
  } finally {
    flushing = false;
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Reactive updates failed.");
}

function schedule(runs: Iterable<Runner>) {
  // Invalidate every derived value before flushing any consumer.
  depth++;
  try {
    for (const run of runs) {
      if (!run.active || run === current) continue;
      if (run.invalidate) run.invalidate();
      else queued.add(run);
    }
  } finally {
    depth--;
    flush();
  }
}

function trigger(target: object, key: PropertyKey, added = false) {
  const map = targets.get(target);
  if (!map) return;
  const runs = new Set<Runner>();
  for (const run of map.get(key) || []) runs.add(run);
  if (added) {
    for (const run of map.get(iterate) || []) runs.add(run);
    if (Array.isArray(target)) {
      for (const run of map.get("length") || []) runs.add(run);
    }
  }
  if (Array.isArray(target) && key === "length") {
    const length = target.length;
    for (const [name, found] of map) {
      if (typeof name !== "string" || !/^\d+$/.test(name)) continue;
      if (Number(name) < length) continue;
      for (const run of found) runs.add(run);
    }
  }
  schedule(runs);
}

export function effect(run: () => void) {
  const task: Runner = {
    active: true,
    deps: new Set(),
    run,
  };
  try {
    execute(task);
  } catch (error) {
    task.active = false;
    queued.delete(task);
    clean(task);
    throw error;
  }
  return () => {
    if (!task.active) return;
    task.active = false;
    queued.delete(task);
    clean(task);
  };
}

/** Lazy derived value. Dispose it when its owner is released. */
export function memo<Value>(get: () => Value): Memo<Value> {
  const target = {};
  let dirty = true;
  let reading = false;
  let failed = false;
  let value: Value;
  const task: Runner = {
    active: true,
    deps: new Set(),
    run: () => { value = get(); },
    invalidate() {
      if (dirty && !failed) return;
      dirty = true;
      failed = false;
      trigger(target, "value");
    },
  };
  const read = () => {
    if (!task.active) throw new Error("Cannot read a disposed memo.");
    if (reading) throw new Error("Circular computed dependency.");
    track(target, "value");
    if (dirty) {
      reading = true;
      try {
        execute(task);
        dirty = false;
        failed = false;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        reading = false;
      }
    }
    return value;
  };
  return Object.freeze(Object.assign(read, {
    dispose() {
      if (!task.active) return;
      task.active = false;
      clean(task);
      queued.delete(task);
    },
  }));
}

export function batch<Value>(run: () => Value): Value {
  depth++;
  try {
    return run();
  } finally {
    depth--;
    flush();
  }
}

export function untrack<Value>(run: () => Value): Value {
  const previous = current;
  current = undefined;
  try {
    return run();
  } finally {
    current = previous;
  }
}

export function state<Value extends object>(source: Value): Value {
  if (!observable(source)) {
    throw new Error("Luon state must be an object or array");
  }
  if (values.has(source)) return source;
  const found = proxies.get(source);
  if (found) return found as Value;

  const proxy = new Proxy(source, {
    deleteProperty(target, key) {
      if (!Object.hasOwn(target, key)) return true;
      const removed = Reflect.deleteProperty(target, key);
      if (removed) trigger(target, key, true);
      return removed;
    },
    get(target, key, receiver) {
      track(target, key);
      const result = Reflect.get(target, key, receiver);
      if (!result || typeof result !== "object") return result;
      if (!observable(result)) return result;
      return state(result);
    },
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      track(target, iterate);
      return Reflect.ownKeys(target);
    },
    set(target, key, next) {
      const added = !Object.hasOwn(target, key);
      const previous = Reflect.get(target, key);
      const value = raw(next);
      if (Object.is(previous, value)) return true;
      const saved = Reflect.set(target, key, value);
      if (saved) trigger(target, key, added);
      return saved;
    },
  });

  proxies.set(source, proxy);
  values.set(proxy, source);
  return proxy;
}
