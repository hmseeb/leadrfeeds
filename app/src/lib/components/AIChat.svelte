<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "$lib/services/supabase";
  import { user } from "$lib/stores/auth";
  import { collectionsStore } from "$lib/stores/collections";
  import { Send, X, Plus, Sparkles, MessageSquare, Zap, FileText, BarChart3, GitCompare, Trash2, HelpCircle, ChevronDown, Bot, User, Loader2, AlertCircle, Command, GripVertical, Newspaper } from "lucide-svelte";
  import type { Tables } from "$lib/types/database";
  import { marked, Renderer } from "marked";

  // Configure marked to open links in new tab
  const renderer = new Renderer();
  renderer.link = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  marked.use({ renderer });

  interface ContextBadge {
    id: string;
    type: "view" | "category" | "feed" | "entry" | "collection";
    label: string;
    data?: any;
  }

  interface AIContextEntry {
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
    feed_url: string | null;
    feed_site_url: string | null;
    is_starred: boolean;
  }

  interface Props {
    contextType: "feed" | "entry";
    contextId?: string | null;
    currentView?: "all" | "starred" | "unread" | string;
    currentCategory?: string | null;
    currentFeed?: { feed_id: string; feed_title: string } | null;
    currentCollection?: { collection_id: string; collection_name: string } | null;
    currentEntry?: {
      entry_id: string;
      entry_title: string | null;
      entry_content?: string | null;
      entry_description?: string | null;
      entry_author?: string | null;
      entry_published_at?: string;
      entry_url?: string | null;
    } | null;
    timelineEntries?: any[];
    feeds?: any[];
    isMobileOverlay?: boolean;
    onClose?: () => void;
    searchQuery?: string;
  }

  let {
    contextType,
    contextId,
    currentView = "all",
    currentCategory = null,
    currentFeed = null,
    currentCollection = null,
    currentEntry = null,
    timelineEntries = [],
    feeds = [],
    isMobileOverlay = false,
    onClose,
    searchQuery = "",
  }: Props = $props();

  type ChatMessage = Tables<"chat_messages">;

  let messages = $state<ChatMessage[]>([]);
  let input = $state("");
  let loading = $state(false);
  let apiKey = $state("");
  let preferredModel = $state("anthropic/claude-3.5-sonnet");
  let chatContainer: HTMLDivElement;
  let streamingContent = $state("");
  let inputRef = $state<HTMLTextAreaElement | null>(null);

  // Resizable panel state
  let panelWidth = $state(380);
  let isResizing = $state(false);
  const MIN_WIDTH = 300;
  const MAX_WIDTH = 600;

  // Context management
  let activeContexts = $state<ContextBadge[]>([]);
  let removedAutoContexts = $state<Set<string>>(new Set());
  let showContextMenu = $state(false);
  let contextSearch = $state("");
  let showCommandMenu = $state(false);
  let selectedCommandIndex = $state(0);

  // AI context cache
  let aiContextCache = $state<Map<string, { entries: AIContextEntry[]; timestamp: number }>>(new Map());
  let isLoadingContext = $state(false);
  const CACHE_TTL_MS = 5 * 60 * 1000;

  // Time range options for AI context
  const TIME_RANGES = [
    { hours: 24, label: "24h" },
    { hours: 72, label: "3d" },
    { hours: 168, label: "7d" }
  ];
  let selectedHoursLookback = $state(24);
  let showTimeRangeMenu = $state(false);

  function clearContextCache() {
    aiContextCache = new Map();
  }

  // Pagination helper to fetch all entries from RPC calls (bypassing PostgREST 1000 row limit)
  const PAGE_SIZE = 1000;

  async function fetchAllPaginated<T>(
    rpcName: 'get_ai_context' | 'get_collection_ai_context',
    params: Record<string, unknown>
  ): Promise<T[]> {
    let allResults: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.rpc(rpcName, {
        ...params,
        result_limit: PAGE_SIZE,
        result_offset: offset
      } as any);

      if (error) {
        console.error(`Error fetching from ${rpcName}:`, error);
        break;
      }

      const results = (data || []) as T[];
      allResults = [...allResults, ...results];

      // If we got fewer results than PAGE_SIZE, we've reached the end
      if (results.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    return allResults;
  }

  function selectTimeRange(hours: number) {
    selectedHoursLookback = hours;
    showTimeRangeMenu = false;
    clearContextCache();
  }

  // Get current time range label
  const currentTimeRangeLabel = $derived(
    TIME_RANGES.find(r => r.hours === selectedHoursLookback)?.label || '24h'
  );

  // Slash commands with icons
  interface SlashCommand {
    name: string;
    label: string;
    description: string;
    icon: typeof Zap;
    color: string;
  }

  const slashCommands: SlashCommand[] = [
    {
      name: "tldr",
      label: "TL;DR",
      description: "Ultra-short 1-2 sentence takeaway",
      icon: Zap,
      color: "text-secondary",
    },
    {
      name: "summarize",
      label: "Summarize",
      description: "80/20 summary with key insights",
      icon: FileText,
      color: "text-primary",
    },
    {
      name: "updates",
      label: "Updates",
      description: "Changelog-style summary of what's new",
      icon: Newspaper,
      color: "text-cyan-400",
    },
    {
      name: "analyze",
      label: "Analyze",
      description: "MECE analysis with patterns",
      icon: Sparkles,
      color: "text-accent",
    },
    {
      name: "actionable",
      label: "Actionable",
      description: "Extract action items and next steps",
      icon: BarChart3,
      color: "text-chart-4",
    },
    {
      name: "compare",
      label: "Compare",
      description: "Compare sources with synthesis",
      icon: GitCompare,
      color: "text-orange-400",
    },
    {
      name: "clear",
      label: "Clear",
      description: "Clear conversation history",
      icon: Trash2,
      color: "text-destructive",
    },
    {
      name: "help",
      label: "Help",
      description: "Show available commands",
      icon: HelpCircle,
      color: "text-muted-foreground",
    },
  ];

  const BASE_SYSTEM_PROMPT = `You are an expert content analyst for LeadrFeeds - opinionated, direct, and focused on signal over noise.

CORE PRINCIPLES:
• 80/20 Rule: Focus on the 20% of content that delivers 80% of value
• "So What?" Test: Always connect insights to why it matters
• Be Opinionated: Call out hype, flag what's overrated, highlight what's underrated
• No Fluff: Skip obvious statements, get to the point
• Evidence-Based: Reference specific quotes/data, not vague summaries

OUTPUT STYLE:
• Use emoji headers for visual hierarchy
• Bullet points over paragraphs
• Bold key terms and takeaways
• Be concise but complete
• Use markdown hyperlinks [text](url) instead of raw URLs
• When referencing posts, use their title as a clickable hyperlink: [Post Title](url)`;

  let filteredCommands = $state<SlashCommand[]>([]);

  // Get context type icon and color
  function getContextStyle(type: ContextBadge["type"]): { bg: string; border: string; text: string } {
    switch (type) {
      case "view":
        return { bg: "bg-primary/15", border: "border-primary/40", text: "text-primary" };
      case "category":
        return { bg: "bg-accent/15", border: "border-accent/40", text: "text-accent" };
      case "feed":
        return { bg: "bg-chart-4/15", border: "border-chart-4/40", text: "text-chart-4" };
      case "entry":
        return { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary/80" };
      case "collection":
        return { bg: "bg-accent/10", border: "border-accent/30", text: "text-accent/80" };
      default:
        return { bg: "bg-muted/50", border: "border-border", text: "text-foreground/80" };
    }
  }

  function stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }

  function getDomainCategory(url: string | null, siteUrl: string | null): string {
    const feedUrl = url || siteUrl;
    if (!feedUrl) return "Other";

    try {
      const urlObj = new URL(feedUrl);
      let domain = urlObj.hostname.replace("www.", "");

      if (domain.includes("youtube.com")) return "YouTube";
      if (domain.includes("reddit.com")) return "Reddit";
      if (domain.includes("github.com")) return "GitHub";
      if (domain.includes("medium.com")) return "Medium";
      if (domain.includes("substack.com")) return "Substack";

      const parts = domain.split(".");
      const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch (e) {
      return "Other";
    }
  }

  async function fetchAIContext(
    viewType: 'all' | 'starred' | 'unread' | 'feed' | 'category',
    feedId?: string,
    category?: string,
    searchQueryParam?: string
  ): Promise<AIContextEntry[]> {
    if (!$user) return [];

    // Include search query and hours lookback in cache key
    const cacheKey = `${viewType}-${feedId || ''}-${category || ''}-${searchQueryParam || ''}-${selectedHoursLookback}h`;
    const cached = aiContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.entries;
    }

    isLoadingContext = true;

    try {
      // Use pagination to bypass PostgREST 1000 row limit
      let entries: AIContextEntry[] = await fetchAllPaginated<AIContextEntry>('get_ai_context', {
        user_id_param: $user.id,
        feed_id_filter: viewType === 'feed' ? feedId : undefined,
        starred_only: viewType === 'starred',
        unread_only: viewType === 'unread',
        hours_lookback: selectedHoursLookback,
        search_query: searchQueryParam || undefined
      });

      if (viewType === 'category' && category) {
        entries = entries.filter(e => {
          const domainCat = getDomainCategory(e.feed_url, e.feed_site_url);
          return domainCat === category;
        });
      }

      aiContextCache.set(cacheKey, { entries, timestamp: Date.now() });
      return entries;
    } finally {
      isLoadingContext = false;
    }
  }

  function addContext(context: ContextBadge) {
    // Check if context already exists by ID or by same type+label combination
    const exists = activeContexts.some((c) =>
      c.id === context.id ||
      (c.type === context.type && c.label === context.label) ||
      // Also check for auto vs manual variants (e.g., "view-starred" vs "manual-view-starred")
      (c.type === context.type && c.data?.view && context.data?.view && c.data.view === context.data.view)
    );
    if (!exists) {
      activeContexts = [...activeContexts, context];
    }
  }

  // Helper to check if a view context is already active
  function hasViewContext(viewName: string): boolean {
    return activeContexts.some(c =>
      c.type === "view" && (c.data?.view === viewName || c.label.toLowerCase().includes(viewName))
    );
  }

  // Helper to check if a feed context is already active
  function hasFeedContext(feedId: string): boolean {
    return activeContexts.some(c =>
      c.type === "feed" && (c.data?.feed_id === feedId || c.data?.id === feedId || c.id.includes(feedId))
    );
  }

  // Helper to check if an entry context is already active
  function hasEntryContext(entryId: string): boolean {
    return activeContexts.some(c =>
      c.type === "entry" && (c.data?.entry_id === entryId || c.id.includes(entryId))
    );
  }

  // Helper to check if a collection context is already active
  function hasCollectionContext(collectionId: string): boolean {
    return activeContexts.some(c =>
      c.type === "collection" && (c.data?.collection_id === collectionId || c.id.includes(collectionId))
    );
  }

  // Fetch AI context for a collection
  async function fetchCollectionAIContext(
    collectionId: string,
    searchQueryParam?: string
  ): Promise<AIContextEntry[]> {
    if (!$user) return [];

    const cacheKey = `collection-${collectionId}-${searchQueryParam || ''}-${selectedHoursLookback}h`;
    const cached = aiContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.entries;
    }

    isLoadingContext = true;

    try {
      // Use pagination to bypass PostgREST 1000 row limit
      const entries: AIContextEntry[] = await fetchAllPaginated<AIContextEntry>('get_collection_ai_context', {
        user_id_param: $user.id,
        collection_id_param: collectionId,
        hours_lookback: selectedHoursLookback,
        search_query: searchQueryParam || undefined
      });

      aiContextCache.set(cacheKey, { entries, timestamp: Date.now() });
      return entries;
    } finally {
      isLoadingContext = false;
    }
  }

  function removeContext(contextId: string) {
    activeContexts = activeContexts.filter((c) => c.id !== contextId);
    if (!contextId.startsWith("manual-")) {
      removedAutoContexts = new Set([...removedAutoContexts, contextId]);
    }
  }

  function addStarredContext() {
    addContext({
      id: "manual-view-starred",
      type: "view",
      label: "Starred Posts",
      data: { view: "starred" },
    });
  }

  function addAllPostsContext() {
    addContext({
      id: "manual-view-all",
      type: "view",
      label: "All Posts",
      data: { view: "all" },
    });
  }

  function addUnreadContext() {
    addContext({
      id: "manual-view-unread",
      type: "view",
      label: "Unread Posts",
      data: { view: "unread" },
    });
  }

  function clearAllContexts() {
    activeContexts = [];
  }

  $effect(() => {
    if (input.startsWith("/")) {
      showCommandMenu = true;
      const query = input.slice(1).toLowerCase();
      if (query.length === 0) {
        filteredCommands = slashCommands;
      } else {
        filteredCommands = slashCommands.filter(
          (c) => c.name.includes(query) || c.label.toLowerCase().includes(query)
        );
      }
      selectedCommandIndex = 0;
    } else {
      showCommandMenu = false;
      filteredCommands = [];
      selectedCommandIndex = 0;
    }
  });

  // Resize handlers
  function handleResizeStart(e: MouseEvent) {
    if (isMobileOverlay) return;
    e.preventDefault();
    isResizing = true;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizeMove(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
  }

  function handleResizeEnd() {
    isResizing = false;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveWidthToDatabase();
  }

  async function saveWidthToDatabase() {
    if (!$user || isMobileOverlay) return;
    try {
      await supabase
        .from("user_settings")
        .update({ ai_chat_width: panelWidth })
        .eq("user_id", $user.id);
    } catch (error) {
      console.error("Error saving chat width:", error);
    }
  }

  // Track if settings have been loaded for this user
  let loadedForUserId = $state<string | null>(null);

  async function loadSettings(userId: string) {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("openrouter_api_key, preferred_model, ai_chat_width")
      .eq("user_id", userId)
      .single();

    if (settings) {
      apiKey = settings.openrouter_api_key || "";
      preferredModel = settings.preferred_model || "anthropic/claude-3.5-sonnet";
      if (settings.ai_chat_width && !isMobileOverlay) {
        panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, settings.ai_chat_width));
      }
    }

    loadedForUserId = userId;
    await loadMessages();
  }

  // Load settings when user becomes available or changes
  $effect(() => {
    const currentUser = $user;
    if (currentUser && loadedForUserId !== currentUser.id) {
      loadSettings(currentUser.id);
    }
  });

  onMount(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showContextMenu && !target.closest(".context-menu-container")) {
        showContextMenu = false;
      }
      if (showTimeRangeMenu && !target.closest(".time-range-menu-container")) {
        showTimeRangeMenu = false;
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  let lastView = $state(currentView);
  let lastFeedId = $state(currentFeed?.feed_id);
  let lastEntryId = $state(currentEntry?.entry_id);
  let lastContextType = $state(contextType);
  let lastContextId = $state(contextId);

  $effect(() => {
    const viewChanged = currentView !== lastView;
    const feedChanged = currentFeed?.feed_id !== lastFeedId;
    const entryChanged = currentEntry?.entry_id !== lastEntryId;
    const contextTypeChanged = contextType !== lastContextType;
    const contextIdChanged = contextId !== lastContextId;

    if (viewChanged || feedChanged || entryChanged) {
      removedAutoContexts = new Set();
      lastView = currentView;
      lastFeedId = currentFeed?.feed_id;
      lastEntryId = currentEntry?.entry_id;
    }

    if (contextTypeChanged || contextIdChanged) {
      loadMessages();
      lastContextType = contextType;
      lastContextId = contextId;
    }
  });

  $effect(() => {
    const newContexts: ContextBadge[] = [];

    if (currentEntry) {
      newContexts.push({
        id: `entry-${currentEntry.entry_id}`,
        type: "entry",
        label: currentEntry.entry_title || "Untitled",
        data: currentEntry,
      });
    } else {
      if (currentView === "all") {
        newContexts.push({
          id: "view-all",
          type: "view",
          label: "All",
          data: { view: "all" },
        });
      }

      if (currentView === "starred") {
        newContexts.push({
          id: "view-starred",
          type: "view",
          label: "Starred",
          data: { view: "starred" },
        });
      }

      if (currentView === "unread") {
        newContexts.push({
          id: "view-unread",
          type: "view",
          label: "Unread",
          data: { view: "unread" },
        });
      }

      if (currentCategory) {
        newContexts.push({
          id: `category-${currentCategory}`,
          type: "category",
          label: currentCategory,
          data: { category: currentCategory },
        });
      }

      if (currentFeed) {
        newContexts.push({
          id: `feed-${currentFeed.feed_id}`,
          type: "feed",
          label: currentFeed.feed_title,
          data: currentFeed,
        });
      }

      if (currentCollection) {
        newContexts.push({
          id: `collection-${currentCollection.collection_id}`,
          type: "collection",
          label: currentCollection.collection_name,
          data: currentCollection,
        });
      }
    }

    const manualContexts = activeContexts.filter((c) => c.id.startsWith("manual-"));
    const mergedContexts = [...manualContexts];

    for (const context of newContexts) {
      // Check if this auto-context was manually removed
      if (removedAutoContexts.has(context.id)) continue;

      // Check if there's already a manual variant of this context
      const hasManualVariant = manualContexts.some((c) => {
        // Same type and same data (view, feed_id, entry_id, category, collection_id)
        if (c.type !== context.type) return false;
        if (context.type === "view" && c.data?.view === context.data?.view) return true;
        if (context.type === "feed" && (c.data?.feed_id === context.data?.feed_id || c.data?.id === context.data?.feed_id)) return true;
        if (context.type === "entry" && c.data?.entry_id === context.data?.entry_id) return true;
        if (context.type === "category" && c.data?.category === context.data?.category) return true;
        if (context.type === "collection" && c.data?.collection_id === context.data?.collection_id) return true;
        return false;
      });

      if (!hasManualVariant && !mergedContexts.some((c) => c.id === context.id)) {
        mergedContexts.push(context);
      }
    }

    if (JSON.stringify(mergedContexts) !== JSON.stringify(activeContexts)) {
      activeContexts = mergedContexts;
    }
  });

  async function loadMessages() {
    if (!$user) return;

    let query = supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", $user.id)
      .eq("context_type", contextType);

    if (contextId) {
      query = query.eq("context_id", contextId);
    } else {
      query = query.is("context_id", null);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (!error && data) {
      messages = data;
      scrollToBottom();
    }
  }

  function parseCommand(input: string): { isCommand: boolean; command?: string; args?: string } {
    const trimmed = input.trim();
    if (trimmed.startsWith("/")) {
      const parts = trimmed.substring(1).split(" ");
      return { isCommand: true, command: parts[0].toLowerCase(), args: parts.slice(1).join(" ") };
    }
    return { isCommand: false };
  }

  async function handleSummarize() {
    const summarizePrompt = `Apply the 80/20 rule: identify the 20% of content that conveys 80% of the value.

OUTPUT FORMAT:
📌 **TL;DR** (1-2 sentences - the one thing to remember)

🎯 **Key Insights**
• [Only what's genuinely new or important - max 5 bullets]
• [Skip obvious or filler content]

💡 **So What?**
Why this matters and what to do with this information.

⚡ **Hot Take**
What the content overstates, understates, or misses entirely. Be opinionated.

If multiple posts are provided, summarize the key themes across all of them.`;
    await sendMessageWithPrompt("/summarize", summarizePrompt);
  }

  async function handleClear() {
    if (!$user) return;

    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", $user.id)
      .eq("context_type", contextType);

    if (error) {
      console.error("Error clearing messages:", error);
      return;
    }

    messages = [];
  }

  async function handleHelp() {
    const helpText = `## Available Commands

| Command | Description |
|---------|-------------|
| \`/tldr\` | Ultra-short 1-2 sentence takeaway |
| \`/summarize\` | 80/20 summary with key insights |
| \`/actionable\` | Extract action items and next steps |
| \`/analyze\` | MECE analysis with patterns |
| \`/compare\` | Compare sources (requires 2+ contexts) |
| \`/updates\` | Changelog-style summary of what's new |
| \`/clear\` | Clear conversation history |
| \`/help\` | Show this message |

**Tips:**
- Type \`/\` to see all commands
- Commands work with your current context
- Add more contexts to analyze multiple sources`;

    const helpMsg = {
      id: "help-" + Date.now(),
      user_id: $user!.id,
      context_type: contextType,
      context_id: contextId || null,
      role: "assistant" as const,
      content: helpText,
      created_at: new Date().toISOString(),
    } as ChatMessage;

    messages = [...messages, helpMsg];
    scrollToBottom();
  }

  async function handleAnalyze() {
    const analysisPrompt = `Perform a structured MECE analysis (Mutually Exclusive, Collectively Exhaustive).

OUTPUT FORMAT:
🔍 **Patterns & Themes**
• Group related insights into distinct categories
• Identify recurring narratives

📊 **Signal vs Noise**
• What's genuinely significant (signal)
• What's hype or redundant (noise)

🔗 **Connections**
• How these pieces relate to each other
• Emerging trends across sources

🚨 **Blind Spots**
• What's NOT being discussed that should be
• Missing perspectives or contrarian views`;
    await sendMessageWithPrompt("/analyze", analysisPrompt);
  }

  async function handleCompare() {
    if (activeContexts.length < 2) {
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user!.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant" as const,
        content: "⚠️ The `/compare` command requires at least 2 contexts. Add more contexts using the **+ Context** button below.",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      scrollToBottom();
      return;
    }

    const comparePrompt = `Compare and contrast using a structured framework.

OUTPUT FORMAT:
✅ **Agreement** (High-confidence insights)
• Where sources align - these are likely true

⚔️ **Disagreement** (Needs more research)
• Where sources conflict - dig deeper here

🎁 **Unique Contributions**
• What each source adds that others miss

🧠 **Synthesis**
Your opinionated take: combining these perspectives, what's the real story?`;
    await sendMessageWithPrompt("/compare", comparePrompt);
  }

  async function handleTldr() {
    const tldrPrompt = `Give me the single most important takeaway in 1-2 sentences. Be direct and opinionated. Start with the conclusion, not background.

If multiple posts are provided, give a combined TL;DR that captures the most important insight across all of them.`;
    await sendMessageWithPrompt("/tldr", tldrPrompt);
  }

  async function handleActionable() {
    const actionablePrompt = `Extract only the actionable items from this content.

OUTPUT FORMAT:
✅ **Do This** - Concrete actions to take
⚠️ **Avoid This** - Pitfalls or anti-patterns mentioned
📅 **Time-Sensitive** - Anything with urgency or deadlines
🔗 **Follow Up** - Resources, links, or topics to explore further

Skip theory and background. Only include items someone can actually act on. If there are no actionable items, say so directly.`;
    await sendMessageWithPrompt("/actionable", actionablePrompt);
  }

  async function handleUpdates() {
    const updatesPrompt = `Analyze the content and present updates in a structured changelog format.

DETECTION: First, identify if this content contains:
- Product/software updates (releases, features, changes)
- General news/articles

OUTPUT FORMAT:

If product/software updates detected:
🚀 **[Product Name] Updates**

✨ **New Features**
• [Feature] - Brief description of what it does

🔧 **Improvements**
• [Change] - What was enhanced or optimized

🐛 **Bug Fixes**
• [Fix] - What was resolved

⚠️ **Breaking Changes** (if any)
• [Change] - What might affect existing usage

📝 **TL;DR**: One sentence summary of the most impactful change.

---

If multiple products have updates, repeat the format for each product.

If general news/articles (not product updates):
📰 **What's New**
• [Headline] - Key development and why it matters

🔥 **Biggest Story**
The most significant item and its implications.

Be concise. Skip minor/trivial updates. Focus on what actually matters to users.`;
    await sendMessageWithPrompt("/updates", updatesPrompt);
  }

  async function sendMessageWithPrompt(commandText: string, customPrompt: string) {
    loading = true;

    const { data: savedMessage } = await supabase
      .from("chat_messages")
      .insert({
        user_id: $user!.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "user",
        content: commandText,
      })
      .select()
      .single();

    if (savedMessage) {
      messages = [...messages, savedMessage];
      scrollToBottom();
    }

    const contextString = await buildContextFromBadgesAsync();

    if (!contextString) {
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user!.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant" as const,
        content: "⚠️ No active contexts found. Add context using the **+ Context** button or navigate to a specific post/feed.",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      scrollToBottom();
      loading = false;
      return;
    }

    const apiMessages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}\n\nCONTEXT:\n${contextString}\n\nTASK:\n${customPrompt}`,
      },
      { role: "user", content: customPrompt },
    ];

    try {
      streamingContent = "";
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "LeadrFeeds",
        },
        body: JSON.stringify({ model: preferredModel, messages: apiMessages, stream: true }),
      });

      if (!response.ok) throw new Error("OpenRouter API request failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.trim().startsWith("data: "));

          for (const line of lines) {
            const data = line.replace(/^data: /, "");
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";
              if (content) {
                assistantMessage += content;
                streamingContent = assistantMessage;
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      const { data: assistantMsg } = await supabase
        .from("chat_messages")
        .insert({
          user_id: $user!.id,
          context_type: contextType,
          context_id: contextId || null,
          role: "assistant",
          content: assistantMessage || "No response",
        })
        .select()
        .single();

      if (assistantMsg) {
        messages = [...messages, assistantMsg];
        scrollToBottom();
      }

      streamingContent = "";
      loading = false;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      loading = false;
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user!.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant" as const,
        content: "❌ Error processing your request. Please check your API key in [Settings](/settings).",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      scrollToBottom();
    }
  }

  async function buildContextFromBadgesAsync(): Promise<string> {
    if (activeContexts.length === 0) return "";

    let contextParts: string[] = [];

    // Get the time label for display
    const timeLabel = TIME_RANGES.find(r => r.hours === selectedHoursLookback)?.label || '24h';

    // Helper to build context header with optional search query
    const buildHeader = (viewName: string, entryCount: number) => {
      const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
      return `## ${viewName}${searchSuffix} (last ${timeLabel}, ${entryCount} entries, ordered newest to oldest):`;
    };

    for (const context of activeContexts) {
      if (context.type === "view" && (context.label === "All" || context.label === "All Posts")) {
        const entries = await fetchAIContext('all', undefined, undefined, searchQuery);
        if (entries.length > 0) {
          const totalEntries = entries.length;
          const entrySummaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              // Number from total down to 1, so Post 1 is oldest and Post N is newest
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nSource: ${entry.feed_title}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(`${buildHeader('All Posts', entries.length)}\n\n${entrySummaries}`);
        } else if (searchQuery) {
          contextParts.push(`## Context: User searched for "${searchQuery}" in All Posts (no matching entries from last ${timeLabel})`);
        }
      } else if (context.type === "view" && (context.label === "Starred" || context.label === "Starred Posts")) {
        const entries = await fetchAIContext('starred', undefined, undefined, searchQuery);
        if (entries.length > 0) {
          const totalEntries = entries.length;
          const entrySummaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nSource: ${entry.feed_title}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(`${buildHeader('Starred Posts', entries.length)}\n\n${entrySummaries}`);
        } else {
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## Context: User is viewing their starred/saved posts${searchSuffix} (none from last ${timeLabel})`);
        }
      } else if (context.type === "view" && (context.label === "Unread" || context.label === "Unread Posts")) {
        const entries = await fetchAIContext('unread', undefined, undefined, searchQuery);
        if (entries.length > 0) {
          const totalEntries = entries.length;
          const entrySummaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nSource: ${entry.feed_title}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(`${buildHeader('Unread Posts', entries.length)}\n\n${entrySummaries}`);
        } else {
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## Context: User is viewing their unread posts${searchSuffix} (none from last ${timeLabel})`);
        }
      } else if (context.type === "category") {
        const entries = await fetchAIContext('category', undefined, context.data.category, searchQuery);
        if (entries.length > 0) {
          const totalEntries = entries.length;
          const summaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nSource: ${entry.feed_title}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(`${buildHeader(`${context.label} Posts`, entries.length)}\n\n${summaries}`);
        } else if (searchQuery) {
          contextParts.push(`## Context: User searched for "${searchQuery}" in ${context.label} (no matching entries from last ${timeLabel})`);
        }
      } else if (context.type === "feed") {
        const feedId = context.data.feed_id || context.data.id;
        const entries = await fetchAIContext('feed', feedId, undefined, searchQuery);
        if (entries.length > 0) {
          const totalEntries = entries.length;
          const summaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## ${context.label} Feed${searchSuffix} (last ${timeLabel}, ${entries.length} posts, ordered newest to oldest):\n\n${summaries}`);
        } else {
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## Context: User is asking about the "${context.label}" feed${searchSuffix} (no posts from last ${timeLabel})`);
        }
      } else if (context.type === "collection") {
        const collectionId = context.data.collection_id;
        const entries = await fetchCollectionAIContext(collectionId, searchQuery);
        if (entries.length > 0) {
          // Get unique feed names in this collection
          const feedNames = [...new Set(entries.map(e => e.feed_title).filter(Boolean))];
          const feedListStr = feedNames.length > 0 ? ` (${feedNames.length} feeds: ${feedNames.join(', ')})` : '';

          const totalEntries = entries.length;
          const summaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              const postNum = totalEntries - index;
              const titleLink = entry.entry_url ? `[${entry.entry_title}](${entry.entry_url})` : entry.entry_title;
              return `[Post ${postNum}]\nTitle: ${titleLink}\nSource: ${entry.feed_title}\nDescription: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## ${context.label} Collection${feedListStr}${searchSuffix} (last ${timeLabel}, ${entries.length} entries, ordered newest to oldest):\n\n${summaries}`);
        } else {
          const searchSuffix = searchQuery ? ` matching "${searchQuery}"` : '';
          contextParts.push(`## Context: User is viewing the "${context.label}" collection${searchSuffix} (no entries from last ${timeLabel})`);
        }
      } else if (context.type === "entry") {
        const rawContent = context.data.entry_content || context.data.entry_description || "";
        const content = stripHtml(rawContent);
        const entryUrl = context.data.entry_url || context.data.url || "";
        const titleLink = entryUrl ? `[${context.label}](${entryUrl})` : `"${context.label}"`;
        contextParts.push(
          `## Article: ${titleLink}\nAuthor: ${context.data.entry_author || "Unknown"}\nPublished: ${new Date(context.data.entry_published_at).toLocaleDateString()}\n\nContent:\n${content}`
        );
      }
    }

    return contextParts.join("\n\n---\n\n");
  }

  async function sendMessage() {
    if (!input.trim() || !apiKey || !$user) return;

    const userMessage = input.trim();
    const parsed = parseCommand(userMessage);

    if (parsed.isCommand) {
      input = "";
      switch (parsed.command) {
        case "tldr": await handleTldr(); return;
        case "summarize": await handleSummarize(); return;
        case "actionable": await handleActionable(); return;
        case "analyze": await handleAnalyze(); return;
        case "compare": await handleCompare(); return;
        case "updates": await handleUpdates(); return;
        case "clear": await handleClear(); return;
        case "help": await handleHelp(); return;
        default:
          const unknownMsg = {
            id: "error-" + Date.now(),
            user_id: $user.id,
            context_type: contextType,
            context_id: contextId || null,
            role: "assistant" as const,
            content: `Unknown command: \`/${parsed.command}\`. Type \`/help\` to see available commands.`,
            created_at: new Date().toISOString(),
          } as ChatMessage;
          messages = [...messages, unknownMsg];
          scrollToBottom();
          return;
      }
    }

    input = "";
    loading = true;

    const { data: savedMessage, error: saveError } = await supabase
      .from("chat_messages")
      .insert({
        user_id: $user.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "user",
        content: userMessage,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving message:", saveError);
      loading = false;
      return;
    }

    messages = [...messages, savedMessage];
    scrollToBottom();

    const contextString = await buildContextFromBadgesAsync();

    let apiMessages: Array<{ role: string; content: string }> = [];

    if (contextString) {
      apiMessages.push({
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}\n\nCONTEXT:\n${contextString}\n\nRESPONSE GUIDELINES:\n• If asked "what's important" → Apply 80/20 filter ruthlessly\n• If asked about trends → Look for patterns across 3+ sources\n• If asked for opinion → Be direct, take a stance, cite evidence\n• If asked to explain → Use analogies and concrete examples\n• If unclear what user wants → Default to the most useful interpretation\n\nRemember: Users are busy. Respect their time. Lead with the conclusion.`,
      });
    }

    const recentMessages = messages.slice(-10);
    apiMessages = [
      ...apiMessages,
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    try {
      streamingContent = "";
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "LeadrFeeds",
        },
        body: JSON.stringify({ model: preferredModel, messages: apiMessages, stream: true }),
      });

      if (!response.ok) throw new Error("OpenRouter API request failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.trim().startsWith("data: "));

          for (const line of lines) {
            const data = line.replace(/^data: /, "");
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";
              if (content) {
                assistantMessage += content;
                streamingContent = assistantMessage;
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      const { data: assistantMsg, error: assistantError } = await supabase
        .from("chat_messages")
        .insert({
          user_id: $user.id,
          context_type: contextType,
          context_id: contextId || null,
          role: "assistant",
          content: assistantMessage || "No response",
        })
        .select()
        .single();

      if (!assistantError && assistantMsg) {
        messages = [...messages, assistantMsg];
        scrollToBottom();
      }

      streamingContent = "";
      loading = false;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      loading = false;
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant",
        content: "❌ Error processing your request. Please check your API key in [Settings](/settings).",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (showCommandMenu && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedCommandIndex = selectedCommandIndex === 0 ? filteredCommands.length - 1 : selectedCommandIndex - 1;
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selectedCommand = filteredCommands[selectedCommandIndex];
        if (selectedCommand) {
          input = `/${selectedCommand.name}`;
          showCommandMenu = false;
          sendMessage();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        showCommandMenu = false;
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const selectedCommand = filteredCommands[selectedCommandIndex];
        if (selectedCommand) {
          input = `/${selectedCommand.name}`;
        }
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderMarkdown(content: string): string {
    return marked(content, { breaks: true, gfm: true }) as string;
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div
  class="ai-chat-container {isMobileOverlay ? 'w-full h-full' : 'border-l border-border/30'} bg-background flex flex-col h-full relative {!isMobileOverlay && !isResizing ? 'transition-[width] duration-300 ease-out' : ''}"
  style:width={!isMobileOverlay ? `${panelWidth}px` : undefined}
>
  <!-- Resize Handle (desktop only) -->
  {#if !isMobileOverlay}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-10 group"
      onmousedown={handleResizeStart}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      tabindex="0"
    >
      <div class="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-12 -ml-1.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={14} class="text-muted-foreground/70" />
      </div>
    </div>
  {/if}

  <!-- Header -->
  <div class="px-4 py-4 border-b border-border/50 {isMobileOverlay ? 'safe-area-inset-top' : ''}">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center border border-accent/20">
          <Sparkles size={18} class="text-primary" />
        </div>
        <h2 class="font-semibold text-base text-foreground">Feeds Assistant</h2>
      </div>
      {#if isMobileOverlay && onClose}
        <button
          onclick={onClose}
          class="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      {/if}
    </div>
  </div>

  <!-- Messages -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
    {#if !loadedForUserId}
      <!-- Loading State with Shimmers -->
      <div class="flex flex-col items-center justify-center h-full px-4">
        <!-- Shimmer icon placeholder -->
        <div class="w-20 h-20 rounded-2xl bg-muted/50 mb-5 shimmer"></div>
        <!-- Shimmer title -->
        <div class="h-5 w-40 bg-muted/50 rounded-lg mb-3 shimmer"></div>
        <!-- Shimmer description -->
        <div class="h-4 w-56 bg-muted/50 rounded-lg mb-2 shimmer"></div>
        <div class="h-4 w-48 bg-muted/50 rounded-lg mb-6 shimmer"></div>
        <!-- Shimmer buttons grid -->
        <div class="w-full max-w-[300px] grid grid-cols-2 gap-2">
          <div class="h-10 bg-muted/50 rounded-lg shimmer"></div>
          <div class="h-10 bg-muted/50 rounded-lg shimmer"></div>
          <div class="h-10 bg-muted/50 rounded-lg shimmer"></div>
          <div class="h-10 bg-muted/50 rounded-lg shimmer"></div>
        </div>
      </div>
    {:else if !apiKey}
      <!-- API Key Required State -->
      <div class="flex flex-col items-center justify-center h-full text-center px-4 py-8">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 border border-amber-500/20">
          <AlertCircle size={28} class="text-amber-400" />
        </div>
        <h3 class="text-lg font-semibold text-foreground mb-2">API Key Required</h3>
        <p class="text-sm text-muted-foreground mb-4 max-w-[280px]">
          Configure your OpenRouter API key to start using the AI assistant.
        </p>
        <a
          href="/settings"
          class="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-foreground text-sm font-medium rounded-lg transition-colors"
        >
          Go to Settings
        </a>
      </div>
    {:else if messages.length === 0}
      <!-- Empty State -->
      <div class="flex flex-col items-center justify-center h-full text-center px-4">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/10 to-primary/10 flex items-center justify-center mb-5 border border-border/50">
          <MessageSquare size={32} class="text-muted-foreground/70" />
        </div>
        <h3 class="text-lg font-semibold text-foreground mb-2">Start a Conversation</h3>
        <p class="text-sm text-muted-foreground/70 mb-6 max-w-[280px]">
          Ask questions about your feeds or use commands to analyze content.
        </p>

        <!-- Quick Commands -->
        <div class="w-full max-w-[300px] space-y-2">
          <p class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Quick Commands</p>
          <div class="grid grid-cols-2 gap-2">
            {#each slashCommands.slice(0, 4) as cmd}
              <button
                onclick={() => { input = `/${cmd.name}`; sendMessage(); }}
                class="flex items-center gap-2 px-3 py-2.5 bg-muted/40 hover:bg-muted/70 border border-border/70/50 rounded-lg text-left transition-all group"
              >
                <svelte:component this={cmd.icon} size={14} class="{cmd.color} group-hover:scale-110 transition-transform" />
                <span class="text-xs text-foreground/80 font-medium">{cmd.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <!-- Messages List -->
      {#each messages as message, i}
        <div class="message-container {message.role === 'user' ? 'user-message' : 'assistant-message'}" class:animate-fade-in={i === messages.length - 1}>
          {#if message.role === 'user'}
            <!-- User Message -->
            <div class="flex justify-end gap-2">
              <div class="max-w-[85%] flex flex-col items-end">
                <div class="px-4 py-2.5 bg-primary/20 border border-primary/30 rounded-2xl rounded-br-md">
                  <p class="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                </div>
                <span class="text-[10px] text-muted-foreground mt-1 mr-1">{formatTime(message.created_at)}</span>
              </div>
              <div class="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={14} class="text-primary" />
              </div>
            </div>
          {:else}
            <!-- Assistant Message -->
            <div class="flex gap-2">
              <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-accent/20">
                <Bot size={14} class="text-accent" />
              </div>
              <div class="max-w-[85%] flex flex-col">
                <div class="px-4 py-3 bg-muted/50 border border-border/70/50 rounded-2xl rounded-tl-md">
                  <div class="prose-chat text-sm">
                    {@html renderMarkdown(message.content)}
                  </div>
                </div>
                <span class="text-[10px] text-muted-foreground mt-1 ml-1">{formatTime(message.created_at)}</span>
              </div>
            </div>
          {/if}
        </div>
      {/each}

      <!-- Streaming Content -->
      {#if streamingContent}
        <div class="flex gap-2 animate-fade-in">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-accent/20">
            <Bot size={14} class="text-accent" />
          </div>
          <div class="max-w-[85%]">
            <div class="px-4 py-3 bg-muted/50 border border-border/70/50 rounded-2xl rounded-tl-md">
              <div class="prose-chat text-sm">
                {@html renderMarkdown(streamingContent)}
              </div>
              <span class="inline-block w-2 h-4 bg-accent/80 animate-pulse ml-0.5 rounded-sm"></span>
            </div>
          </div>
        </div>
      {:else if loading}
        <!-- Loading State -->
        <div class="flex gap-2 animate-fade-in">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center flex-shrink-0 border border-accent/20">
            <Bot size={14} class="text-accent" />
          </div>
          <div class="flex gap-1 items-center px-3 py-2 bg-muted/40 rounded-2xl rounded-tl-md">
            <span class="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style="animation-delay: 0ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style="animation-delay: 300ms"></span>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Input Area -->
  <div class="p-4 border-t border-border/50 bg-background/80 backdrop-blur-sm">
    <!-- Context Badges -->
    {#if activeContexts.length > 0}
      <div class="flex flex-wrap gap-1.5 mb-3">
        {#each activeContexts as context}
          {@const style = getContextStyle(context.type)}
          <div
            class="group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 {style.bg} border {style.border} rounded-full text-xs transition-all hover:scale-[1.02]"
          >
            <span class="{style.text} truncate max-w-[140px]" title={context.label}>
              {context.label}
            </span>
            <button
              onclick={() => removeContext(context.id)}
              class="p-0.5 hover:bg-white/10 rounded-full transition-colors opacity-60 group-hover:opacity-100"
              type="button"
            >
              <X size={12} class="text-muted-foreground" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <form
      onsubmit={(e) => { e.preventDefault(); sendMessage(); }}
      class="relative"
    >
      <!-- Command Menu -->
      {#if showCommandMenu && filteredCommands.length > 0}
        <div class="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-slide-up">
          <div class="p-1.5">
            {#each filteredCommands as command, index}
              <button
                type="button"
                onclick={() => { input = `/${command.name}`; showCommandMenu = false; sendMessage(); }}
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all {index === selectedCommandIndex ? 'bg-primary/15 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'}"
              >
                <div class="w-8 h-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <svelte:component this={command.icon} size={16} class={command.color} />
                </div>
                <div class="flex-1 text-left">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-foreground">/{command.name}</span>
                    <span class="text-xs text-muted-foreground/70">{command.label}</span>
                  </div>
                  <p class="text-xs text-muted-foreground/70">{command.description}</p>
                </div>
              </button>
            {/each}
          </div>
          <div class="px-3 py-2 border-t border-border/50 bg-card/50 flex items-center gap-4 text-[10px] text-muted-foreground/70">
            <span class="flex items-center gap-1"><kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span class="flex items-center gap-1"><kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px]">Tab</kbd> Complete</span>
            <span class="flex items-center gap-1"><kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd> Select</span>
          </div>
        </div>
      {/if}

      <!-- Input Row -->
      <div class="flex gap-2 items-end">
        <div class="flex-1 relative">
          <textarea
            bind:this={inputRef}
            bind:value={input}
            onkeydown={handleKeyDown}
            disabled={!apiKey || loading}
            placeholder={apiKey ? "Ask anything or type /" : "Configure API key first..."}
            rows="1"
            class="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 resize-none disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[44px] max-h-[120px]"
            style="field-sizing: content;"
          ></textarea>
          {#if !input && apiKey}
            <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground pointer-events-none">
              <Command size={12} />
              <span class="text-[10px]">/</span>
            </div>
          {/if}
        </div>
        <button
          type="submit"
          disabled={!apiKey || loading || !input.trim()}
          class="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-primary/25 hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer"
        >
          {#if loading}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <Send size={18} />
          {/if}
        </button>
      </div>

      <!-- Bottom Actions -->
      <div class="flex items-center justify-between mt-2.5">
        <div class="flex items-center gap-2">
          <div class="context-menu-container relative">
            <button
              type="button"
              onclick={() => showContextMenu = !showContextMenu}
              class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground bg-muted/30 hover:bg-muted/60 border border-border/70/40 rounded-lg transition-all hover:text-foreground/80"
            >
              <Plus size={14} />
              <span>Context</span>
              <ChevronDown size={12} class="transition-transform {showContextMenu ? 'rotate-180' : ''}" />
            </button>

          <!-- Context Menu -->
          {#if showContextMenu}
            <div class="absolute bottom-full left-0 mb-2 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-slide-up z-50">
              <div class="p-2 border-b border-border/50">
                <input
                  type="text"
                  placeholder="Search contexts..."
                  bind:value={contextSearch}
                  class="w-full px-3 py-2 text-sm bg-muted/50 text-foreground border border-border/70/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/70"
                />
              </div>

              <div class="max-h-72 overflow-y-auto">
                <!-- Views -->
                <div class="p-2">
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">Views</p>
                  {#if !hasViewContext("all")}
                    <button
                      type="button"
                      onclick={() => { addAllPostsContext(); showContextMenu = false; }}
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div class="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                        <FileText size={12} class="text-primary" />
                      </div>
                      All Posts
                    </button>
                  {/if}
                  {#if !hasViewContext("starred")}
                    <button
                      type="button"
                      onclick={() => { addStarredContext(); showContextMenu = false; }}
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div class="w-6 h-6 rounded-md bg-yellow-500/15 flex items-center justify-center">
                        <Sparkles size={12} class="text-secondary" />
                      </div>
                      Starred Posts
                    </button>
                  {/if}
                  {#if !hasViewContext("unread")}
                    <button
                      type="button"
                      onclick={() => { addUnreadContext(); showContextMenu = false; }}
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div class="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center">
                        <FileText size={12} class="text-cyan-400" />
                      </div>
                      Unread Posts
                    </button>
                  {/if}
                </div>

                <!-- Collections -->
                {#if $collectionsStore.collections.length > 0}
                  {@const availableCollections = $collectionsStore.collections.filter((c) => !hasCollectionContext(c.collection_id) && (!contextSearch || c.collection_name?.toLowerCase().includes(contextSearch.toLowerCase())))}
                  {#if availableCollections.length > 0}
                    <div class="p-2 border-t border-border/50">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">Collections</p>
                      {#each availableCollections.slice(0, 6) as collection}
                        <button
                          type="button"
                          onclick={() => { addContext({ id: `manual-collection-${collection.collection_id}`, type: "collection", label: collection.collection_name, data: { collection_id: collection.collection_id, collection_name: collection.collection_name } }); showContextMenu = false; contextSearch = ""; }}
                          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors truncate"
                        >
                          <div class="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                            <FileText size={12} class="text-violet-400" />
                          </div>
                          <span class="truncate">{collection.collection_name}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}

                <!-- Feeds -->
                {#if feeds.length > 0}
                  {@const availableFeeds = feeds.filter((f) => !hasFeedContext(f.id) && (!contextSearch || f.title?.toLowerCase().includes(contextSearch.toLowerCase())))}
                  {#if availableFeeds.length > 0}
                    <div class="p-2 border-t border-border/50">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">Feeds</p>
                      {#each availableFeeds.slice(0, 8) as feed}
                        <button
                          type="button"
                          onclick={() => { addContext({ id: `manual-feed-${feed.id}`, type: "feed", label: feed.title, data: feed }); showContextMenu = false; contextSearch = ""; }}
                          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors truncate"
                        >
                          <div class="w-6 h-6 rounded-md bg-green-500/15 flex items-center justify-center flex-shrink-0">
                            <FileText size={12} class="text-chart-4" />
                          </div>
                          <span class="truncate">{feed.title}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}

                <!-- Recent Entries -->
                {#if timelineEntries.length > 0}
                  {@const availableEntries = timelineEntries.filter((e) => !hasEntryContext(e.entry_id) && (!contextSearch || e.entry_title?.toLowerCase().includes(contextSearch.toLowerCase())))}
                  {#if availableEntries.length > 0}
                    <div class="p-2 border-t border-border/50">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">Recent Posts</p>
                      {#each availableEntries.slice(0, 6) as entry}
                        <button
                          type="button"
                          onclick={() => { addContext({ id: `manual-entry-${entry.entry_id}`, type: "entry", label: entry.entry_title, data: entry }); showContextMenu = false; contextSearch = ""; }}
                          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div class="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                            <FileText size={12} class="text-orange-400" />
                          </div>
                          <span class="truncate">{entry.entry_title}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
          </div>

          <!-- Time Range Selector -->
          <div class="time-range-menu-container relative">
            <button
              type="button"
              onclick={() => showTimeRangeMenu = !showTimeRangeMenu}
              class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground bg-muted/30 hover:bg-muted/60 border border-border/70/40 rounded-lg transition-all hover:text-foreground/80"
            >
              <span>{currentTimeRangeLabel}</span>
              <ChevronDown size={12} class="transition-transform {showTimeRangeMenu ? 'rotate-180' : ''}" />
            </button>

            {#if showTimeRangeMenu}
              <div class="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-slide-up z-50">
                <div class="p-1.5">
                  {#each TIME_RANGES as range}
                    <button
                      type="button"
                      onclick={() => selectTimeRange(range.hours)}
                      class="w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors {selectedHoursLookback === range.hours ? 'bg-primary/15 text-primary/80' : 'text-foreground/80 hover:bg-muted/50'}"
                    >
                      <span>{range.label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </form>
  </div>
</div>

