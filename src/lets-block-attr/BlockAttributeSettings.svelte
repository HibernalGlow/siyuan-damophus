<script lang="ts" module>
  export interface BlockAttributeSettingsLabels {
    preview: string;
    previewWidth: string;
    properties: string;
    availableProperties: string;
    property: string;
    enabled: string;
    showLabel: string;
    label: string;
    addProperty: string;
    invalidProperty: string;
    blockTypes: string;
    blockTypeDocument: string;
    blockTypeHeading: string;
    blockTypeParagraph: string;
    blockTypeList: string;
    blockTypeListItem: string;
    blockTypeBlockquote: string;
    blockTypeSuperBlock: string;
    blockTypeTable: string;
    advanced: string;
    customCss: string;
    customCssDescription: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Plus } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import type { ColorMode } from "@/theme/runtime";
  import type { DamophusTheme } from "@/theme/schema";
  import BlockAttributePreview from "./BlockAttributePreview.svelte";
  import {
    parseCustomProperties,
    parseCustomPropertyBlockTypes,
  } from "./custom-properties";

  interface SettingChange {
    key: "customProperties" | "customPropertyBlockTypes" | "customStyle";
    value: string;
  }

  const PROPERTY_CANDIDATES = [
    "custom-qb-id",
    "custom-qb-type",
    "custom-qb-collection",
    "custom-qb-year",
    "custom-qb-subject",
    "custom-qb-category",
    "custom-qb-topic-id",
    "custom-qb-parent-id",
    "custom-qb-role",
    "custom-qb-source",
    "custom-qb-section",
  ] as const;

  const BLOCK_TYPES = [
    "NodeDocument",
    "NodeHeading",
    "NodeParagraph",
    "NodeList",
    "NodeListItem",
    "NodeBlockquote",
    "NodeSuperBlock",
    "NodeTable",
  ] as const;

  export let customProperties: string;
  export let customPropertyBlockTypes: string;
  export let customStyle: string;
  export let theme: DamophusTheme;
  export let mode: ColorMode;
  export let labels: BlockAttributeSettingsLabels;

  const dispatch = createEventDispatcher<{
    changed: SettingChange;
    preview: SettingChange;
  }>();

  let newProperty = "";
  let propertyError = "";

  $: parsedProperties = parseCustomProperties(customProperties);
  $: parsedPropertyMap = new Map(parsedProperties.map((property) => [property.key, property]));
  $: propertyKeys = [
    ...PROPERTY_CANDIDATES,
    ...parsedProperties.map(({ key }) => key).filter((key) => !PROPERTY_CANDIDATES.includes(key as never)),
  ];
  $: activePropertyKeys = propertyKeys.filter((key) => parsedPropertyMap.has(key));
  $: availablePropertyKeys = propertyKeys.filter((key) => !parsedPropertyMap.has(key));
  $: enabledBlockTypes = new Set(parseCustomPropertyBlockTypes(customPropertyBlockTypes));

  function serializeProperties(properties: { key: string; label: string }[]) {
    return properties.map(({ key, label }) => label ? `${key}|${label}` : key).join("\n");
  }

  function defaultLabel(key: string) {
    return key.replace(/^custom-/u, "");
  }

  function updateProperty(key: string, enabled: boolean, label?: string, commit = true) {
    const next = parsedProperties.filter((property) => property.key !== key);
    if (enabled) {
      const current = parsedPropertyMap.get(key);
      const nextLabel = label ?? current?.label ?? defaultLabel(key);
      const order = propertyKeys.indexOf(key);
      const insertAt = next.findIndex((property) => propertyKeys.indexOf(property.key) > order);
      next.splice(insertAt < 0 ? next.length : insertAt, 0, { key, label: nextLabel });
    }
    dispatch(commit ? "changed" : "preview", {
      key: "customProperties",
      value: serializeProperties(next),
    });
  }

  function addProperty() {
    const key = newProperty.trim().toLowerCase();
    if (!/^custom-[a-z0-9][a-z0-9_-]*$/u.test(key) || key === "custom-qb-answer") {
      propertyError = labels.invalidProperty;
      if (key === "custom-qb-answer") newProperty = "";
      return;
    }
    propertyError = "";
    updateProperty(key, true);
    newProperty = "";
  }

  function updateBlockType(blockType: string, enabled: boolean) {
    const next = new Set(enabledBlockTypes);
    if (enabled) next.add(blockType);
    else next.delete(blockType);
    dispatch("changed", {
      key: "customPropertyBlockTypes",
      value: BLOCK_TYPES.filter((candidate) => next.has(candidate)).join("\n"),
    });
  }

  function blockTypeLabel(blockType: typeof BLOCK_TYPES[number]) {
    const suffix = blockType.replace(/^Node/u, "");
    return labels[`blockType${suffix}` as keyof BlockAttributeSettingsLabels];
  }
</script>

<div class="flex min-w-0 flex-col gap-5">
  <BlockAttributePreview
    {customProperties}
    {customStyle}
    {theme}
    {mode}
    title={labels.preview}
    widthLabel={labels.previewWidth}
  />

  <section class="border-y border-border py-4" aria-labelledby="damophus-property-settings">
    <h3 id="damophus-property-settings" class="mb-3 text-sm font-semibold">{labels.properties}</h3>
    <div class="flex flex-col divide-y divide-border">
      {#each activePropertyKeys as key (key)}
        {@const property = parsedPropertyMap.get(key)}
        {@const labelEnabled = Boolean(property?.label)}
        <div class="grid min-h-14 grid-cols-[minmax(160px,1fr)_auto_minmax(240px,1fr)] items-center gap-4 py-3 max-[640px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:gap-3">
          <code class="min-w-0 [overflow-wrap:anywhere] text-xs font-medium text-foreground">{key}</code>
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{labels.enabled}</span>
            <Switch checked={true} onCheckedChange={(checked) => updateProperty(key, checked)} />
          </label>
          <div class="grid grid-cols-[auto_auto_minmax(120px,1fr)] items-center gap-2 max-[640px]:col-span-2">
            <span class="text-xs text-muted-foreground">{labels.showLabel}</span>
            <Switch checked={labelEnabled} onCheckedChange={(checked) => updateProperty(key, true, checked ? defaultLabel(key) : "")} />
            <Input
              value={property?.label ?? ""}
              disabled={!labelEnabled}
              aria-label={`${labels.label}: ${key}`}
              oninput={(event) => updateProperty(key, true, event.currentTarget.value, false)}
              onchange={(event) => updateProperty(key, true, event.currentTarget.value)}
            />
          </div>
        </div>
      {/each}
    </div>
    {#if availablePropertyKeys.length > 0}
      <details class="border-b border-border py-3">
        <summary class="cursor-pointer text-xs font-medium text-muted-foreground">
          {labels.availableProperties} ({availablePropertyKeys.length})
        </summary>
        <div class="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-5">
          {#each availablePropertyKeys as key (key)}
            <label class="flex min-h-10 items-center justify-between gap-3 border-b border-border/60 text-xs">
              <code class="min-w-0 [overflow-wrap:anywhere]">{key}</code>
              <Switch checked={false} onCheckedChange={(checked) => updateProperty(key, checked)} />
            </label>
          {/each}
        </div>
      </details>
    {/if}
    <div class="mt-3 flex flex-wrap items-start gap-2">
      <div class="min-w-48 flex-1">
        <Input
          bind:value={newProperty}
          placeholder="custom-qb-..."
          aria-invalid={Boolean(propertyError)}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addProperty();
            }
          }}
        />
        {#if propertyError}<p class="mt-1 text-xs text-destructive">{propertyError}</p>{/if}
      </div>
      <Button variant="outline" onclick={addProperty}>
        <Plus data-icon="inline-start" />
        {labels.addProperty}
      </Button>
    </div>
  </section>

  <section class="border-b border-border pb-4" aria-labelledby="damophus-block-type-settings">
    <h3 id="damophus-block-type-settings" class="mb-3 text-sm font-semibold">{labels.blockTypes}</h3>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-2">
      {#each BLOCK_TYPES as blockType}
        <label class="flex min-h-9 items-center justify-between gap-3 border-b border-border/60 text-sm">
          <span>{blockTypeLabel(blockType)}</span>
          <Switch
            checked={enabledBlockTypes.has(blockType)}
            onCheckedChange={(checked) => updateBlockType(blockType, checked)}
          />
        </label>
      {/each}
    </div>
  </section>

  <details class="group border-b border-border pb-4">
    <summary class="cursor-pointer list-none text-sm font-semibold marker:hidden">
      {labels.advanced}
    </summary>
    <label class="mt-3 block">
      <span class="text-sm font-medium">{labels.customCss}</span>
      <span class="mt-1 block text-xs text-muted-foreground">{labels.customCssDescription}</span>
      <Textarea
        class="mt-2 min-h-32 font-mono text-xs"
        value={customStyle}
        oninput={(event) => dispatch("preview", { key: "customStyle", value: event.currentTarget.value })}
        onchange={(event) => dispatch("changed", { key: "customStyle", value: event.currentTarget.value })}
      />
    </label>
  </details>
</div>
