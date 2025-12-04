<script lang="ts">
	import { onMount } from 'svelte';
	import { signIn, user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	// Redirect if already logged in
	onMount(() => {
		if ($user) {
			goto('/timeline/all');
		}
	});

	async function handleLogin() {
		if (!email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		loading = true;
		error = '';

		const { error: signInError } = await signIn(email, password);

		if (signInError) {
			error = signInError.message;
			loading = false;
		} else {
			// Check if user has subscriptions
			const { supabase } = await import('$lib/services/supabase');
			const userId = (await supabase.auth.getUser()).data.user?.id;

			if (userId) {
				const { data: subscriptions } = await supabase
					.from('user_subscriptions')
					.select('id')
					.eq('user_id', userId)
					.limit(1);

				if (subscriptions && subscriptions.length > 0) {
					goto('/timeline/all');
				} else {
					goto('/discover');
				}
			}
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<img src="/logo.png" alt="LeadrFeeds" class="h-16 mx-auto mb-4" />
			<p class="text-muted-foreground">Sign in to your account</p>
		</div>

		<div class="bg-card border border-border rounded-lg p-8">
			<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
				<div class="space-y-4">
					<div>
						<label for="email" class="block text-sm font-medium text-foreground mb-2">
							Email
						</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							placeholder="you@example.com"
							disabled={loading}
						/>
					</div>

					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="password" class="block text-sm font-medium text-foreground">
								Password
							</label>
							<a
								href="/auth/forgot-password"
								class="text-sm text-primary hover:text-primary/90 font-medium"
							>
								Forgot password?
							</a>
						</div>
						<input
							id="password"
							type="password"
							bind:value={password}
							class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							placeholder="••••••••"
							disabled={loading}
						/>
					</div>

					{#if error}
						<div class="bg-destructive/10 border border-destructive text-destructive-foreground px-4 py-3 rounded-md text-sm">
							{error}
						</div>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</div>
			</form>

			<div class="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?
				<a href="/auth/register" class="text-primary hover:text-primary/90 font-medium">
					Sign up
				</a>
			</div>
		</div>
	</div>
</div>
