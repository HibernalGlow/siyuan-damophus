<script lang="ts">
  import ExternalLinkIcon from "lucide-svelte/icons/external-link";
  import SaveIcon from "lucide-svelte/icons/save";
  import ScanLineIcon from "lucide-svelte/icons/scan-line";
  import SearchIcon from "lucide-svelte/icons/search";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";
  import { Switch } from "@/components/ui/switch";
  import { onMount } from "svelte";
  import type { TopicDictionaryDocument, TopicDictionaryEntry } from "@/question-bank/topic-dictionary";
  import type {
    TopicDictionaryConfig,
    TopicDictionaryLabels,
    TopicDictionaryOperations,
  } from "./dock";
  import "@/styles/lucide-outline.css";

  type GroupMode = "subject" | "category" | "collection" | "source";
  type StateFilter = "all" | "present" | "retired";

  let {
    labels,
    operations,
    config,
    onOpenTab,
  }: {
    labels: TopicDictionaryLabels;
    operations: TopicDictionaryOperations;
    config: TopicDictionaryConfig;
    onOpenTab?: () => void;
  } = $props();

  let dictionary = $state<TopicDictionaryDocument>();
  let drafts = $state<Record<string, string>>({});
  let dirtyIds = $state(new Set<string>());
  let search = $state("");
  let groupMode = $state<GroupMode>("subject");
  let stateFilter = $state<StateFilter>("present");
  let autoScanOnOpen = $state(false);
  let busy = $state(false);
  let status = $state("");
  let statusError = $state(false);

  const entries = $derived(Object.values(dictionary?.entries ?? {}));
  const filteredEntries = $derived.by(() => {
    const needle = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (stateFilter !== "all" && entry.state !== stateFilter) return false;
      if (!needle) return true;
      return [
        entry.topicId,
        drafts[entry.topicId] ?? entry.displayName,
        entry.suggestedName,
        ...entry.subjects,
        ...entry.categories,
        ...entry.collections,
        ...entry.sources,
      ].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  });
  const groups = $derived.by(() => {
    const grouped = new Map<string, TopicDictionaryEntry[]>();
    for (const entry of filteredEntries) {
      const key = classificationValues(entry)[0] || labels.unclassified;
      const group = grouped.get(key) ?? [];
      group.push(entry);
      grouped.set(key, group);
    }
    return [...grouped.entries()]
      .map(([name, values]) => [name, values.sort(compareEntries)] as const)
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN", {numeric: true}));
  });
  const presentCount = $derived(entries.filter((entry) => entry.state === "present").length);
  const retiredCount = $derived(entries.filter((entry) => entry.state === "retired").length);

  function compareEntries(left: TopicDictionaryEntry, right: TopicDictionaryEntry): number {
    const leftName = drafts[left.topicId] || left.displayName || left.suggestedName || left.topicId;
    const rightName = drafts[right.topicId] || right.displayName || right.suggestedName || right.topicId;
    return leftName.localeCompare(rightName, "zh-CN", {numeric: true, sensitivity: "base"});
  }

  function classificationValues(entry: TopicDictionaryEntry): string[] {
    if (groupMode === "category") return entry.categories;
    if (groupMode === "collection") return entry.collections;
    if (groupMode === "source") return entry.sources;
    return entry.subjects;
  }

  function applyDocument(next: TopicDictionaryDocument): void {
    dictionary = next;
    drafts = Object.fromEntries(Object.values(next.entries).map((entry) => [entry.topicId, entry.displayName]));
    dirtyIds = new Set();
  }

  function setStatus(message: string, error = false): void {
    status = message;
    statusError = error;
  }

  async function loadDictionary(scanAfterLoad = false): Promise<void> {
    busy = true;
    try {
      applyDocument(await operations.load());
      if (scanAfterLoad) await scanDictionary();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function scanDictionary(): Promise<void> {
    busy = true;
    try {
      const result = await operations.scan();
      applyDocument(result.document);
      setStatus(labels.scanResult
        .replace("{present}", String(result.presentCount))
        .replace("{retired}", String(result.retiredCount))
        .replace("{new}", String(result.newTopicIds.length)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  function updateDraft(topicId: string, displayName: string): void {
    drafts = {...drafts, [topicId]: displayName};
    const nextDirty = new Set(dirtyIds);
    const original = dictionary?.entries[topicId]?.displayName ?? "";
    if (displayName.trim() === original) nextDirty.delete(topicId);
    else nextDirty.add(topicId);
    dirtyIds = nextDirty;
  }

  async function saveChanges(): Promise<void> {
    if (dirtyIds.size === 0) return;
    busy = true;
    try {
      const updates = Object.fromEntries([...dirtyIds].map((topicId) => [topicId, drafts[topicId] ?? ""]));
      applyDocument(await operations.saveLabels(updates));
      setStatus(labels.saved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  function toggleAutoScan(value: boolean): void {
    autoScanOnOpen = value;
    operations.setAutoScanOnOpen(value);
  }

  onMount(() => {
    autoScanOnOpen = config.autoScanOnOpen;
    void loadDictionary(autoScanOnOpen);
  });
</script>

<section class="damophus-topic-dictionary" aria-label={labels.title} data-status={statusError ? "error" : "ok"}>
  <header class="damophus-topic-dictionary__toolbar">
    <h2>{labels.title}</h2>
    <Button variant="outline" onclick={() => void scanDictionary()} disabled={busy}>
      <ScanLineIcon />{labels.scan}
    </Button>
    <Button onclick={() => void saveChanges()} disabled={busy || dirtyIds.size === 0}>
      <SaveIcon />{labels.save}{dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ""}
    </Button>
    {#if onOpenTab}
      <Button variant="outline" size="icon" title={labels.openTab} aria-label={labels.openTab} onclick={onOpenTab}>
        <ExternalLinkIcon />
      </Button>
    {/if}
  </header>

  <div class="damophus-topic-dictionary__controls">
    <label class="damophus-topic-dictionary__search">
      <SearchIcon />
      <Input type="search" aria-label={labels.search} placeholder={labels.search} bind:value={search} />
    </label>
    <Select.Root type="single" value={groupMode} onValueChange={(value) => { groupMode = value as GroupMode; }}>
      <Select.Trigger aria-label={labels.groupBy}>
        {groupMode === "category" ? labels.category : groupMode === "collection" ? labels.collection : groupMode === "source" ? labels.source : labels.subject}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="subject" label={labels.subject} />
        <Select.Item value="category" label={labels.category} />
        <Select.Item value="collection" label={labels.collection} />
        <Select.Item value="source" label={labels.source} />
      </Select.Content>
    </Select.Root>
    <Select.Root type="single" value={stateFilter} onValueChange={(value) => { stateFilter = value as StateFilter; }}>
      <Select.Trigger aria-label={labels.filterState}>
        {stateFilter === "present" ? labels.present : stateFilter === "retired" ? labels.retired : labels.all}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all" label={labels.all} />
        <Select.Item value="present" label={labels.present} />
        <Select.Item value="retired" label={labels.retired} />
      </Select.Content>
    </Select.Root>
  </div>

  <div class="damophus-topic-dictionary__summary">
    <span>{labels.visibleCount.replace("{visible}", String(filteredEntries.length)).replace("{total}", String(entries.length))}</span>
    <Badge variant="secondary">{labels.present} {presentCount}</Badge>
    <Badge variant="outline">{labels.retired} {retiredCount}</Badge>
    <label class="damophus-topic-dictionary__auto-scan">
      <Switch checked={autoScanOnOpen} onCheckedChange={toggleAutoScan} aria-label={labels.autoScanOnOpen} />
      <span>{labels.autoScanOnOpen}</span>
    </label>
  </div>

  <div class="damophus-topic-dictionary__content">
    {#if !dictionary}
      <div class="damophus-topic-dictionary__empty">{labels.loading}</div>
    {:else if groups.length === 0}
      <div class="damophus-topic-dictionary__empty">{labels.empty}</div>
    {:else}
      {#each groups as [groupName, groupEntries] (groupName)}
        <section class="damophus-topic-dictionary__group">
          <header><h3>{groupName}</h3><span>{groupEntries.length}</span></header>
          <div class="damophus-topic-dictionary__rows">
            {#each groupEntries as entry (entry.topicId)}
              <div class="damophus-topic-dictionary__row" data-state={entry.state}>
                <div class="damophus-topic-dictionary__identity">
                  <code title={entry.topicId}>{entry.topicId}</code>
                  <div class="damophus-topic-dictionary__metadata">
                    {#if entry.state === "retired"}<Badge variant="outline">{labels.retired}</Badge>{/if}
                    {#if entry.suggestedName}<span title={labels.suggestedName}>{entry.suggestedName}</span>{/if}
                    {#each classificationValues(entry).slice(1) as value}<span>{value}</span>{/each}
                  </div>
                </div>
                <Input
                  type="text"
                  aria-label={`${labels.displayName}: ${entry.topicId}`}
                  value={drafts[entry.topicId] ?? ""}
                  placeholder={entry.suggestedName || labels.displayName}
                  oninput={(event) => updateDraft(entry.topicId, event.currentTarget.value)}
                />
              </div>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>

  <div class="damophus-topic-dictionary__status" role="status" aria-live="polite">{status}</div>
</section>
