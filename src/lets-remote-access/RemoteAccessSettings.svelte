<script lang="ts" module>
  export interface RemoteAccessSettingsLabels {
    serveStatus: string;
    serveEnabled: string;
    serveDisabled: string;
    serveDisabledHint: string;
    desktopOnlyHint: string;
    publicUrl: string;
    publicUrlDescription: string;
    publicHost: string;
    publicHostDescription: string;
    publicHostPlaceholder: string;
    lanUrls: string;
    lanUrlsDescription: string;
    autoDetected: string;
    detecting: string;
    detectFailed: string;
    copy: string;
    copied: string;
    refresh: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import { Copy, RefreshCw, Server, Smartphone, Wifi } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { copyText } from "./interaction";
  import {
    PublicHostCache,
    buildRemoteUrl,
    buildServePlan,
    normalizePublicHostEntry,
    readHostConfig,
    readServePort,
  } from "./remote-access";

  export let group: string;
  export let title: string;
  export let publicHost = "";
  export let labels: RemoteAccessSettingsLabels;
  export let mobile = false;

  const dispatch = createEventDispatcher();
  const cache = new PublicHostCache();

  let conf = readHostConfig();
  let detected: string | null = null;
  let detecting = false;
  let detectFailed = false;
  let copiedUrl: string | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  $: plan = buildServePlan(conf, readServePort());
  $: manual = normalizePublicHostEntry(publicHost);
  $: publicEntry = manual ?? (detected ? { host: detected } : null);
  $: remoteUrl = plan.serveEnabled && publicEntry
    ? buildRemoteUrl(publicEntry.host, plan.protocol, publicEntry.port ?? plan.port)
    : null;

  onMount(() => {
    if (plan.serveEnabled && !manual) void refreshDetection();
  });

  onDestroy(() => {
    if (copiedTimer) clearTimeout(copiedTimer);
  });

  async function refreshDetection() {
    if (detecting) return;
    detecting = true;
    detectFailed = false;
    cache.invalidate();
    const host = await cache.resolve();
    detected = host;
    detectFailed = host === null;
    detecting = false;
  }

  async function refresh() {
    conf = readHostConfig();
    if (plan.serveEnabled && !manual) await refreshDetection();
  }

  function onManualInput(event: Event) {
    publicHost = (event.currentTarget as HTMLInputElement).value;
    dispatch("changed", { group, key: "publicHost", value: publicHost });
  }

  async function copy(url: string) {
    try {
      await copyText(url);
      copiedUrl = url;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedUrl = null;
      }, 2000);
    } catch {
      // Keep the previous indicator; the user can select the URL manually.
    }
  }
</script>

<section class="space-y-5" data-mobile={mobile}>
  <header class="border-b border-border pb-4">
    <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
  </header>

  <div class="space-y-2 rounded-md border border-border p-4">
    <div class="flex items-center gap-2 text-sm font-medium">
      <Server class="size-4" aria-hidden="true" />
      <span>{labels.serveStatus}</span>
      <span
        class="rounded-full px-2 py-0.5 text-xs {plan.serveEnabled
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'}"
        data-testid="serve-status"
      >
        {plan.serveEnabled ? labels.serveEnabled : labels.serveDisabled}
      </span>
    </div>
    {#if !plan.serveEnabled}
      <p class="m-0 text-sm text-muted-foreground">{labels.serveDisabledHint}</p>
    {:else if !plan.desktop}
      <p class="m-0 text-sm text-muted-foreground">{labels.desktopOnlyHint}</p>
    {/if}
  </div>

  <div class="space-y-3 rounded-md border border-border bg-background p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="grid gap-1">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <Smartphone class="size-4" aria-hidden="true" />
          <span>{labels.publicUrl}</span>
        </div>
        <p class="m-0 text-xs text-muted-foreground">{labels.publicUrlDescription}</p>
      </div>
      <Button variant="outline" size="sm" onclick={() => void refresh()}>
        <RefreshCw class={detecting ? "animate-spin" : ""} />
        {labels.refresh}
      </Button>
    </div>

    <div class="flex items-center gap-2" data-testid="public-url-row">
      <code class="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 text-sm">
        {remoteUrl ?? (plan.serveEnabled ? "--" : labels.serveDisabled)}
      </code>
      <Button size="sm" disabled={!remoteUrl} onclick={() => remoteUrl && void copy(remoteUrl)}>
        <Copy />{copiedUrl === remoteUrl ? labels.copied : labels.copy}
      </Button>
    </div>

    {#if manual}
      <p class="m-0 text-xs text-muted-foreground">{labels.publicHost}: {manual.host}</p>
    {:else if detecting}
      <p class="m-0 text-xs text-muted-foreground">{labels.detecting}</p>
    {:else if detectFailed}
      <p class="m-0 text-xs text-muted-foreground">{labels.detectFailed}</p>
    {:else if detected}
      <p class="m-0 text-xs text-muted-foreground">{labels.autoDetected}: {detected}</p>
    {/if}
  </div>

  <label class="grid gap-1 text-sm font-medium">
    <span>{labels.publicHost}</span>
    <Input
      value={publicHost}
      placeholder={labels.publicHostPlaceholder}
      onchange={onManualInput}
    />
    <span class="text-xs font-normal text-muted-foreground">{labels.publicHostDescription}</span>
  </label>

  {#if plan.serveEnabled && plan.lanUrls.length > 0}
    <div class="space-y-2 rounded-md border border-border p-4">
      <div class="flex items-center gap-2 text-sm font-semibold">
        <Wifi class="size-4" aria-hidden="true" />
        <span>{labels.lanUrls}</span>
      </div>
      <p class="m-0 text-xs text-muted-foreground">{labels.lanUrlsDescription}</p>
      {#each plan.lanUrls as url}
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 text-sm">{url}</code>
          <Button size="sm" variant="outline" onclick={() => void copy(url)}>
            <Copy />{copiedUrl === url ? labels.copied : labels.copy}
          </Button>
        </div>
      {/each}
    </div>
  {/if}
</section>
