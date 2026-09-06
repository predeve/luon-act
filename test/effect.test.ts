import { expect, test } from "bun:test";
import { effect, state } from "../src/reactive.ts";

test("failed initial effects release their subscriptions", () => {
  const data = state({ count: 0 });
  let calls = 0;
  expect(() => effect(() => {
    calls++;
    void data.count;
    throw new Error("failed");
  })).toThrow("failed");
  data.count++;
  expect(calls).toBe(1);
});
