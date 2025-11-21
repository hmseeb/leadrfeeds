<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { Save, Check, X } from 'lucide-svelte';

	let apiKey = $state('');
	let preferredModel = $state('anthropic/claude-3.5-sonnet');
	let customModel = $state('');
	let useCustomModel = $state(false);
	let theme = $state('dark');
	let loading = $state(true);
	let saving = $state(false);
	let saveSuccess = $state(false);
	let saveError = $state('');

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

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		await loadSettings();
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
					user_id: $user.id,
					theme: 'dark'
				})
				.select()
				.single();

			if (newSettings) {
				apiKey = newSettings.openrouter_api_key || '';
				preferredModel = newSettings.preferred_model || 'anthropic/claude-3.5-sonnet';
				theme = newSettings.theme || 'dark';
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

			theme = data.theme || 'dark';
		}

		loading = false;
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
				theme: theme,
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

<div class="flex h-screen bg-background">
	<!-- Sidebar -->
	<Sidebar />

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-3xl mx-auto p-6">
			<!-- Header -->
			<div class="mb-8 select-none">
				<h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
				<p class="text-muted-foreground">Manage your account and preferences</p>
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
								<label class="block text-sm font-medium text-foreground mb-2">
									Model Selection
								</label>

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

					<!-- Appearance -->
					<div class="bg-card border border-border rounded-lg p-6">
						<h2 class="text-lg font-semibold text-foreground mb-4 select-none">Appearance</h2>

						<div>
							<label for="theme" class="block text-sm font-medium text-foreground mb-2">
								Theme
							</label>
							<select
								id="theme"
								bind:value={theme}
								class="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="dark">Dark</option>
								<option value="light">Light</option>
							</select>
							<p class="mt-2 text-xs text-muted-foreground">
								Light theme support coming soon
							</p>
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
