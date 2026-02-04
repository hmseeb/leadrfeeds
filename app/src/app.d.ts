// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			apiUser?: {
				userId: string;
				keyId: string;
			};
			rateLimitHeaders?: Record<string, string>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
