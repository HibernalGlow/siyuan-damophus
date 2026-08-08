import { describe, expect, it } from "vitest";
import metadata from "./plugin";

describe("animated image replay settings", () => {
  it("defaults supported images to their final frame", () => {
    const initialFrame = metadata.settings?.find((setting) => setting.key === "initialFrame");

    expect(initialFrame).toMatchObject({
      type: "select",
      value: "last",
      options: {
        first: "lets-animated-image-replay.initialFrameFirst",
        last: "lets-animated-image-replay.initialFrameLast",
      },
    });
  });
});
