<script lang="ts">
	import { Combobox as SelectPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "@/lib/utils.js";
	import type { WithoutChildrenOrChild } from "@/lib/utils.js";
	import { isolatePortaledSelectGestures } from "../select/select-gesture-isolation.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		// A Combobox is a non-modal popover. Locking document scrolling here causes
		// SiYuan's scrollable settings dialog to become unusable while the portal
		// is open, especially when the portal itself is clipped by the dialog.
		preventScroll = false,
		...restProps
	}: WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPrimitive.Portal>>;
	} = $props();

	$effect(() => {
		if (!ref) return;
		const isolation = isolatePortaledSelectGestures(ref);
		return () => isolation.destroy();
	});
</script>

<SelectPrimitive.Portal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="combobox-content"
		class={cn(
			"damophus-combobox-content relative isolate z-[10000] overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-md bg-popover text-popover-foreground shadow-md",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
