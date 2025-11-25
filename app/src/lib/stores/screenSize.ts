import { readable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Breakpoints matching Tailwind defaults
const BREAKPOINTS = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	'2xl': 1536
} as const;

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

function createScreenWidthStore() {
	// Default to mobile width for SSR to prevent flash of desktop layout on mobile
	// This is mobile-first: better to show mobile layout initially than flash sidebar
	const defaultWidth = 375;

	return readable(defaultWidth, (set) => {
		if (!browser) return;

		// Set initial value immediately
		set(window.innerWidth);

		const handleResize = () => {
			set(window.innerWidth);
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
}

function createLandscapeStore() {
	// Default to portrait for SSR (mobile-first)
	return readable(false, (set) => {
		if (!browser) return;

		const mediaQuery = window.matchMedia('(orientation: landscape)');
		set(mediaQuery.matches);

		const handleChange = (e: MediaQueryListEvent) => {
			set(e.matches);
		};

		mediaQuery.addEventListener('change', handleChange);

		return () => {
			mediaQuery.removeEventListener('change', handleChange);
		};
	});
}

// Core stores
export const screenWidth = createScreenWidthStore();
export const isLandscape = createLandscapeStore();

// Derived breakpoint stores
export const breakpoint = derived(screenWidth, ($width): Breakpoint => {
	if ($width >= BREAKPOINTS['2xl']) return '2xl';
	if ($width >= BREAKPOINTS.xl) return 'xl';
	if ($width >= BREAKPOINTS.lg) return 'lg';
	if ($width >= BREAKPOINTS.md) return 'md';
	if ($width >= BREAKPOINTS.sm) return 'sm';
	return 'xs';
});

// Convenience boolean stores
export const isMobile = derived(screenWidth, ($width) => $width < BREAKPOINTS.md);
export const isTablet = derived(
	screenWidth,
	($width) => $width >= BREAKPOINTS.md && $width < BREAKPOINTS.lg
);
export const isDesktop = derived(screenWidth, ($width) => $width >= BREAKPOINTS.lg);

// Combined store for adaptive tablet behavior (portrait = mobile, landscape = desktop)
export const useDesktopLayout = derived(
	[screenWidth, isLandscape],
	([$width, $isLandscape]) => {
		// Desktop always uses desktop layout
		if ($width >= BREAKPOINTS.lg) return true;
		// Tablet in landscape uses desktop layout
		if ($width >= BREAKPOINTS.md && $isLandscape) return true;
		// Everything else uses mobile layout
		return false;
	}
);
