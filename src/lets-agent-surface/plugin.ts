import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "../libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "agentSurface",
  displayName: "lets-agent-surface.displayName",
  description: "lets-agent-surface.description",
  version: "1.0.0",
  enabled: true,
  icon: "sparkles",
  settings: [
    ...createEntrySettings({ menu: true, mobileDock: true, tab: true }, { central: true }),
    {
      type: "checkbox",
      title: "lets-agent-surface.openInNewTabTitle",
      description: "lets-agent-surface.openInNewTabDescription",
      key: "openInNewTab",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.mobileDropdownTitle",
      description: "lets-agent-surface.mobileDropdownDescription",
      key: "mobileDropdown",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.interceptAddToAgentTitle",
      description: "lets-agent-surface.interceptAddToAgentDescription",
      key: "interceptAddToAgent",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.yoloModeTitle",
      description: "lets-agent-surface.yoloModeDescription",
      key: "yoloMode",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.yoloNotifyBeforeApprovalTitle",
      description: "lets-agent-surface.yoloNotifyBeforeApprovalDescription",
      key: "yoloNotifyBeforeApproval",
      value: false,
    },
    {
      type: "number",
      title: "lets-agent-surface.yoloApprovalDelaySecondsTitle",
      description: "lets-agent-surface.yoloApprovalDelaySecondsDescription",
      key: "yoloApprovalDelaySeconds",
      value: 3,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.preserveNewSessionDraftTitle",
      description: "lets-agent-surface.preserveNewSessionDraftDescription",
      key: "preserveNewSessionDraft",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.skipModelSwitchContextConfirmationTitle",
      description: "lets-agent-surface.skipModelSwitchContextConfirmationDescription",
      key: "skipModelSwitchContextConfirmation",
      value: true,
    },
  ],
};

export default pluginMetadata;
