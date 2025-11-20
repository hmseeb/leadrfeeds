import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');

	if (code) {
		// Handle the OAuth callback
		// This is for future OAuth providers if needed
	}

	throw redirect(303, '/');
};
