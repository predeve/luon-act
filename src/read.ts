import type { Read } from "./types.ts";

export function act<Value>(read: () => Value): Read<Value> {
  return Object.freeze({ __act: true as const, read });
}

export function isRead(value: unknown): value is Read {
  return !!value
    && typeof value === "object"
    && (value as Partial<Read>).__act === true
    && typeof (value as Partial<Read>).read === "function";
}
