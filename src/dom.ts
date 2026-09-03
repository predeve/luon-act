import { effect } from "./reactive.ts";
import { isRead } from "./read.ts";
import type { Child, Component, Props, Read, Ref } from "./types.ts";

type Host = Node & ParentNode;
type Clean = () => void;

const cleans = new WeakMap<Node, Set<Clean>>();
const callbackRefs = new WeakMap<Function, Element>();
const contextKey = Symbol.for("@luon/act/context");
const childrenKey = Symbol.for("@luon/act/children");
let refQueue: Array<() => void> | undefined;
const Fragment = Symbol("Fragment");
const svgNs = "http://www.w3.org/2000/svg";
const noTranslateTags = new Set(["code", "kbd", "pre", "samp"]);

const svgTags = new Set([
  "animate",
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "foreignObject",
  "g",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "symbol",
  "text",
  "textPath",
  "use",
]);

const props = new Set([
  "checked",
  "disabled",
  "indeterminate",
  "multiple",
  "muted",
  "open",
  "selected",
  "tabIndex",
  "value",
]);

const eventNames: Record<string, string> = {
  doubleclick: "dblclick",
};

function own(node: Node, clean: Clean) {
  let found = cleans.get(node);
  if (!found) cleans.set(node, found = new Set());
  found.add(clean);
}

function drop(node: Node) {
  const found = cleans.get(node);
  if (found) {
    cleans.delete(node);
    for (const clean of found) clean();
  }
  for (const child of [...node.childNodes]) drop(child);
}

function nodeValue(value: unknown): value is Node {
  return !!value
    && typeof value === "object"
    && typeof (value as Node).nodeType === "number";
}

function classText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(classText).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, active]) => active)
      .map(([name]) => name)
      .join(" ");
  }
  return "";
}

function cssName(name: string) {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (part) => `-${part.toLowerCase()}`);
}

function styleValue(
  style: CSSStyleDeclaration,
  value: unknown,
  previous?: unknown,
) {
  if (typeof value === "string") {
    if (style.cssText !== value) style.cssText = value;
    return;
  }
  if (!value || typeof value !== "object") {
    if (style.cssText) style.cssText = "";
    return;
  }
  if (previous && typeof previous === "object") {
    for (const name of Object.keys(previous)) {
      if (!(name in value)) style.removeProperty(cssName(name));
    }
  } else {
    style.cssText = "";
  }
  for (const [name, item] of Object.entries(value)) {
    const key = cssName(name);
    if (item == null || item === false) {
      if (style.getPropertyValue(key)) style.removeProperty(key);
    } else {
      const text = String(item);
      if (style.getPropertyValue(key) !== text) style.setProperty(key, text);
    }
  }
}

function attrName(name: string) {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name;
}

function write(
  element: Element,
  source: string,
  value: unknown,
  previous?: unknown,
) {
  const name = attrName(source);
  if (name === "class") {
    const text = classText([
      noTranslateTags.has(element.localName) && "notranslate",
      value,
    ]);
    if (text && element.getAttribute("class") !== text) {
      element.setAttribute("class", text);
    } else if (!text && element.hasAttribute("class")) {
      element.removeAttribute("class");
    }
    return;
  }
  if (name === "translate" && noTranslateTags.has(element.localName)) {
    if (element.getAttribute(name) !== "no") element.setAttribute(name, "no");
    return;
  }
  if (name === "style" && "style" in element) {
    const style = (element as Element & {
      style: CSSStyleDeclaration;
    }).style;
    styleValue(style, value, previous);
    return;
  }
  if (name === "html") {
    const text = value == null ? "" : String(value);
    if (element.innerHTML !== text) element.innerHTML = text;
    return;
  }
  if (name.startsWith("aria-")) {
    if (value == null) element.removeAttribute(name);
    else {
      const text = String(value);
      if (element.getAttribute(name) !== text) {
        element.setAttribute(name, text);
      }
    }
    return;
  }
  if (props.has(name) && name in element) {
    const next = value ?? (name === "value" ? "" : false);
    if (!Object.is(Reflect.get(element, name), next)) {
      Reflect.set(element, name, next);
    }
    return;
  }
  if (value == null || value === false) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (value === true) {
    if (element.getAttribute(name) !== "") element.setAttribute(name, "");
  } else {
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
}

function eventName(name: string) {
  const source = name.slice(2).toLowerCase();
  return eventNames[source] || source;
}

function bindEvent(element: Element, name: string, source: unknown) {
  let current: EventListenerOrEventListenerObject | undefined;
  const update = (value: unknown) => {
    const type = eventName(name);
    if (current) element.removeEventListener(type, current);
    current = typeof value === "function"
      || value && typeof value === "object" && "handleEvent" in value
      ? value as EventListenerOrEventListenerObject
      : undefined;
    if (current) element.addEventListener(type, current);
  };
  let stop: Clean | undefined;
  if (isRead(source)) stop = effect(() => update(source.read()));
  else update(source);
  own(element, () => {
    stop?.();
    if (current) element.removeEventListener(eventName(name), current);
  });
}

function bindRef(element: Element, source: unknown) {
  const ref = source as Ref<Element> | undefined;
  let connected = false;
  if (typeof ref === "function") {
    const connect = () => {
      connected = true;
      callbackRefs.set(ref, element);
      ref(element);
    };
    if (refQueue) refQueue.push(connect);
    else connect();
    own(element, () => {
      if (!connected) return;
      if (callbackRefs.get(ref) !== element) return;
      callbackRefs.delete(ref);
      ref(null);
    });
  } else if (ref && typeof ref === "object" && "current" in ref) {
    const connect = () => {
      connected = true;
      ref.current = element;
    };
    if (refQueue) refQueue.push(connect);
    else connect();
    own(element, () => {
      if (!connected) return;
      if (ref.current === element) ref.current = null;
    });
  }
}

function bindProp(element: Element, name: string, source: unknown) {
  if (name.startsWith("on") && name.length > 2) {
    bindEvent(element, name, source);
    return;
  }
  if (name === "ref") {
    bindRef(element, source);
    return;
  }
  if (!isRead(source)) {
    write(element, name, source);
    return;
  }
  let previous: unknown;
  const stop = effect(() => {
    const value = source.read();
    write(element, name, value, previous);
    previous = value;
  });
  own(element, stop);
}

export function bindProps(element: Element, values: Props) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "children" || name === "key") continue;
    bindProp(element, name, value);
  }
  return element;
}

function remove(nodes: Node[]) {
  for (const node of nodes) {
    drop(node);
    node.parentNode?.removeChild(node);
  }
}

function insertRead(host: Host, source: Read, before: Node | null) {
  const start = document.createComment("act");
  const end = document.createComment("/act");
  const context = Reflect.get(source, contextKey);
  if (context) {
    Reflect.set(start, contextKey, context);
    Reflect.set(end, contextKey, context);
  }
  host.insertBefore(start, before);
  host.insertBefore(end, before);
  let nodes: Node[] = [];
  const stop = effect(() => {
    const parent = end.parentNode as Host | null;
    if (!parent) return;
    const fragment = document.createDocumentFragment();
    const parentQueue = refQueue;
    const refs = parentQueue || [];
    if (!parentQueue) refQueue = refs;
    let next: Node[];
    try {
      next = insert(fragment, source.read() as Child, null);
    } finally {
      if (!parentQueue) refQueue = undefined;
    }
    remove(nodes);
    parent.insertBefore(fragment, end);
    nodes = next;
    if (!parentQueue) {
      for (const connect of refs) connect();
    }
  });
  own(start, () => {
    stop();
    source.dispose?.();
    remove(nodes);
    nodes = [];
  });
  return [start, end];
}

function insert(host: Host, value: Child, before: Node | null): Node[] {
  if (isRead(value)) return insertRead(host, value, before);
  if (Array.isArray(value)) {
    return value.flatMap((item) => insert(host, item, before));
  }
  if (nodeValue(value)) {
    if (value.nodeType === 11) {
      const nodes = [...value.childNodes];
      host.insertBefore(value, before);
      return nodes;
    }
    host.insertBefore(value, before);
    return [value];
  }
  if (value == null || typeof value === "boolean") return [];
  const text = document.createTextNode(String(value));
  host.insertBefore(text, before);
  return [text];
}

function element(name: string) {
  const node = svgTags.has(name)
    ? document.createElementNS(svgNs, name)
    : document.createElement(name);
  if (noTranslateTags.has(name)) {
    node.classList.add("notranslate");
    node.setAttribute("translate", "no");
  }
  return node;
}

export function jsx(
  type: string | Component<any> | typeof Fragment,
  source: Props | null,
  _key?: unknown,
): Child {
  const values = source || {};
  if (type === Fragment) {
    const fragment = document.createDocumentFragment();
    insert(fragment, values.children as Child, null);
    return fragment;
  }
  if (typeof type === "function") return type(values);

  const node = element(type);
  bindProps(node, values);
  if (!("html" in values)) {
    insert(node, values.children as Child, null);
  }
  return node;
}

export const jsxs = jsx;
export { Fragment };

export function mount(view: Child, host: Element | DocumentFragment) {
  let nodes = insert(host, view, null);
  return () => {
    remove(nodes);
    nodes = [];
  };
}

export type PortalTarget = Element | DocumentFragment | string;

export function portal(view: Child, target: PortalTarget): Read<Child> {
  let close: Clean | undefined;
  let marker: Comment | undefined;
  const clean = () => {
    close?.();
    close = undefined;
  };
  const resolve = () => (
    typeof target === "string" ? document.querySelector(target) : target
  );
  return Object.freeze({
    __act: true as const,
    [childrenKey]: view,
    dispose: clean,
    read() {
      if (!marker) {
        marker = document.createComment("portal");
        own(marker, clean);
      }
      if (!close) {
        const host = resolve();
        if (!host) {
          throw new Error("Luon Portal target is not available.");
        }
        close = mount(view, host);
      }
      return marker;
    },
  });
}
