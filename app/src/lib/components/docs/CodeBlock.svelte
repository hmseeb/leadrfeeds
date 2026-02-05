<script lang="ts">
	import Prism from 'prismjs';
	import 'prismjs/components/prism-bash';
	import 'prismjs/components/prism-javascript';
	import 'prismjs/components/prism-python';
	import 'prismjs/components/prism-json';
	import { Copy, Check } from 'lucide-svelte';

	interface Props {
		code: string;
		language: 'bash' | 'javascript' | 'python' | 'json';
	}

	let { code, language }: Props = $props();

	let copied = $state(false);

	const highlighted = $derived(Prism.highlight(code, Prism.languages[language], language));

	async function copyToClipboard() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<div class="group relative">
	<pre
		class="overflow-x-auto rounded-lg border border-border bg-card p-4 text-sm"><code class="language-{language}">{@html highlighted}</code></pre>
	<button
		type="button"
		onclick={copyToClipboard}
		class="absolute right-2 top-2 rounded-md border border-border bg-background p-2 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
		aria-label={copied ? 'Copied!' : 'Copy code'}
	>
		{#if copied}
			<Check class="h-4 w-4 text-green-500" />
		{:else}
			<Copy class="h-4 w-4 text-muted-foreground" />
		{/if}
	</button>
</div>

<style>
	/* Prism theme overrides for dark mode compatibility */
	:global(.token.comment),
	:global(.token.prolog),
	:global(.token.doctype),
	:global(.token.cdata) {
		color: hsl(var(--muted-foreground));
	}

	:global(.token.punctuation) {
		color: hsl(var(--foreground) / 0.7);
	}

	:global(.token.property),
	:global(.token.tag),
	:global(.token.boolean),
	:global(.token.number),
	:global(.token.constant),
	:global(.token.symbol),
	:global(.token.deleted) {
		color: hsl(var(--destructive));
	}

	:global(.token.selector),
	:global(.token.attr-name),
	:global(.token.string),
	:global(.token.char),
	:global(.token.builtin),
	:global(.token.inserted) {
		color: hsl(142 71% 45%);
	}

	:global(.token.operator),
	:global(.token.entity),
	:global(.token.url),
	:global(.language-css .token.string),
	:global(.style .token.string) {
		color: hsl(var(--foreground));
	}

	:global(.token.atrule),
	:global(.token.attr-value),
	:global(.token.keyword) {
		color: hsl(var(--primary));
	}

	:global(.token.function),
	:global(.token.class-name) {
		color: hsl(221 83% 53%);
	}

	:global(.token.regex),
	:global(.token.important),
	:global(.token.variable) {
		color: hsl(38 92% 50%);
	}
</style>
