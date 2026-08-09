import { ProtyleMethod } from "siyuan";

export function enhanceSkillPreview(element: HTMLElement): void {
  ProtyleMethod.highlightRender(element);
  ProtyleMethod.mathRender(element, undefined, true);
  ProtyleMethod.mermaidRender(element);
  ProtyleMethod.flowchartRender(element);
  ProtyleMethod.graphvizRender(element);
  ProtyleMethod.chartRender(element);
  ProtyleMethod.abcRender(element);
  ProtyleMethod.mindmapRender(element);
  ProtyleMethod.plantumlRender(element);
  ProtyleMethod.htmlRender(element);
}
