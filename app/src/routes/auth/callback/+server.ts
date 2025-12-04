import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const type = url.searchParams.get('type');

	// Password recovery flow
	if (type === 'recovery') {
		throw redirect(303, '/auth/reset-password');
	}

	if (code) {
		// Handle the OAuth callback
		// This is for future OAuth providers if needed
	}

	throw redirect(303, '/');
};
