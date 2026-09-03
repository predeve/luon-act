/** @jsxImportSource @luon/act */
import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import {
  act,
  batch,
  effect,
  mount,
  portal,
  state,
  untrack,
  type Child,
} from "../src/index.ts";

const window = new Window({ url: "http://localhost" });
Object.assign(globalThis, {
  document: window.document,
  Element: window.Element,
  Event: window.Event,
  HTMLElement: window.HTMLElement,
  MouseEvent: window.MouseEvent,
  Node: window.Node,
  SVGElement: window.SVGElement,
  window,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("state", () => {
  test("tracks properties and batches repeated writes", () => {
    const data = state({ left: 0, right: 0 });
    let left = 0;
    let right = 0;
    const stopLeft = effect(() => {
      data.left;
      left++;
    });
    const stopRight = effect(() => {
      data.right;
      right++;
    });

    batch(() => {
      data.left++;
      data.left++;
    });

    expect(left).toBe(2);
    expect(right).toBe(1);
    stopLeft();
    stopRight();
  });

  test("tracks nested objects and growing arrays", () => {
    const data = state({ items: [{ name: "A" }] });
    let text = "";
    const stop = effect(() => {
      text = data.items.map((item) => item.name).join(",");
    });

    data.items[0]!.name = "B";
    expect(text).toBe("B");
    data.items.push({ name: "C" });
    expect(text).toBe("B,C");
    stop();
  });

  test("can read state without subscribing the current effect", () => {
    const data = state({ value: 0 });
    let runs = 0;
    const stop = effect(() => {
      runs++;
      untrack(() => data.value);
    });

    data.value = 1;
    expect(runs).toBe(1);
    stop();
  });
});

describe("DOM", () => {
  test("types and connects standard web events", () => {
    let key = "";
    let x = 0;
    const button = (
      <button
        onClick={(event) => x = event.clientX}
        onKeydown={(event) => key = event.key}
      />
    ) as HTMLButtonElement;

    button.dispatchEvent(new window.MouseEvent(
      "click",
      { clientX: 24 },
    ) as unknown as Event);
    button.dispatchEvent(new window.KeyboardEvent(
      "keydown",
      { key: "K" },
    ) as unknown as Event);
    expect({ key, x }).toEqual({ key: "K", x: 24 });
  });

  test("updates text and attributes without rerunning the component", () => {
    const data = state({ count: 0 });
    let renders = 0;
    let reads = 0;

    function Counter() {
      renders++;
      return (
        <button
          class={act(() => data.count ? "active" : "idle")}
          onClick={() => data.count++}
        >
          Count: {act(() => {
            reads++;
            return data.count;
          })}
        </button>
      );
    }

    const close = mount(<Counter />, document.body);
    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Count: 0");
    expect(button.className).toBe("idle");

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(button.textContent).toBe("Count: 1");
    expect(button.className).toBe("active");
    expect(renders).toBe(1);
    expect(reads).toBe(2);

    close();
    data.count++;
    expect(reads).toBe(2);
    expect(document.body.childNodes).toHaveLength(0);
  });

  test("replaces only an explicit reactive region", () => {
    const data = state({ open: true, title: "First" });
    let titleReads = 0;
    const view = (
      <main>
        <h1>Stable</h1>
        {act(() => data.open
          ? (
            <section>
              {act(() => {
                titleReads++;
                return data.title;
              })}
            </section>
          )
          : null)}
      </main>
    );
    const close = mount(view, document.body);
    const heading = document.querySelector("h1");

    data.title = "Second";
    expect(document.querySelector("section")?.textContent).toBe("Second");
    expect(document.querySelector("h1")).toBe(heading);

    data.open = false;
    expect(document.querySelector("section")).toBeNull();
    data.title = "Third";
    expect(titleReads).toBe(2);
    close();
  });

  test("prepares the next reactive region before removing the current one", () => {
    const data = state({ count: 0 });
    let current: HTMLElement | null = null;
    let connected = false;
    const close = mount(act(() => {
      data.count;
      connected = current?.isConnected || false;
      return <span ref={(node: Element | null) => {
        current = node as HTMLElement | null;
      }}>{data.count}</span>;
    }), document.body);

    data.count++;

    const span = document.querySelector("span");
    expect(connected).toBeTrue();
    expect(current as HTMLElement | null).toBe(span);
    expect(span?.textContent).toBe("1");
    close();
    expect(current as HTMLElement | null).toBeNull();
  });

  test("supports classes, styles, html, refs and native properties", () => {
    const data = state({ disabled: false, width: 12 });
    const ref = { current: null as HTMLInputElement | null };
    const view = (
      <section>
        <input
          disabled={act(() => data.disabled)}
          ref={ref}
          value="Luon"
        />
        <div
          class={["card", { active: true }]}
          html="<strong>Act</strong>"
          style={act(() => ({ width: `${data.width}px` }))}
        />
      </section>
    );
    const close = mount(view, document.body);
    const input = document.querySelector("input")!;
    const card = document.querySelector("div")!;

    expect(ref.current).toBe(input);
    expect(input.value).toBe("Luon");
    expect(input.disabled).toBeFalse();
    expect(card.className).toBe("card active");
    expect(card.innerHTML).toBe("<strong>Act</strong>");
    expect(card.style.width).toBe("12px");

    data.disabled = true;
    data.width = 20;
    expect(input.disabled).toBeTrue();
    expect(card.style.width).toBe("20px");

    close();
    expect(ref.current).toBeNull();
  });

  test("writes boolean ARIA state as text", () => {
    const data = state({ open: false });
    const close = mount(
      <button aria-expanded={act(() => data.open)}>Menu</button>,
      document.body,
    );
    const button = document.querySelector("button")!;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    data.open = true;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    close();
  });

  test("protects semantic code from automatic translation", () => {
    const close = mount(
      <section><code class="inline">@luon/act</code><kbd>Ctrl+C</kbd></section>,
      document.body,
    );
    const code = document.querySelector("code")!;
    const key = document.querySelector("kbd")!;

    expect(code.className).toBe("notranslate inline");
    expect(code.getAttribute("translate")).toBe("no");
    expect(key.className).toBe("notranslate");
    expect(key.getAttribute("translate")).toBe("no");
    close();
  });

  test("does not rewrite unchanged reactive DOM values", () => {
    const data = state({ tick: 0 });
    const close = mount(
      <section
        aria-busy={act(() => {
          data.tick;
          return false;
        })}
        html={act(() => {
          data.tick;
          return "<strong>Selection</strong>";
        })}
      />,
      document.body,
    );
    const section = document.querySelector("section")!;
    const content = document.querySelector("strong");
    let writes = 0;
    const set = section.setAttribute.bind(section);
    section.setAttribute = (name, value) => {
      writes++;
      set(name, value);
    };

    data.tick++;

    expect(document.querySelector("strong")).toBe(content);
    expect(writes).toBe(0);
    close();
  });

  test("creates basic SVG nodes in their native namespace", () => {
    const Icon = ({ children }: { children?: Child }) => (
      <svg viewBox="0 0 10 10">{children}</svg>
    );
    const close = mount(
      <Icon><circle cx="5" cy="5" r="4" /></Icon>,
      document.body,
    );

    expect(document.querySelector("svg")?.namespaceURI)
      .toBe("http://www.w3.org/2000/svg");
    expect(document.querySelector("circle")?.namespaceURI)
      .toBe("http://www.w3.org/2000/svg");
    close();
  });

  test("mounts and removes a root fragment", () => {
    const close = mount(
      <>
        <span>A</span>
        <span>B</span>
      </>,
      document.body,
    );

    expect(document.body.textContent).toBe("AB");
    close();
    expect(document.body.childNodes).toHaveLength(0);
  });

  test("updates a reactive region after its root fragment moves", () => {
    const data = state({ open: false });
    const close = mount(<>
      <span>Stable</span>
      {act(() => data.open ? <strong>Open</strong> : null)}
    </>, document.body);

    data.open = true;
    expect(document.querySelector("strong")?.textContent).toBe("Open");
    data.open = false;
    expect(document.querySelector("strong")).toBeNull();
    close();
  });

  test("renders a portal outside its host and cleans it", () => {
    const host = document.createElement("main");
    const target = document.createElement("aside");
    target.id = "portal-target";
    document.body.append(host, target);
    const data = state({ text: "First" });
    const close = mount(portal(
      <strong>{act(() => data.text)}</strong>,
      "#portal-target",
    ), host);

    expect(host.querySelector("strong")).toBeNull();
    expect(target.querySelector("strong")?.textContent).toBe("First");
    data.text = "Second";
    expect(target.querySelector("strong")?.textContent).toBe("Second");

    close();
    expect(target.childNodes).toHaveLength(0);
  });
});
