<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, loading } from '$lib/stores/auth';

	onMount(async () => {
		// Wait for auth to load
		const unsubscribe = loading.subscribe(async (isLoading) => {
			if (!isLoading) {
				if ($user) {
					// Check if user has subscriptions
					const { supabase } = await import('$lib/services/supabase');
					const { data: subscriptions } = await supabase
						.from('user_subscriptions')
						.select('id')
						.eq('user_id', $user.id)
						.limit(1);

					if (subscriptions && subscriptions.length > 0) {
						goto('/timeline/all');
					} else {
						goto('/discover');
					}
				} else {
					goto('/auth/login');
				}
				unsubscribe();
			}
		});
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-background">
	<div class="text-center">
		<h1 class="text-4xl font-bold text-foreground mb-4">LeadrFeeds</h1>
		<p class="text-muted-foreground">Loading...</p>
	</div>
</div>