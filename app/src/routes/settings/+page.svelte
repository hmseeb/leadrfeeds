<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user, session } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';
	import { Save, Check, X, Key, Plus, Trash2, Book } from 'lucide-svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import { format, formatDistanceToNow, parseISO } from 'date-fns';
	import ApiKeyModal from '$lib/components/ApiKeyModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	// Responsive state
	const isDesktopMode = $derived($useDesktopLayout);
	let isSidebarOpen = $state(false);

	let apiKey = $state('');
	let preferredModel = $state('anthropic/claude-3.5-sonnet');
	let customModel = $state('');
	let useCustomModel = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let saveSuccess = $state(false);
	let saveError = $state('');

	// API Keys state
	let apiKeys = $state<Array<{
		id: string;
		label: string;
		key_prefix: string;
		expires_at: string | null;
		revoked_at: string | null;
		last_used_at: string | null;
		created_at: string;
	}>>([]);
	let keysLoading = $state(true);
	let keysError = $state('');

	// Create key form state
	let newKeyLabel = $state('');
	let newKeyExpires = $state('');
	let creatingKey = $state(false);
	let createError = $state('');

	// Show key modal state
	let showKeyModal = $state(false);
	let newlyCreatedKey = $state('');
	let newlyCreatedKeyLabel = $state('');

	// Revoke confirmation state
	let showRevokeModal = $state(false);
	let keyToRevoke = $state<{ id: string; label: string } | null>(null);
	let revoking = $state(false);

	// Minimum expiration date (tomorrow)
	const minExpirationDate = $derived(
		format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
	);

	const availableModels = [
		{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
		{ id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
		{ id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
		{ id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
		{ id: 'openai/gpt-4o', name: 'GPT-4o' },
		{ id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
		{ id: 'google/gemini-pro', name: 'Gemini Pro' },
		{ id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' }
	];

	function getAuthHeaders(): HeadersInit {
		const accessToken = $session?.access_token;
		if (!accessToken) return {};
		return {
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		};
	}

	function getKeyStatus(key: typeof apiKeys[0]): 'active' | 'expired' | 'revoked' {
		if (key.revoked_at) return 'revoked';
		if (key.expires_at && parseISO(key.expires_at) < new Date()) return 'expired';
		return 'active';
	}

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		await loadSettings();
		await loadApiKeys();
	});

	async function loadSettings() {
		if (!$user) return;

		const { data, error } = await supabase
			.from('user_settings')
			.select('*')
			.eq('user_id', $user.id)
			.single();

		if (error) {
			// Create default settings if none exist
			const { data: newSettings } = await supabase
				.from('user_settings')
				.insert({
					user_id: $user.id
				})
				.select()
				.single();

			if (newSettings) {
				apiKey = newSettings.openrouter_api_key || '';
				preferredModel = newSettings.preferred_model || 'anthropic/claude-3.5-sonnet';
			}
		} else if (data) {
			apiKey = data.openrouter_api_key || '';
			const savedModel = data.preferred_model || 'anthropic/claude-3.5-sonnet';

			// Check if saved model is in the predefined list
			const isPreDefinedModel = availableModels.some(m => m.id === savedModel);

			if (isPreDefinedModel) {
				preferredModel = savedModel;
				useCustomModel = false;
			} else {
				// It's a custom model
				customModel = savedModel;
				useCustomModel = true;
			}
		}

		loading = false;
	}

	async function loadApiKeys() {
		if (!$user) return;
		keysLoading = true;
		keysError = '';

		try {
			const response = await fetch('/settings/api-keys', {
				headers: getAuthHeaders()
			});

			if (!response.ok) {
				throw new Error('Failed to load API keys');
			}

			apiKeys = await response.json();
		} catch (e) {
			keysError = e instanceof Error ? e.message : 'Failed to load keys';
		} finally {
			keysLoading = false;
		}
	}

	async function createApiKey() {
		if (!newKeyLabel.trim()) return;

		creatingKey = true;
		createError = '';

		try {
			const body: { label: string; expires_at?: string } = {
				label: newKeyLabel.trim()
			};

			if (newKeyExpires) {
				// Set expiration to end of day UTC
				body.expires_at = new Date(newKeyExpires + 'T23:59:59Z').toISOString();
			}

			const response = await fetch('/settings/api-keys', {
				method: 'POST',
				headers: getAuthHeaders(),
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to create key');
			}

			const data = await response.json();

			// Show the key in modal (only time it's visible)
			newlyCreatedKey = data.full_key;
			newlyCreatedKeyLabel = data.label;
			showKeyModal = true;

			// Reset form
			newKeyLabel = '';
			newKeyExpires = '';

			// Reload keys list
			await loadApiKeys();
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create key';
		} finally {
			creatingKey = false;
		}
	}

	function confirmRevoke(key: { id: string; label: string }) {
		keyToRevoke = key;
		showRevokeModal = true;
	}

	async function revokeApiKey() {
		if (!keyToRevoke) return;

		revoking = true;

		try {
			const response = await fetch('/settings/api-keys', {
				method: 'DELETE',
				headers: getAuthHeaders(),
				body: JSON.stringify({ id: keyToRevoke.id })
			});

			if (!response.ok) {
				throw new Error('Failed to revoke key');
			}

			await loadApiKeys();
		} catch (e) {
			// Show error briefly
			keysError = e instanceof Error ? e.message : 'Failed to revoke key';
			setTimeout(() => keysError = '', 3000);
		} finally {
			revoking = false;
			keyToRevoke = null;
		}
	}

	async function saveSettings() {
		if (!$user) return;

		saving = true;
		saveError = '';
		saveSuccess = false;

		// Determine which model to save
		const modelToSave = useCustomModel ? customModel.trim() : preferredModel;

		// Validate custom model if it's being used
		if (useCustomModel && !customModel.trim()) {
			saveError = 'Please enter a custom model identifier';
			saving = false;
			return;
		}

		const { error } = await supabase
			.from('user_settings')
			.update({
				openrouter_api_key: apiKey,
				preferred_model: modelToSave,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', $user.id);

		if (error) {
			saveError = error.message;
		} else {
			saveSuccess = true;
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		}

		saving = false;
	}
</script>

<!-- Mobile Header (only on mobile) - positioned fixed -->
{#if !isDesktopMode}
	<MobileHeader
		onMenuClick={() => isSidebarOpen = true}
	/>
{/if}

<!-- Mobile Sidebar (overlay only - only render when open) -->
{#if !isDesktopMode && isSidebarOpen}
	<Sidebar
		isMobileOpen={true}
		onMobileClose={() => isSidebarOpen = false}
	/>
{/if}

<div class="flex h-screen bg-background {!isDesktopMode ? 'pt-14' : ''}">
	<!-- Desktop Sidebar -->
	{#if isDesktopMode}
		<Sidebar />
	{/if}

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-3xl mx-auto p-4 md:p-6">
			<!-- Header -->
			<div class="mb-6 md:mb-8 select-none">
				<h1 class="text-2xl md:text-3xl font-bold text-foreground mb-2">Settings</h1>
				<p class="text-muted-foreground text-sm md:text-base">Manage your account and preferences</p>
			</div>

			{#if loading}
				<div class="text-center py-12">
					<p class="text-muted-foreground">Loading settings...</p>
				</div>
			{:else}
				<div class="space-y-6">
					<!-- OpenRouter API Key -->
					<div class="bg-card border border-border rounded-lg p-6">
						<h2 class="text-lg font-semibold text-foreground mb-4 select-none">OpenRouter API Configuration</h2>

						<div class="space-y-4">
							<div>
								<label for="apiKey" class="block text-sm font-medium text-foreground mb-2">
									API Key
								</label>
								<input
									id="apiKey"
									type="password"
									bind:value={apiKey}
									placeholder="sk-or-v1-..."
									class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
								<p class="mt-2 text-xs text-muted-foreground">
									Get your API key from
									<a
										href="https://openrouter.ai/keys"
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary hover:text-primary/90"
									>
										openrouter.ai/keys
									</a>
								</p>
							</div>

							<div>
								<span class="block text-sm font-medium text-foreground mb-2">
									Model Selection
								</span>

								<!-- Toggle between preset and custom -->
								<div class="flex gap-2 mb-3">
									<button
										type="button"
										onclick={() => (useCustomModel = false)}
										class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors {!useCustomModel
											? 'bg-primary text-primary-foreground'
											: 'bg-card border border-border text-foreground hover:bg-accent'}"
									>
										Preset Models
									</button>
									<button
										type="button"
										onclick={() => (useCustomModel = true)}
										class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors {useCustomModel
											? 'bg-primary text-primary-foreground'
											: 'bg-card border border-border text-foreground hover:bg-accent'}"
									>
										Custom Model
									</button>
								</div>

								{#if !useCustomModel}
									<!-- Preset Model Dropdown -->
									<select
										id="model"
										bind:value={preferredModel}
										class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
									>
										{#each availableModels as model}
											<option value={model.id}>{model.name}</option>
										{/each}
									</select>
								{:else}
									<!-- Custom Model Input -->
									<input
										type="text"
										bind:value={customModel}
										placeholder="e.g., anthropic/claude-3.5-sonnet-20240620"
										class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
									/>
									<p class="mt-2 text-xs text-muted-foreground">
										Enter any OpenRouter model ID. Find available models at
										<a
											href="https://openrouter.ai/models"
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary hover:text-primary/90"
										>
											openrouter.ai/models
										</a>
									</p>
								{/if}
							</div>
						</div>
					</div>

					<!-- Account -->
					<div class="bg-card border border-border rounded-lg p-6">
						<h2 class="text-lg font-semibold text-foreground mb-4 select-none">Account</h2>

						<div class="space-y-2 text-sm select-none">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Email:</span>
								<span class="text-foreground">{$user?.email}</span>
							</div>
						</div>
					</div>

					<!-- API Keys -->
					<div class="bg-card border border-border rounded-lg p-6">
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-2">
								<Key size={20} class="text-primary" />
								<h2 class="text-lg font-semibold text-foreground select-none">API Keys</h2>
							</div>
						</div>

						<p class="text-sm text-muted-foreground mb-3">
							API keys allow programmatic access to your feed data. Keys are shown only once when created.
						</p>

						<a href="/docs/api" class="text-sm text-primary hover:text-primary/90 inline-flex items-center gap-1.5 mb-4">
							<Book size={14} />
							View API Documentation
						</a>

						{#if keysLoading}
							<p class="text-muted-foreground text-sm">Loading keys...</p>
						{:else if keysError}
							<p class="text-destructive text-sm">{keysError}</p>
						{:else}
							<!-- Create new key form -->
							<div class="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-background border border-border rounded-md">
								<div class="flex-1">
									<label for="keyLabel" class="block text-xs text-muted-foreground mb-1">Label</label>
									<input
										id="keyLabel"
										type="text"
										bind:value={newKeyLabel}
										placeholder="e.g., My Integration"
										maxlength={100}
										class="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
									/>
								</div>
								<div class="sm:w-40">
									<label for="keyExpires" class="block text-xs text-muted-foreground mb-1">Expires (optional)</label>
									<input
										id="keyExpires"
										type="date"
										bind:value={newKeyExpires}
										min={minExpirationDate}
										class="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
									/>
								</div>
								<div class="flex items-end">
									<button
										onclick={createApiKey}
										disabled={creatingKey || !newKeyLabel.trim()}
										class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
									>
										<Plus size={16} />
										{creatingKey ? 'Creating...' : 'Create Key'}
									</button>
								</div>
							</div>

							{#if createError}
								<p class="text-destructive text-sm mb-4">{createError}</p>
							{/if}

							<!-- Keys list -->
							{#if apiKeys.length === 0}
								<p class="text-muted-foreground text-sm text-center py-8">
									No API keys yet. Create one to get started.
								</p>
							{:else}
								<div class="space-y-3">
									{#each apiKeys as key (key.id)}
										{@const status = getKeyStatus(key)}
										<div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-background border border-border rounded-md gap-3">
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2 flex-wrap">
													<span class="font-medium text-foreground">{key.label}</span>
													<!-- Status badge -->
													{#if status === 'revoked'}
														<span class="px-2 py-0.5 text-xs bg-destructive/10 text-destructive rounded">
															Revoked
														</span>
													{:else if status === 'expired'}
														<span class="px-2 py-0.5 text-xs bg-secondary/10 text-secondary rounded">
															Expired
														</span>
													{:else}
														<span class="px-2 py-0.5 text-xs bg-green-500/10 text-green-600 dark:text-green-400 rounded">
															Active
														</span>
													{/if}
												</div>
												<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
													<div>
														<span class="font-mono">{key.key_prefix}...</span>
														<span class="mx-2">|</span>
														Created {format(parseISO(key.created_at), 'MMM d, yyyy')}
													</div>
													{#if key.expires_at}
														<div>
															Expires {format(parseISO(key.expires_at), 'MMM d, yyyy')}
														</div>
													{/if}
													{#if key.last_used_at}
														<div>
															Last used {formatDistanceToNow(parseISO(key.last_used_at), { addSuffix: true })}
														</div>
													{:else}
														<div>Never used</div>
													{/if}
												</div>
											</div>

											<!-- Revoke button -->
											{#if status === 'active'}
												<button
													onclick={() => confirmRevoke({ id: key.id, label: key.label })}
													class="px-3 py-1.5 text-destructive hover:bg-destructive/10 rounded-md text-sm flex items-center gap-1.5 self-start sm:self-center"
												>
													<Trash2 size={14} />
													Revoke
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						{/if}
					</div>

					<!-- Save Button -->
					<div class="flex items-center gap-4">
						<button
							onclick={saveSettings}
							disabled={saving}
							class="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
						>
							<Save size={18} />
							{saving ? 'Saving...' : 'Save Settings'}
						</button>

						{#if saveSuccess}
							<div class="flex items-center gap-2 text-accent">
								<Check size={18} />
								<span class="text-sm">Settings saved successfully</span>
							</div>
						{/if}

						{#if saveError}
							<div class="flex items-center gap-2 text-destructive">
								<X size={18} />
								<span class="text-sm">{saveError}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- API Key Modal (show once) -->
<ApiKeyModal
	bind:isOpen={showKeyModal}
	apiKey={newlyCreatedKey}
	label={newlyCreatedKeyLabel}
	onClose={() => {
		showKeyModal = false;
		newlyCreatedKey = '';
		newlyCreatedKeyLabel = '';
	}}
/>

<!-- Revoke Confirmation Modal -->
<ConfirmModal
	bind:isOpen={showRevokeModal}
	title="Revoke API Key"
	message={`Are you sure you want to revoke "${keyToRevoke?.label}"? This action cannot be undone. Any applications using this key will stop working.`}
	confirmText={revoking ? 'Revoking...' : 'Revoke Key'}
	variant="danger"
	onConfirm={revokeApiKey}
	onCancel={() => {
		showRevokeModal = false;
		keyToRevoke = null;
	}}
/>
