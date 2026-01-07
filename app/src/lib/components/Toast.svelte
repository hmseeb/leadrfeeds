<script lang="ts">
	import { toast, type Toast } from '$lib/stores/toast';
	import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	const toasts = $derived($toast);

	const icons = {
		success: CheckCircle,
		error: AlertCircle,
		warning: AlertTriangle,
		info: Info
	};

	const styles = {
		success: {
			bg: 'bg-chart-4/10 border-chart-4/50',
			icon: 'text-chart-4',
			text: 'text-foreground'
		},
		error: {
			bg: 'bg-primary/10 border-primary/50',
			icon: 'text-primary',
			text: 'text-foreground'
		},
		warning: {
			bg: 'bg-secondary/10 border-secondary/50',
			icon: 'text-secondary',
			text: 'text-foreground'
		},
		info: {
			bg: 'bg-accent/10 border-accent/50',
			icon: 'text-accent',
			text: 'text-foreground'
		}
	};
</script>

{#if toasts.length > 0}
	<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
		{#each toasts as t (t.id)}
			{@const Icon = icons[t.type]}
			{@const style = styles[t.type]}
			<div
				class="flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm shadow-lg {style.bg}"
				transition:fly={{ x: 100, duration: 200 }}
				role="alert"
			>
				<Icon size={20} class="{style.icon} flex-shrink-0 mt-0.5" />
				<p class="flex-1 text-sm {style.text}">{t.message}</p>
				<button
					onclick={() => toast.remove(t.id)}
					class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
					aria-label="Dismiss"
				>
					<X size={16} />
				</button>
			</div>
		{/each}
	</div>
{/if}
