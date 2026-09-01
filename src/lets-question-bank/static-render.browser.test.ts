import { describe, expect, it } from "vitest";
import {
  renderStaticCode,
  renderStaticContent,
  renderStaticFlowchart,
  renderStaticMath,
  renderStaticMermaid,
  resolveOfficialPasses,
} from "./static-render";

const baseGlobals = {
  unescapeHtml: (value: string) => value,
  macros: {},
  lineWrap: true,
  ligatures: true,
  lineNumbers: false,
  dark: false,
};

function stubWindowSiyuan(): () => void {
  const holder = window as unknown as {siyuan?: unknown};
  const previous = holder.siyuan;
  holder.siyuan = {config: {appearance: {mode: 0}, editor: {}}};
  return () => {
    holder.siyuan = previous;
  };
}

function makeKatex(overrides: Partial<{ throwOnError: boolean }> = {}) {
  const calls: {input: string; displayMode: boolean}[] = [];
  return {
    calls,
    katex: {
      renderToString(input: string, options: Record<string, unknown>) {
        if (overrides.throwOnError) throw new Error("katex boom");
        calls.push({input, displayMode: Boolean(options.displayMode)});
        return `<span class="katex"><span class="base">${input}</span></span>`;
      },
    },
  };
}

function makeMermaid(overrides: Partial<{ throwOn: string }> = {}) {
  const rendered: string[] = [];
  return {
    rendered,
    mermaid: {
      initialize: () => {},
      async render(id: string, text: string) {
        if (overrides.throwOn === text) throw new Error("mermaid boom");
        rendered.push(`${id}:${text}`);
        return {svg: `<svg id="${id}"><text>${text}</text></svg>`};
      },
    },
  };
}

function makeFlowchart() {
  const drawn: string[] = [];
  return {
    drawn,
    flowchart: {
      parse(text: string) {
        return {drawSVG: (target: Element) => {
          drawn.push(text);
          target.innerHTML = `<svg>${text}</svg>`;
        }};
      },
    },
  };
}

function blockRows(container: HTMLElement): HTMLElement {
  return container.querySelector("span") as HTMLElement;
}

describe("kernel ProtyleMethod integration", () => {
  it("probes the kernel's official render passes", () => {
    const passes = resolveOfficialPasses();
    expect(typeof passes?.mathRender).toBe("function");
    expect(typeof passes?.highlightRender).toBe("function");
    expect(typeof passes?.mermaidRender).toBe("function");
  });

  it("prefers official passes and runs them in the app's order", async () => {
    const restore = stubWindowSiyuan();
    try {
      const container = document.createElement("div");
      container.innerHTML = '<span data-subtype="math" data-content="x"></span>';
      const calls: string[] = [];
      await renderStaticContent(container, {
        highlightRender: () => { calls.push("highlight"); },
        mathRender: () => { calls.push("math"); },
        mermaidRender: () => { calls.push("mermaid"); },
        flowchartRender: () => { calls.push("flowchart"); },
        chartRender: () => { calls.push("chart"); },
      });
      expect(calls).toEqual(["highlight", "math", "mermaid", "flowchart", "chart"]);
    } finally {
      restore();
    }
  });

  it("survives an official pass throwing and keeps running the rest", async () => {
    const restore = stubWindowSiyuan();
    try {
      const container = document.createElement("div");
      container.innerHTML = '<span data-subtype="math" data-content="x"></span>';
      await renderStaticContent(container, {
        highlightRender: () => { throw new Error("boom"); },
        mathRender: (element) => {
          element.querySelector("span")!.setAttribute("data-done", "1");
        },
        mermaidRender: () => {},
        flowchartRender: () => {},
      });
      expect(container.querySelector("span")!.getAttribute("data-done")).toBe("1");
    } finally {
      restore();
    }
  });
});

describe("renderStaticMath", () => {
  it("renders block math into the verified render-node shape", () => {
    const container = document.createElement("div");
    // Exact shape returned by kernel getBlockDOM / Lute Md2BlockDOM.
    container.innerHTML = [
      '<div data-type="NodeMathBlock" class="render-node" data-subtype="math" data-content="E=mc^2"><div spin="1"></div><div class="protyle-attr"></div></div>',
      '<span data-type="inline-math" data-subtype="math" data-content="a^2"></span>',
    ].join("");

    const {katex, calls} = makeKatex();
    renderStaticMath(container, {...baseGlobals, katex});

    expect(calls.map((call) => [call.input, call.displayMode])).toEqual([["E=mc^2", true], ["a^2", false]]);

    const block = container.querySelector('[data-subtype="math"]')!;
    expect(block.getAttribute("data-render")).toBe("true");
    const slot = block.firstElementChild!.firstElementChild as HTMLElement;
    expect(slot.getAttribute("contenteditable")).toBe("false");
    expect(slot.innerHTML).toContain("E=mc^2");
    expect(block.innerHTML).toContain("protyle-cursor");
    expect(block.innerHTML).toContain("fn__flex-1");

    const inline = container.querySelector('span[data-type="inline-math"]')!;
    expect(inline.getAttribute("data-render")).toBe("true");
    expect(inline.innerHTML).toContain("a^2");
  });

  it("surfaces katex failures as ft__error text and is idempotent", () => {
    const container = document.createElement("div");
    container.innerHTML = '<span data-subtype="math" data-content="bad"></span>';
    const failing = makeKatex({throwOnError: true});
    renderStaticMath(container, {...baseGlobals, katex: failing.katex});
    const inline = container.querySelector("span[data-subtype=math]")!;
    expect(inline.classList.contains("ft__error")).toBe(true);
    expect(inline.textContent).toBe("katex boom");

    const second = makeKatex();
    renderStaticMath(container, {...baseGlobals, katex: second.katex});
    expect(second.calls).toHaveLength(0);
  });
});

describe("renderStaticMermaid", () => {
  it("renders the diagram into the render-node placeholder", async () => {
    const container = document.createElement("div");
    container.innerHTML = [
      '<div data-type="NodeCodeBlock" class="render-node" data-subtype="mermaid"',
      ' data-content="flowchart TD\\n A -&gt; B"><div spin="1"></div><div class="protyle-attr"></div></div>',
    ].join("");

    const {mermaid, rendered} = makeMermaid();
    await renderStaticMermaid(container, {...baseGlobals, mermaid});

    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain("flowchart TD");
    const block = container.querySelector('[data-subtype="mermaid"]')!;
    expect(block.getAttribute("data-render")).toBe("true");
    expect(block.innerHTML).toContain("<svg");
    expect(block.querySelector(".ft__error")).toBeNull();
  });

  it("shows diagram failures as ft__error and cleans the temp node", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="render-node" data-subtype="mermaid" data-content="broken"><div spin="1"></div></div>';
    const {mermaid} = makeMermaid({throwOn: "broken"});
    await renderStaticMermaid(container, {...baseGlobals, mermaid});
    expect(container.querySelector(".ft__error")?.textContent).toBe("mermaid boom");
    expect(document.getElementById("mermaid-static-2")).toBeNull();
  });
});

describe("renderStaticFlowchart", () => {
  it("draws flowchart blocks into the render-node placeholder", () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="render-node" data-subtype="flowchart" data-content="st=>start: a"><div spin="1"></div></div>';
    const {flowchart, drawn} = makeFlowchart();
    renderStaticFlowchart(container, {...baseGlobals, flowchart});
    expect(drawn).toEqual(["st=>start: a"]);
    expect(container.querySelector('[data-subtype="flowchart"]')!.innerHTML).toContain("<svg");
  });
});

describe("renderStaticCode", () => {
  it("highlights code blocks and hides the line-number gutter by default", () => {
    const container = document.createElement("div");
    container.innerHTML = [
      '<div class="code-block" data-language="python" linewrap="true">',
      '<span class="protyle-linenumber__rows"></span>',
      '<code class="hljs language-python">print(1)</code>',
      "</div>",
    ].join("");

    const calls: {code: string; language: string}[] = [];
    renderStaticCode(container, {
      ...baseGlobals,
      hljs: {
        highlight(code: string, options: {language: string}) {
          calls.push({code, language: options.language});
          return {value: `<span class="hljs-keyword">${code.trim()}</span>`};
        },
        getLanguage: (name: string) => (name === "python" ? {} : undefined),
      },
    });

    expect(calls).toEqual([{code: "print(1)\n", language: "python"}]);
    const code = container.querySelector("code")!;
    expect(code.innerHTML).toContain("print(1)");
    expect(code.style.getPropertyValue("white-space")).toBe("pre-wrap");
    const rows = blockRows(container);
    expect(rows.className).toBe("fn__none");
    expect(rows.innerHTML).toBe("");
  });

  it("falls back to plaintext for unknown languages", () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="code-block"><code class="hljs">mystery</code></div>';
    const calls: {language: string}[] = [];
    renderStaticCode(container, {
      ...baseGlobals,
      hljs: {
        highlight(code: string, options: {language: string}) {
          calls.push({language: options.language});
          return {value: code};
        },
        getLanguage: () => undefined,
      },
    });
    expect(calls).toEqual([{language: "plaintext"}]);
  });

  it("does not re-highlight already rendered blocks", () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="code-block"><code class="hljs language-python">x</code></div>';
    const calls: unknown[] = [];
    const hljs = {
      highlight(code: string) {
        calls.push(code);
        return {value: code};
      },
      getLanguage: () => ({}),
    };
    renderStaticCode(container, {...baseGlobals, hljs});
    renderStaticCode(container, {...baseGlobals, hljs});
    expect(calls).toHaveLength(1);
  });
});
