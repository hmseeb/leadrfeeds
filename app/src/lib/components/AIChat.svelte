<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "$lib/services/supabase";
  import { user } from "$lib/stores/auth";
  import { Send, X, Plus } from "lucide-svelte";
  import type { Tables } from "$lib/types/database";
  import { marked } from "marked";

  interface ContextBadge {
    id: string;
    type: "view" | "category" | "feed" | "entry";
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
    currentView?: "all" | "starred" | string;
    currentCategory?: string | null;
    currentFeed?: { feed_id: string; feed_title: string } | null;
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
  }

  let {
    contextType,
    contextId,
    currentView = "all",
    currentCategory = null,
    currentFeed = null,
    currentEntry = null,
    timelineEntries = [],
    feeds = [],
    isMobileOverlay = false,
    onClose,
  }: Props = $props();

  type ChatMessage = Tables<"chat_messages">;

  let messages = $state<ChatMessage[]>([]);
  let input = $state("");
  let loading = $state(false);
  let apiKey = $state("");
  let preferredModel = $state("anthropic/claude-3.5-sonnet");
  let chatContainer: HTMLDivElement;
  let streamingContent = $state("");

  // Context management
  let activeContexts = $state<ContextBadge[]>([]);
  let removedAutoContexts = $state<Set<string>>(new Set()); // Track which auto contexts user removed
  let showContextMenu = $state(false);
  let contextSearch = $state("");
  let showCommandMenu = $state(false);
  let selectedCommandIndex = $state(0);

  // AI context cache
  let aiContextCache = $state<Map<string, { entries: AIContextEntry[]; timestamp: number }>>(new Map());
  let isLoadingContext = $state(false);
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache

  // Slash commands
  interface SlashCommand {
    name: string;
    label: string;
    description: string;
  }

  const slashCommands: SlashCommand[] = [
    {
      name: "tldr",
      label: "TL;DR",
      description: "Ultra-short 1-2 sentence takeaway",
    },
    {
      name: "summarize",
      label: "Summarize",
      description: "80/20 summary with key insights and hot take",
    },
    {
      name: "actionable",
      label: "Actionable",
      description: "Extract action items and next steps",
    },
    {
      name: "analyze",
      label: "Analyze",
      description: "MECE analysis with patterns and blind spots",
    },
    {
      name: "compare",
      label: "Compare",
      description: "Compare sources with synthesis",
    },
    {
      name: "clear",
      label: "Clear",
      description: "Clear conversation history",
    },
    {
      name: "help",
      label: "Help",
      description: "Show available commands",
    },
  ];

  // Master system prompt for opinionated, structured responses
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
• Be concise but complete`;

  let filteredCommands = $state<SlashCommand[]>([]);

  // Strip HTML tags from content
  function stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }

  // Domain category helper (same as sidebar/timeline)
  function getDomainCategory(
    url: string | null,
    siteUrl: string | null
  ): string {
    const feedUrl = url || siteUrl;
    if (!feedUrl) return "Other";

    try {
      const urlObj = new URL(feedUrl);
      let domain = urlObj.hostname.replace("www.", "");

      // Map common domains to readable names
      if (domain.includes("youtube.com")) return "YouTube";
      if (domain.includes("reddit.com")) return "Reddit";
      if (domain.includes("github.com")) return "GitHub";
      if (domain.includes("medium.com")) return "Medium";
      if (domain.includes("substack.com")) return "Substack";

      // Extract main domain (e.g., "google" from "blog.google.com")
      const parts = domain.split(".");
      // Get second-to-last part for multi-level domains (blog.google.com -> google)
      // or first part for simple domains (example.com -> example)
      const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch (e) {
      return "Other";
    }
  }

  // Fetch AI context from database (all posts from last 24h)
  async function fetchAIContext(
    viewType: 'all' | 'starred' | 'feed' | 'category',
    feedId?: string,
    category?: string
  ): Promise<AIContextEntry[]> {
    if (!$user) return [];

    const cacheKey = `${viewType}-${feedId || ''}-${category || ''}`;
    const cached = aiContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.entries;
    }

    isLoadingContext = true;

    try {
      const { data, error } = await supabase.rpc('get_ai_context', {
        user_id_param: $user.id,
        feed_id_filter: viewType === 'feed' ? feedId : undefined,
        starred_only: viewType === 'starred',
        hours_lookback: 24
      });

      if (error) {
        console.error('Error fetching AI context:', error);
        return [];
      }

      let entries: AIContextEntry[] = data || [];

      // Apply category filter client-side
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

  // Context management functions
  function addContext(context: ContextBadge) {
    // Check if context already exists
    const exists = activeContexts.some((c) => c.id === context.id);
    if (!exists) {
      activeContexts = [...activeContexts, context];
    }
  }

  function removeContext(contextId: string) {
    activeContexts = activeContexts.filter((c) => c.id !== contextId);
    // If it's an auto-added context, remember that the user removed it
    if (!contextId.startsWith("manual-")) {
      removedAutoContexts = new Set([...removedAutoContexts, contextId]);
    }
  }

  // Add starred context badge (data will be fetched on-demand when sending messages)
  function addStarredContext() {
    addContext({
      id: "manual-view-starred",
      type: "view",
      label: "Starred Posts",
      data: { view: "starred" },
    });
  }

  // Add all posts context badge (data will be fetched on-demand when sending messages)
  function addAllPostsContext() {
    addContext({
      id: "manual-view-all",
      type: "view",
      label: "All Posts",
      data: { view: "all" },
    });
  }

  function clearAllContexts() {
    activeContexts = [];
  }

  // Watch for slash command input
  $effect(() => {
    if (input.startsWith("/")) {
      showCommandMenu = true;
      const query = input.slice(1).toLowerCase();
      if (query.length === 0) {
        // Show all commands when just "/" is typed
        filteredCommands = slashCommands;
      } else {
        filteredCommands = slashCommands.filter(
          (c) =>
            c.name.includes(query) || c.label.toLowerCase().includes(query)
        );
      }
      // Reset selection when filter changes
      selectedCommandIndex = 0;
    } else {
      showCommandMenu = false;
      filteredCommands = [];
      selectedCommandIndex = 0;
    }
  });

  onMount(() => {
    // Click outside handler for context menu
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showContextMenu && !target.closest(".context-menu-container")) {
        showContextMenu = false;
      }
    };

    document.addEventListener("click", handleClickOutside);

    // Load data asynchronously
    (async () => {
      if (!$user) return;

      // Load user settings for API key
      const { data: settings } = await supabase
        .from("user_settings")
        .select("openrouter_api_key, preferred_model")
        .eq("user_id", $user.id)
        .single();

      if (settings) {
        apiKey = settings.openrouter_api_key || "";
        preferredModel =
          settings.preferred_model || "anthropic/claude-3.5-sonnet";
      }

      // Load chat history
      await loadMessages();
    })();

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  // Clear removed contexts tracking when view changes (so auto contexts can be re-added)
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
      // Clear the removed contexts tracking when navigation occurs
      removedAutoContexts = new Set();
      lastView = currentView;
      lastFeedId = currentFeed?.feed_id;
      lastEntryId = currentEntry?.entry_id;
    }

    // Reload messages when context changes
    if (contextTypeChanged || contextIdChanged) {
      loadMessages();
      lastContextType = contextType;
      lastContextId = contextId;
    }
  });

  // Automatic context management - add/remove badges based on current view
  $effect(() => {
    const newContexts: ContextBadge[] = [];

    // Add specific entry context (opened post)
    if (currentEntry) {
      newContexts.push({
        id: `entry-${currentEntry.entry_id}`,
        type: "entry",
        label: currentEntry.entry_title || "Untitled",
        data: currentEntry,
      });
    } else {
      // Only add view contexts if no specific entry is selected
      // Add "All" context when viewing all posts
      if (currentView === "all") {
        newContexts.push({
          id: "view-all",
          type: "view",
          label: "All",
          data: { view: "all" },
        });
      }

      // Add "Starred" context when viewing starred posts
      if (currentView === "starred") {
        newContexts.push({
          id: "view-starred",
          type: "view",
          label: "Starred",
          data: { view: "starred" },
        });
      }
      // Only add category/feed context if no specific entry is selected
      // Add category context (e.g., Reddit.com)
      if (currentCategory) {
        newContexts.push({
          id: `category-${currentCategory}`,
          type: "category",
          label: currentCategory,
          data: { category: currentCategory },
        });
      }

      // Add specific feed context (e.g., OpenAI News)
      if (currentFeed) {
        newContexts.push({
          id: `feed-${currentFeed.feed_id}`,
          type: "feed",
          label: currentFeed.feed_title,
          data: currentFeed,
        });
      }
    }

    // Build the new context array without triggering effect recursion
    // Keep manually added contexts and merge with new auto contexts
    const manualContexts = activeContexts.filter((c) =>
      c.id.startsWith("manual-")
    );
    const mergedContexts = [...manualContexts];

    // Add new contexts if they don't already exist and weren't explicitly removed by user
    for (const context of newContexts) {
      if (
        !mergedContexts.some((c) => c.id === context.id) &&
        !removedAutoContexts.has(context.id)
      ) {
        mergedContexts.push(context);
      }
    }

    // Only update if there's actually a change
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

    const { data, error } = await query.order("created_at", {
      ascending: true,
    });

    if (!error && data) {
      messages = data;
      scrollToBottom();
    }
  }

  function parseCommand(input: string): {
    isCommand: boolean;
    command?: string;
    args?: string;
  } {
    const trimmed = input.trim();
    if (trimmed.startsWith("/")) {
      const parts = trimmed.substring(1).split(" ");
      return {
        isCommand: true,
        command: parts[0].toLowerCase(),
        args: parts.slice(1).join(" "),
      };
    }
    return { isCommand: false };
  }

  async function loadContextData(): Promise<{
    type: string;
    data: any;
  } | null> {
    if (contextType === "entry" && contextId) {
      const { data: entry } = await supabase
        .from("entries")
        .select("id, title, description, content, author, url, published_at")
        .eq("id", contextId)
        .single();

      return entry ? { type: "entry", data: entry } : null;
    } else if (contextType === "feed" && contextId) {
      const { data: feed } = await supabase
        .from("feeds")
        .select("id, title, description, category")
        .eq("id", contextId)
        .single();

      return feed ? { type: "feed", data: feed } : null;
    }
    return null;
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

    // Delete ALL messages for this user in this context_type
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", $user.id)
      .eq("context_type", contextType);

    if (error) {
      console.error("Error clearing messages:", error);
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant" as const,
        content: "Failed to clear conversation history. Please try again.",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      return;
    }

    // Clear local messages
    messages = [];

    // Show confirmation
    const confirmMsg = {
      id: "clear-" + Date.now(),
      user_id: $user.id,
      context_type: contextType,
      context_id: contextId || null,
      role: "assistant" as const,
      content: "🧹 Conversation cleared. Ready for a fresh start!",
      created_at: new Date().toISOString(),
    } as ChatMessage;
    messages = [confirmMsg];
    scrollToBottom();
  }

  async function handleHelp() {
    const helpText = `📚 **Available Commands:**

**/tldr** - Ultra-short 1-2 sentence takeaway
**/summarize** - 80/20 summary with key insights and hot take
**/actionable** - Extract action items and next steps
**/analyze** - MECE analysis with patterns and blind spots
**/compare** - Compare sources with synthesis (requires 2+ contexts)
**/clear** - Clear conversation history
**/help** - Show this message

💡 **Tips:**
• Commands work with your current view (All Posts, Starred, Feed, or single article)
• Add more contexts with "Add Context" to analyze multiple sources
• Be direct with questions - I'll give opinionated, structured answers

📍 **Current Context:**
${
  activeContexts.length > 0
    ? `✓ ${activeContexts.length} context${activeContexts.length > 1 ? "s" : ""} loaded - all commands ready`
    : "No contexts - navigate to a feed or post, or use Add Context"
}`;

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
    // Use MECE framework for structured analysis
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
        content:
          'The /compare command requires at least 2 contexts. Please add more contexts using the "Add Context" button.',
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

  async function sendMessageWithPrompt(
    commandText: string,
    customPrompt: string
  ) {
    loading = true;

    // Save command message
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

    // Build context from active badges (async - fetches fresh data)
    const contextString = await buildContextFromBadgesAsync();

    if (!contextString) {
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user!.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant" as const,
        content:
          'No active contexts found. Please add some context using the "Add Context" button or navigate to a specific post/feed.',
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      scrollToBottom();
      loading = false;
      return;
    }

    // Build API messages with enhanced base prompt
    const apiMessages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}

CONTEXT:
${contextString}

TASK:
${customPrompt}`,
      },
      { role: "user", content: customPrompt },
    ];

    try {
      streamingContent = "";
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "LeadrFeeds",
          },
          body: JSON.stringify({
            model: preferredModel,
            messages: apiMessages,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("OpenRouter API request failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk
            .split("\n")
            .filter((line) => line.trim().startsWith("data: "));

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
            } catch (e) {
              // Skip invalid JSON
            }
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
        content:
          "Sorry, there was an error processing your request. Please check your API key in settings.",
        created_at: new Date().toISOString(),
      } as ChatMessage;
      messages = [...messages, errorMsg];
      scrollToBottom();
    }
  }

  // Build context string from active context badges (async - fetches fresh data from DB)
  async function buildContextFromBadgesAsync(): Promise<string> {
    if (activeContexts.length === 0) return "";

    let contextParts: string[] = [];

    for (const context of activeContexts) {
      // Handle both automatic ('All') and manual ('All Posts') labels
      if (
        context.type === "view" &&
        (context.label === "All" || context.label === "All Posts")
      ) {
        // Fetch all entries from last 24h from database
        const entries = await fetchAIContext('all');
        if (entries.length > 0) {
          const entrySummaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              return `[Post ${index + 1}]
Title: ${entry.entry_title}
Source: ${entry.feed_title}
URL: ${entry.entry_url || "N/A"}
Description: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");

          contextParts.push(
            `## All Posts (last 24h, ${entries.length} entries):\n\n${entrySummaries}`
          );
        }
      } else if (
        context.type === "view" &&
        (context.label === "Starred" || context.label === "Starred Posts")
      ) {
        // Fetch starred entries from last 24h from database
        const entries = await fetchAIContext('starred');
        if (entries.length > 0) {
          const entrySummaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              return `[Post ${index + 1}]
Title: ${entry.entry_title}
Source: ${entry.feed_title}
URL: ${entry.entry_url || "N/A"}
Description: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");

          contextParts.push(
            `## Starred Posts (last 24h, ${entries.length} entries):\n\n${entrySummaries}`
          );
        } else {
          contextParts.push(
            `## Context: User is viewing their starred/saved posts (none from last 24h)`
          );
        }
      } else if (context.type === "category") {
        // Fetch all entries then filter by category
        const entries = await fetchAIContext('category', undefined, context.data.category);
        if (entries.length > 0) {
          const summaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              return `[Post ${index + 1}]
Title: ${entry.entry_title}
Source: ${entry.feed_title}
URL: ${entry.entry_url || "N/A"}
Description: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(
            `## ${context.label} Posts (last 24h, ${entries.length} entries):\n\n${summaries}`
          );
        }
      } else if (context.type === "feed") {
        // Fetch entries for specific feed
        const feedId = context.data.feed_id || context.data.id;
        const entries = await fetchAIContext('feed', feedId);
        if (entries.length > 0) {
          const summaries = entries
            .map((entry, index) => {
              const description = stripHtml(entry.entry_description || "");
              return `[Post ${index + 1}]
Title: ${entry.entry_title}
URL: ${entry.entry_url || "N/A"}
Description: ${description || "N/A"}`;
            })
            .join("\n\n---\n\n");
          contextParts.push(
            `## ${context.label} Feed (last 24h, ${entries.length} posts):\n\n${summaries}`
          );
        } else {
          contextParts.push(
            `## Context: User is asking about the "${context.label}" feed (no posts from last 24h)`
          );
        }
      } else if (context.type === "entry") {
        // Include full entry content (no truncation for individual articles)
        const rawContent =
          context.data.entry_content || context.data.entry_description || "";
        const content = stripHtml(rawContent);
        const entryUrl = context.data.entry_url || context.data.url || "";
        contextParts.push(
          `## Article: "${context.label}"\nAuthor: ${context.data.entry_author || "Unknown"}\nPublished: ${new Date(context.data.entry_published_at).toLocaleDateString()}${entryUrl ? `\nURL: ${entryUrl}` : ""}\n\nContent:\n${content}`
        );
      }
    }

    return contextParts.join("\n\n---\n\n");
  }

  async function sendMessage() {
    if (!input.trim() || !apiKey || !$user) return;

    const userMessage = input.trim();
    const parsed = parseCommand(userMessage);

    // Handle commands
    if (parsed.isCommand) {
      input = "";
      switch (parsed.command) {
        case "tldr":
          await handleTldr();
          return;
        case "summarize":
          await handleSummarize();
          return;
        case "actionable":
          await handleActionable();
          return;
        case "analyze":
          await handleAnalyze();
          return;
        case "compare":
          await handleCompare();
          return;
        case "clear":
          await handleClear();
          return;
        case "help":
          await handleHelp();
          return;
        default:
          const unknownMsg = {
            id: "error-" + Date.now(),
            user_id: $user.id,
            context_type: contextType,
            context_id: contextId || null,
            role: "assistant" as const,
            content: `Unknown command: /${parsed.command}. Type /help to see available commands.`,
            created_at: new Date().toISOString(),
          } as ChatMessage;
          messages = [...messages, unknownMsg];
          scrollToBottom();
          return;
      }
    }

    input = "";
    loading = true;

    // Save user message
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

    // Build context from active badges (async - fetches fresh data)
    const contextString = await buildContextFromBadgesAsync();

    // Build messages array with context
    let apiMessages: Array<{ role: string; content: string }> = [];

    // Add system message with context if we have any active contexts
    if (contextString) {
      apiMessages.push({
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}

CONTEXT:
${contextString}

RESPONSE GUIDELINES:
• If asked "what's important" → Apply 80/20 filter ruthlessly
• If asked about trends → Look for patterns across 3+ sources
• If asked for opinion → Be direct, take a stance, cite evidence
• If asked to explain → Use analogies and concrete examples
• If unclear what user wants → Default to the most useful interpretation

Remember: Users are busy. Respect their time. Lead with the conclusion.`,
      });
    }

    // Add conversation history (limit to last 10 messages to save tokens)
    const recentMessages = messages.slice(-10);
    apiMessages = [
      ...apiMessages,
      ...recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    // Call OpenRouter API with streaming
    try {
      streamingContent = "";
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "LeadrFeeds",
          },
          body: JSON.stringify({
            model: preferredModel,
            messages: apiMessages,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("OpenRouter API request failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk
            .split("\n")
            .filter((line) => line.trim().startsWith("data: "));

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
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Save assistant message (keep streaming content visible until saved)
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

      // Clear streaming content and loading state after message is saved
      streamingContent = "";
      loading = false;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      loading = false;
      // Show error message
      const errorMsg = {
        id: "error-" + Date.now(),
        user_id: $user.id,
        context_type: contextType,
        context_id: contextId || null,
        role: "assistant",
        content:
          "Sorry, there was an error processing your request. Please check your API key in settings.",
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
    // Handle command menu navigation
    if (showCommandMenu && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedCommandIndex =
          selectedCommandIndex === 0
            ? filteredCommands.length - 1
            : selectedCommandIndex - 1;
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
    }

    // Normal Enter behavior for sending messages
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderMarkdown(content: string): string {
    return marked(content, { breaks: true, gfm: true }) as string;
  }
</script>

<div
  class="{isMobileOverlay
    ? 'w-full h-full'
    : 'border-l border-gray-800/50'} bg-[#121212] flex flex-col h-full"
  style:width={!isMobileOverlay ? "clamp(320px, 22vw, 480px)" : undefined}
>
  <!-- Header -->
  <div
    class="px-4 md:px-6 py-4 md:py-5 border-b border-gray-800/50 flex items-center justify-between {isMobileOverlay
      ? 'safe-area-inset-top'
      : ''}"
  >
    <div>
      <h2 class="font-bold text-lg md:text-xl text-gray-100 tracking-tight">
        AI Assistant
      </h2>
      <p class="text-xs text-gray-500 mt-0.5">Powered by OpenRouter</p>
    </div>
    {#if isMobileOverlay && onClose}
      <button
        onclick={onClose}
        class="p-2 -mr-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Close"
      >
        <X size={24} />
      </button>
    {/if}
  </div>

  <!-- Messages -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-6 space-y-4">
    {#if !apiKey}
      <div
        class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-400"
      >
        <p class="font-medium mb-2">OpenRouter API Key Required</p>
        <p class="text-xs">
          Configure your OpenRouter API key in
          <a href="/settings" class="underline">Settings</a>
          to use the AI chat feature.
        </p>
      </div>
    {:else if messages.length === 0}
      <div class="text-center py-8 text-gray-400 text-sm">
        <p>No messages yet.</p>
        <p class="mt-2">Ask me anything about your feeds!</p>
      </div>
    {:else}
      {#each messages as message}
        <div
          class="flex {message.role === 'user'
            ? 'justify-end'
            : 'justify-start'}"
        >
          <div
            class="max-w-[80%] rounded-lg px-4 py-2 {message.role === 'user'
              ? 'bg-blue-500/20 text-gray-200'
              : 'bg-gray-800 text-gray-200'}"
          >
            {#if message.role === "user"}
              <p class="text-sm whitespace-pre-wrap">{message.content}</p>
            {:else}
              <div
                class="text-sm prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:bg-[#0d0d0d] prose-pre:text-gray-100"
              >
                {@html renderMarkdown(message.content)}
              </div>
            {/if}
          </div>
        </div>
      {/each}

      {#if streamingContent}
        <div class="flex justify-start">
          <div
            class="max-w-[80%] rounded-lg px-4 py-2 bg-gray-800 text-gray-200"
          >
            <div
              class="text-sm prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:bg-[#0d0d0d] prose-pre:text-gray-100"
            >
              {@html renderMarkdown(streamingContent)}
            </div>
            <div
              class="inline-block w-2 h-4 bg-gray-200 animate-pulse ml-1"
            ></div>
          </div>
        </div>
      {:else if loading}
        <div class="flex justify-start">
          <div class="bg-gray-800 rounded-lg px-4 py-2">
            <p class="text-sm text-gray-400">
              Thinking<span class="blinking-dots"
                ><span>.</span><span>.</span><span>.</span></span
              >
            </p>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Input -->
  <div class="p-4 border-t border-gray-800">
    <!-- Context Badges -->
    {#if activeContexts.length > 0}
      <div class="flex flex-wrap gap-2 mb-3">
        {#each activeContexts as context}
          <div
            class="flex items-center gap-1 px-3 py-1 bg-blue-500/20 border border-blue-400 rounded-full text-xs max-w-[250px]"
          >
            <span class="text-gray-200 truncate" title={context.label}
              >{context.label}</span
            >
            <button
              onclick={() => removeContext(context.id)}
              class="hover:bg-blue-500/30 rounded-full p-0.5 transition-colors flex-shrink-0"
              type="button"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault();
        sendMessage();
      }}
      class="flex flex-col gap-2 relative"
    >
      <!-- Command Dropdown -->
      {#if showCommandMenu && filteredCommands.length > 0}
        <div
          class="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-lg z-50"
        >
          <div class="p-2">
            {#each filteredCommands as command, index}
              <button
                type="button"
                onclick={() => {
                  input = `/${command.name}`;
                  showCommandMenu = false;
                  sendMessage();
                }}
                class="w-full text-left px-3 py-2 rounded-md transition-colors {index ===
                selectedCommandIndex
                  ? 'bg-blue-500/20 border border-blue-500/50'
                  : 'hover:bg-gray-800'}"
              >
                <div class="font-medium text-sm text-gray-200">
                  /{command.name}
                  <span class="text-gray-400 font-normal ml-1"
                    >- {command.label}</span
                  >
                </div>
                <div class="text-xs text-gray-400">{command.description}</div>
              </button>
            {/each}
          </div>
          <div
            class="px-3 py-2 border-t border-gray-800 text-xs text-gray-500 flex gap-3"
          >
            <span><kbd class="px-1 bg-gray-800 rounded">↑↓</kbd> navigate</span>
            <span><kbd class="px-1 bg-gray-800 rounded">↵</kbd> select</span>
            <span><kbd class="px-1 bg-gray-800 rounded">esc</kbd> close</span>
          </div>
        </div>
      {/if}

      <div class="flex gap-2">
        <textarea
          bind:value={input}
          onkeydown={handleKeyDown}
          disabled={!apiKey || loading}
          placeholder="Ask about your feeds..."
          rows="2"
          class="flex-1 px-3 py-2 bg-[#0d0d0d] border border-gray-800 rounded-md text-base md:text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
        ></textarea>
        <button
          type="submit"
          disabled={!apiKey || loading || !input.trim()}
          class="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <Send size={18} />
        </button>
      </div>

      <!-- Bottom actions -->
      <div class="flex items-center justify-between relative">
        <div class="flex items-center gap-2 context-menu-container relative">
          <button
            type="button"
            onclick={() => (showContextMenu = !showContextMenu)}
            class="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 border border-gray-800 rounded-md hover:bg-gray-800 transition-colors"
          >
            <Plus size={14} />
            Add Context
          </button>

          <!-- Context Dropdown Menu -->
          {#if showContextMenu}
            <div
              class="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-lg z-50"
            >
              <!-- Search box -->
              <div class="p-2 border-b border-gray-800">
                <input
                  type="text"
                  placeholder="Search for context..."
                  bind:value={contextSearch}
                  class="w-full px-2 py-1 text-base md:text-xs bg-[#0d0d0d] text-gray-200 border border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <!-- Context options -->
              <div class="max-h-96 overflow-y-auto">
                <!-- Views Section -->
                <div class="p-2">
                  <div class="text-xs text-gray-500 mb-1 px-2">Views</div>
                  <button
                    type="button"
                    onclick={() => {
                      addAllPostsContext();
                      showContextMenu = false;
                    }}
                    class="w-full text-left px-2 py-1 text-xs text-gray-200 rounded hover:bg-gray-800 transition-colors"
                  >
                    All Posts
                  </button>
                  <button
                    type="button"
                    onclick={() => {
                      addStarredContext();
                      showContextMenu = false;
                    }}
                    class="w-full text-left px-2 py-1 text-xs text-gray-200 rounded hover:bg-gray-800 transition-colors"
                  >
                    Starred Posts
                  </button>
                </div>

                <!-- Feeds Section -->
                {#if feeds.length > 0}
                  <div class="p-2 border-t border-gray-800">
                    <div class="text-xs text-gray-500 mb-1 px-2">Feeds</div>
                    {#each feeds.filter((f) => !contextSearch || f.title
                          ?.toLowerCase()
                          .includes(contextSearch.toLowerCase())) as feed}
                      <button
                        type="button"
                        onclick={() => {
                          addContext({
                            id: `manual-feed-${feed.id}`,
                            type: "feed",
                            label: feed.title,
                            data: feed,
                          });
                          showContextMenu = false;
                          contextSearch = "";
                        }}
                        class="w-full text-left px-2 py-1 text-xs text-gray-200 rounded hover:bg-gray-800 transition-colors truncate"
                      >
                        {feed.title}
                      </button>
                    {/each}
                  </div>
                {/if}

                <!-- Recent Entries Section -->
                {#if timelineEntries.length > 0}
                  <div class="p-2 border-t border-gray-800">
                    <div class="text-xs text-gray-500 mb-1 px-2">
                      Recent Entries
                    </div>
                    {#each timelineEntries
                      .filter((e) => !contextSearch || e.entry_title
                            ?.toLowerCase()
                            .includes(contextSearch.toLowerCase()))
                      .slice(0, 10) as entry}
                      <button
                        type="button"
                        onclick={() => {
                          addContext({
                            id: `manual-entry-${entry.entry_id}`,
                            type: "entry",
                            label: entry.entry_title,
                            data: entry,
                          });
                          showContextMenu = false;
                          contextSearch = "";
                        }}
                        class="w-full text-left px-2 py-1 text-xs text-gray-200 rounded hover:bg-gray-800 transition-colors truncate"
                      >
                        {entry.entry_title}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
        <span class="text-xs text-gray-500">Auto</span>
      </div>
    </form>
  </div>
</div>

<style>
  .blinking-dots span {
    animation: blink 1.4s infinite;
    opacity: 0;
  }

  .blinking-dots span:nth-child(1) {
    animation-delay: 0s;
  }

  .blinking-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .blinking-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes blink {
    0%,
    20% {
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
