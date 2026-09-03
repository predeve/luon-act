import type { Child, Component, Props } from "./types.ts";

import { Fragment, jsx } from "./dom.ts";
export { Fragment, jsx, jsxs } from "./dom.ts";

export function jsxDEV(
  type: string | Component<any> | typeof Fragment,
  props: Props,
  key?: unknown,
) {
  return jsx(type, props, key);
}

export type DomEvents = {
  [Name in keyof GlobalEventHandlersEventMap as
    `on${Capitalize<Name & string>}`]?: (
      event: GlobalEventHandlersEventMap[Name],
    ) => unknown;
};

type Attrs = Props & DomEvents & {
  class?: unknown;
  className?: unknown;
  html?: unknown;
  ref?: unknown;
};

export namespace JSX {
  export type Element = Child;
  export type ElementType = string | Component<any>;
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export interface IntrinsicAttributes {
    key?: unknown;
  }
  export interface IntrinsicElements {
    [name: string]: Attrs;
  }
}
