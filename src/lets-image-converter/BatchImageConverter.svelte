<script lang="ts">
  import PlayIcon from "lucide-svelte/icons/play";
  import RotateCcwIcon from "lucide-svelte/icons/rotate-ccw";
  import type {BatchConversionOptions, BatchConversionResult, BatchProgress, BatchScope} from "./batch-converter";

  type Labels = Record<string, string>;
  type RunOptions = Omit<BatchConversionOptions, "onProgress" | "conversion"> & {
    format: string;
    quality: number;
  };

  let {
    labels,
    defaultFormat,
    defaultQuality,
    defaultSkipAnimated,
    onRun,
  }: {
    labels: Labels;
    defaultFormat: string;
    defaultQuality: number;
    defaultSkipAnimated: boolean;
    onRun: (options: RunOptions, onProgress: (progress: BatchProgress) => void) => Promise<BatchConversionResult>;
  } = $props();

  let targetId = $state("");
  let scope = $state<BatchScope>("document");
  let includeChildren = $state(true);
  let skipAnimated = $state(true);
  let format = $state("avifq60");
  let quality = $state(60);
  let running = $state(false);
  let progress = $state<BatchProgress>();
  let result = $state<BatchConversionResult>();
  let error = $state("");

  let initialized = $state(false);
  $effect(() => {
    if (initialized) return;
    skipAnimated = defaultSkipAnimated;
    format = defaultFormat;
    quality = defaultQuality;
    initialized = true;
  });

  const formatOptions = $derived([
    ["avifq60", labels.formatAvifQ60],
    ["avifq80", labels.formatAvifQ80],
    ["webpq60", labels.formatWebpQ60],
    ["webpq80", labels.formatWebpQ80],
  ]);

  function progressPercent(): number {
    if (!progress || progress.total === 0) return 0;
    return Math.min(100, Math.round(progress.completed / progress.total * 100));
  }

  async function run(): Promise<void> {
    if (running || !targetId.trim()) return;
    running = true;
    error = "";
    result = undefined;
    progress = {phase: "snapshot", completed: 0, total: 1, message: labels.creatingSnapshot};
    try {
      result = await onRun({
        targetId: targetId.trim(),
        scope,
        includeChildren: scope === "document" && includeChildren,
        skipAnimated,
        format,
        quality: Math.min(100, Math.max(1, Math.round(Number(quality) || defaultQuality))),
      }, (next) => progress = next);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      running = false;
    }
  }

  function reset(): void {
    targetId = "";
    progress = undefined;
    result = undefined;
    error = "";
  }
</script>

<div class="damophus-image-converter" data-running={running}>
  <header class="damophus-image-converter__header">
    <div>
      <h2>{labels.title}</h2>
      <p>{labels.subtitle}</p>
    </div>
    <button class="b3-button b3-button--outline" type="button" title={labels.reset} aria-label={labels.reset} onclick={reset} disabled={running}>
      <RotateCcwIcon size={16} />
    </button>
  </header>

  <form class="damophus-image-converter__form" onsubmit={(event) => { event.preventDefault(); void run(); }}>
    <label>
      <span>{labels.targetId}</span>
      <input class="b3-text-field" bind:value={targetId} placeholder={labels.targetIdPlaceholder} autocomplete="off" spellcheck="false" disabled={running} />
    </label>
    <div class="damophus-image-converter__grid">
      <label>
        <span>{labels.scope}</span>
        <select class="b3-select" bind:value={scope} disabled={running}>
          <option value="document">{labels.scopeDocument}</option>
          <option value="notebook">{labels.scopeNotebook}</option>
        </select>
      </label>
      <label>
        <span>{labels.format}</span>
        <select class="b3-select" bind:value={format} disabled={running}>
          {#each formatOptions as option}
            <option value={option[0]}>{option[1]}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{labels.quality}: {quality}</span>
        <input type="range" min="1" max="100" step="1" bind:value={quality} disabled={running} />
      </label>
    </div>
    <div class="damophus-image-converter__checks">
      <label class="damophus-image-converter__check">
        <input type="checkbox" bind:checked={includeChildren} disabled={running || scope !== "document"} />
        <span>{labels.includeChildren}</span>
      </label>
      <label class="damophus-image-converter__check">
        <input type="checkbox" bind:checked={skipAnimated} disabled={running} />
        <span>{labels.skipAnimated}</span>
      </label>
    </div>
    <button class="b3-button b3-button--primary damophus-image-converter__run" type="submit" disabled={running || !targetId.trim()}>
      <PlayIcon size={16} />
      <span>{running ? labels.running : labels.start}</span>
    </button>
  </form>

  {#if progress}
    <section class="damophus-image-converter__progress" aria-live="polite">
      <div class="damophus-image-converter__progress-head">
        <strong>{progress.message}</strong>
        <span>{progressPercent()}%</span>
      </div>
      <progress max="100" value={progressPercent()}></progress>
      <span class="damophus-image-converter__phase">{progress.phase} · {progress.completed}/{progress.total}</span>
    </section>
  {/if}

  {#if result}
    <section class="damophus-image-converter__result" data-state="success">
      <strong>{labels.completed}</strong>
      <span>{labels.resultSummary.replace("{converted}", String(result.converted)).replace("{assets}", String(result.assets)).replace("{documents}", String(result.documents))}</span>
      <span>{labels.resultSkipped.replace("{animated}", String(result.skippedAnimated)).replace("{retained}", String(result.retainedOriginals))}</span>
    </section>
  {/if}
  {#if error}
    <section class="damophus-image-converter__result" data-state="error" aria-live="assertive">
      <strong>{labels.failed}</strong>
      <span>{error}</span>
    </section>
  {/if}
</div>
