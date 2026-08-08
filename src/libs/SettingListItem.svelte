<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { isMobile } from "../utils";
  import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";

  export let value: any[] = [];
  export let columns: Array<{
    key: string;
    title: string;
    type: "text" | "number" | "select";
    width?: string;
    options?: Record<string, string>;
  }> = [];

  // Ensure value is an array
  if (!Array.isArray(value)) {
    value = [];
  }

  const dispatch = createEventDispatcher();

  function addItem() {
    const newItem: Record<string, any> = {};
    columns.forEach(col => {
      newItem[col.key] = "";
    });
    value = [...value, newItem];
    notifyChange();
  }

  function removeItem(index: number) {
    value.splice(index, 1);
    value = [...value];
    notifyChange();
  }

  function moveUp(index: number) {
    if (index > 0) {
      const temp = value[index];
      value[index] = value[index - 1];
      value[index - 1] = temp;
      value = [...value];
      notifyChange();
    }
  }

  function moveDown(index: number) {
    if (index < value.length - 1) {
      const temp = value[index];
      value[index] = value[index + 1];
      value[index + 1] = temp;
      value = [...value];
      notifyChange();
    }
  }

  function notifyChange() {
    dispatch("value", value);
  }
</script>

<div class="setting-list-container">
  {#each value as item, index}
    <div class="list-row" class:mobile={isMobile}>
      <!-- 动态渲染列 -->
      <div class="list-fields" class:mobile={isMobile}>
        {#each columns as col}
          <div class="field-item" style:flex={col.width && col.width !== '1fr' ? `0 0 ${col.width}` : "1"}>
            {#if isMobile}
              <span class="field-label mobile-only">{col.title}</span>
            {/if}
            
            {#if col.type === "select" && col.options}
              <Select.Root type="single" value={String(item[col.key])} onValueChange={(next) => { item[col.key] = next; notifyChange(); }}>
                <Select.Trigger class="w-full">{col.options[String(item[col.key])] ?? item[col.key]}</Select.Trigger>
                <Select.Content>{#each Object.entries(col.options) as [optValue, optLabel]}<Select.Item value={optValue} label={optLabel} />{/each}</Select.Content>
              </Select.Root>
            {:else if col.type === "number"}
              <Input type="number" bind:value={item[col.key]} placeholder={col.title} oninput={notifyChange} />
            {:else}
              <Input type="text" bind:value={item[col.key]} placeholder={col.title} oninput={notifyChange} />
            {/if}
          </div>
        {/each}
      </div>
      
      <!-- 操作区 -->
      <div class="list-actions" class:mobile={isMobile}>
        <Button variant="ghost" size="icon-sm" title="上移" aria-label="上移" onclick={() => moveUp(index)} disabled={index === 0}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" title="下移" aria-label="下移" onclick={() => moveDown(index)} disabled={index === value.length - 1}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" title="删除" aria-label="删除" onclick={() => removeItem(index)}><Trash2 /></Button>
      </div>
    </div>
  {/each}
  <div class="list-add-action">
    <Button variant="outline" class="w-full" onclick={addItem}><Plus />添加项</Button>
  </div>
</div>

<style>
  .setting-list-container {
    width: 100%;
    margin-top: 8px;
  }

  .list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  
  .list-row.mobile {
    flex-direction: column;
    background: var(--b3-theme-surface-light);
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--b3-border-color);
  }

  .list-fields {
    display: flex;
    flex: 1;
    gap: 8px;
    width: 100%;
  }

  .list-fields.mobile {
    flex-direction: column;
  }

  .field-item {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0; /* Prevent flex overflow */
  }

  .mobile-only {
    display: block;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-bottom: 4px;
  }

  .list-actions {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
  }

  .list-actions.mobile {
    margin-top: 8px;
    width: 100%;
    justify-content: flex-end;
  }

  .list-add-action {
    margin-top: 12px;
  }
</style>
