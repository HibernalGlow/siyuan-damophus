<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Slider } from "@/components/ui/slider";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import { plugin } from "../utils";
  import SettingListItem from "./SettingListItem.svelte";

  export let type: string;
  export let title: string;
  export let description: string;
  export let settingKey: string;
  export let settingValue: any;
  export let height = "";
  export let placeholder = "";
  export let options: Record<string | number, string> = {};
  export let slider = { min: 0, max: 100, step: 1 };
  export let columns: Array<{
    key: string;
    title: string;
    type: "text" | "number" | "select";
    width?: string;
    options?: Record<string, string>;
  }> = [];

  const dispatch = createEventDispatcher();
  $: translatedTitle = plugin.i18n[title] || title;
  $: translatedDescription = plugin.i18n[description] || description;
  $: translatedPlaceholder = plugin.i18n[placeholder] || placeholder;
  $: buttonLabel = type === "button" ? plugin.i18n[settingValue] || settingValue : settingValue;

  function changed() {
    dispatch("changed", { key: settingKey, value: settingValue });
  }
</script>

{#if type === "textarea" || type === "list"}
  <div class="flex flex-col gap-3 border-b border-border px-3 py-4 last:border-b-0">
    <div>
      <div class="text-sm font-medium">{@html translatedTitle}</div>
      <div class="mt-1 text-xs text-muted-foreground">{@html translatedDescription}</div>
    </div>
    {#if type === "textarea"}
      <Textarea
        style={`height: ${height || "240px"}`}
        id={settingKey}
        placeholder={translatedPlaceholder}
        bind:value={settingValue}
        oninput={() => dispatch("preview", { key: settingKey, value: settingValue })}
        onchange={changed}
      />
    {:else}
      <SettingListItem value={settingValue} {columns} on:value={(event) => { settingValue = event.detail; changed(); }} />
    {/if}
  </div>
{:else}
  <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(180px,auto)] items-center gap-5 border-b border-border px-3 py-3 last:border-b-0 max-[640px]:grid-cols-1 max-[640px]:gap-3">
    <div class="min-w-0">
      <div class="text-sm font-medium">{@html translatedTitle}</div>
      <div class="mt-1 text-xs leading-5 text-muted-foreground">{@html translatedDescription}</div>
    </div>
    <div class="flex min-w-0 justify-end max-[640px]:justify-start">
      {#if type === "checkbox"}
        <Switch checked={Boolean(settingValue)} onCheckedChange={(checked) => { settingValue = checked; changed(); }} aria-label={translatedTitle} />
      {:else if type === "textinput" || type === "number"}
        <Input class="w-52 max-w-full" id={settingKey} type={type === "number" ? "number" : "text"} placeholder={translatedPlaceholder} bind:value={settingValue} onchange={changed} />
      {:else if type === "button"}
        <Button variant="outline" onclick={() => dispatch("click", { key: settingKey, value: settingValue })}>{buttonLabel}</Button>
      {:else if type === "select"}
        <select class="h-8 w-52 max-w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/25" id={settingKey} bind:value={settingValue} onchange={changed}>
          {#each Object.entries(options) as [value, text]}
            <option {value}>{plugin.i18n[text] || text}</option>
          {/each}
        </select>
      {:else if type === "slider"}
        <div class="grid w-56 max-w-full grid-cols-[1fr_42px] items-center gap-3">
          <Slider type="single" min={slider.min} max={slider.max} step={slider.step} bind:value={settingValue} onValueChange={changed} aria-label={translatedTitle} />
          <output class="text-right font-mono text-xs">{settingValue}</output>
        </div>
      {/if}
    </div>
  </div>
{/if}
