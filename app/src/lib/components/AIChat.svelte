<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { Send, X, Plus } from 'lucide-svelte';
	import type { Tables } from '$lib/types/database';
	import { marked } from 'marked';

	interface ContextBadge {
		id: string;
		type: 'view' | 'category' | 'feed' | 'entry';
		label: string;
		data?: any;
	}

	interface Props {
		contextType: 'feed' | 'entry';
		contextId?: string;
		currentView?: 'all' | 'starred' | string;
		currentCategory?: string | null;
		currentFeed?: { feed_id: string; feed_title: string } | null;
		currentEntry?: { entry_id: string; entry_title: string; entry_content?: string } | null;
		timelineEntries?: any[];
		feeds?: any[];
	}

	let {
		contextType,
		contextId,
		currentView = 'all',
		currentCategory = null,
		currentFeed = null,
		currentEntry = null,
		timelineEntries = [],
		feeds = []
	}: Props = $props();

	type ChatMessage = Tables<'chat_messages'>;

	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let loading = $state(false);
	let apiKey = $state('');
	let preferredModel = $state('anthropic/claude-3.5-sonnet');
	let chatContainer: HTMLDivElement;
	let streamingContent = $state('');

	// Context management
	let activeContexts = $state<ContextBadge[]>([]);
	let removedAutoContexts = $state<Set<string>>(new Set()); // Track which auto contexts user removed
	let showContextMenu = $state(false);
	let contextSearch = $state('');
	let showCommandMenu = $state(false);

	// Slash commands
	interface SlashCommand {
		name: string;
		label: string;
		description: string;
	}

	const slashCommands: SlashCommand[] = [
		{
			name: 'summarize',
			label: 'Summarize',
			description: 'Get a concise summary of the active contexts'
		},
		{
			name: 'analyze',
			label: 'Analyze',
			description: 'Deep analysis of content with insights and patterns'
		},
		{
			name: 'compare',
			label: 'Compare',
			description: 'Compare and contrast multiple posts or feeds'
		},
		{
			name: 'help',
			label: 'Help',
			description: 'Show available commands and context info'
		}
	];

	let filteredCommands = $state<SlashCommand[]>([]);

	// Strip HTML tags from content
	function stripHtml(html: string): string {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		return doc.body.textContent || '';
	}

	// Domain category helper (same as sidebar/timeline)
	function getDomainCategory(url: string | null, siteUrl: string | null): string {
		const feedUrl = url || siteUrl;
		if (!feedUrl) return 'Other';

		try {
			const urlObj = new URL(feedUrl);
			let domain = urlObj.hostname.replace('www.', '');

			// Map common domains to readable names
			if (domain.includes('youtube.com')) return 'YouTube';
			if (domain.includes('reddit.com')) return 'Reddit';
			if (domain.includes('github.com')) return 'GitHub';
			if (domain.includes('medium.com')) return 'Medium';
			if (domain.includes('substack.com')) return 'Substack';

			// Capitalize first letter for other domains
			return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
		} catch (e) {
			return 'Other';
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
		if (!contextId.startsWith('manual-')) {
			removedAutoContexts = new Set([...removedAutoContexts, contextId]);
		}
	}

	function clearAllContexts() {
		activeContexts = [];
	}

	// Watch for slash command input
	$effect(() => {
		if (input.startsWith('/') && input.length > 1) {
			showCommandMenu = true;
			const query = input.slice(1).toLowerCase();
			filteredCommands = slashCommands.filter(
				(c) => c.name.includes(query) || c.label.toLowerCase().includes(query)
			);
		} else {
			showCommandMenu = false;
			filteredCommands = [];
		}
	});

	onMount(async () => {
		if (!$user) return;

		// Load user settings for API key
		const { data: settings } = await supabase
			.from('user_settings')
			.select('openrouter_api_key, preferred_model')
			.eq('user_id', $user.id)
			.single();

		if (settings) {
			apiKey = settings.openrouter_api_key || '';
			preferredModel = settings.preferred_model || 'anthropic/claude-3.5-sonnet';
		}

		// Load chat history
		await loadMessages();

		// Click outside handler for context menu
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (showContextMenu && !target.closest('.context-menu-container')) {
				showContextMenu = false;
			}
		};

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
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

		// Add "All" context when viewing all posts
		if (currentView === 'all') {
			newContexts.push({
				id: 'view-all',
				type: 'view',
				label: 'All',
				data: { view: 'all' }
			});
		}

		// Add "Starred" context when viewing starred posts
		if (currentView === 'starred') {
			newContexts.push({
				id: 'view-starred',
				type: 'view',
				label: 'Starred',
				data: { view: 'starred' }
			});
		}

		// Add specific entry context (opened post)
		if (currentEntry) {
			newContexts.push({
				id: `entry-${currentEntry.entry_id}`,
				type: 'entry',
				label: currentEntry.entry_title,
				data: currentEntry
			});
		} else {
			// Only add category/feed context if no specific entry is selected
			// Add category context (e.g., Reddit.com)
			if (currentCategory) {
				newContexts.push({
					id: `category-${currentCategory}`,
					type: 'category',
					label: currentCategory,
					data: { category: currentCategory }
				});
			}

			// Add specific feed context (e.g., OpenAI News)
			if (currentFeed) {
				newContexts.push({
					id: `feed-${currentFeed.feed_id}`,
					type: 'feed',
					label: currentFeed.feed_title,
					data: currentFeed
				});
			}
		}

		// Build the new context array without triggering effect recursion
		// Keep manually added contexts and merge with new auto contexts
		const manualContexts = activeContexts.filter((c) => c.id.startsWith('manual-'));
		const mergedContexts = [...manualContexts];

		// Add new contexts if they don't already exist and weren't explicitly removed by user
		for (const context of newContexts) {
			if (!mergedContexts.some((c) => c.id === context.id) && !removedAutoContexts.has(context.id)) {
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

		const { data, error} = await supabase
			.from('chat_messages')
			.select('*')
			.eq('user_id', $user.id)
			.eq('context_type', contextType)
			.eq('context_id', contextId || null)
			.order('created_at', { ascending: true });

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
		if (trimmed.startsWith('/')) {
			const parts = trimmed.substring(1).split(' ');
			return {
				isCommand: true,
				command: parts[0].toLowerCase(),
				args: parts.slice(1).join(' ')
			};
		}
		return { isCommand: false };
	}

	async function loadContextData(): Promise<{
		type: string;
		data: any;
	} | null> {
		if (contextType === 'entry' && contextId) {
			const { data: entry } = await supabase
				.from('entries')
				.select('id, title, description, content, author, url, published_at')
				.eq('id', contextId)
				.single();

			return entry ? { type: 'entry', data: entry } : null;
		} else if (contextType === 'feed' && contextId) {
			const { data: feed } = await supabase
				.from('feeds')
				.select('id, title, description, category')
				.eq('id', contextId)
				.single();

			return feed ? { type: 'feed', data: feed } : null;
		}
		return null;
	}

	async function handleSummarize() {
		if (contextType !== 'entry' || !contextId) {
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content:
					'The /summarize command only works when viewing a specific post. Please click on a post first.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
			return;
		}

		loading = true;

		// Fetch entry data
		const { data: entry, error: entryError } = await supabase
			.from('entries')
			.select('title, description, content, author, url, published_at')
			.eq('id', contextId)
			.single();

		if (entryError || !entry) {
			loading = false;
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content: 'Sorry, I couldn\'t load the post content to summarize.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
			return;
		}

		// Save command message
		const { data: savedMessage } = await supabase
			.from('chat_messages')
			.insert({
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'user',
				content: '/summarize'
			})
			.select()
			.single();

		if (savedMessage) {
			messages = [...messages, savedMessage];
			scrollToBottom();
		}

		// Create system message with Pareto principle instructions
		const systemMessage = {
			role: 'system',
			content: `You are summarizing an article for LeadrFeeds. Use the Pareto Principle (80/20 rule): identify the 20% of content that conveys 80% of the meaning.

Article: "${entry.title}"${entry.author ? `\nAuthor: ${entry.author}` : ''}
Published: ${new Date(entry.published_at || '').toLocaleDateString()}

Content:
${entry.content || entry.description || 'No content available'}

Provide a concise, high-quality summary in 2-3 paragraphs that:
1. Captures the main thesis/argument
2. Highlights key points and insights
3. Notes important conclusions or takeaways
Focus on substance over details. Be clear and direct.`
		};

		try {
			// Call OpenRouter with streaming
			streamingContent = '';
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': window.location.origin,
					'X-Title': 'LeadrFeeds'
				},
				body: JSON.stringify({
					model: preferredModel,
					messages: [systemMessage, { role: 'user', content: 'Please summarize this article.' }],
					stream: true
				})
			});

			if (!response.ok) {
				throw new Error('OpenRouter API request failed');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let summary = '';

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

					for (const line of lines) {
						const data = line.replace(/^data: /, '');
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const content = parsed.choices[0]?.delta?.content || '';
							if (content) {
								summary += content;
								streamingContent = summary;
								scrollToBottom();
							}
						} catch (e) {
							// Skip invalid JSON
						}
					}
				}
			}

			// Save assistant response
			const { data: assistantMsg } = await supabase
				.from('chat_messages')
				.insert({
					user_id: $user!.id,
					context_type: contextType,
					context_id: contextId || null,
					role: 'assistant',
					content: summary || 'No response generated'
				})
				.select()
				.single();

			if (assistantMsg) {
				messages = [...messages, assistantMsg];
				scrollToBottom();
			}

			streamingContent = '';
			loading = false;
		} catch (error) {
			console.error('Error calling OpenRouter:', error);
			loading = false;
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content:
					'Sorry, there was an error generating the summary. Please check your API key in settings.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
		}
	}

	async function handleHelp() {
		const helpText = `**Available Commands:**

**/summarize** - Generate a concise summary of the current post (only works when viewing a post)
**/help** - Show this help message

**Context Information:**
${
	contextType === 'entry'
		? '✓ You are viewing a specific post. I can summarize it or answer questions about it.'
		: contextType === 'feed'
			? '✓ You are viewing a feed. I can answer questions about posts in this feed.'
			: '✓ You are in global view. I can answer general questions about your feeds.'
}`;

		const helpMsg = {
			id: 'help-' + Date.now(),
			user_id: $user!.id,
			context_type: contextType,
			context_id: contextId || null,
			role: 'assistant' as const,
			content: helpText,
			created_at: new Date().toISOString()
		} as ChatMessage;

		messages = [...messages, helpMsg];
		scrollToBottom();
	}

	async function handleAnalyze() {
		// Use the regular send flow with a specific prompt
		const analysisPrompt = 'Analyze the content in the active contexts. Look for patterns, trends, key insights, and interesting connections. Provide a structured analysis.';
		await sendMessageWithPrompt('/analyze', analysisPrompt);
	}

	async function handleCompare() {
		if (activeContexts.length < 2) {
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content:
					'The /compare command requires at least 2 contexts. Please add more contexts using the "Add Context" button.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
			return;
		}

		const comparePrompt = 'Compare and contrast the different pieces of content in the active contexts. Highlight similarities, differences, and unique perspectives.';
		await sendMessageWithPrompt('/compare', comparePrompt);
	}

	async function sendMessageWithPrompt(commandText: string, customPrompt: string) {
		loading = true;

		// Save command message
		const { data: savedMessage } = await supabase
			.from('chat_messages')
			.insert({
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'user',
				content: commandText
			})
			.select()
			.single();

		if (savedMessage) {
			messages = [...messages, savedMessage];
			scrollToBottom();
		}

		// Build context from active badges
		const contextString = buildContextFromBadges();

		if (!contextString) {
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content:
					'No active contexts found. Please add some context using the "Add Context" button or navigate to a specific post/feed.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
			loading = false;
			return;
		}

		// Build API messages
		const apiMessages: Array<{ role: string; content: string }> = [
			{
				role: 'system',
				content: `You are an AI assistant helping analyze RSS feed content for LeadrFeeds.

${contextString}

${customPrompt}`
			},
			{ role: 'user', content: customPrompt }
		];

		try {
			streamingContent = '';
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': window.location.origin,
					'X-Title': 'LeadrFeeds'
				},
				body: JSON.stringify({
					model: preferredModel,
					messages: apiMessages,
					stream: true
				})
			});

			if (!response.ok) {
				throw new Error('OpenRouter API request failed');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let assistantMessage = '';

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

					for (const line of lines) {
						const data = line.replace(/^data: /, '');
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const content = parsed.choices[0]?.delta?.content || '';
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
				.from('chat_messages')
				.insert({
					user_id: $user!.id,
					context_type: contextType,
					context_id: contextId || null,
					role: 'assistant',
					content: assistantMessage || 'No response'
				})
				.select()
				.single();

			if (assistantMsg) {
				messages = [...messages, assistantMsg];
				scrollToBottom();
			}

			streamingContent = '';
			loading = false;
		} catch (error) {
			console.error('Error calling OpenRouter:', error);
			loading = false;
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user!.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant' as const,
				content:
					'Sorry, there was an error processing your request. Please check your API key in settings.',
				created_at: new Date().toISOString()
			} as ChatMessage;
			messages = [...messages, errorMsg];
			scrollToBottom();
		}
	}

	// Build context string from active context badges
	function buildContextFromBadges(): string {
		if (activeContexts.length === 0) return '';

		let contextParts: string[] = [];

		for (const context of activeContexts) {
			if (context.type === 'view' && context.label === 'All') {
				// Include summaries of visible timeline entries with content
				if (timelineEntries.length > 0) {
					const entrySummaries = timelineEntries
						.slice(0, 8)
						.map((entry) => {
							const rawContent = entry.entry_content || entry.entry_description || 'No content';
							const content = stripHtml(rawContent);
							return `- "${entry.entry_title}" (from ${entry.feed_title}, ${new Date(entry.entry_published_at).toLocaleDateString()})\n  ${content.substring(0, 800)}${content.length > 800 ? '...' : ''}`;
						})
						.join('\n\n');

					contextParts.push(
						`## All Posts Feed (${timelineEntries.length} visible entries, showing first 8):\n${entrySummaries}`
					);
				}
			} else if (context.type === 'view' && context.label === 'Starred') {
				contextParts.push(`## Context: User is viewing their starred/saved posts`);
			} else if (context.type === 'category') {
				// Include posts from specific category (using domain-based categories)
				const categoryPosts = timelineEntries.filter((e) => {
					// Find the feed for this entry
					const feed = feeds.find((f) => f.id === e.feed_id);
					if (!feed) return false;
					// Get domain category from feed URL
					const domainCat = getDomainCategory(feed.url, feed.site_url);
					return domainCat === context.data.category;
				});
				if (categoryPosts.length > 0) {
					const summaries = categoryPosts
						.slice(0, 8)
						.map((entry) => {
							const rawContent = entry.entry_content || entry.entry_description || 'No content';
							const content = stripHtml(rawContent);
							return `- "${entry.entry_title}" (${entry.feed_title})\n  ${content.substring(0, 800)}${content.length > 800 ? '...' : ''}`;
						})
						.join('\n\n');
					contextParts.push(`## ${context.label} Posts (showing ${Math.min(8, categoryPosts.length)} of ${categoryPosts.length}):\n${summaries}`);
				}
			} else if (context.type === 'feed') {
				// Include posts from specific feed
				const feedPosts = timelineEntries.filter((e) => e.feed_id === context.data.feed_id);
				if (feedPosts.length > 0) {
					const summaries = feedPosts
						.slice(0, 8)
						.map((entry) => {
							const rawContent = entry.entry_content || entry.entry_description || 'No content';
							const content = stripHtml(rawContent);
							return `- "${entry.entry_title}"\n  ${content.substring(0, 800)}${content.length > 800 ? '...' : ''}`;
						})
						.join('\n\n');
					contextParts.push(`## ${context.label} Feed (showing ${Math.min(8, feedPosts.length)} of ${feedPosts.length} posts):\n${summaries}`);
				} else {
					contextParts.push(`## Context: User is asking about the "${context.label}" feed`);
				}
			} else if (context.type === 'entry') {
				// Include full entry content (no truncation for individual articles)
				const rawContent = context.data.entry_content || context.data.entry_description || '';
				const content = stripHtml(rawContent);
				contextParts.push(
					`## Article: "${context.label}"\nAuthor: ${context.data.entry_author || 'Unknown'}\nPublished: ${new Date(context.data.entry_published_at).toLocaleDateString()}\n\nContent:\n${content}`
				);
			}
		}

		return contextParts.join('\n\n---\n\n');
	}

	async function sendMessage() {
		if (!input.trim() || !apiKey || !$user) return;

		const userMessage = input.trim();
		const parsed = parseCommand(userMessage);

		// Handle commands
		if (parsed.isCommand) {
			input = '';
			switch (parsed.command) {
				case 'summarize':
					await handleSummarize();
					return;
				case 'analyze':
					await handleAnalyze();
					return;
				case 'compare':
					await handleCompare();
					return;
				case 'help':
					await handleHelp();
					return;
				default:
					const unknownMsg = {
						id: 'error-' + Date.now(),
						user_id: $user.id,
						context_type: contextType,
						context_id: contextId || null,
						role: 'assistant' as const,
						content: `Unknown command: /${parsed.command}. Type /help to see available commands.`,
						created_at: new Date().toISOString()
					} as ChatMessage;
					messages = [...messages, unknownMsg];
					scrollToBottom();
					return;
			}
		}

		input = '';
		loading = true;

		// Save user message
		const { data: savedMessage, error: saveError } = await supabase
			.from('chat_messages')
			.insert({
				user_id: $user.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'user',
				content: userMessage
			})
			.select()
			.single();

		if (saveError) {
			console.error('Error saving message:', saveError);
			loading = false;
			return;
		}

		messages = [...messages, savedMessage];
		scrollToBottom();

		// Build context from active badges
		const contextString = buildContextFromBadges();

		// Build messages array with context
		let apiMessages: Array<{ role: string; content: string }> = [];

		// Add system message with context if we have any active contexts
		if (contextString) {
			apiMessages.push({
				role: 'system',
				content: `You are an AI assistant helping analyze RSS feed content for LeadrFeeds.

${contextString}

The user is asking about the content above. Provide insightful, accurate analysis. When referencing posts, use their titles. Be concise and helpful.`
			});
		}

		// Add conversation history (limit to last 10 messages to save tokens)
		const recentMessages = messages.slice(-10);
		apiMessages = [
			...apiMessages,
			...recentMessages.map((m) => ({
				role: m.role,
				content: m.content
			})),
			{ role: 'user', content: userMessage }
		];

		// Call OpenRouter API with streaming
		try {
			streamingContent = '';
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': window.location.origin,
					'X-Title': 'LeadrFeeds'
				},
				body: JSON.stringify({
					model: preferredModel,
					messages: apiMessages,
					stream: true
				})
			});

			if (!response.ok) {
				throw new Error('OpenRouter API request failed');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let assistantMessage = '';

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

					for (const line of lines) {
						const data = line.replace(/^data: /, '');
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const content = parsed.choices[0]?.delta?.content || '';
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
				.from('chat_messages')
				.insert({
					user_id: $user.id,
					context_type: contextType,
					context_id: contextId || null,
					role: 'assistant',
					content: assistantMessage || 'No response'
				})
				.select()
				.single();

			if (!assistantError && assistantMsg) {
				messages = [...messages, assistantMsg];
				scrollToBottom();
			}

			// Clear streaming content and loading state after message is saved
			streamingContent = '';
			loading = false;
		} catch (error) {
			console.error('Error calling OpenRouter:', error);
			loading = false;
			// Show error message
			const errorMsg = {
				id: 'error-' + Date.now(),
				user_id: $user.id,
				context_type: contextType,
				context_id: contextId || null,
				role: 'assistant',
				content: 'Sorry, there was an error processing your request. Please check your API key in settings.',
				created_at: new Date().toISOString()
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
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function renderMarkdown(content: string): string {
		return marked(content, { breaks: true, gfm: true }) as string;
	}
</script>

<div class="w-[400px] border-l border-gray-800/50 bg-[#121212] flex flex-col h-full">
	<!-- Header -->
	<div class="px-6 py-5 border-b border-gray-800/50">
		<h2 class="font-bold text-xl text-gray-100 tracking-tight">AI Assistant</h2>
		<p class="text-xs text-gray-500 mt-0.5">Powered by OpenRouter</p>
	</div>

	<!-- Messages -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto p-6 space-y-4">
		{#if !apiKey}
			<div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-400">
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
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div
						class="max-w-[80%] rounded-lg px-4 py-2 {message.role === 'user' ? 'bg-blue-500/20 text-gray-200' : 'bg-gray-800 text-gray-200'}"
					>
						{#if message.role === 'user'}
							<p class="text-sm whitespace-pre-wrap">{message.content}</p>
						{:else}
							<div class="text-sm prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:bg-[#0d0d0d] prose-pre:text-gray-100">
								{@html renderMarkdown(message.content)}
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if streamingContent}
				<div class="flex justify-start">
					<div class="max-w-[80%] rounded-lg px-4 py-2 bg-gray-800 text-gray-200">
						<div class="text-sm prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:bg-[#0d0d0d] prose-pre:text-gray-100">
							{@html renderMarkdown(streamingContent)}
						</div>
						<div class="inline-block w-2 h-4 bg-gray-200 animate-pulse ml-1"></div>
					</div>
				</div>
			{:else if loading}
				<div class="flex justify-start">
					<div class="bg-gray-800 rounded-lg px-4 py-2">
						<p class="text-sm text-gray-400">
							Thinking<span class="blinking-dots"><span>.</span><span>.</span><span>.</span></span>
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
						<span class="text-gray-200 truncate" title={context.label}>{context.label}</span>
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

		<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="flex flex-col gap-2 relative">
			<!-- Command Dropdown -->
			{#if showCommandMenu && filteredCommands.length > 0}
				<div
					class="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-lg z-50"
				>
					<div class="p-2">
						{#each filteredCommands as command}
							<button
								type="button"
								onclick={() => {
									input = `/${command.name}`;
									showCommandMenu = false;
									sendMessage();
								}}
								class="w-full text-left px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
							>
								<div class="font-medium text-sm text-gray-200">{command.label}</div>
								<div class="text-xs text-gray-400">{command.description}</div>
							</button>
						{/each}
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
					class="flex-1 px-3 py-2 bg-[#0d0d0d] border border-gray-800 rounded-md text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
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
									class="w-full px-2 py-1 text-xs bg-[#0d0d0d] text-gray-200 border border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
											addContext({
												id: 'manual-view-all',
												type: 'view',
												label: 'All Posts',
												data: { view: 'all' }
											});
											showContextMenu = false;
										}}
										class="w-full text-left px-2 py-1 text-xs text-gray-200 rounded hover:bg-gray-800 transition-colors"
									>
										All Posts
									</button>
									<button
										type="button"
										onclick={() => {
											addContext({
												id: 'manual-view-starred',
												type: 'view',
												label: 'Starred Posts',
												data: { view: 'starred' }
											});
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
										{#each feeds.filter((f) =>
											!contextSearch ||
											f.title?.toLowerCase().includes(contextSearch.toLowerCase())
										) as feed}
											<button
												type="button"
												onclick={() => {
													addContext({
														id: `manual-feed-${feed.id}`,
														type: 'feed',
														label: feed.title,
														data: feed
													});
													showContextMenu = false;
													contextSearch = '';
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
										<div class="text-xs text-gray-500 mb-1 px-2">Recent Entries</div>
										{#each timelineEntries
											.filter(
												(e) =>
													!contextSearch ||
													e.entry_title?.toLowerCase().includes(contextSearch.toLowerCase())
											)
											.slice(0, 10) as entry}
											<button
												type="button"
												onclick={() => {
													addContext({
														id: `manual-entry-${entry.entry_id}`,
														type: 'entry',
														label: entry.entry_title,
														data: entry
													});
													showContextMenu = false;
													contextSearch = '';
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
		0%, 20% {
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
