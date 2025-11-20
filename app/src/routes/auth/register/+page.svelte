<script lang="ts">
	import { signUp } from '$lib/stores/auth';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleRegister() {
		if (!email || !password || !confirmPassword) {
			error = 'Please fill in all fields';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		loading = true;
		error = '';

		const { data, error: signUpError } = await signUp(email, password);

		if (signUpError) {
			error = signUpError.message;
			loading = false;
		} else {
			// Create user settings record
			if (data.user) {
				const { supabase } = await import('$lib/services/supabase');
				await supabase
					.from('user_settings')
					.insert({
						user_id: data.user.id,
						theme: 'dark'
					});
			}

			// Redirect to discover page for new users
			goto('/discover');
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-foreground mb-2">LeadrFeeds</h1>
			<p class="text-muted-foreground">Create your account</p>
		</div>

		<div class="bg-card border border-border rounded-lg p-8">
			<form onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
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
						<label for="password" class="block text-sm font-medium text-foreground mb-2">
							Password
						</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							placeholder="••••••••"
							disabled={loading}
						/>
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-foreground mb-2">
							Confirm Password
						</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
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
						{loading ? 'Creating account...' : 'Sign up'}
					</button>
				</div>
			</form>

			<div class="mt-6 text-center text-sm text-muted-foreground">
				Already have an account?
				<a href="/auth/login" class="text-primary hover:text-primary/90 font-medium">
					Sign in
				</a>
			</div>
		</div>
	</div>
</div>
