<script lang="ts">
  import {
    BookA,
    BookOpenCheck,
    Bot,
    Boxes,
    Brain,
    CloudCog,
    FileOutput,
    Film,
    GlassWater,
    GraduationCap,
    GripVertical,
    Highlighter,
    ImagePlay,
    LayoutGrid,
    ListTree,
    MessageSquareText,
    Move,
    Network,
    Paintbrush,
    Palette,
    PanelRight,
    Plug,
    Power,
    Settings2,
    Smartphone,
    Sparkles,
    SunMoon,
    TableProperties,
    Tags,
    TextSelect,
    Waypoints,
    Workflow,
  } from "lucide-svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";

  export let name: PluginIconName;
  export let className = "size-4";

  const ICONS = {
    bookA: BookA,
    bookOpenCheck: BookOpenCheck,
    bot: Bot,
    boxes: Boxes,
    brain: Brain,
    cloudCog: CloudCog,
    fileOutput: FileOutput,
    film: Film,
    glassWater: GlassWater,
    graduationCap: GraduationCap,
    gripVertical: GripVertical,
    highlighter: Highlighter,
    imagePlay: ImagePlay,
    layoutGrid: LayoutGrid,
    listTree: ListTree,
    messageSquareText: MessageSquareText,
    move: Move,
    network: Network,
    paintbrush: Paintbrush,
    palette: Palette,
    panelRight: PanelRight,
    plug: Plug,
    power: Power,
    settings: Settings2,
    smartphone: Smartphone,
    sparkles: Sparkles,
    sunMoon: SunMoon,
    tableProperties: TableProperties,
    tags: Tags,
    textSelect: TextSelect,
    waypoints: Waypoints,
    workflow: Workflow,
  } satisfies Record<PluginIconName, typeof Brain>;

  $: Icon = ICONS[name];
</script>

<svelte:component this={Icon} class={className} aria-hidden="true" />
