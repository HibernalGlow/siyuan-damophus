/**
 * Augmentation for the petal "siyuan" module: recent SiYuan versions expose
 * the editor's real render passes to plugins via API.ProtyleMethod
 * (app/src/plugin/ProtyleMethod.ts, injected as require("siyuan") by
 * app/src/plugin/loader.ts). The published petal types do not declare it yet,
 * so declare the members we consume here. Access is always defensive — older
 * kernels simply yield undefined.
 */
declare module "siyuan" {
  export interface ProtyleMethodStatic {
    graphvizRender(element: Element, cdn?: string): void;
    highlightRender(element: Element, cdn?: string, zoom?: number): void;
    mathRender(element: Element, cdn?: string, maxWidth?: boolean): void;
    mermaidRender(element: Element, cdn?: string): void;
    flowchartRender(element: Element, cdn?: string): void;
    chartRender(element: Element, cdn?: string): void;
    abcRender(element: Element, cdn?: string): void;
    mindmapRender(element: Element, cdn?: string): void;
    plantumlRender(element: Element, cdn?: string): void;
    avRender(element: Element, cdn?: string): void;
    htmlRender(element: Element): void;
  }

  export const ProtyleMethod: ProtyleMethodStatic | undefined;
}

// Without a top-level export this file is a global script and its
// `declare module "siyuan"` shadows the petal types entirely (every other
// import from "siyuan" reports a missing export). The export turns the
// declaration into a proper module augmentation merged with petal's types.
export {};
