import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

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
function initSystemPreference() {
	if (!browser) return;

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	systemPrefersDark.set(mediaQuery.matches);

	// Listen for system preference changes
	mediaQuery.addEventListener('change', (e) => {
		systemPrefersDark.set(e.matches);
	});
}

// Load theme preference from localStorage
export function loadTheme(): void {
	if (!browser) return;

	// Initialize system preference listener
	initSystemPreference();

	// Subscribe to resolved theme changes and apply
	resolvedTheme.subscribe(applyTheme);

	// Load from localStorage
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && ['system', 'light', 'dark'].includes(stored)) {
		theme.set(stored as ThemeValue);
	}
}

// Set theme preference and save to localStorage
export function setTheme(value: ThemeValue): void {
	theme.set(value);

	if (browser) {
		localStorage.setItem(STORAGE_KEY, value);
	}
}
