import { afterEach, describe, expect, it, vi } from "vitest";
import { MoreBackgroundController, type MoreBackgroundOptions } from "./more-background";

const BLOCK_ID = "20260315144700-jocgd43";

interface AttrStore {
  attrs: Record<string, string>;
}

function renderDoc(): { root: HTMLElement; background: HTMLElement; img: HTMLImageElement } {
  document.body.innerHTML = `
    <div class="protyle">
      <div class="protyle-title" data-node-id="${BLOCK_ID}"></div>
      <div class="protyle-background" data-node-id="${BLOCK_ID}">
        <div class="protyle-background__img"><img src="https://example.com/cover.jpg"></div>
        <div class="protyle-background__ia"></div>
      </div>
      <div class="protyle-wysiwyg"></div>
    </div>`;
  const root = document.querySelector<HTMLElement>(".protyle")!;
  const background = root.querySelector<HTMLElement>(".protyle-background")!;
  const img = background.querySelector<HTMLImageElement>("img")!;
  return { root, background, img };
}

function buildOptions(directDrag: boolean): MoreBackgroundOptions {
  return {
    width: 1920,
    height: 1080,
    assetsLocation: "/assets/more-background",
    readFromAssets: false,
    writeToAssets: false,
    localCache: false,
    autoCacheLegacyCovers: false,
    localCacheRoot: "/storage/petal/siyuan-damophus/more-background/covers",
    localCachePathTemplate: "{year}/{month}/{hash}.webp",
    localCacheMaxEdge: "1920",
    directDrag,
    t: (key: string) => key,
  } as MoreBackgroundOptions;
}

/** 拦截 /api/attr/* 请求，用内存 store 模拟 kernel 属性读写 */
function mockAttrApi(initial: Record<string, string>): AttrStore & { setCalls: Array<Record<string, string>> } {
  const store: AttrStore = { attrs: { ...initial } };
  const setCalls: Array<Record<string, string>> = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/api/attr/getBlockAttrs")) {
      return new Response(JSON.stringify({ code: 0, data: { ...store.attrs } }));
    }
    if (url.includes("/api/attr/setBlockAttrs")) {
      setCalls.push(body.attrs);
      Object.assign(store.attrs, body.attrs);
      return new Response(JSON.stringify({ code: 0, data: null }));
    }
    return realFetch(input, init);
  }) as typeof fetch);
  return { attrs: store.attrs, setCalls };
}

/** 真实浏览器事件序列：mousedown 在 img 上，move/up 派发到 window（模拟官方拖拽后插件监听的窗口事件） */
async function dragCover(img: HTMLImageElement, fromY: number, toY: number): Promise<void> {
  img.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientY: fromY, button: 0 }));
  await new Promise((r) => setTimeout(r, 20));
  window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientY: toY }));
  await new Promise((r) => setTimeout(r, 20));
  window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientY: toY, button: 0 }));
  await new Promise((r) => setTimeout(r, 20));
}

describe("more-background cover position drag persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("directDrag: mousedown+move+mouseup writes position attr and stable title-img", async () => {
    const { root, img } = renderDoc();
    const api = mockAttrApi({
      "title-img": `background-image:url("https://example.com/cover.jpg")`,
    });
    const controller = new MoreBackgroundController(buildOptions(true));
    controller.scanRoot(root);

    // containerHeight 兜底 200px：拖 100px → 50% + 初始 50% → 截断为 100
    await dragCover(img, 300, 200);
    await new Promise((r) => setTimeout(r, 200));

    const posCall = api.setCalls.find((c) => "custom-damophus-cover-position" in c);
    expect(posCall).toBeDefined();
    expect(posCall!["custom-damophus-cover-position"]).toBe("100");
    expect(posCall!["title-img"]).toContain("https://example.com/cover.jpg");
    expect(posCall!["title-img"]).not.toContain("blob:");
    controller.dispose();
  });

  it("long-press mode: 300ms hold then move saves position", async () => {
    const { root, img } = renderDoc();
    const api = mockAttrApi({
      "title-img": `background-image:url("assets/img-20260101-abcd.jpeg")`,
    });
    const controller = new MoreBackgroundController(buildOptions(false));
    controller.scanRoot(root);

    img.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientY: 300, button: 0 }));
    // 长按 300ms 阈值激活
    await new Promise((r) => setTimeout(r, 420));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientY: 150 }));
    await new Promise((r) => setTimeout(r, 30));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientY: 150, button: 0 }));
    await new Promise((r) => setTimeout(r, 250));

    const posCall = api.setCalls.find((c) => "custom-damophus-cover-position" in c);
    expect(posCall).toBeDefined();
    expect(posCall!["title-img"]).toContain("assets/img-20260101-abcd.jpeg");
    controller.dispose();
  });

  it("official-style confirm path: blob title-img gets healed even with localCache disabled", async () => {
    const { root, background, img } = renderDoc();
    const api = mockAttrApi({
      "title-img": `background-image:url("blob:http://127.0.0.1:6806/dead");object-position:center 30%`,
      "custom-damophus-cover-source-url": "https://example.com/cover.jpg",
      "custom-damophus-cover-cache-path": "/storage/petal/x.webp",
    });
    // localCache: false —— 官方路径的自愈绝不能依赖缓存开关
    const controller = new MoreBackgroundController(buildOptions(false));
    controller.scanRoot(root);
    // 官方确认后 render 会用 title-img 的 blob 重载 img src，触发 MutationObserver
    img.setAttribute("src", "blob:http://127.0.0.1:6806/new-blob-from-render");
    await new Promise((r) => setTimeout(r, 1200));

    const healCall = api.setCalls.find(
      (c) => "title-img" in c && String(c["title-img"]).includes("https://example.com/cover.jpg"),
    );
    expect(healCall).toBeDefined();
    // 官方确认的位置（30%）必须保留进自愈结果与块属性
    expect(healCall!["title-img"]).toContain("30%");
    expect(api.attrs["custom-damophus-cover-position"]).toBe("30");
    // 绝不能清掉元数据
    expect(api.attrs["custom-damophus-cover-source-url"]).toBe("https://example.com/cover.jpg");
    expect(background).toBeTruthy();
    controller.dispose();
  });
});
