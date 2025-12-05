<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "$lib/services/supabase";
  import { user } from "$lib/stores/auth";
  import { goto } from "$app/navigation";
  import { Search, Plus, Check } from "lucide-svelte";
  import SuggestFeedModal from "$lib/components/SuggestFeedModal.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import type { Database } from "$lib/types/database";

  type DiscoveryFeed =
    Database["public"]["Functions"]["get_discovery_feeds"]["Returns"][0];

  let feeds = $state<DiscoveryFeed[]>([]);
  let subscribedFeedIds = $state<Set<string>>(new Set());
  let searchQuery = $state("");
  let selectedCategory = $state<string>("");
  let subscriptionFilter = $state<"all" | "subscribed" | "not_subscribed">("all");
  let loading = $state(true);
  let subscribingIds = $state<Set<string>>(new Set());

  // Suggestion feature
  let suggestModalOpen = $state(false);

  // Track which categories have multiple feeds (others go to "Others")
  let multiCategorySet = $state<Set<string>>(new Set());

  // Get the display category for a feed (original category if multi-feed, "Others" if single-feed)
  function getDisplayCategory(feed: DiscoveryFeed): string {
    const category = feed.feed_category || "Others";
    return multiCategorySet.has(category) ? category : "Others";
  }

  // Get display categories for filter buttons (only multi-feed categories + Others)
  const displayCategories = $derived.by(() => {
    const cats = Array.from(multiCategorySet).sort();
    // Add "Others" at the end if there are any single-feed categories
    const hasOthers = feeds.some(
      (f) => !multiCategorySet.has(f.feed_category || "Others")
    );
    if (hasOthers && !cats.includes("Others")) {
      cats.push("Others");
    }
    return cats;
  });

  // Filtered feeds based on filters
  const displayedFeeds = $derived.by(() => {
    let result = feeds;
    // Hide feeds with no posts (last_entry_at is null means no posts synced yet)
    result = result.filter((f) => f.last_entry_at !== null);
    // Apply subscription filter
    if (subscriptionFilter === "subscribed") {
      result = result.filter((f) => subscribedFeedIds.has(f.feed_id));
    } else if (subscriptionFilter === "not_subscribed") {
      result = result.filter((f) => !subscribedFeedIds.has(f.feed_id));
    }
    // Filter by selected category (using display category logic)
    if (selectedCategory) {
      if (selectedCategory === "Others") {
        // Show feeds whose original category is NOT in the multi-category set
        result = result.filter(
          (f) => !multiCategorySet.has(f.feed_category || "Others")
        );
      } else {
        result = result.filter((f) => f.feed_category === selectedCategory);
      }
    }
    return result;
  });

  // Count of not subscribed feeds (for the filter badge)
  const notSubscribedCount = $derived.by(() => {
    return feeds.filter((f) => f.last_entry_at !== null && !subscribedFeedIds.has(f.feed_id)).length;
  });

  // Get a readable feed title from URL if no title exists
  function getFeedTitle(feed: DiscoveryFeed): string {
    if (feed.feed_title) return feed.feed_title;

    const url = feed.feed_site_url || feed.feed_url;
    if (!url) return "Feed";

    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname.replace("www.", "");

      // For YouTube, try to extract channel info from the URL
      if (domain.includes("youtube.com")) {
        const path = urlObj.pathname;
        // Check for /channel/, /@username, or /c/ patterns
        const channelMatch = path.match(
          /\/@([^\/]+)|\/channel\/([^\/]+)|\/c\/([^\/]+)/
        );
        if (channelMatch) {
          const channelName =
            channelMatch[1] || channelMatch[2] || channelMatch[3];
          return channelName;
        }
        return "YouTube Channel";
      }
      if (domain.includes("reddit.com")) {
        const subredditMatch = urlObj.pathname.match(/\/r\/([^\/]+)/);
        if (subredditMatch) return `r/${subredditMatch[1]}`;
        return "Reddit";
      }
      if (domain.includes("github.com")) {
        const repoMatch = urlObj.pathname.match(/\/([^\/]+)/);
        if (repoMatch) return repoMatch[1];
        return "GitHub";
      }
      if (domain.includes("medium.com")) return "Medium";
      if (domain.includes("substack.com")) {
        // Try to get subdomain for Substack
        const subdomain = urlObj.hostname.split(".")[0];
        if (subdomain !== "www" && subdomain !== "substack") {
          return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
        }
        return "Substack";
      }
      if (domain.includes("twitter.com") || domain.includes("x.com"))
        return "Twitter/X";
      if (domain.includes("linkedin.com")) return "LinkedIn";
      if (domain.includes("techcrunch.com")) return "TechCrunch";
      if (domain.includes("theverge.com")) return "The Verge";
      if (domain.includes("arstechnica.com")) return "Ars Technica";
      if (domain.includes("hackernews") || domain.includes("ycombinator.com"))
        return "Hacker News";

      // Extract main domain name and capitalize
      const parts = domain.split(".");
      const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch {
      return "Feed";
    }
  }

  onMount(async () => {
    if (!$user) {
      goto("/auth/login");
      return;
    }

    await loadFeeds();
  });

  async function loadFeeds() {
    loading = true;

    // Load all feeds to calculate category counts
    const { data: allFeedsData } = await supabase.rpc("get_discovery_feeds", {
      search_query: searchQuery || undefined,
      category_filter: undefined, // Always load all for category calculation
      limit_param: 1000,
      offset_param: 0,
    });

    if (allFeedsData) {
      // Filter out feeds with no posts first
      const feedsWithPosts = allFeedsData.filter(
        (f) => f.last_entry_at !== null
      );

      // Count feeds per category
      const categoryCounts = new Map<string, number>();
      feedsWithPosts.forEach((f) => {
        const cat = f.feed_category || "Others";
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      });

      // Categories with 2+ feeds are "multi-feed categories"
      const multiCats = new Set<string>();
      categoryCounts.forEach((count, cat) => {
        if (count >= 2) {
          multiCats.add(cat);
        }
      });
      multiCategorySet = multiCats;

      // Set feeds
      feeds = allFeedsData;
    }

    // Load user's subscriptions
    if ($user) {
      const { data: subsData } = await supabase
        .from("user_subscriptions")
        .select("feed_id")
        .eq("user_id", $user.id);

      if (subsData) {
        subscribedFeedIds = new Set(subsData.map((s) => s.feed_id));
      }
    }

    loading = false;
  }

  async function toggleSubscription(feedId: string) {
    if (!$user) return;

    // Add to subscribing set
    subscribingIds = new Set(subscribingIds).add(feedId);

    const isSubscribed = subscribedFeedIds.has(feedId);

    if (isSubscribed) {
      // Unsubscribe
      const { error } = await supabase
        .from("user_subscriptions")
        .delete()
        .eq("user_id", $user.id)
        .eq("feed_id", feedId);

      if (!error) {
        const newSet = new Set(subscribedFeedIds);
        newSet.delete(feedId);
        subscribedFeedIds = newSet;

        // Update subscriber count in feeds array
        feeds = feeds.map((f) =>
          f.feed_id === feedId
            ? { ...f, subscriber_count: Math.max(0, (f.subscriber_count || 1) - 1) }
            : f
        );
      }
    } else {
      // Subscribe
      const { error } = await supabase.from("user_subscriptions").insert({
        user_id: $user.id,
        feed_id: feedId,
      });

      if (!error) {
        subscribedFeedIds = new Set(subscribedFeedIds).add(feedId);

        // Update subscriber count in feeds array
        feeds = feeds.map((f) =>
          f.feed_id === feedId
            ? { ...f, subscriber_count: (f.subscriber_count || 0) + 1 }
            : f
        );
      }
    }

    // Remove from subscribing set
    const newSubscribingSet = new Set(subscribingIds);
    newSubscribingSet.delete(feedId);
    subscribingIds = newSubscribingSet;
  }

  async function handleSearch() {
    await loadFeeds();
  }

  function filterByCategory(category: string) {
    selectedCategory = category === selectedCategory ? "" : category;
    // No need to reload - filtering is done client-side via displayedFeeds
  }
</script>

<div class="h-screen bg-background flex flex-col">
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-7xl mx-auto px-4 py-6 md:py-8 pb-24">
      <!-- Header -->
      <div class="mb-6 md:mb-8">
        <h1 class="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Discover Feeds
        </h1>
        <p class="text-muted-foreground text-sm md:text-base">
          Browse and subscribe to RSS feeds
        </p>
      </div>

      <!-- Search -->
      <div class="mb-6">
        <form
          onsubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          class="relative"
        >
          <Search
            class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={20}
          />
          <input
            type="text"
            bind:value={searchQuery}
            onkeyup={handleSearch}
            placeholder="Search feeds..."
            class="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
      </div>

      <!-- Filters -->
      <div class="mb-8">
        <div class="flex flex-wrap gap-2">
          <!-- Subscription filters -->
          <button
            onclick={() => {
              subscriptionFilter = subscriptionFilter === "subscribed" ? "all" : "subscribed";
              if (subscriptionFilter !== "all") {
                selectedCategory = "";
              }
            }}
            class="px-4 py-2 rounded-full text-sm font-medium transition-colors {subscriptionFilter === 'subscribed'
              ? 'bg-accent text-accent-foreground'
              : 'bg-card border border-border text-foreground hover:bg-accent'}"
          >
            Subscribed ({subscribedFeedIds.size})
          </button>
          <button
            onclick={() => {
              subscriptionFilter = subscriptionFilter === "not_subscribed" ? "all" : "not_subscribed";
              if (subscriptionFilter !== "all") {
                selectedCategory = "";
              }
            }}
            class="px-4 py-2 rounded-full text-sm font-medium transition-colors {subscriptionFilter === 'not_subscribed'
              ? 'bg-accent text-accent-foreground'
              : 'bg-card border border-border text-foreground hover:bg-accent'}"
          >
            Not Subscribed ({notSubscribedCount})
          </button>

          <span class="border-l border-border mx-1"></span>

          <!-- Category filters -->
          <button
            onclick={() => {
              filterByCategory("");
              subscriptionFilter = "all";
            }}
            class="px-4 py-2 rounded-full text-sm font-medium transition-colors {selectedCategory ===
              '' && subscriptionFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-foreground hover:bg-accent'}"
          >
            All
          </button>
          {#each displayCategories as category}
            <button
              onclick={() => {
                filterByCategory(category);
                subscriptionFilter = "all";
              }}
              class="px-4 py-2 rounded-full text-sm font-medium transition-colors {selectedCategory ===
              category
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-foreground hover:bg-accent'}"
            >
              {category}
            </button>
          {/each}
        </div>
      </div>

      <!-- Feeds Grid -->
      {#if loading}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each Array(9) as _}
            <div class="bg-card border border-border rounded-lg p-6">
              <div class="flex items-start justify-between mb-4">
                <div class="flex-1 space-y-3">
                  <Skeleton variant="rectangular" width="48px" height="48px" />
                  <Skeleton width="70%" height="20px" />
                  <div class="flex items-center gap-2">
                    <Skeleton width="60px" height="16px" />
                    <Skeleton width="80px" height="16px" />
                  </div>
                </div>
              </div>
              <Skeleton width="100%" height="16px" class="mb-2" />
              <Skeleton width="90%" height="16px" class="mb-4" />
              <Skeleton width="100%" height="40px" />
            </div>
          {/each}
        </div>
      {:else if displayedFeeds.length === 0}
        <div class="text-center py-12">
          <p class="text-muted-foreground">
            {#if subscriptionFilter === "subscribed"}
              No subscribed feeds yet
            {:else if subscriptionFilter === "not_subscribed"}
              You're subscribed to all available feeds!
            {:else}
              No feeds found
            {/if}
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each displayedFeeds as feed}
            <div
              class="bg-card border border-border rounded-lg p-6 hover:border-primary transition-colors flex flex-col select-none"
            >
              <div class="flex items-start justify-between mb-4">
                <div class="flex-1 min-w-0">
                  {#if feed.feed_image}
                    <img
                      src={feed.feed_image}
                      alt={feed.feed_title}
                      class="w-12 h-12 rounded-lg object-cover mb-3"
                      onerror={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.fallbackAttempted) {
                          target.dataset.fallbackAttempted = "true";
                          target.src = feed.feed_site_url
                            ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=128`
                            : "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
                        } else {
                          target.src =
                            "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
                        }
                      }}
                    />
                  {:else if feed.feed_site_url}
                    <img
                      src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=128`}
                      alt={feed.feed_title}
                      class="w-12 h-12 rounded-lg object-cover mb-3"
                      onerror={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src =
                          "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
                      }}
                    />
                  {:else}
                    <div
                      class="w-12 h-12 rounded-lg mb-3 flex items-center justify-center bg-accent/10"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#888"
                        stroke-width="2"
                      >
                        <path d="M4 11a9 9 0 0 1 9 9" />
                        <path d="M4 4a16 16 0 0 1 16 16" />
                        <circle cx="5" cy="19" r="1" />
                      </svg>
                    </div>
                  {/if}
                  <h3 class="font-semibold text-foreground mb-1 truncate">
                    {getFeedTitle(feed)}
                  </h3>
                  <div
                    class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap"
                  >
                    <span class="px-2 py-0.5 bg-accent/10 text-accent rounded">
                      {getDisplayCategory(feed)}
                    </span>
                    <span>
                      {feed.subscriber_count || 0} subscribers
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex-1 flex flex-col">
                {#if feed.feed_description}
                  <p class="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {feed.feed_description}
                  </p>
                {/if}

                {#if feed.feed_site_url || feed.feed_url}
                  <a
                    href={feed.feed_site_url || feed.feed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-primary hover:text-primary/90 mb-4 block truncate"
                  >
                    {feed.feed_site_url || feed.feed_url}
                  </a>
                {/if}
              </div>

              <button
                onclick={() => toggleSubscription(feed.feed_id)}
                disabled={subscribingIds.has(feed.feed_id)}
                class="w-full py-2 px-4 rounded-md font-medium text-sm transition-all duration-200 {subscribedFeedIds.has(
                  feed.feed_id
                )
                  ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {#if subscribingIds.has(feed.feed_id)}
                  <svg
                    class="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {subscribedFeedIds.has(feed.feed_id)
                    ? "Unsubscribing..."
                    : "Subscribing..."}
                {:else if subscribedFeedIds.has(feed.feed_id)}
                  <Check size={16} />
                  Subscribed
                {:else}
                  <Plus size={16} />
                  Subscribe
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Can't find feed message -->
      <div class="mt-8 text-center py-8 border-t border-border">
        <p class="text-muted-foreground mb-3">
          Can't see the feed you're looking for?
        </p>
        <button
          onclick={() => (suggestModalOpen = true)}
          class="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus size={20} />
          Suggest a Feed
        </button>
      </div>

    </div>
  </div>
</div>

<!-- Navigation to Timeline - only show when subscribed -->
{#if subscribedFeedIds.size > 0}
  <a
    href="/timeline/all"
    class="fixed right-4 md:right-8 z-50 bg-primary text-primary-foreground px-5 py-3 md:px-6 md:py-3 rounded-full font-medium shadow-xl hover:bg-primary/90 transition-colors text-sm md:text-base"
    style="bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));"
  >
    Go to Timeline →
  </a>
{/if}

<!-- Suggest Feed Modal -->
<SuggestFeedModal bind:isOpen={suggestModalOpen} />
