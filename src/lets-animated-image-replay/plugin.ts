import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "animatedImageReplay",
  displayName: "lets-animated-image-replay.displayName",
  description: "lets-animated-image-replay.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      title: "lets-animated-image-replay.showReplayButtonTitle",
      description: "lets-animated-image-replay.showReplayButtonDescription",
      key: "showReplayButton",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-animated-image-replay.replayOnHoverTitle",
      description: "lets-animated-image-replay.replayOnHoverDescription",
      key: "replayOnHover",
      value: true,
    },
  ],
};

export default pluginMetadata;
