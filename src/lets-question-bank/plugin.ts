import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "questionBank",
  displayName: "lets-question-bank.displayName",
  description: "lets-question-bank.description",
  version: "1.0.0",
  author: "HibernalGlow",
  enabled: true,
  settings: [
    {
      type: "number",
      title: "lets-question-bank.reviewThreshold",
      description: "lets-question-bank.reviewThresholdDescription",
      key: "reviewThreshold",
      value: 2,
    },
    {
      type: "checkbox",
      title: "lets-question-bank.autoAddQuickCards",
      description: "lets-question-bank.autoAddQuickCardsDescription",
      key: "autoAddQuickCards",
      value: true,
    },
    {
      type: "number",
      title: "lets-question-bank.autoCardThreshold",
      description: "lets-question-bank.autoCardThresholdDescription",
      key: "autoCardThreshold",
      value: 2,
    },
  ],
};

export default pluginMetadata;
