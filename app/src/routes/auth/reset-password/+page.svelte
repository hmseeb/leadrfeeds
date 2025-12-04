<script lang="ts">
	import { updatePassword, session, loading as authLoading } from '$lib/stores/auth';
	import { goto } from '$app/navigation';

	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let checkingSession = $state(true);
	let invalidLink = $state(false);

	// Wait for auth to finish loading, then check for session
	$effect(() => {
		if (!$authLoading) {
			checkingSession = false;
			if (!$session) {
				invalidLink = true;
			}
		}
	});

	async function handlePasswordUpdate() {
		if (!password || !confirmPassword) {
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

		const { error: updateError } = await updatePassword(password);

		if (updateError) {
			error = updateError.message;
			loading = false;
		} else {
			goto('/auth/login');
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<img src="/logo.png" alt="LeadrFeeds" class="h-16 mx-auto mb-4" />
			<p class="text-muted-foreground">Set your new password</p>
		</div>

		<div class="bg-card border border-border rounded-lg p-8">
			{#if checkingSession}
				<div class="text-center py-8">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p class="text-muted-foreground">Verifying reset link...</p>
				</div>
			{:else if invalidLink}
				<div class="text-center">
					<div class="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<h2 class="text-xl font-semibold text-foreground mb-2">Invalid or expired link</h2>
					<p class="text-muted-foreground mb-6">
						This password reset link is invalid or has expired. Please request a new one.
					</p>
					<a
						href="/auth/forgot-password"
						class="text-primary hover:text-primary/90 font-medium"
					>
						Request new link
					</a>
				</div>
			{:else}
				<form onsubmit={(e) => { e.preventDefault(); handlePasswordUpdate(); }}>
					<div class="space-y-4">
						<div>
							<label for="password" class="block text-sm font-medium text-foreground mb-2">
								New Password
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
							{loading ? 'Updating...' : 'Update password'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
</div>
