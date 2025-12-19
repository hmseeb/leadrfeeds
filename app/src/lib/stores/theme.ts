import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { supabase } from '$lib/services/supabase';
import { user } from '$lib/stores/auth';

export type ThemeValue = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

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
function initSystemPreference(): (() => void) | undefined {
	if (!browser) return;

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	systemPrefersDark.set(mediaQuery.matches);

	// Named handler for cleanup
	const onChange = (e: MediaQueryListEvent) => systemPrefersDark.set(e.matches);
	mediaQuery.addEventListener('change', onChange);

	return () => mediaQuery.removeEventListener('change', onChange);
}

// Load theme preference
export async function loadTheme(): Promise<(() => void) | undefined> {
	if (!browser) return;

	// Initialize system preference listener and capture cleanup
	const cleanupSystemPref = initSystemPreference();

	// Subscribe to resolved theme changes and capture unsubscribe
	const unsubscribe = resolvedTheme.subscribe(applyTheme);

	// First, load from localStorage for instant apply (prevents flash)
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && ['system', 'light', 'dark'].includes(stored)) {
		theme.set(stored as ThemeValue);
	}

	// Then, if user is logged in, load from database (source of truth)
	const currentUser = get(user);
	if (currentUser) {
		const { data } = await supabase
			.from('user_settings')
			.select('theme')
			.eq('user_id', currentUser.id)
			.single();

		if (data?.theme && ['system', 'light', 'dark'].includes(data.theme)) {
			const dbTheme = data.theme as ThemeValue;
			theme.set(dbTheme);
			// Sync localStorage with database value
			localStorage.setItem(STORAGE_KEY, dbTheme);
		}
	}

	// Return combined cleanup function
	return () => {
		cleanupSystemPref?.();
		unsubscribe();
	};
}

// Set theme preference
export async function setTheme(value: ThemeValue): Promise<void> {
	theme.set(value);

	// Always save to localStorage for flash prevention
	if (browser) {
		localStorage.setItem(STORAGE_KEY, value);
	}

	// If logged in, save to database for cross-device sync
	const currentUser = get(user);
	if (currentUser) {
		await supabase
			.from('user_settings')
			.upsert({
				user_id: currentUser.id,
				theme: value,
				updated_at: new Date().toISOString()
			}, { onConflict: 'user_id' });
	}
}
