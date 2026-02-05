<script lang="ts">
	import { onMount } from 'svelte';
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import ParamTable from '$lib/components/docs/ParamTable.svelte';
	import { Book, Key, Zap, AlertCircle, Download, ExternalLink, Menu, X } from 'lucide-svelte';

	// State
	let selectedLang = $state<'curl' | 'javascript' | 'python'>('curl');
	let activeSection = $state('overview');
	let mobileNavOpen = $state(false);

	// Sections for navigation
	const sections = [
		{ id: 'overview', title: 'Overview', icon: Book },
		{ id: 'authentication', title: 'Authentication', icon: Key },
		{ id: 'entries', title: 'GET /entries', icon: null },
		{ id: 'feeds', title: 'GET /feeds', icon: null },
		{ id: 'collections', title: 'GET /collections', icon: null },
		{ id: 'stats', title: 'GET /stats', icon: null },
		{ id: 'errors', title: 'Error Handling', icon: AlertCircle },
		{ id: 'rate-limits', title: 'Rate Limits', icon: Zap }
	];

	// Parameters for entries endpoint
	const entriesParams = [
		{ name: 'cursor', type: 'string', required: false, description: 'Pagination cursor from previous response. Omit for first page.' },
		{ name: 'limit', type: 'integer', required: false, description: 'Maximum entries per page (1-100)', default: '20' },
		{ name: 'feed_id', type: 'string (UUID)', required: false, description: 'Filter by specific feed' },
		{ name: 'collection_id', type: 'string (UUID)', required: false, description: 'Filter by collection (returns entries from all feeds in collection)' },
		{ name: 'category', type: 'string', required: false, description: 'Filter by feed category' },
		{ name: 'start_date', type: 'string (ISO 8601)', required: false, description: 'Entries published on or after this date' },
		{ name: 'end_date', type: 'string (ISO 8601)', required: false, description: 'Entries published on or before this date' },
		{ name: 'is_read', type: 'boolean', required: false, description: 'Filter by read status (true for read, false for unread)' },
		{ name: 'is_starred', type: 'boolean', required: false, description: 'Filter by starred status (true for starred only)' },
		{ name: 'search', type: 'string', required: false, description: 'Full-text search in title and description (case-insensitive)' }
	];

	// Code examples
	const authExample = {
		curl: `curl -X GET "https://leadrfeeds.com/api/v1/entries" \\
  -H "Authorization: Bearer lf_your_api_key_here"`,
		javascript: `const response = await fetch('https://leadrfeeds.com/api/v1/entries', {
  headers: {
    'Authorization': 'Bearer lf_your_api_key_here'
  }
});
const data = await response.json();`,
		python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/entries',
    headers={'Authorization': 'Bearer lf_your_api_key_here'}
)
data = response.json()`
	};

	const entriesExample = {
		curl: `curl -X GET "https://leadrfeeds.com/api/v1/entries?limit=10&is_read=false" \\
  -H "Authorization: Bearer lf_your_api_key_here"`,
		javascript: `const params = new URLSearchParams({
  limit: '10',
  is_read: 'false'
});

const response = await fetch(
  \`https://leadrfeeds.com/api/v1/entries?\${params}\`,
  {
    headers: {
      'Authorization': 'Bearer lf_your_api_key_here'
    }
  }
);
const data = await response.json();

// Paginate through results
if (data.meta.has_more) {
  const nextParams = new URLSearchParams({
    cursor: data.meta.next_cursor
  });
  // Fetch next page...
}`,
		python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/entries',
    params={'limit': 10, 'is_read': False},
    headers={'Authorization': 'Bearer lf_your_api_key_here'}
)
data = response.json()

# Paginate through results
if data['meta']['has_more']:
    next_response = requests.get(
        'https://leadrfeeds.com/api/v1/entries',
        params={'cursor': data['meta']['next_cursor']},
        headers={'Authorization': 'Bearer lf_your_api_key_here'}
    )`
	};

	const feedsExample = {
		curl: `curl -X GET "https://leadrfeeds.com/api/v1/feeds" \\
  -H "Authorization: Bearer lf_your_api_key_here"`,
		javascript: `const response = await fetch('https://leadrfeeds.com/api/v1/feeds', {
  headers: {
    'Authorization': 'Bearer lf_your_api_key_here'
  }
});
const { data: feeds } = await response.json();

console.log(\`You have \${feeds.length} subscribed feeds\`);
feeds.forEach(feed => {
  console.log(\`\${feed.title}: \${feed.unread_count} unread\`);
});`,
		python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/feeds',
    headers={'Authorization': 'Bearer lf_your_api_key_here'}
)
feeds = response.json()['data']

print(f"You have {len(feeds)} subscribed feeds")
for feed in feeds:
    print(f"{feed['title']}: {feed['unread_count']} unread")`
	};

	const collectionsExample = {
		curl: `curl -X GET "https://leadrfeeds.com/api/v1/collections" \\
  -H "Authorization: Bearer lf_your_api_key_here"`,
		javascript: `const response = await fetch('https://leadrfeeds.com/api/v1/collections', {
  headers: {
    'Authorization': 'Bearer lf_your_api_key_here'
  }
});
const { data: collections } = await response.json();

collections.forEach(collection => {
  console.log(\`\${collection.name}: \${collection.feed_count} feeds, \${collection.unread_count} unread\`);
});`,
		python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/collections',
    headers={'Authorization': 'Bearer lf_your_api_key_here'}
)
collections = response.json()['data']

for collection in collections:
    print(f"{collection['name']}: {collection['feed_count']} feeds, {collection['unread_count']} unread")`
	};

	const statsExample = {
		curl: `curl -X GET "https://leadrfeeds.com/api/v1/stats" \\
  -H "Authorization: Bearer lf_your_api_key_here"`,
		javascript: `const response = await fetch('https://leadrfeeds.com/api/v1/stats', {
  headers: {
    'Authorization': 'Bearer lf_your_api_key_here'
  }
});
const { data: stats } = await response.json();

console.log(\`Total unread: \${stats.total_unread}\`);
console.log(\`Total starred: \${stats.total_starred}\`);`,
		python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/stats',
    headers={'Authorization': 'Bearer lf_your_api_key_here'}
)
stats = response.json()['data']

print(f"Total unread: {stats['total_unread']}")
print(f"Total starred: {stats['total_starred']}")`
	};

	// Response examples
	const entryResponse = `{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Understanding RSS Feeds",
      "url": "https://example.com/article",
      "description": "A comprehensive guide to RSS...",
      "content": "<p>Full article content...</p>",
      "author": "Jane Doe",
      "published_at": "2026-02-05T10:30:00Z",
      "feed": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "title": "Tech Blog",
        "image": "https://example.com/icon.png"
      },
      "is_read": false,
      "is_starred": true
    }
  ],
  "meta": {
    "next_cursor": "eyJwIjoiMjAyNi0wMi0wNSIsImkiOiIxMjM0In0=",
    "has_more": true,
    "limit": 20
  }
}`;

	const feedResponse = `{
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "title": "Tech Blog",
      "url": "https://example.com/feed.xml",
      "site_url": "https://example.com",
      "description": "Latest tech news and tutorials",
      "category": "Technology",
      "image": "https://example.com/icon.png",
      "unread_count": 12,
      "subscribed_at": "2026-01-15T08:00:00Z"
    }
  ]
}`;

	const collectionResponse = `{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Tech News",
      "icon_name": "newspaper",
      "display_order": 1,
      "feed_count": 5,
      "unread_count": 42,
      "feeds": [
        {
          "id": "660e8400-e29b-41d4-a716-446655440001",
          "title": "Tech Blog",
          "url": "https://example.com/feed.xml",
          "unread_count": 12,
          "subscribed_at": "2026-01-15T08:00:00Z"
        }
      ]
    }
  ]
}`;

	const statsResponse = `{
  "data": {
    "total_unread": 156,
    "total_starred": 23,
    "feeds": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "title": "Tech Blog",
        "unread_count": 12
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440002",
        "title": "Design Weekly",
        "unread_count": 8
      }
    ]
  }
}`;

	const errorResponse = `{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key",
    "status": 401
  }
}`;

	// Error codes table data
	const errorCodes = [
		{ code: 'BAD_REQUEST', status: 400, description: 'Invalid request parameters (e.g., malformed UUID, invalid cursor)' },
		{ code: 'UNAUTHORIZED', status: 401, description: 'Missing or invalid API key' },
		{ code: 'NOT_FOUND', status: 404, description: 'Resource not found (e.g., feed_id does not exist)' },
		{ code: 'RATE_LIMIT_EXCEEDED', status: 429, description: 'Too many requests. Check Retry-After header.' },
		{ code: 'INTERNAL_ERROR', status: 500, description: 'Server error. Please try again later.' }
	];

	// IntersectionObserver for active section tracking
	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						activeSection = entry.target.id;
					}
				});
			},
			{ threshold: 0.2, rootMargin: '-80px 0px -60% 0px' }
		);

		sections.forEach((s) => {
			const el = document.getElementById(s.id);
			if (el) observer.observe(el);
		});

		return () => observer.disconnect();
	});

	function scrollToSection(id: string) {
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
			mobileNavOpen = false;
		}
	}

	function getLangForCodeBlock(lang: 'curl' | 'javascript' | 'python'): 'bash' | 'javascript' | 'python' {
		return lang === 'curl' ? 'bash' : lang;
	}
</script>

<svelte:head>
	<title>API Documentation - LeadrFeeds</title>
	<meta name="description" content="LeadrFeeds API documentation. Learn how to access your feed data programmatically." />
</svelte:head>

<!-- Fixed Header -->
<header class="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
		<div class="flex items-center gap-3">
			<!-- Mobile menu button -->
			<button
				type="button"
				onclick={() => mobileNavOpen = !mobileNavOpen}
				class="rounded-md p-2 hover:bg-muted md:hidden"
				aria-label="Toggle navigation"
			>
				{#if mobileNavOpen}
					<X size={20} />
				{:else}
					<Menu size={20} />
				{/if}
			</button>
			<a href="/" class="flex items-center gap-2">
				<Book size={24} class="text-primary" />
				<span class="text-lg font-semibold">LeadrFeeds API</span>
			</a>
		</div>
		<a
			href="/api/openapi.json"
			class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
		>
			<Download size={16} />
			<span class="hidden sm:inline">Download</span> OpenAPI
		</a>
	</div>
</header>

<!-- Mobile Navigation Overlay -->
{#if mobileNavOpen}
	<div class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden">
		<nav class="fixed top-14 left-0 bottom-0 w-64 overflow-y-auto border-r border-border bg-background p-4">
			<ul class="space-y-1">
				{#each sections as section}
					<li>
						<button
							type="button"
							onclick={() => scrollToSection(section.id)}
							class="w-full rounded-md px-3 py-2 text-left text-sm transition-colors {activeSection === section.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						>
							{section.title}
						</button>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
{/if}

<div class="flex pt-14">
	<!-- Desktop Sidebar Navigation -->
	<nav class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-border p-4 md:block">
		<ul class="space-y-1">
			{#each sections as section}
				<li>
					<button
						type="button"
						onclick={() => scrollToSection(section.id)}
						class="w-full rounded-md px-3 py-2 text-left text-sm transition-colors {activeSection === section.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{section.title}
					</button>
				</li>
			{/each}
		</ul>

		<!-- Back to app link -->
		<div class="mt-8 border-t border-border pt-4">
			<a href="/settings" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
				<ExternalLink size={14} />
				Back to App
			</a>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-12">
		<div class="mx-auto max-w-4xl">
			<!-- Overview Section -->
			<section id="overview" class="mb-16 scroll-mt-20">
				<h1 class="mb-4 text-3xl font-bold text-foreground">LeadrFeeds API</h1>
				<p class="mb-6 text-lg text-muted-foreground">
					Read-only API for programmatic access to your feed data. Build integrations, automate workflows, or create custom clients.
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-4">
					<h3 class="mb-2 font-semibold text-foreground">Base URL</h3>
					<code class="rounded bg-muted px-2 py-1 text-sm font-mono text-primary">https://leadrfeeds.com/api/v1</code>
				</div>

				<div class="grid gap-4 sm:grid-cols-3">
					<div class="rounded-lg border border-border bg-card p-4">
						<div class="mb-2 flex items-center gap-2">
							<Key size={18} class="text-primary" />
							<h4 class="font-medium">Bearer Auth</h4>
						</div>
						<p class="text-sm text-muted-foreground">Secure API key authentication</p>
					</div>
					<div class="rounded-lg border border-border bg-card p-4">
						<div class="mb-2 flex items-center gap-2">
							<Zap size={18} class="text-primary" />
							<h4 class="font-medium">100 req/min</h4>
						</div>
						<p class="text-sm text-muted-foreground">Per-key rate limiting</p>
					</div>
					<div class="rounded-lg border border-border bg-card p-4">
						<div class="mb-2 flex items-center gap-2">
							<Book size={18} class="text-primary" />
							<h4 class="font-medium">JSON</h4>
						</div>
						<p class="text-sm text-muted-foreground">All responses in JSON format</p>
					</div>
				</div>
			</section>

			<!-- Authentication Section -->
			<section id="authentication" class="mb-16 scroll-mt-20">
				<h2 class="mb-4 text-2xl font-bold text-foreground">Authentication</h2>
				<p class="mb-6 text-muted-foreground">
					All API requests require a valid API key passed in the <code class="rounded bg-muted px-1.5 py-0.5 text-sm">Authorization</code> header using the Bearer scheme.
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-6">
					<h3 class="mb-4 text-lg font-semibold text-foreground">Creating an API Key</h3>
					<ol class="list-decimal space-y-2 pl-5 text-muted-foreground">
						<li>Navigate to <a href="/settings" class="text-primary hover:underline">Settings</a></li>
						<li>Scroll to the <strong>API Keys</strong> section</li>
						<li>Enter a label for your key (e.g., "My Integration")</li>
						<li>Optionally set an expiration date</li>
						<li>Click <strong>Create Key</strong></li>
						<li>Copy your key immediately - it will only be shown once!</li>
					</ol>
				</div>

				<div class="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
					<div class="flex items-start gap-3">
						<AlertCircle size={18} class="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
						<div>
							<h4 class="font-medium text-yellow-600 dark:text-yellow-400">Important</h4>
							<p class="text-sm text-muted-foreground">
								API keys are shown only once when created. Store your key securely. If you lose it, you'll need to create a new one.
							</p>
						</div>
					</div>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Making Authenticated Requests</h3>
				<p class="mb-4 text-muted-foreground">
					Include your API key in the <code class="rounded bg-muted px-1.5 py-0.5 text-sm">Authorization</code> header:
				</p>

				<!-- Language tabs -->
				<div class="mb-2 flex gap-1">
					<button
						type="button"
						onclick={() => selectedLang = 'curl'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'curl' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						cURL
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'javascript'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'javascript' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						JavaScript
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'python'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'python' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Python
					</button>
				</div>
				<CodeBlock code={authExample[selectedLang]} language={getLangForCodeBlock(selectedLang)} />
			</section>

			<!-- Entries Endpoint -->
			<section id="entries" class="mb-16 scroll-mt-20">
				<div class="mb-4 flex items-center gap-3">
					<span class="rounded bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<h2 class="text-2xl font-bold text-foreground">/entries</h2>
				</div>
				<p class="mb-6 text-muted-foreground">
					Returns a paginated list of entries from your subscribed feeds. Supports filtering by feed, collection, category, date range, read/starred status, and full-text search.
				</p>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Parameters</h3>
				<div class="mb-6 rounded-lg border border-border bg-card p-4">
					<ParamTable params={entriesParams} />
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Example Request</h3>
				<div class="mb-2 flex gap-1">
					<button
						type="button"
						onclick={() => selectedLang = 'curl'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'curl' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						cURL
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'javascript'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'javascript' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						JavaScript
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'python'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'python' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Python
					</button>
				</div>
				<CodeBlock code={entriesExample[selectedLang]} language={getLangForCodeBlock(selectedLang)} />

				<h3 class="mb-3 mt-6 text-lg font-semibold text-foreground">Example Response</h3>
				<CodeBlock code={entryResponse} language="json" />
			</section>

			<!-- Feeds Endpoint -->
			<section id="feeds" class="mb-16 scroll-mt-20">
				<div class="mb-4 flex items-center gap-3">
					<span class="rounded bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<h2 class="text-2xl font-bold text-foreground">/feeds</h2>
				</div>
				<p class="mb-6 text-muted-foreground">
					Returns all feeds you are subscribed to, including unread counts. Results are ordered by subscription date (newest first).
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-4">
					<p class="text-sm text-muted-foreground">This endpoint has no parameters. It returns all your subscribed feeds.</p>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Example Request</h3>
				<div class="mb-2 flex gap-1">
					<button
						type="button"
						onclick={() => selectedLang = 'curl'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'curl' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						cURL
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'javascript'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'javascript' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						JavaScript
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'python'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'python' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Python
					</button>
				</div>
				<CodeBlock code={feedsExample[selectedLang]} language={getLangForCodeBlock(selectedLang)} />

				<h3 class="mb-3 mt-6 text-lg font-semibold text-foreground">Example Response</h3>
				<CodeBlock code={feedResponse} language="json" />
			</section>

			<!-- Collections Endpoint -->
			<section id="collections" class="mb-16 scroll-mt-20">
				<div class="mb-4 flex items-center gap-3">
					<span class="rounded bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<h2 class="text-2xl font-bold text-foreground">/collections</h2>
				</div>
				<p class="mb-6 text-muted-foreground">
					Returns all your collections with their associated feeds and aggregate counts. Collections are ordered by display_order.
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-4">
					<p class="text-sm text-muted-foreground">This endpoint has no parameters. It returns all your collections with nested feeds.</p>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Example Request</h3>
				<div class="mb-2 flex gap-1">
					<button
						type="button"
						onclick={() => selectedLang = 'curl'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'curl' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						cURL
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'javascript'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'javascript' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						JavaScript
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'python'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'python' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Python
					</button>
				</div>
				<CodeBlock code={collectionsExample[selectedLang]} language={getLangForCodeBlock(selectedLang)} />

				<h3 class="mb-3 mt-6 text-lg font-semibold text-foreground">Example Response</h3>
				<CodeBlock code={collectionResponse} language="json" />
			</section>

			<!-- Stats Endpoint -->
			<section id="stats" class="mb-16 scroll-mt-20">
				<div class="mb-4 flex items-center gap-3">
					<span class="rounded bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<h2 class="text-2xl font-bold text-foreground">/stats</h2>
				</div>
				<p class="mb-6 text-muted-foreground">
					Returns aggregate statistics including total unread count, total starred count, and per-feed unread breakdowns.
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-4">
					<p class="text-sm text-muted-foreground">This endpoint has no parameters. It returns aggregate statistics for your account.</p>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Example Request</h3>
				<div class="mb-2 flex gap-1">
					<button
						type="button"
						onclick={() => selectedLang = 'curl'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'curl' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						cURL
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'javascript'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'javascript' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						JavaScript
					</button>
					<button
						type="button"
						onclick={() => selectedLang = 'python'}
						class="rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors {selectedLang === 'python' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						Python
					</button>
				</div>
				<CodeBlock code={statsExample[selectedLang]} language={getLangForCodeBlock(selectedLang)} />

				<h3 class="mb-3 mt-6 text-lg font-semibold text-foreground">Example Response</h3>
				<CodeBlock code={statsResponse} language="json" />
			</section>

			<!-- Errors Section -->
			<section id="errors" class="mb-16 scroll-mt-20">
				<h2 class="mb-4 text-2xl font-bold text-foreground">Error Handling</h2>
				<p class="mb-6 text-muted-foreground">
					All errors return a consistent JSON structure with an error object containing code, message, and status.
				</p>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Error Response Format</h3>
				<CodeBlock code={errorResponse} language="json" />

				<h3 class="mb-3 mt-6 text-lg font-semibold text-foreground">Error Codes</h3>
				<div class="overflow-x-auto rounded-lg border border-border bg-card">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border">
								<th class="px-4 py-3 text-left font-medium">Status</th>
								<th class="px-4 py-3 text-left font-medium">Code</th>
								<th class="px-4 py-3 text-left font-medium">Description</th>
							</tr>
						</thead>
						<tbody>
							{#each errorCodes as error}
								<tr class="border-b border-border/50">
									<td class="px-4 py-3">
										<span class="rounded bg-muted px-2 py-0.5 font-mono text-sm">{error.status}</span>
									</td>
									<td class="px-4 py-3 font-mono text-primary">{error.code}</td>
									<td class="px-4 py-3 text-muted-foreground">{error.description}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<!-- Rate Limits Section -->
			<section id="rate-limits" class="mb-16 scroll-mt-20">
				<h2 class="mb-4 text-2xl font-bold text-foreground">Rate Limits</h2>
				<p class="mb-6 text-muted-foreground">
					API requests are rate-limited to ensure fair usage and protect the service.
				</p>

				<div class="mb-6 rounded-lg border border-border bg-card p-6">
					<div class="mb-4 flex items-center gap-3">
						<Zap size={24} class="text-primary" />
						<div>
							<h3 class="text-lg font-semibold text-foreground">100 requests per minute</h3>
							<p class="text-sm text-muted-foreground">Per API key, sliding window</p>
						</div>
					</div>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Rate Limit Headers</h3>
				<p class="mb-4 text-muted-foreground">
					All responses include headers to help you track your rate limit status:
				</p>

				<div class="mb-6 overflow-x-auto rounded-lg border border-border bg-card">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border">
								<th class="px-4 py-3 text-left font-medium">Header</th>
								<th class="px-4 py-3 text-left font-medium">Description</th>
							</tr>
						</thead>
						<tbody>
							<tr class="border-b border-border/50">
								<td class="px-4 py-3 font-mono text-primary">X-RateLimit-Remaining</td>
								<td class="px-4 py-3 text-muted-foreground">Requests remaining in current window</td>
							</tr>
							<tr class="border-b border-border/50">
								<td class="px-4 py-3 font-mono text-primary">X-RateLimit-Reset</td>
								<td class="px-4 py-3 text-muted-foreground">Unix timestamp when window resets</td>
							</tr>
							<tr>
								<td class="px-4 py-3 font-mono text-primary">Retry-After</td>
								<td class="px-4 py-3 text-muted-foreground">Seconds to wait (only on 429 responses)</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h3 class="mb-3 text-lg font-semibold text-foreground">Best Practices</h3>
				<ul class="list-disc space-y-2 pl-5 text-muted-foreground">
					<li>Cache responses when possible to reduce API calls</li>
					<li>Use cursor-based pagination to efficiently fetch large datasets</li>
					<li>Monitor rate limit headers and implement backoff strategies</li>
					<li>Use filters to request only the data you need</li>
					<li>Consider batching multiple requests if building a sync solution</li>
				</ul>
			</section>

			<!-- Footer -->
			<footer class="border-t border-border pt-8 text-center text-sm text-muted-foreground">
				<p>Need help? Contact support or check the <a href="/api/openapi.json" class="text-primary hover:underline">OpenAPI specification</a>.</p>
			</footer>
		</div>
	</main>
</div>
