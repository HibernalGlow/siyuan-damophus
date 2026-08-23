<script lang="ts">
	import * as Collapsible from '@/components/ui/collapsible/index.js';
	import { Folder as FolderIcon, FolderOpen as FolderOpenIcon } from 'lucide-svelte';
	import { cn } from '@/lib/utils.js';
	import type { TreeViewFolderProps } from './types';

	let {
		name,
		open = $bindable(true),
		class: className,
		icon,
		children
	}: TreeViewFolderProps = $props();
</script>

<Collapsible.Root bind:open>
	<Collapsible.Trigger
		role="treeitem"
		aria-expanded={open}
		class={cn('flex appearance-none place-items-center gap-1 border-0 bg-transparent p-0 text-inherit', className)}
	>
		{#if icon}
			{@render icon({ name, open })}
		{:else if open}
			<FolderOpenIcon class="size-4" />
		{:else}
			<FolderIcon class="size-4" />
		{/if}
		<span>{name}</span>
	</Collapsible.Trigger>
	<Collapsible.Content role="group" class="ml-2 border-l">
		<div class="relative flex place-items-start">
			<div class="bg-border mx-2 h-full w-px"></div>
			<div class="flex flex-1 flex-col">
				{@render children?.()}
			</div>
		</div>
	</Collapsible.Content>
</Collapsible.Root>
