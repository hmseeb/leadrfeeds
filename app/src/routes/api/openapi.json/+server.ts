import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openApiSpec } from '$lib/data/openapi-spec';

export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify(openApiSpec, null, 2), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
