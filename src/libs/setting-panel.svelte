<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import SettingItem from "./setting-item.svelte";

  export let group: string;
  export let settingItems: ISettingItem[];
  export let display = true;

  const dispatch = createEventDispatcher();
</script>

<section class:hidden={!display} class="border-y border-border" data-name={group}>
  {#each settingItems as item (item.key)}
    <SettingItem
      type={item.type}
      title={item.title}
      description={item.description}
      settingKey={item.key}
      settingValue={item.value}
      placeholder={item?.placeholder}
      options={item?.options}
      columns={item?.columns}
      slider={item?.slider}
      height={item?.height}
      on:click={(event) => dispatch("click", { group, ...event.detail })}
      on:changed={(event) => dispatch("changed", { group, ...event.detail })}
      on:preview={(event) => dispatch("preview", { group, ...event.detail })}
    />
  {/each}
</section>
