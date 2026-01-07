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

	interface Props {
		selectedIcon: string;
		onSelect: (iconName: string) => void;
	}

	let { selectedIcon, onSelect }: Props = $props();

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

	const iconNames = Object.keys(ICONS);
</script>

<div class="grid grid-cols-6 gap-2 p-2 max-h-48 overflow-y-auto">
	{#each iconNames as iconName}
		{@const IconComponent = ICONS[iconName]}
		<button
			type="button"
			onclick={() => onSelect(iconName)}
			class="p-2 rounded-lg transition-all duration-150 flex items-center justify-center cursor-pointer
				{selectedIcon === iconName
				? 'bg-primary/30 ring-2 ring-primary text-primary'
				: 'hover:bg-muted text-muted-foreground hover:text-foreground'}"
			title={iconName}
		>
			<IconComponent size={20} />
		</button>
	{/each}
</div>
