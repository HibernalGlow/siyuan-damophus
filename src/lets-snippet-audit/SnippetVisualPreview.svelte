<script lang="ts">
  import LiveStylePreview from "@/components/live-style-preview.svelte";
  import { buildSnippetPreviewDocument, type SnippetPreviewScene } from "./snippet-audit";

  export let css: string;
  export let scenes: SnippetPreviewScene[] = [];
  export let title = "Visual preview";
  export let description = "The original CSS is isolated inside matching SiYuan scenes.";
  export let sceneLabel: (scene: SnippetPreviewScene) => string = (scene) => scene;
  export let themeVariables: Readonly<Record<string, string>> = {};
</script>

{#if scenes.length > 0}
  <LiveStylePreview {title} {description}>
    <div class="grid gap-4 lg:grid-cols-2" data-snippet-visual-preview>
      {#each scenes as scene (scene)}
        <figure class="min-w-0">
          <figcaption class="mb-2 text-xs font-medium text-muted-foreground">{sceneLabel(scene)}</figcaption>
          <iframe
            class="h-40 w-full border border-border bg-white"
            title={`${title}: ${sceneLabel(scene)}`}
            sandbox=""
            srcdoc={buildSnippetPreviewDocument(scene, css, themeVariables)}
          ></iframe>
        </figure>
      {/each}
    </div>
  </LiveStylePreview>
{/if}
