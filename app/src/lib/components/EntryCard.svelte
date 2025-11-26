<script lang="ts">
  import { Star, ExternalLink } from "lucide-svelte";
  import { formatDistanceToNow } from "date-fns";

  interface Entry {
    entry_id: string;
    entry_title: string | null;
    entry_description: string | null;
    entry_content: string | null;
    entry_author: string | null;
    entry_url: string | null;
    entry_published_at: string;
    feed_id: string;
    feed_title: string | null;
    feed_category: string | null;
    feed_image: string | null;
    is_read: boolean;
    is_starred: boolean;
  }

  interface Props {
    entry: Entry;
    onToggleStar: (entryId: string) => void;
    onMarkRead: (entryId: string) => void;
    onClick: (entry: Entry) => void;
    isSelected?: boolean;
  }

  let {
    entry,
    onToggleStar,
    onMarkRead,
    onClick,
    isSelected = false,
  }: Props = $props();

  function getTimeAgo(dateString: string) {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return "";
    }
  }

  // Extract thumbnail from content or description HTML
  function extractThumbnail(content: string | null, description: string | null): string | null {
    const html = content || description || "";
    if (!html) return null;

    // Try to find an img tag
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      const src = imgMatch[1];
      // Filter out tracking pixels and tiny images
      if (src.includes('pixel') || src.includes('tracking') || src.includes('1x1')) {
        return null;
      }
      return src;
    }

    // Try to find og:image or other meta-like patterns in content
    const ogMatch = html.match(/(?:og:image|twitter:image)[^"']*["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
      return ogMatch[1];
    }

    return null;
  }

  const thumbnail = $derived(extractThumbnail(entry.entry_content, entry.entry_description));
  let thumbnailError = $state(false);

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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
  onclick={handleClick}
  onkeydown={handleKeyDown}
  tabindex="0"
  role="button"
  class="bg-card border rounded-lg hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer backdrop-blur-sm select-none {isSelected
    ? 'border-primary border-2 shadow-lg shadow-primary/10 ring-1 ring-primary/20 p-3 md:p-3'
    : !entry.is_read
      ? 'border-l-[3px] border-l-primary border-border shadow-md shadow-primary/5 p-3 md:p-4'
      : 'border-border shadow-sm shadow-black/5 p-3 md:p-4'}"
>
  <!-- Feed Info -->
  <div class="flex items-center gap-2 mb-2">
    {#if entry.feed_image}
      <img
        src={entry.feed_image}
        alt={entry.feed_title}
        class="w-5 h-5 rounded object-cover"
        onerror={(e) => {
          const target = e.target as HTMLImageElement;
          if (!target.dataset.fallbackAttempted) {
            target.dataset.fallbackAttempted = "true";
            target.src = entry.entry_url
              ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(entry.entry_url)}&size=64`
              : "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
          } else {
            target.src =
              "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
          }
        }}
      />
    {:else if entry.entry_url}
      <img
        src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(entry.entry_url)}&size=64`}
        alt={entry.feed_title}
        class="w-5 h-5 rounded object-cover"
        onerror={(e) => {
          const target = e.target as HTMLImageElement;
          target.src =
            "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E";
        }}
      />
    {:else}
      <div
        class="w-5 h-5 rounded flex items-center justify-center bg-accent/10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
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
    <div class="flex-1 min-w-0 flex items-center gap-2">
      <span class="text-sm font-medium text-foreground truncate break-words">
        {entry.feed_title}
      </span>
      <span
        class="px-2 py-0.5 text-xs bg-accent/20 text-accent font-medium rounded-full border border-accent/30"
      >
        {entry.feed_category}
      </span>
    </div>
    <button
      onclick={handleStarClick}
      class="text-muted-foreground hover:text-accent hover:scale-110 transition-all duration-200 p-2 -m-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
    >
      <Star
        size={20}
        class={entry.is_starred ? "fill-accent text-accent drop-shadow-lg" : ""}
      />
    </button>
  </div>

  <!-- Content with optional thumbnail -->
  <div class="flex gap-3">
    <div class="flex-1 min-w-0">
      <!-- Title -->
      <h2
        class="text-base md:text-lg font-semibold text-foreground mb-2 leading-tight break-words {!entry.is_read
          ? 'font-bold'
          : 'font-medium'}"
      >
        {entry.entry_title || "Untitled Post"}
      </h2>

      <!-- Description -->
      {#if entry.entry_description}
        <p
          class="text-sm text-muted-foreground mb-2 leading-relaxed break-words line-clamp-2"
        >
          {entry.entry_description}
        </p>
      {/if}
    </div>

    <!-- Thumbnail -->
    {#if thumbnail && !thumbnailError}
      <div class="flex-shrink-0">
        <img
          src={thumbnail}
          alt=""
          class="w-20 h-20 md:w-24 md:h-24 object-cover rounded-lg bg-muted"
          loading="lazy"
          onerror={() => { thumbnailError = true; }}
        />
      </div>
    {/if}
  </div>

  <!-- Metadata -->
  <div class="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
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
        class="ml-auto flex items-center gap-1 text-primary hover:text-primary/90 p-1 -m-1 min-h-[44px] md:min-h-0 md:p-0 md:m-0"
      >
        <ExternalLink size={14} />
        <span class="hidden md:inline">Open</span>
      </a>
    {/if}
  </div>
</article>
