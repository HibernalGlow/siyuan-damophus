<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import { isMobile } from "../utils";
  import {
    normalizeExcludedRules,
    type ExcludedRuleItem,
  } from "@/lets-network-assets-local/network-assets-local";

  export let value: ExcludedRuleItem[] | string = [];

  const dispatch = createEventDispatcher<{ value: ExcludedRuleItem[] }>();

  let rules: ExcludedRuleItem[] = normalizeExcludedRules(value);

  $: {
    const normalized = normalizeExcludedRules(value);
    if (JSON.stringify(normalized) !== JSON.stringify(rules)) {
      rules = normalized;
    }
  }

  function notifyChange() {
    dispatch("value", rules);
  }

  function addRule() {
    rules = [
      ...rules,
      { pattern: "", description: "", enabled: true },
    ];
    notifyChange();
  }

  function removeRule(index: number) {
    rules.splice(index, 1);
    rules = [...rules];
    notifyChange();
  }

  function toggleRule(index: number, enabled: boolean) {
    rules[index].enabled = enabled;
    rules = [...rules];
    notifyChange();
  }

  function moveUp(index: number) {
    if (index > 0) {
      const temp = rules[index];
      rules[index] = rules[index - 1];
      rules[index - 1] = temp;
      rules = [...rules];
      notifyChange();
    }
  }

  function moveDown(index: number) {
    if (index < rules.length - 1) {
      const temp = rules[index];
      rules[index] = rules[index + 1];
      rules[index + 1] = temp;
      rules = [...rules];
      notifyChange();
    }
  }
</script>

<div class="damophus-excluded-rules flex flex-col gap-2.5 w-full mt-2">
  {#if rules.length === 0}
    <div class="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
      暂无排除规则，点击下方按钮添加
    </div>
  {/if}

  {#each rules as rule, index}
    <div
      class="rule-item flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20 transition-all"
      class:opacity-50={!rule.enabled}
      class:flex-col={isMobile}
      class:items-stretch={isMobile}
    >
      <div class="flex items-center gap-2 shrink-0">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(checked) => toggleRule(index, checked)}
          aria-label="启用此规则"
        />
        {#if isMobile}
          <span class="text-xs font-medium text-muted-foreground">
            {rule.enabled ? "已启用" : "已停用"}
          </span>
        {/if}
      </div>

      <div class="flex-1 min-w-0" style="flex: 2;">
        <Input
          type="text"
          class="font-mono text-xs w-full bg-background"
          bind:value={rule.pattern}
          placeholder="正则表达式 (例如: inkloomer\.github\.io/inkloom)"
          oninput={notifyChange}
        />
      </div>

      <div class="flex-1 min-w-0" style="flex: 1;">
        <Input
          type="text"
          class="text-xs w-full bg-background"
          bind:value={rule.description}
          placeholder="备注说明（可选）"
          oninput={notifyChange}
        />
      </div>

      <div class="flex items-center gap-1 shrink-0 justify-end" class:w-full={isMobile}>
        <Button
          variant="ghost"
          size="icon-sm"
          title="上移"
          aria-label="上移"
          onclick={() => moveUp(index)}
          disabled={index === 0}
        >
          <ArrowUp class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="下移"
          aria-label="下移"
          onclick={() => moveDown(index)}
          disabled={index === rules.length - 1}
        >
          <ArrowDown class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-destructive hover:text-destructive hover:bg-destructive/10"
          title="删除"
          aria-label="删除"
          onclick={() => removeRule(index)}
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>
    </div>
  {/each}

  <div class="pt-1">
    <Button
      variant="outline"
      size="sm"
      class="w-full flex items-center justify-center gap-1.5 border-dashed"
      onclick={addRule}
    >
      <Plus class="size-4" />
      <span>添加排除规则</span>
    </Button>
  </div>
</div>
