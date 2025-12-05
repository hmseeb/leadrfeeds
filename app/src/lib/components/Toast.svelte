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
			bg: 'bg-green-500/10 border-green-500/50',
			icon: 'text-green-500',
			text: 'text-green-100'
		},
		error: {
			bg: 'bg-red-500/10 border-red-500/50',
			icon: 'text-red-500',
			text: 'text-red-100'
		},
		warning: {
			bg: 'bg-yellow-500/10 border-yellow-500/50',
			icon: 'text-yellow-500',
			text: 'text-yellow-100'
		},
		info: {
			bg: 'bg-blue-500/10 border-blue-500/50',
			icon: 'text-blue-500',
			text: 'text-blue-100'
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
					class="text-gray-400 hover:text-white transition-colors flex-shrink-0"
					aria-label="Dismiss"
				>
					<X size={16} />
				</button>
			</div>
		{/each}
	</div>
{/if}
