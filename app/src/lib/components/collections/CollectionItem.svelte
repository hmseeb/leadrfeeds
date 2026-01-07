<script lang="ts">
	import {
		Folder,
		FolderOpen,
		Star,
		Heart,
		Bookmark,
		Tag,
		Hash,
		Briefcase,
		Code,
		Coffee,
		Flame,
		Zap,
		Trophy,
		Target,
		Flag,
		Bell,
		Lightbulb,
		Rocket,
		Globe,
		Book,
		Newspaper,
		Rss,
		Radio,
		Tv,
		Film,
		Music,
		Gamepad2,
		Dumbbell,
		Utensils,
		Car,
		Plane,
		Home,
		Building,
		Laptop,
		Smartphone,
		Users
	} from 'lucide-svelte';
	import type { Collection } from '$lib/stores/collections';

	interface Props {
		collection: Collection;
		isActive: boolean;
		isCollapsed: boolean;
		onNavigate?: () => void;
	}

	let { collection, isActive, isCollapsed, onNavigate }: Props = $props();

	// Map icon names to components
	const ICONS: Record<string, typeof Folder> = {
		Folder,
		FolderOpen,
		Star,
		Heart,
		Bookmark,
		Tag,
		Hash,
		Briefcase,
		Code,
		Coffee,
		Flame,
		Zap,
		Trophy,
		Target,
		Flag,
		Bell,
		Lightbulb,
		Rocket,
		Globe,
		Book,
		Newspaper,
		Rss,
		Radio,
		Tv,
		Film,
		Music,
		Gamepad2,
		Dumbbell,
		Utensils,
		Car,
		Plane,
		Home,
		Building,
		Laptop,
		Smartphone,
		Users
	};

	const IconComponent = $derived(ICONS[collection.icon_name] || Folder);
</script>

<a
	href="/timeline/collection:{collection.collection_id}"
	onclick={onNavigate}
	class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0
		{isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : 'text-sidebar-foreground/80'}"
	title={isCollapsed ? collection.collection_name : undefined}
>
	<IconComponent
		size={18}
		class="{isActive ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0"
	/>
	{#if !isCollapsed}
		<span class="flex-1 min-w-0 truncate">{collection.collection_name}</span>
		{#if collection.unread_count > 0}
			<span
				class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {isActive ? 'bg-white/30 text-white' : 'bg-primary/20 text-primary'}"
			>
				{collection.unread_count}
			</span>
		{/if}
	{/if}
</a>
