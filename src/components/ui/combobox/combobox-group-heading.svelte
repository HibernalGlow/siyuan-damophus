<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";
	import { cn } from "@/lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ComboboxPrimitive.GroupHeadingProps = $props();
</script>

<ComboboxPrimitive.GroupHeading
	bind:ref
	data-slot="combobox-group-heading"
	class={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</ComboboxPrimitive.GroupHeading>
