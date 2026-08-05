<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    ChevronDown,
    ChevronUp,
    Clock3,
    Copy,
    Download,
    Eye,
    Focus,
    Grid3X3,
    Play,
    RefreshCw,
    Undo2,
    Upload,
    X,
  } from "lucide-svelte";

  let source: HTMLDivElement;

  onMount(() => {
    document.getElementById("damophus-dev-icon-sprite")?.remove();

    const namespace = "http://www.w3.org/2000/svg";
    const sprite = document.createElementNS(namespace, "svg");
    const definitions = document.createElementNS(namespace, "defs");
    sprite.id = "damophus-dev-icon-sprite";
    sprite.setAttribute("aria-hidden", "true");
    sprite.classList.add("icon-sprite");
    sprite.append(definitions);

    for (const icon of source.querySelectorAll<SVGSVGElement>("[data-native-icon]")) {
      const id = icon.dataset.nativeIcon;
      if (!id) continue;
      const symbol = document.createElementNS(namespace, "symbol");
      symbol.id = id;
      for (const attribute of [
        "viewBox",
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
      ]) {
        const value = icon.getAttribute(attribute);
        if (value) symbol.setAttribute(attribute, value);
      }
      for (const child of icon.childNodes) symbol.append(child.cloneNode(true));
      definitions.append(symbol);
    }

    document.body.prepend(sprite);
    return () => sprite.remove();
  });
</script>

<div class="icon-definitions" aria-hidden="true" bind:this={source}>
  <Check data-native-icon="iconCheck" />
  <Clock3 data-native-icon="iconClock" />
  <X data-native-icon="iconClose" />
  <Copy data-native-icon="iconCopy" />
  <ChevronDown data-native-icon="iconDown" />
  <Download data-native-icon="iconDownload" />
  <Eye data-native-icon="iconEye" />
  <Focus data-native-icon="iconFocus" />
  <Grid3X3 data-native-icon="iconGrid" />
  <Play data-native-icon="iconPlay" />
  <RefreshCw data-native-icon="iconRefresh" />
  <Undo2 data-native-icon="iconUndo" />
  <ChevronUp data-native-icon="iconUp" />
  <Upload data-native-icon="iconUpload" />
</div>

<style>
  .icon-definitions {
    position: fixed;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }

  :global(.icon-sprite) {
    position: fixed;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
