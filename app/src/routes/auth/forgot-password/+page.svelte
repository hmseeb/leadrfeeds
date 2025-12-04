<script lang="ts">
	import { resetPasswordForEmail } from '$lib/stores/auth';

	let email = $state('');
	let error = $state('');
	let success = $state(false);
	let loading = $state(false);

	async function handleResetRequest() {
		if (!email) {
			error = 'Please enter your email address';
			return;
		}

		if (!/\S+@\S+\.\S+/.test(email)) {
			error = 'Please enter a valid email address';
			return;
		}

		loading = true;
		error = '';

		const { error: resetError } = await resetPasswordForEmail(email);

		if (resetError) {
			error = resetError.message;
			loading = false;
		} else {
			success = true;
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<img src="/logo.png" alt="LeadrFeeds" class="h-16 mx-auto mb-4" />
			<p class="text-muted-foreground">Reset your password</p>
		</div>

		<div class="bg-card border border-border rounded-lg p-8">
			{#if success}
				<div class="text-center">
					<div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
					</div>
					<h2 class="text-xl font-semibold text-foreground mb-2">Check your email</h2>
					<p class="text-muted-foreground mb-6">
						If an account exists with this email, you will receive a password reset link.
					</p>
					<a
						href="/auth/login"
						class="text-primary hover:text-primary/90 font-medium"
					>
						Back to login
					</a>
				</div>
			{:else}
				<form onsubmit={(e) => { e.preventDefault(); handleResetRequest(); }}>
					<div class="space-y-4">
						<p class="text-sm text-muted-foreground mb-4">
							Enter your email address and we'll send you a link to reset your password.
						</p>

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
							{loading ? 'Sending...' : 'Send reset link'}
						</button>
					</div>
				</form>

				<div class="mt-6 text-center text-sm text-muted-foreground">
					Remember your password?
					<a href="/auth/login" class="text-primary hover:text-primary/90 font-medium">
						Sign in
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>
