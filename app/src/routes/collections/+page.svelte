<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth';
	import { collectionsStore, type Collection, type CollectionFeed } from '$lib/stores/collections';
	import { sidebarStore } from '$lib/stores/sidebar';
	import { toast } from '$lib/stores/toast';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';
	import CollectionModal from '$lib/components/collections/CollectionModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		Plus,
		Pencil,
		Trash2,
		ChevronDown,
		ChevronRight,
		GripVertical,
		X,
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
		Users,
		Search
	} from 'lucide-svelte';

	// Icon mapping for dynamic rendering
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

	// Responsive state
	const isDesktopMode = $derived($useDesktopLayout);
	let isSidebarOpen = $state(false);

	// Data state
	const collections = $derived($collectionsStore.collections);
	const feeds = $derived($sidebarStore.feeds);
	let loading = $state(true);

	// UI state
	let isModalOpen = $state(false);
	let editingCollection = $state<Collection | null>(null);
	let expandedCollections = $state<Set<string>>(new Set());
	let collectionFeeds = $state<Map<string, CollectionFeed[]>>(new Map());
	let loadingFeeds = $state<Set<string>>(new Set());

	// Drag and drop state
	let draggedFeedId = $state<string | null>(null);
	let dragOverCollectionId = $state<string | null>(null);

	// Delete confirmation state
	let isDeleteModalOpen = $state(false);
	let collectionToDelete = $state<Collection | null>(null);

	// Search state for available feeds
	let feedSearch = $state('');

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		await Promise.all([collectionsStore.loadCollections(true), sidebarStore.loadFeeds(true)]);

		loading = false;
	});

	function toggleExpand(collectionId: string) {
		const newExpanded = new Set(expandedCollections);
		if (newExpanded.has(collectionId)) {
			newExpanded.delete(collectionId);
		} else {
			newExpanded.add(collectionId);
			// Load feeds for this collection if not already loaded
			loadCollectionFeeds(collectionId);
		}
		expandedCollections = newExpanded;
	}

	async function loadCollectionFeeds(collectionId: string) {
		if (collectionFeeds.has(collectionId) || loadingFeeds.has(collectionId)) return;

		loadingFeeds = new Set([...loadingFeeds, collectionId]);

		const feeds = await collectionsStore.getCollectionFeeds(collectionId);
		collectionFeeds = new Map(collectionFeeds).set(collectionId, feeds);

		const newLoadingFeeds = new Set(loadingFeeds);
		newLoadingFeeds.delete(collectionId);
		loadingFeeds = newLoadingFeeds;
	}

	function openNewCollectionModal() {
		editingCollection = null;
		isModalOpen = true;
	}

	function openEditCollectionModal(collection: Collection) {
		editingCollection = collection;
		isModalOpen = true;
	}

	async function handleSaveCollection(name: string, iconName: string) {
		try {
			if (editingCollection) {
				await collectionsStore.updateCollection(editingCollection.collection_id, name, iconName);
				toast.success('Collection updated');
			} else {
				await collectionsStore.createCollection(name, iconName);
				toast.success('Collection created');
			}
		} catch (err: any) {
			toast.error(err.message || 'Failed to save collection');
			throw err; // Re-throw to keep modal open with error state
		}
	}

	function openDeleteModal(collection: Collection) {
		collectionToDelete = collection;
		isDeleteModalOpen = true;
	}

	async function confirmDeleteCollection() {
		if (collectionToDelete) {
			await collectionsStore.deleteCollection(collectionToDelete.collection_id);
			collectionToDelete = null;
		}
	}

	function cancelDeleteCollection() {
		collectionToDelete = null;
	}

	async function handleRemoveFeedFromCollection(collectionId: string, feedId: string) {
		await collectionsStore.removeFeedFromCollection(collectionId, feedId);
		// Refresh the feeds for this collection
		const feeds = await collectionsStore.getCollectionFeeds(collectionId);
		collectionFeeds = new Map(collectionFeeds).set(collectionId, feeds);
	}

	// Drag and drop handlers
	function handleDragStart(e: DragEvent, feedId: string) {
		draggedFeedId = feedId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', feedId);
		}
	}

	function handleDragEnd() {
		draggedFeedId = null;
		dragOverCollectionId = null;
	}

	function handleDragOver(e: DragEvent, collectionId: string) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		dragOverCollectionId = collectionId;
	}

	function handleDragLeave() {
		dragOverCollectionId = null;
	}

	async function handleDrop(e: DragEvent, collectionId: string) {
		e.preventDefault();
		dragOverCollectionId = null;

		if (draggedFeedId) {
			await collectionsStore.addFeedToCollection(collectionId, draggedFeedId);
			// Refresh the feeds for this collection if it's expanded
			if (expandedCollections.has(collectionId)) {
				const feeds = await collectionsStore.getCollectionFeeds(collectionId);
				collectionFeeds = new Map(collectionFeeds).set(collectionId, feeds);
			}
		}

		draggedFeedId = null;
	}

	function getIconComponent(iconName: string) {
		return ICONS[iconName] || Folder;
	}

	// Get feeds not in any collection for the "Available Feeds" section
	const availableFeeds = $derived(() => {
		const feedsInCollections = new Set<string>();
		for (const feedList of collectionFeeds.values()) {
			for (const feed of feedList) {
				feedsInCollections.add(feed.feed_id);
			}
		}
		return feeds.filter((f) => !feedsInCollections.has(f.feed_id));
	});

	// Filter feeds based on search query
	const filteredFeeds = $derived(() => {
		if (!feedSearch.trim()) return feeds;
		const query = feedSearch.toLowerCase().trim();
		return feeds.filter((f) => f.feed_title?.toLowerCase().includes(query));
	});
</script>

<!-- Mobile Header -->
{#if !isDesktopMode}
	<MobileHeader onMenuClick={() => (isSidebarOpen = true)} />
{/if}

<!-- Mobile Sidebar -->
{#if !isDesktopMode && isSidebarOpen}
	<Sidebar isMobileOpen={true} onMobileClose={() => (isSidebarOpen = false)} />
{/if}

<div class="flex h-screen bg-background {!isDesktopMode ? 'pt-14' : ''}">
	<!-- Desktop Sidebar -->
	{#if isDesktopMode}
		<Sidebar />
	{/if}

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-4xl mx-auto p-4 md:p-6">
			<!-- Header -->
			<div class="mb-6 md:mb-8 flex items-center justify-between">
				<div class="select-none">
					<h1 class="text-2xl md:text-3xl font-bold text-foreground mb-2">Collections</h1>
					<p class="text-muted-foreground text-sm md:text-base">
						Group your feeds into custom collections
					</p>
				</div>
				<button
					onclick={openNewCollectionModal}
					class="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
				>
					<Plus size={18} />
					<span class="hidden sm:inline">New Collection</span>
				</button>
			</div>

			{#if loading}
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<!-- Collections Shimmer -->
					<div class="space-y-4">
						<h2 class="text-lg font-semibold text-foreground select-none">Your Collections</h2>
						<div class="space-y-2">
							{#each Array(3) as _}
								<div class="bg-card border border-border rounded-lg p-4">
									<div class="flex items-center gap-3">
										<Skeleton variant="circular" width="18px" height="18px" />
										<Skeleton variant="circular" width="24px" height="24px" />
										<div class="flex-1">
											<Skeleton variant="text" height="18px" class="mb-1" />
											<Skeleton variant="text" width="80px" height="14px" />
										</div>
										<div class="flex items-center gap-1">
											<Skeleton variant="circular" width="32px" height="32px" />
											<Skeleton variant="circular" width="32px" height="32px" />
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Available Feeds Shimmer -->
					<div class="space-y-4">
						<h2 class="text-lg font-semibold text-foreground select-none">Available Feeds</h2>
						<p class="text-sm text-muted-foreground">
							Drag feeds to a collection to add them
						</p>
						<div class="bg-card border border-border rounded-lg p-4">
							<div class="space-y-1">
								{#each Array(5) as _}
									<div class="flex items-center gap-3 p-2">
										<Skeleton variant="rectangular" width="16px" height="16px" />
										<Skeleton variant="circular" width="20px" height="20px" />
										<Skeleton variant="text" height="16px" class="flex-1" />
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<!-- Collections List -->
					<div class="space-y-4">
						<h2 class="text-lg font-semibold text-foreground select-none">Your Collections</h2>

						{#if collections.length === 0}
							<div class="bg-card border border-border rounded-lg p-8 text-center">
								<div
									class="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center"
								>
									<Folder size={32} class="text-muted-foreground" />
								</div>
								<p class="text-muted-foreground mb-4">
									No collections yet. Create one to group your feeds!
								</p>
								<button
									onclick={openNewCollectionModal}
									class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
								>
									<Plus size={18} />
									Create Collection
								</button>
							</div>
						{:else}
							<div class="space-y-2">
								{#each collections as collection}
									{@const IconComponent = getIconComponent(collection.icon_name)}
									{@const isExpanded = expandedCollections.has(collection.collection_id)}
									{@const isDragOver = dragOverCollectionId === collection.collection_id}

									<div
										class="bg-card border rounded-lg overflow-hidden transition-all duration-200 {isDragOver
											? 'border-primary ring-2 ring-primary/30'
											: 'border-border'}"
										ondragover={(e) => handleDragOver(e, collection.collection_id)}
										ondragleave={handleDragLeave}
										ondrop={(e) => handleDrop(e, collection.collection_id)}
										role="listitem"
									>
										<!-- Collection Header -->
										<div class="flex items-center gap-3 p-4">
											<button
												onclick={() => toggleExpand(collection.collection_id)}
												class="p-1 hover:bg-muted rounded transition-colors"
											>
												{#if isExpanded}
													<ChevronDown size={18} class="text-muted-foreground" />
												{:else}
													<ChevronRight size={18} class="text-muted-foreground" />
												{/if}
											</button>

											<IconComponent
												size={24}
												class="text-primary flex-shrink-0"
											/>

											<div class="flex-1 min-w-0">
												<h3 class="font-medium text-foreground truncate">
													{collection.collection_name}
												</h3>
												<p class="text-xs text-muted-foreground">
													{collection.feed_count}
													{collection.feed_count === 1 ? 'feed' : 'feeds'}
													{#if collection.unread_count > 0}
														&middot; {collection.unread_count} unread
													{/if}
												</p>
											</div>

											<div class="flex items-center gap-1">
												<button
													onclick={() => openEditCollectionModal(collection)}
													class="p-2 hover:bg-muted rounded-lg transition-colors"
													title="Edit collection"
												>
													<Pencil size={16} class="text-muted-foreground" />
												</button>
												<button
													onclick={() => openDeleteModal(collection)}
													class="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
													title="Delete collection"
												>
													<Trash2 size={16} class="text-red-500" />
												</button>
											</div>
										</div>

										<!-- Expanded Feed List -->
										{#if isExpanded}
											<div class="border-t border-border bg-muted/30 p-3">
												{#if loadingFeeds.has(collection.collection_id)}
													<div class="space-y-1">
														{#each Array(2) as _}
															<div class="flex items-center gap-3 p-2 bg-card rounded-md">
																<Skeleton variant="circular" width="20px" height="20px" />
																<Skeleton variant="text" height="14px" class="flex-1" />
															</div>
														{/each}
													</div>
												{:else if (collectionFeeds.get(collection.collection_id)?.length ?? 0) === 0}
													<p class="text-sm text-muted-foreground text-center py-2">
														Drag feeds here to add them to this collection
													</p>
												{:else}
													<div class="space-y-1">
														{#each collectionFeeds.get(collection.collection_id) || [] as feed}
															{@const faviconUrl = feed.feed_site_url
																? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`
																: null}
															<div
																class="flex items-center gap-3 p-2 bg-card rounded-md group"
															>
																{#if faviconUrl}
																	<img
																		src={faviconUrl}
																		alt={feed.feed_title}
																		class="w-5 h-5 rounded object-cover flex-shrink-0"
																		onerror={(e) => {
																			const target = e.target as HTMLImageElement;
																			target.src = '/rss-fallback.svg';
																		}}
																	/>
																{:else}
																	<div
																		class="w-5 h-5 rounded flex items-center justify-center bg-primary/20 flex-shrink-0"
																	>
																		<Rss size={12} class="text-primary" />
																	</div>
																{/if}
																<span class="flex-1 text-sm text-foreground truncate">
																	{feed.feed_title}
																</span>
																<button
																	onclick={() =>
																		handleRemoveFeedFromCollection(
																			collection.collection_id,
																			feed.feed_id
																		)}
																	class="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded transition-all"
																	title="Remove from collection"
																>
																	<X size={14} class="text-red-500" />
																</button>
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Available Feeds (for drag and drop) -->
					<div class="space-y-4">
						<h2 class="text-lg font-semibold text-foreground select-none">Available Feeds</h2>
						<p class="text-sm text-muted-foreground">
							Drag feeds to a collection to add them
						</p>

						<div class="bg-card border border-border rounded-lg overflow-hidden">
							<!-- Search Input -->
							<div class="p-3 border-b border-border">
								<div class="relative">
									<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
									<input
										type="text"
										placeholder="Search feeds..."
										bind:value={feedSearch}
										class="w-full pl-9 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
									/>
									{#if feedSearch}
										<button
											onclick={() => feedSearch = ''}
											class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded transition-colors"
										>
											<X size={14} class="text-muted-foreground" />
										</button>
									{/if}
								</div>
							</div>

							<div class="p-4 pt-2">
								{#if feeds.length === 0}
									<p class="text-sm text-muted-foreground text-center py-4">
										No subscribed feeds yet.
										<a href="/discover" class="text-primary hover:underline">Discover feeds</a>
									</p>
								{:else if filteredFeeds().length === 0}
									<p class="text-sm text-muted-foreground text-center py-4">
										No feeds match "{feedSearch}"
									</p>
								{:else}
									<div class="space-y-1 max-h-[500px] overflow-y-auto">
										{#each filteredFeeds() as feed}
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												draggable="true"
												ondragstart={(e) => handleDragStart(e, feed.feed_id)}
												ondragend={handleDragEnd}
												class="flex items-center gap-3 p-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted transition-colors {draggedFeedId ===
												feed.feed_id
													? 'opacity-50'
													: ''}"
											>
												<GripVertical size={16} class="text-muted-foreground flex-shrink-0" />
												{#if feed.feed_image}
													<img
														src={feed.feed_image}
														alt={feed.feed_title}
														class="w-5 h-5 rounded object-cover flex-shrink-0"
													/>
												{:else if feed.feed_site_url}
													<img
														src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`}
														alt={feed.feed_title}
														class="w-5 h-5 rounded object-cover flex-shrink-0"
													/>
												{:else}
													<div
														class="w-5 h-5 rounded flex items-center justify-center bg-muted flex-shrink-0"
													>
														<div class="w-2.5 h-2.5 rounded-full bg-muted-foreground/50"></div>
													</div>
												{/if}
												<span class="flex-1 text-sm text-foreground truncate">
													{feed.feed_title}
												</span>
												{#if feed.unread_count > 0}
													<span
														class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400"
													>
														{feed.unread_count}
													</span>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Collection Modal -->
<CollectionModal
	bind:isOpen={isModalOpen}
	collection={editingCollection}
	onSave={handleSaveCollection}
	onClose={() => (editingCollection = null)}
/>

<!-- Delete Confirmation Modal -->
<ConfirmModal
	bind:isOpen={isDeleteModalOpen}
	title="Delete Collection"
	message={collectionToDelete ? `Are you sure you want to delete "${collectionToDelete.collection_name}"? This cannot be undone.` : ''}
	confirmText="Delete"
	cancelText="Cancel"
	variant="danger"
	onConfirm={confirmDeleteCollection}
	onCancel={cancelDeleteCollection}
/>
