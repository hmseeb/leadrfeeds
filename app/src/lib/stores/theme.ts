import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { supabase } from '$lib/services/supabase';
import { user } from '$lib/stores/auth';

export type ThemeValue = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// The user's theme preference
export const theme = writable<ThemeValue>('system');

// Track system preference
const systemPrefersDark = writable<boolean>(false);

// The actual applied theme (resolved from preference + system)
export const resolvedTheme = derived(
	[theme, systemPrefersDark],
	([$theme, $systemPrefersDark]) => {
		if ($theme === 'system') {
			return $systemPrefersDark ? 'dark' : 'light';
		}
		return $theme;
	}
);

// Apply theme class to document
function applyTheme(resolved: ResolvedTheme) {
	if (!browser) return;

	if (resolved === 'dark') {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

// Initialize system preference detection
function initSystemPreference() {
	if (!browser) return;

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	systemPrefersDark.set(mediaQuery.matches);

	// Listen for system preference changes
	mediaQuery.addEventListener('change', (e) => {
		systemPrefersDark.set(e.matches);
	});
}

// Load theme preference
export async function loadTheme(): Promise<void> {
	if (!browser) return;

	// Initialize system preference listener
	initSystemPreference();

	// Subscribe to resolved theme changes and apply
	resolvedTheme.subscribe(applyTheme);

	// Check if user is logged in
	const currentUser = get(user);

	if (currentUser) {
		// Load from database
		const { data } = await supabase
			.from('user_settings')
			.select('theme')
			.eq('user_id', currentUser.id)
			.single();

		if (data?.theme && ['system', 'light', 'dark'].includes(data.theme)) {
			theme.set(data.theme as ThemeValue);
		}
	}
	// Guests just use system preference (default 'system')
}

// Set theme preference
export async function setTheme(value: ThemeValue): Promise<void> {
	theme.set(value);

	const currentUser = get(user);

	if (currentUser) {
		// Save to database
		await supabase
			.from('user_settings')
			.upsert({
				user_id: currentUser.id,
				theme: value,
				updated_at: new Date().toISOString()
			}, { onConflict: 'user_id' });
	}
}
