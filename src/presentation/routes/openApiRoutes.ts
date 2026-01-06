/**
 * OpenAPI Route Handler for InstagramReelPoster
 * 
 * Exposes /api/openapi.json and /api/docs for Agent Manager discovery.
 * Integrated with existing Express application.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * OpenAPI 3.0 Specification
 */
const OPENAPI_SPEC = {
    openapi: '3.0.3',
    info: {
        title: 'InstagramReelPoster API',
        version: '1.0.0',
        description: 'Automated video reel generation and posting API. Supports standard reels, website promos, and Telegram webhooks.'
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Local development' },
        { url: 'https://instagram-reel-poster.railway.app', description: 'Production' }
    ],
    paths: {
        '/reel': {
            post: {
                summary: 'Generate a standard reel',
                description: 'Generate a video reel from a business name, category, and metadata.',
                operationId: 'generateReel',
                tags: ['Reel Generation'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ReelRequest' }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Job submitted', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobResponse' } } } },
                    '400': { description: 'Invalid request' }
                }
            }
        },
        '/website': {
            post: {
                summary: 'Generate a website promo reel',
                description: 'Generate a promotional reel by scraping a business website URL.',
                operationId: 'generateWebsitePromo',
                tags: ['Reel Generation'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/WebsiteRequest' }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Job submitted' }
                }
            }
        },
        '/job/{id}': {
            get: {
                summary: 'Get job status',
                description: 'Retrieve the current status and output of a generation job.',
                operationId: 'getJobStatus',
                tags: ['Jobs'],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'Job status' },
                    '404': { description: 'Job not found' }
                }
            }
        },
        '/health': {
            get: {
                summary: 'Health check',
                operationId: 'healthCheck',
                tags: ['System'],
                responses: {
                    '200': { description: 'API is healthy' }
                }
            }
        }
    },
    components: {
        schemas: {
            ReelRequest: {
                type: 'object',
                properties: {
                    businessName: { type: 'string' },
                    category: { type: 'string' },
                    language: { type: 'string', default: 'en' },
                    style: { type: 'string', enum: ['modern', 'classic', 'minimal'] }
                },
                required: ['businessName', 'category']
            },
            WebsiteRequest: {
                type: 'object',
                properties: {
                    url: { type: 'string', format: 'uri' },
                    language: { type: 'string', default: 'en' }
                },
                required: ['url']
            },
            JobResponse: {
                type: 'object',
                properties: {
                    jobId: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'processing', 'complete', 'failed'] },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            }
        }
    }
};

/**
 * GET /api/openapi.json
 */
router.get('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(OPENAPI_SPEC);
});

/**
 * GET /api/docs
 */
router.get('/docs', (_req: Request, res: Response) => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>InstagramReelPoster - API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"><style>body{margin:0}.swagger-ui .topbar{display:none}</style></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.onload=()=>{SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:'BaseLayout'})}</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

export default router;
