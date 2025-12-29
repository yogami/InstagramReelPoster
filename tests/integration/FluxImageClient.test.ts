import { FluxImageClient } from '../../src/infrastructure/images/FluxImageClient';
import nock from 'nock';

describe('FluxImageClient - Beam.cloud Integration', () => {
    const BEAM_API_KEY = process.env.BEAMCLOUD_API_KEY || 'test-key';
    const BEAM_ENDPOINT = 'https://app.beam.cloud';
    const ENDPOINT_PATH = '/endpoint/flux1-image';

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Error Handling', () => {
        it('should handle 400 error with empty response body', async () => {
            // Mock the exact error scenario from production logs
            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(400, '');

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);

            await expect(client.generateImage('test prompt'))
                .rejects
                .toThrow(/Flux image generation failed \(400\)/);
        });

        it('should handle 400 error with JSON error message', async () => {
            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(400, {
                    error: 'Invalid request',
                    message: 'Missing required field: aspect_ratio'
                });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);

            await expect(client.generateImage('test prompt'))
                .rejects
                .toThrow(/Flux image generation failed \(400\): Invalid request/);
        });

        it('should handle 401 unauthorized error', async () => {
            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(401, {
                    error: 'Unauthorized',
                    message: 'Invalid API key'
                });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);

            await expect(client.generateImage('test prompt'))
                .rejects
                .toThrow(/Flux image generation failed \(401\): Unauthorized/);
        });

        it('should handle timeout errors', async () => {
            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .delayConnection(200000) // Delay longer than timeout
                .reply(200, { image_base64: 'data:image/png;base64,test' });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`, 1000);

            await expect(client.generateImage('test prompt'))
                .rejects
                .toThrow(/timeout/i);
        });
    });

    describe('Request Format', () => {
        it('should send correct request payload to Beam.cloud', async () => {
            let capturedRequest: any;

            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH, (body) => {
                    capturedRequest = body;
                    return true;
                })
                .reply(200, {
                    image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);
            await client.generateImage('a beautiful sunset');

            expect(capturedRequest).toBeDefined();
            expect(capturedRequest.prompt).toContain('a beautiful sunset');
            expect(capturedRequest.aspect_ratio).toBe('9:16');
        });

        it('should include correct authorization header', async () => {
            let capturedHeaders: any;

            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(function () {
                    capturedHeaders = this.req.headers;
                    return [200, { image_base64: 'data:image/png;base64,test' }];
                });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);
            await client.generateImage('test');

            expect(capturedHeaders.authorization).toBe(`Bearer ${BEAM_API_KEY}`);
            expect(capturedHeaders['content-type']).toBe('application/json');
        });
    });

    describe('Response Parsing', () => {
        it('should extract image from image_base64 field', async () => {
            const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(200, { image_base64: base64Image });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);
            const result = await client.generateImage('test');

            expect(result.imageUrl).toBe(base64Image);
        });

        it('should extract image from url field', async () => {
            const imageUrl = 'https://example.com/image.png';

            nock(BEAM_ENDPOINT)
                .post(ENDPOINT_PATH)
                .reply(200, { url: imageUrl });

            const client = new FluxImageClient(BEAM_API_KEY, `${BEAM_ENDPOINT}${ENDPOINT_PATH}`);
            const result = await client.generateImage('test');

            expect(result.imageUrl).toBe(imageUrl);
        });
    });

    describe('Real Beam.cloud API Test', () => {
        it.skip('should successfully generate image with real Beam.cloud API', async () => {
            // Skip by default - only run when testing with real API
            if (!process.env.BEAMCLOUD_API_KEY) {
                console.log('Skipping real API test - BEAMCLOUD_API_KEY not set');
                return;
            }

            const client = new FluxImageClient(
                process.env.BEAMCLOUD_API_KEY,
                process.env.BEAMCLOUD_ENDPOINT_URL || 'https://app.beam.cloud/endpoint/flux1-image'
            );

            const result = await client.generateImage('a serene mountain landscape at sunset');

            expect(result.imageUrl).toBeDefined();
            expect(result.imageUrl).toMatch(/^(data:image|https?:\/\/)/);
        }, 180000); // 3 minute timeout for real API
    });
});
