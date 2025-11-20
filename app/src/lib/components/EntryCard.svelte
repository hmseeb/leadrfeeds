<script lang="ts">
	import { Star, ExternalLink } from 'lucide-svelte';
	import { formatDistanceToNow } from 'date-fns';

	interface Entry {
		entry_id: string;
		entry_title: string;
		entry_description: string;
		entry_content: string;
		entry_author: string;
		entry_url: string;
		entry_published_at: string;
		feed_id: string;
		feed_title: string;
		feed_category: string;
		feed_image: string;
		is_read: boolean;
		is_starred: boolean;
	}

	interface Props {
		entry: Entry;
		onToggleStar: (entryId: string) => void;
		onMarkRead: (entryId: string) => void;
		onClick: (entry: Entry) => void;
	}

	let { entry, onToggleStar, onMarkRead, onClick }: Props = $props();

	function getTimeAgo(dateString: string) {
		try {
			return formatDistanceToNow(new Date(dateString), { addSuffix: true });
		} catch {
			return '';
		}
	}

	function handleClick() {
		if (!entry.is_read) {
			onMarkRead(entry.entry_id);
		}
		onClick(entry);
	}

	function handleStarClick(e: MouseEvent) {
		e.stopPropagation();
		onToggleStar(entry.entry_id);
	}
</script>

<article
	onclick={handleClick}
	class="bg-card border border-border rounded-lg p-6 hover:border-primary hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.01] transition-all duration-200 cursor-pointer {!entry.is_read ? 'border-l-4 border-l-primary shadow-md shadow-black/20' : 'shadow-sm shadow-black/10'}"
>
	<!-- Feed Info -->
	<div class="flex items-center gap-3 mb-3">
		{#if entry.feed_image}
			<img
				src={entry.feed_image}
				alt={entry.feed_title}
				class="w-6 h-6 rounded object-cover"
				onerror={(e) => {
					if (!e.target.dataset.fallbackAttempted) {
						e.target.dataset.fallbackAttempted = 'true';
						e.target.src = entry.entry_url
							? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(entry.entry_url)}&size=64`
							: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
					} else {
						e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
					}
				}}
			/>
		{:else if entry.entry_url}
			<img
				src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(entry.entry_url)}&size=64`}
				alt={entry.feed_title}
				class="w-6 h-6 rounded object-cover"
				onerror={(e) => {
					e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
				}}
			/>
		{:else}
			<div class="w-6 h-6 rounded flex items-center justify-center bg-accent/10">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2">
					<path d="M4 11a9 9 0 0 1 9 9"/>
					<path d="M4 4a16 16 0 0 1 16 16"/>
					<circle cx="5" cy="19" r="1"/>
				</svg>
			</div>
		{/if}
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<span class="text-sm font-medium text-foreground truncate">
				{entry.feed_title}
			</span>
			<span class="px-2 py-0.5 text-xs bg-accent/20 text-accent font-medium rounded-full border border-accent/30">
				{entry.feed_category}
			</span>
		</div>
		<button
			onclick={handleStarClick}
			class="text-muted-foreground hover:text-accent hover:scale-110 transition-all duration-200"
		>
			<Star
				size={18}
				class={entry.is_starred ? 'fill-accent text-accent drop-shadow-lg' : ''}
			/>
		</button>
	</div>

	<!-- Title -->
	<h2 class="text-lg font-semibold text-foreground mb-2 {!entry.is_read ? 'font-bold' : ''}">
		{entry.entry_title || 'Untitled Post'}
	</h2>

	<!-- Description -->
	{#if entry.entry_description}
		<p class="text-sm text-muted-foreground mb-3 line-clamp-2">
			{entry.entry_description}
		</p>
	{/if}

	<!-- Metadata -->
	<div class="flex items-center gap-3 text-xs text-muted-foreground">
		{#if entry.entry_author}
			<span>{entry.entry_author}</span>
			<span>•</span>
		{/if}
		<span>{getTimeAgo(entry.entry_published_at)}</span>
		{#if entry.entry_url}
			<a
				href={entry.entry_url}
				target="_blank"
				rel="noopener noreferrer"
				onclick={(e) => e.stopPropagation()}
				class="ml-auto flex items-center gap-1 text-primary hover:text-primary/90"
			>
				<ExternalLink size={12} />
				Open
			</a>
		{/if}
	</div>
</article>
