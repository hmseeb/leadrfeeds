<script lang="ts">
	interface Param {
		name: string;
		type: string;
		required: boolean;
		description: string;
		default?: string;
	}

	interface Props {
		params: Param[];
	}

	let { params }: Props = $props();
</script>

<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-border">
				<th class="px-3 py-2 text-left font-medium">Parameter</th>
				<th class="px-3 py-2 text-left font-medium">Type</th>
				<th class="px-3 py-2 text-left font-medium">Required</th>
				<th class="px-3 py-2 text-left font-medium">Description</th>
			</tr>
		</thead>
		<tbody>
			{#each params as param}
				<tr class="border-b border-border/50">
					<td class="px-3 py-2 font-mono text-primary">{param.name}</td>
					<td class="px-3 py-2 text-muted-foreground">{param.type}</td>
					<td class="px-3 py-2">
						{#if param.required}
							<span class="text-destructive">Yes</span>
						{:else}
							<span class="text-muted-foreground">No</span>
						{/if}
					</td>
					<td class="px-3 py-2">
						{param.description}
						{#if param.default !== undefined}
							<span class="text-muted-foreground"> (default: <code class="rounded bg-muted px-1 py-0.5 text-xs">{param.default}</code>)</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
