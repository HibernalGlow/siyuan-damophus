<script lang="ts">
	import { File as FileIcon } from 'lucide-svelte';
	import { cn } from '@/lib/utils.js';
	import type { TreeViewFileProps } from './types';

	let { name, icon, type = 'button', class: className, ...rest }: TreeViewFileProps = $props();
</script>

<button
	{type}
	role="treeitem"
	class={cn('flex appearance-none place-items-center gap-1 border-0 bg-transparent p-0 pl-[3px] text-inherit', className)}
	{...rest}
>
	{#if icon}
		{@render icon({ name })}
	{:else}
		<FileIcon class="size-4" />
	{/if}
	<span>{name}</span>
</button>
