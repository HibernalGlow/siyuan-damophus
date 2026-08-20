import type { PluginMetadata } from "@/types/plugin";
import { DEFAULT_COVER_SOURCES, DEFAULT_SITE_CREDENTIALS, DEFAULT_TEMPLATES } from "./sources";

export const pluginMetadata: PluginMetadata = {
  name: "moreBackground",
  displayName: "lets-more-background.displayName",
  description: "lets-more-background.description",
  version: "1.0.0",
  enabled: false,
  icon: "images",
  settings: [
    {
      type: "number",
      title: "lets-more-background.widthTitle",
      description: "lets-more-background.widthDescription",
      key: "width",
      value: 1920,
    },
    {
      type: "number",
      title: "lets-more-background.heightTitle",
      description: "lets-more-background.heightDescription",
      key: "height",
      value: 1080,
    },
    {
      type: "textinput",
      title: "lets-more-background.assetsLocationTitle",
      description: "lets-more-background.assetsLocationDescription",
      key: "assetsLocation",
      value: "/assets/more-background",
    },
    {
      type: "checkbox",
      title: "lets-more-background.readFromAssetsTitle",
      description: "lets-more-background.readFromAssetsDescription",
      key: "readFromAssets",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-more-background.writeToAssetsTitle",
      description: "lets-more-background.writeToAssetsDescription",
      key: "writeToAssets",
      value: false,
    },
    {
      type: "list",
      title: "lets-more-background.credentialsTab",
      description: "lets-more-background.credentialsDescription",
      key: "siteCredentials",
      value: DEFAULT_SITE_CREDENTIALS,
    },
    {
      type: "list",
      title: "lets-more-background.templatesTab",
      description: "lets-more-background.templatesTab",
      key: "templates",
      value: DEFAULT_TEMPLATES,
    },
    {
      type: "list",
      title: "lets-more-background.sourcesTitle",
      description: "lets-more-background.sourcesDescription",
      key: "sources",
      value: DEFAULT_COVER_SOURCES,
    },
  ],
};

export default pluginMetadata;
