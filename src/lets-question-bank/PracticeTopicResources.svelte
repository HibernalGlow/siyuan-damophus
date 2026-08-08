<script lang="ts">
  import { ExternalLink, FileText, Pin } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import type { TopicResourceProjection } from "@/question-bank/adapters/siyuan";
  import type { Label } from "./question-bank-display";

  export let resources: TopicResourceProjection[] = [];
  export let label: Label;
  export let persistResource: ((projection: TopicResourceProjection) => void) | undefined = undefined;
  export let persistingIdentity = "";
  export let persistedIdentities: ReadonlySet<string> = new Set();

  function identity(projection: TopicResourceProjection): string {
    return `${projection.topicId}:${projection.resource.type}:${projection.resource.content}`;
  }

  function resourceUrl(content: string): string {
    return content.startsWith("assets/") ? `/${content}` : content;
  }

  function isVideo(content: string): boolean {
    return /\.(?:mp4|webm|ogv|ogg)(?:[?#].*)?$/iu.test(content);
  }
</script>

{#if resources.length > 0}
  <section class="topic-resources" aria-label={label("topicResources", "Topic resources")}>
    <header>
      <strong>{label("topicResources", "Topic resources")}</strong>
      <span>{[...new Set(resources.map((item) => item.topicName))].join(" · ")}</span>
    </header>
    <div class="topic-resource-list">
      {#each resources as projection (`${projection.topicId}:${projection.resource.type}:${projection.resource.content}`)}
        <figure data-topic-id={projection.topicId} data-topic-status={projection.status}>
          {#if projection.resource.type === "image"}
            <img
              src={resourceUrl(projection.resource.content)}
              alt={projection.resource.name || projection.topicName}
              loading="lazy"
            />
          {:else if isVideo(projection.resource.content)}
            <video
              src={resourceUrl(projection.resource.content)}
              aria-label={projection.resource.name || projection.topicName}
              controls
              loop
              muted
              playsinline
              preload="metadata"
            ></video>
          {:else}
            <a href={resourceUrl(projection.resource.content)} target="_blank" rel="noreferrer">
              <FileText size={18} aria-hidden="true" />
              <span>{projection.resource.name || projection.resource.content}</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          {/if}
          <figcaption>
            <span>{projection.resource.name || projection.topicName}</span>
            {#if persistResource}
              <Button
                variant="ghost"
                size="sm"
                disabled={persistingIdentity === identity(projection) || persistedIdentities.has(identity(projection))}
                title={label("persistTopicResource", "固化")}
                onclick={() => persistResource?.(projection)}
              >
                <Pin size={14} aria-hidden="true" />
                <span>{persistedIdentities.has(identity(projection)) ? label("topicResourcePersisted", "已固化") : label("persistTopicResource", "固化")}</span>
              </Button>
            {/if}
          </figcaption>
        </figure>
      {/each}
    </div>
  </section>
{/if}

<style>
  .topic-resources {
    width: 100%;
    padding: 12px 22px 16px;
    border-top: 1px solid var(--b3-border-color);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    margin-bottom: 10px;
  }
  header strong {
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }
  header span {
    min-width: 0;
    overflow: hidden;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .topic-resource-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 12px;
  }
  figure {
    min-width: 0;
    margin: 0;
  }
  img,
  video {
    display: block;
    width: 100%;
    max-height: 360px;
    object-fit: contain;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
  }
  a {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    color: var(--b3-theme-primary);
    text-decoration: none;
  }
  a span {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
  }
  figcaption {
    margin-top: 5px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    overflow-wrap: anywhere;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  figcaption > span { min-width: 0; }
  @media (max-width: 750px) {
    .topic-resources { padding-inline: 12px; }
    .topic-resource-list { grid-template-columns: 1fr; }
    img, video { max-height: 300px; }
  }
</style>
