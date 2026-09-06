import { expect, test } from "bun:test";
import { batch, effect, memo, state } from "../src/index.ts";

test("memo caches lazily, changes dependencies and stops on disposal", () => {
  const data = state({ left: 1, right: 10, side: true });
  let calls = 0;
  const value = memo(() => {
    calls++;
    return data.side ? data.left : data.right;
  });
  expect(calls).toBe(0);
  expect(value()).toBe(1);
  expect(value()).toBe(1);
  expect(calls).toBe(1);
  data.right++;
  expect(value()).toBe(1);
  expect(calls).toBe(1);
  data.side = false;
  expect(value()).toBe(11);
  data.left++;
  expect(value()).toBe(11);
  expect(calls).toBe(2);
  value.dispose();
  data.right++;
  expect(calls).toBe(2);
  expect(() => value()).toThrow("disposed");
});

test("direct and diamond dependencies flush once with fresh values", () => {
  const data = state({ n: 1 });
  const twice = memo(() => data.n * 2);
  const triple = memo(() => data.n * 3);
  const total = memo(() => twice() + triple());
  const values: number[][] = [];
  const stop = effect(() => values.push([data.n, total(), twice()]));
  data.n = 2;
  expect(values).toEqual([[1, 5, 2], [2, 10, 4]]);
  batch(() => { data.n = 3; data.n = 4; });
  expect(values).toEqual([[1, 5, 2], [2, 10, 4], [4, 20, 8]]);
  stop();
  total.dispose(); twice.dispose(); triple.dispose();
});

test("failed getters can retry; recursive getters report a cycle", () => {
  const data = state({ fail: true });
  const value = memo(() => {
    if (data.fail) throw Error("not ready");
    return 7;
  });
  expect(() => value()).toThrow("not ready");
  data.fail = false;
  expect(value()).toBe(7);
  const cycle = memo((): number => cycle());
  expect(() => cycle()).toThrow("Circular computed dependency");
  value.dispose(); cycle.dispose();
});

test("a failed update can recover on the next dependency change", () => {
  const data = state({ fail: false, n: 1 });
  const value = memo(() => {
    if (data.fail) throw Error("retry");
    return data.n;
  });
  const seen: number[] = [];
  let other = false;
  const stop = effect(() => { seen.push(value()); });
  const stopOther = effect(() => { other = data.fail; });
  expect(() => { data.fail = true; }).toThrow("retry");
  expect(other).toBeTrue();
  data.fail = false;
  data.n = 2;
  expect(seen).toEqual([1, 1, 2]);
  stop(); stopOther(); value.dispose();
});
