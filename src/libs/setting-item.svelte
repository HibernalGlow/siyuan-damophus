<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Slider } from "@/components/ui/slider";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";
  import { Textarea } from "@/components/ui/textarea";
  import * as Select from "@/components/ui/select";
  import { plugin } from "../utils";
  import SettingListItem from "./SettingListItem.svelte";
  import SiyuanBlockTypeSelector from "./SiyuanBlockTypeSelector.svelte";

  export let type: string;
  export let title: string;
  export let description: string;
  export let icon: PluginIconName | undefined = undefined;
  export let settingKey: string;
  export let settingValue: any;
  export let height = "";
  export let mobile = false;
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
  $: i18n = plugin?.i18n ?? {};
  $: translatedTitle = i18n[title] || title;
  $: translatedDescription = i18n[description] || description;
  $: translatedPlaceholder = i18n[placeholder] || placeholder;
  $: buttonLabel = type === "button" ? i18n[settingValue] || settingValue : settingValue;

  function changed() {
    dispatch("changed", { key: settingKey, value: settingValue });
  }

  function preview() {
    dispatch("preview", { key: settingKey, value: settingValue });
  }

  let previewFrame = 0;
  function scheduleSliderPreview() {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(preview);
  }

</script>

{#if type === "textarea" || type === "list" || type === "blockTypes"}
  <div class="flex flex-col gap-3 border-b border-border px-3 py-4 last:border-b-0" class:damophus-setting-item-mobile={mobile}>
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
    {:else if type === "list"}
      <SettingListItem value={settingValue} {columns} on:value={(event) => { settingValue = event.detail; changed(); }} />
    {:else}
      <SiyuanBlockTypeSelector
        value={settingValue}
        labels={i18n}
        on:value={(event) => { settingValue = event.detail; changed(); }}
      />
    {/if}
  </div>
{:else}
  <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(180px,auto)] items-center gap-5 border-b border-border px-3 py-3 last:border-b-0 max-[640px]:grid-cols-1 max-[640px]:gap-3" class:damophus-setting-item-mobile={mobile}>
    <div class="flex min-w-0 items-start gap-3">
      {#if icon}<PluginIcon name={icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{/if}
      <div class="min-w-0">
        <div class="text-sm font-medium">{@html translatedTitle}</div>
        <div class="mt-1 text-xs leading-5 text-muted-foreground">{@html translatedDescription}</div>
      </div>
    </div>
    <div class="flex min-w-0 justify-end max-[640px]:justify-start" class:damophus-setting-control-mobile={mobile}>
      {#if type === "checkbox"}
        <Switch checked={Boolean(settingValue)} onCheckedChange={(checked) => { settingValue = checked; changed(); }} aria-label={translatedTitle} />
      {:else if type === "textinput" || type === "number"}
        <Input class="w-52 max-w-full damophus-setting-input" id={settingKey} type={type === "number" ? "number" : "text"} placeholder={translatedPlaceholder} bind:value={settingValue} oninput={preview} onchange={changed} />
      {:else if type === "button"}
        <Button variant="outline" onclick={() => dispatch("click", { key: settingKey, value: settingValue })}>{buttonLabel}</Button>
      {:else if type === "select"}
        <Select.Root type="single" value={String(settingValue)} onValueChange={(value) => { settingValue = value; changed(); }}>
          <Select.Trigger id={settingKey} class="w-52 max-w-full damophus-setting-select">{i18n[options[settingValue]] || options[settingValue] || settingValue}</Select.Trigger>
          <Select.Content>
            <Select.Group>{#each Object.entries(options) as [value, text]}<Select.Item {value} label={i18n[text] || text} />{/each}</Select.Group>
          </Select.Content>
        </Select.Root>
      {:else if type === "slider"}
        <div class="grid w-56 max-w-full grid-cols-[1fr_42px] items-center gap-3 damophus-setting-slider">
          <Slider type="single" min={slider.min} max={slider.max} step={slider.step} bind:value={settingValue} onpointermove={scheduleSliderPreview} onkeydown={scheduleSliderPreview} onValueCommit={changed} aria-label={translatedTitle} />
          <output class="text-right font-mono text-xs">{settingValue}</output>
        </div>
      {/if}
    </div>
  </div>
{/if}
