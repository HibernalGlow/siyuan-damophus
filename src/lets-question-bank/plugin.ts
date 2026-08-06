import type { PluginMetadata } from "@/types/plugin";
import { DEFAULT_ANSWER_MASK_STYLE } from "./source-answer-mask";

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
      title: "lets-question-bank.autoCardHardThreshold",
      description: "lets-question-bank.autoCardHardThresholdDescription",
      key: "autoCardHardThreshold",
      value: 1,
    },
    {
      type: "number",
      title: "lets-question-bank.autoCardAgainThreshold",
      description: "lets-question-bank.autoCardAgainThresholdDescription",
      key: "autoCardAgainThreshold",
      value: 2,
    },
    {
      type: "checkbox",
      title: "lets-question-bank.autoSyncIndex",
      description: "lets-question-bank.autoSyncIndexDescription",
      key: "autoSyncIndex",
      value: false,
    },
    {
      type: "checkbox",
      title: "lets-question-bank.autoScanDocument",
      description: "lets-question-bank.autoScanDocumentDescription",
      key: "autoScanDocument",
      value: false,
    },
    {
      type: "checkbox",
      title: "lets-question-bank.inheritSourceStyles",
      description: "lets-question-bank.inheritSourceStylesDescription",
      key: "inheritSourceStyles",
      value: true,
    },
    {
      type: "select",
      title: "lets-question-bank.questionRenderMode",
      description: "lets-question-bank.questionRenderModeDescription",
      key: "questionRenderMode",
      value: "native",
      options: {
        html: "lets-question-bank.questionRenderModeHtml",
        native: "lets-question-bank.questionRenderModeNative",
        embed: "lets-question-bank.questionRenderModeEmbed",
      },
    },
    {
      type: "checkbox",
      title: "lets-question-bank.timingEnabled",
      description: "lets-question-bank.timingEnabledDescription",
      key: "timingEnabled",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-question-bank.maskSourceAnswers",
      description: "lets-question-bank.maskSourceAnswersDescription",
      key: "maskSourceAnswers",
      value: false,
    },
    {
      type: "select",
      title: "lets-question-bank.answerMaskStyle",
      description: "lets-question-bank.answerMaskStyleDescription",
      key: "answerMaskStyle",
      value: DEFAULT_ANSWER_MASK_STYLE,
      options: {
        blur: "lets-question-bank.answerMaskStyleBlur",
        solid: "lets-question-bank.answerMaskStyleSolid",
        underline: "lets-question-bank.answerMaskStyleUnderline",
      },
    },
  ],
};

export default pluginMetadata;
