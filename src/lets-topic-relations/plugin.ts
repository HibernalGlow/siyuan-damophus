import type { PluginMetadata } from "@/types/plugin";
import {
  DEFAULT_MOBILE_PANEL_HEIGHT,
  DEFAULT_SOURCE_PRIORITY,
  DEFAULT_TOPIC_RELATION_STYLE,
} from "./topic-relations";

export const pluginMetadata: PluginMetadata = {
  name: "topicRelations",
  displayName: "lets-topic-relations.displayName",
  description: "lets-topic-relations.description",
  version: "1.0.0",
  enabled: true,
  icon: "network",
  settings: [
    {
      type: "select",
      title: "lets-topic-relations.displayModeTitle",
      description: "lets-topic-relations.displayModeDescription",
      key: "displayMode",
      value: "compact",
      options: {
        compact: "lets-topic-relations.displayModeCompact",
        summary: "lets-topic-relations.displayModeSummary",
        expanded: "lets-topic-relations.displayModeExpanded",
      },
    },
    {
      type: "checkbox",
      title: "lets-topic-relations.nativeHoverTitle",
      description: "lets-topic-relations.nativeHoverDescription",
      key: "nativeHover",
      value: true,
    },
    {
      type: "textarea",
      title: "lets-topic-relations.sourcePriorityTitle",
      description: "lets-topic-relations.sourcePriorityDescription",
      key: "sourcePriority",
      value: DEFAULT_SOURCE_PRIORITY,
      placeholder: DEFAULT_SOURCE_PRIORITY,
      height: "150px",
    },
    {
      type: "number",
      title: "lets-topic-relations.mobilePanelHeightTitle",
      description: "lets-topic-relations.mobilePanelHeightDescription",
      key: "mobilePanelHeight",
      value: DEFAULT_MOBILE_PANEL_HEIGHT,
      placeholder: String(DEFAULT_MOBILE_PANEL_HEIGHT),
    },
    {
      type: "textarea",
      title: "lets-topic-relations.customStyleTitle",
      description: "lets-topic-relations.customStyleDescription",
      key: "customStyle",
      value: DEFAULT_TOPIC_RELATION_STYLE,
      placeholder: "border-left-color: var(--b3-theme-primary);",
      height: "150px",
    },
  ],
};

export default pluginMetadata;
