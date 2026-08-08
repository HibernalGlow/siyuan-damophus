import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "animatedImageReplay",
  displayName: "lets-animated-image-replay.displayName",
  description: "lets-animated-image-replay.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "select",
      title: "lets-animated-image-replay.initialFrameTitle",
      description: "lets-animated-image-replay.initialFrameDescription",
      key: "initialFrame",
      value: "last",
      options: {
        last: "lets-animated-image-replay.initialFrameLast",
        first: "lets-animated-image-replay.initialFrameFirst",
      },
    },
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
    {
      type: "number",
      title: "lets-animated-image-replay.hoverReplayDelayTitle",
      description: "lets-animated-image-replay.hoverReplayDelayDescription",
      key: "hoverReplayDelayMs",
      value: 700,
    },
    {
      type: "checkbox",
      title: "lets-animated-image-replay.replayWhenOpenedLargeTitle",
      description: "lets-animated-image-replay.replayWhenOpenedLargeDescription",
      key: "replayWhenOpenedLarge",
      value: true,
    },
    {
      type: "number",
      title: "lets-animated-image-replay.replayBlobCacheSizeTitle",
      description: "lets-animated-image-replay.replayBlobCacheSizeDescription",
      key: "replayBlobCacheSize",
      value: 4,
    },
  ],
};

export default pluginMetadata;
