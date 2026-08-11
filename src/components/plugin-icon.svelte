<script lang="ts">
  import {
    BookOpenCheck,
    Bot,
    Brain,
    FileOutput,
    Film,
    GlassWater,
    ImagePlay,
    ListTree,
    MessageSquareText,
    Network,
    PanelRight,
    Power,
    Settings2,
    Smartphone,
    Sparkles,
    SunMoon,
    TableProperties,
    Tags,
    Waypoints,
  } from "lucide-svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";

  export let name: PluginIconName;
  export let className = "size-4";

  const ICONS = {
    bookOpenCheck: BookOpenCheck,
    bot: Bot,
    brain: Brain,
    fileOutput: FileOutput,
    film: Film,
    glassWater: GlassWater,
    imagePlay: ImagePlay,
    listTree: ListTree,
    messageSquareText: MessageSquareText,
    network: Network,
    panelRight: PanelRight,
    power: Power,
    settings: Settings2,
    smartphone: Smartphone,
    sparkles: Sparkles,
    sunMoon: SunMoon,
    tableProperties: TableProperties,
    tags: Tags,
    waypoints: Waypoints,
  } satisfies Record<PluginIconName, typeof Brain>;

  $: Icon = ICONS[name];
</script>

<svelte:component this={Icon} class={className} aria-hidden="true" />
