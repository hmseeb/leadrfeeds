export const openApiSpec = {
	openapi: '3.1.0',
	info: {
		title: 'LeadrFeeds API',
		version: '1.0.0',
		description: 'Read-only API for accessing your feed data programmatically.'
	},
	servers: [
		{
			url: 'https://feeds.leadrai.com/api/v1',
			description: 'Production'
		}
	],
	security: [
		{
			bearerAuth: []
		}
	],
	components: {
		securitySchemes: {
			bearerAuth: {
				type: 'http',
				scheme: 'bearer',
				description: 'API key from Settings > API Keys. Include in Authorization header as: Bearer YOUR_API_KEY'
			}
		},
		schemas: {
			Error: {
				type: 'object',
				properties: {
					error: {
						type: 'object',
						properties: {
							code: {
								type: 'string',
								description: 'Error code identifier',
								example: 'VALIDATION_ERROR'
							},
							message: {
								type: 'string',
								description: 'Human-readable error message',
								example: 'Invalid cursor format'
							},
							status: {
								type: 'integer',
								description: 'HTTP status code',
								example: 400
							}
						},
						required: ['code', 'message', 'status']
					}
				},
				required: ['error']
			},
			Entry: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique entry identifier'
					},
					title: {
						type: 'string',
						description: 'Entry title'
					},
					url: {
						type: 'string',
						format: 'uri',
						description: 'Link to the original entry'
					},
					description: {
						type: 'string',
						nullable: true,
						description: 'Entry summary or excerpt'
					},
					content: {
						type: 'string',
						nullable: true,
						description: 'Full entry content (HTML)'
					},
					author: {
						type: 'string',
						nullable: true,
						description: 'Entry author name'
					},
					published_at: {
						type: 'string',
						format: 'date-time',
						description: 'Publication timestamp (ISO 8601)'
					},
					feed: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								format: 'uuid',
								description: 'Feed identifier'
							},
							title: {
								type: 'string',
								description: 'Feed title'
							},
							image: {
								type: 'string',
								format: 'uri',
								nullable: true,
								description: 'Feed icon or logo URL'
							}
						},
						required: ['id', 'title']
					},
					is_read: {
						type: 'boolean',
						description: 'Whether entry has been marked as read'
					},
					is_starred: {
						type: 'boolean',
						description: 'Whether entry has been starred'
					}
				},
				required: ['id', 'title', 'url', 'published_at', 'feed', 'is_read', 'is_starred']
			},
			Feed: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique feed identifier'
					},
					title: {
						type: 'string',
						description: 'Feed title'
					},
					url: {
						type: 'string',
						format: 'uri',
						description: 'Feed URL (RSS/Atom)'
					},
					site_url: {
						type: 'string',
						format: 'uri',
						nullable: true,
						description: 'Website URL'
					},
					description: {
						type: 'string',
						nullable: true,
						description: 'Feed description'
					},
					category: {
						type: 'string',
						nullable: true,
						description: 'Feed category'
					},
					image: {
						type: 'string',
						format: 'uri',
						nullable: true,
						description: 'Feed icon or logo URL'
					},
					unread_count: {
						type: 'integer',
						description: 'Number of unread entries'
					},
					subscribed_at: {
						type: 'string',
						format: 'date-time',
						description: 'Subscription timestamp (ISO 8601)'
					}
				},
				required: ['id', 'title', 'url', 'unread_count', 'subscribed_at']
			},
			Collection: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique collection identifier'
					},
					name: {
						type: 'string',
						description: 'Collection name'
					},
					icon_name: {
						type: 'string',
						nullable: true,
						description: 'Lucide icon name for the collection'
					},
					display_order: {
						type: 'integer',
						description: 'Sort order for display'
					},
					feed_count: {
						type: 'integer',
						description: 'Number of feeds in collection'
					},
					unread_count: {
						type: 'integer',
						description: 'Total unread entries across all feeds'
					},
					feeds: {
						type: 'array',
						items: {
							$ref: '#/components/schemas/Feed'
						},
						description: 'Feeds in this collection'
					}
				},
				required: ['id', 'name', 'display_order', 'feed_count', 'unread_count', 'feeds']
			},
			Stats: {
				type: 'object',
				properties: {
					total_unread: {
						type: 'integer',
						description: 'Total unread entries across all feeds'
					},
					total_starred: {
						type: 'integer',
						description: 'Total starred entries'
					},
					feeds: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: {
									type: 'string',
									format: 'uuid'
								},
								title: {
									type: 'string'
								},
								unread_count: {
									type: 'integer'
								}
							},
							required: ['id', 'title', 'unread_count']
						},
						description: 'Per-feed unread counts'
					}
				},
				required: ['total_unread', 'total_starred', 'feeds']
			},
			PaginationMeta: {
				type: 'object',
				properties: {
					next_cursor: {
						type: 'string',
						nullable: true,
						description: 'Cursor for next page (null if no more results)'
					},
					has_more: {
						type: 'boolean',
						description: 'Whether more results are available'
					},
					limit: {
						type: 'integer',
						description: 'Number of results per page'
					}
				},
				required: ['next_cursor', 'has_more', 'limit']
			}
		}
	},
	paths: {
		'/entries': {
			get: {
				summary: 'List feed entries',
				description:
					'Returns a paginated list of entries from your subscribed feeds. Supports filtering by feed, collection, category, date range, read/starred status, and full-text search.',
				operationId: 'listEntries',
				tags: ['Entries'],
				parameters: [
					{
						name: 'cursor',
						in: 'query',
						description:
							'Pagination cursor from previous response. Omit for first page.',
						schema: {
							type: 'string'
						}
					},
					{
						name: 'limit',
						in: 'query',
						description: 'Maximum number of entries to return (1-100)',
						schema: {
							type: 'integer',
							minimum: 1,
							maximum: 100,
							default: 20
						}
					},
					{
						name: 'feed_id',
						in: 'query',
						description: 'Filter by specific feed UUID',
						schema: {
							type: 'string',
							format: 'uuid'
						}
					},
					{
						name: 'collection_id',
						in: 'query',
						description: 'Filter by collection UUID (returns entries from all feeds in collection)',
						schema: {
							type: 'string',
							format: 'uuid'
						}
					},
					{
						name: 'category',
						in: 'query',
						description: 'Filter by feed category',
						schema: {
							type: 'string'
						}
					},
					{
						name: 'start_date',
						in: 'query',
						description: 'Filter entries published on or after this date (ISO 8601)',
						schema: {
							type: 'string',
							format: 'date-time'
						}
					},
					{
						name: 'end_date',
						in: 'query',
						description: 'Filter entries published on or before this date (ISO 8601)',
						schema: {
							type: 'string',
							format: 'date-time'
						}
					},
					{
						name: 'is_read',
						in: 'query',
						description: 'Filter by read status (true for read, false for unread)',
						schema: {
							type: 'boolean'
						}
					},
					{
						name: 'is_starred',
						in: 'query',
						description: 'Filter by starred status (true for starred only)',
						schema: {
							type: 'boolean'
						}
					},
					{
						name: 'search',
						in: 'query',
						description: 'Full-text search in title and description (case-insensitive)',
						schema: {
							type: 'string'
						}
					}
				],
				responses: {
					'200': {
						description: 'Successful response with paginated entries',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: {
												$ref: '#/components/schemas/Entry'
											}
										},
										meta: {
											$ref: '#/components/schemas/PaginationMeta'
										}
									},
									required: ['data', 'meta']
								}
							}
						}
					},
					'400': {
						description: 'Invalid request parameters',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								},
								example: {
									error: {
										code: 'VALIDATION_ERROR',
										message: 'Invalid cursor format',
										status: 400
									}
								}
							}
						}
					},
					'401': {
						description: 'Missing or invalid API key',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								},
								example: {
									error: {
										code: 'UNAUTHORIZED',
										message: 'Invalid or missing API key',
										status: 401
									}
								}
							}
						}
					},
					'429': {
						description: 'Rate limit exceeded',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								},
								example: {
									error: {
										code: 'RATE_LIMIT_EXCEEDED',
										message: 'Rate limit exceeded. Try again in 60 seconds.',
										status: 429
									}
								}
							}
						}
					},
					'500': {
						description: 'Internal server error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								},
								example: {
									error: {
										code: 'INTERNAL_ERROR',
										message: 'An unexpected error occurred',
										status: 500
									}
								}
							}
						}
					}
				}
			}
		},
		'/feeds': {
			get: {
				summary: 'List subscribed feeds',
				description:
					'Returns all feeds you are subscribed to, including unread counts. Results are ordered by subscription date (newest first).',
				operationId: 'listFeeds',
				tags: ['Feeds'],
				responses: {
					'200': {
						description: 'Successful response with feeds list',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: {
												$ref: '#/components/schemas/Feed'
											}
										}
									},
									required: ['data']
								}
							}
						}
					},
					'401': {
						description: 'Missing or invalid API key',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'429': {
						description: 'Rate limit exceeded',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'500': {
						description: 'Internal server error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			}
		},
		'/collections': {
			get: {
				summary: 'List collections with feeds',
				description:
					'Returns all your collections with their associated feeds and aggregate counts. Collections are ordered by display_order.',
				operationId: 'listCollections',
				tags: ['Collections'],
				responses: {
					'200': {
						description: 'Successful response with collections list',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: {
												$ref: '#/components/schemas/Collection'
											}
										}
									},
									required: ['data']
								}
							}
						}
					},
					'401': {
						description: 'Missing or invalid API key',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'429': {
						description: 'Rate limit exceeded',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'500': {
						description: 'Internal server error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			}
		},
		'/stats': {
			get: {
				summary: 'Get aggregate statistics',
				description:
					'Returns aggregate statistics including total unread count, total starred count, and per-feed unread breakdowns.',
				operationId: 'getStats',
				tags: ['Stats'],
				responses: {
					'200': {
						description: 'Successful response with statistics',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											$ref: '#/components/schemas/Stats'
										}
									},
									required: ['data']
								}
							}
						}
					},
					'401': {
						description: 'Missing or invalid API key',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'429': {
						description: 'Rate limit exceeded',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					'500': {
						description: 'Internal server error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			}
		}
	}
} as const;
