<script lang="ts">
	import { Menu, MessageCircle } from 'lucide-svelte';

	let {
		onMenuClick,
		onChatClick,
		showChatButton = false
	}: {
		onMenuClick: () => void;
		onChatClick?: () => void;
		showChatButton?: boolean;
	} = $props();
</script>

<header class="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border safe-area-inset-top lg:hidden">
	<!-- Hamburger Menu Button -->
	<button
		onclick={onMenuClick}
		class="flex items-center justify-center w-10 h-10 -ml-2 hover:bg-sidebar-accent transition-colors"
		aria-label="Open menu"
	>
		<Menu size={24} class="text-sidebar-foreground/80" />
	</button>

	<!-- Logo -->
	<img src="/logo.png" alt="LeadrFeeds" class="h-8 object-contain" />

	<!-- Chat Button (optional) -->
	{#if showChatButton && onChatClick}
		<button
			onclick={onChatClick}
			class="flex items-center justify-center w-10 h-10 -mr-2 hover:bg-sidebar-accent transition-colors"
			aria-label="Open chat"
		>
			<MessageCircle size={24} class="text-sidebar-foreground/80" />
		</button>
	{:else}
		<!-- Spacer to keep title centered -->
		<div class="w-10 h-10"></div>
	{/if}
</header>
