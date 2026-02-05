<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let error = $state('');

	// Wait for auth store to sync after OAuth
	function waitForAuthSync(maxWaitMs = 3000): Promise<boolean> {
		return new Promise((resolve) => {
			// If already have user, resolve immediately
			if ($user) {
				resolve(true);
				return;
			}

			const timeout = setTimeout(() => {
				unsubscribe();
				resolve(false);
			}, maxWaitMs);

			const unsubscribe = user.subscribe((u) => {
				if (u) {
					clearTimeout(timeout);
					unsubscribe();
					resolve(true);
				}
			});
		});
	}

	onMount(async () => {
		const code = $page.url.searchParams.get('code');

		if (!code) {
			goto('/auth/login');
			return;
		}

		// Exchange the code for a session (PKCE flow)
		const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

		if (exchangeError) {
			error = exchangeError.message;
			return;
		}

		if (!session) {
			error = 'Failed to create session';
			return;
		}

		// Wait for auth store to sync before navigating
		await waitForAuthSync();

		// Check if user has settings (existing user) or needs onboarding (new user)
		const { data: settings } = await supabase
			.from('user_settings')
			.select('user_id')
			.eq('user_id', session.user.id)
			.single();

		if (!settings) {
			// New user - create settings
			// Use upsert to handle race conditions (e.g., double-click, retry)
			await supabase.from('user_settings').upsert({
				user_id: session.user.id
			}, { onConflict: 'user_id' });
			// Redirect to discover for onboarding
			goto('/discover');
			return;
		}

		// Existing user - check if they have subscriptions
		const { data: subscriptions } = await supabase
			.from('user_subscriptions')
			.select('id')
			.eq('user_id', session.user.id)
			.limit(1);

		if (subscriptions && subscriptions.length > 0) {
			goto('/timeline/all');
		} else {
			goto('/discover');
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<div class="text-center">
		{#if error}
			<div class="bg-destructive/10 border-2 border-destructive text-destructive-foreground px-6 py-4 mb-4">
				{error}
			</div>
			<a
				href="/auth/login"
				class="text-primary hover:text-primary/90 font-medium"
			>
				Return to login
			</a>
		{:else}
			<LoadingSpinner size={40} />
			<p class="mt-4 text-muted-foreground">Signing you in...</p>
		{/if}
	</div>
</div>
