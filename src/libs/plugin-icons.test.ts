import { describe, expect, it } from "vitest";
import type { PluginMetadata } from "@/types/plugin";
import { resolvePluginIconName, settingGroupIcons } from "./plugin-icons";

const metadataModules = import.meta.glob("../lets-*/plugin.ts", {
  eager: true,
  import: "default",
}) as Record<string, PluginMetadata>;

const implementationPaths = new Set(
  Object.keys(import.meta.glob("../lets-*/index.ts"))
    .map((path) => path.replace(/\/index\.ts$/, "/plugin.ts")),
);

describe("plugin icon metadata", () => {
  it("uses a distinct icon for every registered settings module", () => {
    const iconOwners = new Map<string, string[]>(
      Object.entries(settingGroupIcons).map(([group, icon]) => [icon, [`settings.${group}`]]),
    );
    const registeredModules = Object.entries(metadataModules)
      .filter(([path]) => implementationPaths.has(path))
      .map(([, metadata]) => metadata)
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(registeredModules.length).toBeGreaterThan(0);

    for (const metadata of registeredModules) {
      const icon = resolvePluginIconName(metadata.name, metadata.icon);
      iconOwners.set(icon, [...(iconOwners.get(icon) ?? []), metadata.name]);
    }

    const duplicates = [...iconOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([icon, owners]) => `${icon}: ${owners.join(", ")}`);

    expect(duplicates, "Registered settings modules must not share icons").toEqual([]);
  });
});
