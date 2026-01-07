import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	const type = url.searchParams.get('type');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	// Handle OAuth errors (e.g., user denied consent)
	if (error) {
		const message = errorDescription || error;
		throw redirect(303, `/auth/login?error=${encodeURIComponent(message)}`);
	}

	// Password recovery flow
	if (type === 'recovery') {
		throw redirect(303, '/auth/reset-password');
	}

	// For OAuth callback, redirect to the client page with the code
	// The client-side Supabase will exchange the code using PKCE
	if (code) {
		throw redirect(303, `/auth/callback/complete?code=${code}`);
	}

	throw redirect(303, '/');
};
