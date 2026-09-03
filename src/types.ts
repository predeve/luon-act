export type Primitive = bigint | boolean | null | number | string | undefined;

export interface Read<Value = unknown> {
  readonly __act: true;
  readonly dispose?: () => void;
  readonly read: () => Value;
}

export interface Children extends Array<Child> {}

export type Child = Node | Primitive | Read<Child> | Children;

export type Props = {
  children?: Child;
  [name: string]: unknown;
};

export type Component<Value extends Props = Props> = (
  props: Value,
) => Child;

export type Ref<Value extends Node = Node> =
  | { current: Value | null }
  | ((value: Value | null) => void);
