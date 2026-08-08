<script lang="ts" module>
  export interface LayoutActionsSettingsLabels {
    dockEnabled: string;
    dockEnabledDescription: string;
    dockPosition: string;
    actions: string;
    addAction: string;
    enabled: string;
    title: string;
    icon: string;
    kind: string;
    command: string;
    commandId: string;
    placement: string;
    system: string;
    plugin: string;
    editor: string;
    placementMenu: string;
    dock: string;
    both: string;
    leftTop: string;
    leftBottom: string;
    rightTop: string;
    rightBottom: string;
    bottomLeft: string;
    bottomRight: string;
    unavailable: string;
    moveUp: string;
    moveDown: string;
    remove: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import * as Select from "@/components/ui/select";
  import {
    DEFAULT_ACTIONS,
    normalizeConfiguredActions,
    resolveActionTitle,
    type ActionKind,
    type ActionPlacement,
    type ConfiguredAction,
  } from "./actions";
  import { collectCommandOptions, type CommandOption } from "./runtime";
  import { plugin } from "@/utils";
  import type { TPluginDockPosition } from "siyuan";

  export let group: string;
  export let title: string;
  export let actions: ConfiguredAction[] = [];
  export let showDock = false;
  export let dockPosition: TPluginDockPosition = "RightBottom";
  export let labels: LayoutActionsSettingsLabels;
  export let mobile = false;

  const dispatch = createEventDispatcher();
  let catalog: Record<ActionKind, CommandOption[]> = { system: [], plugin: [], editor: [] };

  onMount(() => {
    catalog = collectCommandOptions();
  });

  $: normalizedActions = normalizeConfiguredActions(actions);

  function changed(key: string, value: unknown) {
    dispatch("changed", { group, key, value });
  }

  function updateAction(index: number, patch: Partial<ConfiguredAction>) {
    const next = normalizedActions.map((action, actionIndex) =>
      actionIndex === index ? { ...action, ...patch } : action,
    );
    actions = next;
    changed("actions", next);
  }

  function addAction() {
    const template = DEFAULT_ACTIONS[0];
    actions = [...normalizedActions, {
      ...template,
      id: `custom-action-${Date.now()}`,
      title: labels.addAction,
      value: catalog.system[0]?.value || "switchLeftDock",
      enabled: false,
    }];
    changed("actions", actions);
  }

  function removeAction(index: number) {
    actions = normalizedActions.filter((_, actionIndex) => actionIndex !== index);
    changed("actions", actions);
  }

  function moveAction(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= normalizedActions.length) return;
    const next = [...normalizedActions];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    actions = next;
    changed("actions", next);
  }

  function optionLabel(action: ConfiguredAction): string {
    return catalog[action.kind].find((option) => option.value === action.value)?.label || action.value;
  }

  function actionTitle(action: ConfiguredAction): string {
    return resolveActionTitle(action, plugin?.i18n ?? {});
  }
</script>

<section class="space-y-5" data-mobile={mobile}>
  <header class="border-b border-border pb-4">
    <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
  </header>

  <div class="border-y border-border">
    <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 px-3 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-3">
      <div class="min-w-0">
        <div class="text-sm font-medium">{labels.dockEnabled}</div>
        <div class="mt-1 text-xs leading-5 text-muted-foreground">{labels.dockEnabledDescription}</div>
      </div>
      <Switch checked={showDock} onCheckedChange={(checked) => { showDock = checked; changed("showDock", checked); }} aria-label={labels.dockEnabled} />
    </div>

    <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(180px,auto)] items-center gap-5 border-t border-border px-3 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-3">
      <div class="text-sm font-medium">{labels.dockPosition}</div>
      <Select.Root type="single" value={dockPosition} onValueChange={(value) => { dockPosition = value as TPluginDockPosition; changed("dockPosition", dockPosition); }}>
        <Select.Trigger class="w-52 max-w-full">{{
          LeftTop: labels.leftTop,
          LeftBottom: labels.leftBottom,
          RightTop: labels.rightTop,
          RightBottom: labels.rightBottom,
          BottomLeft: labels.bottomLeft,
          BottomRight: labels.bottomRight,
        }[dockPosition]}</Select.Trigger>
        <Select.Content>
          <Select.Item value="LeftTop" label={labels.leftTop} />
          <Select.Item value="LeftBottom" label={labels.leftBottom} />
          <Select.Item value="RightTop" label={labels.rightTop} />
          <Select.Item value="RightBottom" label={labels.rightBottom} />
          <Select.Item value="BottomLeft" label={labels.bottomLeft} />
          <Select.Item value="BottomRight" label={labels.bottomRight} />
        </Select.Content>
      </Select.Root>
    </div>
  </div>

  <div class="flex items-center justify-between gap-3 border-b border-border pb-3">
    <div class="text-sm font-semibold">{labels.actions}</div>
    <Button variant="outline" size="sm" onclick={addAction}><Plus />{labels.addAction}</Button>
  </div>

  <div class="space-y-3">
    {#each normalizedActions as action, index (action.id)}
      <article class="rounded-md border border-border bg-background p-3">
        <div class="flex items-center gap-2 border-b border-border pb-3">
          <Switch checked={action.enabled} onCheckedChange={(enabled) => updateAction(index, { enabled })} aria-label={`${labels.enabled}: ${actionTitle(action)}`} />
          <Input class="min-w-0 flex-1" value={actionTitle(action)} placeholder={labels.title} onchange={(event) => updateAction(index, { title: event.currentTarget.value })} />
          <Button variant="ghost" size="icon-sm" title={labels.moveUp} aria-label={labels.moveUp} disabled={index === 0} onclick={() => moveAction(index, -1)}><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" title={labels.moveDown} aria-label={labels.moveDown} disabled={index === normalizedActions.length - 1} onclick={() => moveAction(index, 1)}><ArrowDown /></Button>
          <Button variant="ghost" size="icon-sm" title={labels.remove} aria-label={labels.remove} onclick={() => removeAction(index)}><Trash2 /></Button>
        </div>

        <div class="grid grid-cols-2 gap-3 pt-3 max-[720px]:grid-cols-1">
          <label class="grid gap-1 text-xs text-muted-foreground">
            <span>{labels.kind}</span>
            <Select.Root type="single" value={action.kind} onValueChange={(value) => {
              const kind = value as ActionKind;
              updateAction(index, { kind, value: catalog[kind][0]?.value || "" });
            }}>
              <Select.Trigger class="w-full">{{ system: labels.system, plugin: labels.plugin, editor: labels.editor }[action.kind]}</Select.Trigger>
              <Select.Content>
                <Select.Item value="system" label={labels.system} />
                <Select.Item value="plugin" label={labels.plugin} />
                <Select.Item value="editor" label={labels.editor} />
              </Select.Content>
            </Select.Root>
          </label>

          <label class="grid gap-1 text-xs text-muted-foreground">
            <span>{labels.placement}</span>
            <Select.Root type="single" value={action.placement} onValueChange={(value) => updateAction(index, { placement: value as ActionPlacement })}>
              <Select.Trigger class="w-full">{{ menu: labels.placementMenu, dock: labels.dock, both: labels.both }[action.placement]}</Select.Trigger>
              <Select.Content>
                <Select.Item value="menu" label={labels.placementMenu} />
                <Select.Item value="dock" label={labels.dock} />
                <Select.Item value="both" label={labels.both} />
              </Select.Content>
            </Select.Root>
          </label>

          <label class="grid gap-1 text-xs text-muted-foreground">
            <span>{labels.command}</span>
            <Select.Root type="single" value={action.value} onValueChange={(value) => updateAction(index, { value })}>
              <Select.Trigger class="w-full">{optionLabel(action)}</Select.Trigger>
              <Select.Content>
                {#each catalog[action.kind] as option}
                  <Select.Item value={option.value} label={option.available ? option.label : `${option.label} (${labels.unavailable})`} />
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <label class="grid gap-1 text-xs text-muted-foreground">
            <span>{labels.commandId}</span>
            <Input value={action.value} onchange={(event) => updateAction(index, { value: event.currentTarget.value })} />
          </label>

          <label class="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
            <span>{labels.icon}</span>
            <Input value={action.icon} placeholder="iconMenu" onchange={(event) => updateAction(index, { icon: event.currentTarget.value })} />
          </label>
        </div>
      </article>
    {/each}
  </div>
</section>
