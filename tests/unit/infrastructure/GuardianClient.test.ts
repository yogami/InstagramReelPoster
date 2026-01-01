/**
 * Unit tests for GuardianClient
 */
import axios from 'axios';
import { GuardianClient, GuardianScanResponse } from '../../../src/infrastructure/compliance/GuardianClient';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: () => ({
        guardianApiUrl: 'http://localhost:3001',
    }),
}));

describe('GuardianClient', () => {
    let client: GuardianClient;
    let mockAxiosInstance: {
        post: jest.Mock;
        get: jest.Mock;
    };

    beforeEach(() => {
        mockAxiosInstance = {
            post: jest.fn(),
            get: jest.fn(),
        };

        mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
        client = new GuardianClient();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('scanScript()', () => {
        it('should return approved result for passing scan', async () => {
            const mockResponse: GuardianScanResponse = {
                status: 'APPROVED',
                score: 95,
                signals: [],
                violations: [],
                auditId: 'audit-123',
                correctionHints: [],
                scannedAt: new Date().toISOString(),
                profileUsed: 'PROMO_SCRIPT_DE_V1',
            };

            mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

            const result = await client.scanScript('Entdecken Sie unser Restaurant.', 'de');

            expect(result.approved).toBe(true);
            expect(result.score).toBe(95);
            expect(result.auditId).toBe('audit-123');
            expect(result.violations).toHaveLength(0);
        });

        it('should return rejected result with violations', async () => {
            const mockResponse: GuardianScanResponse = {
                status: 'REJECTED',
                score: 60,
                signals: [{ type: 'SIGNAL_AGGRESSIVE_SALES', source: 'REGEX', confidence: 0.9 }],
                violations: [
                    { ruleId: 'brand-001', category: 'MANIPULATION', severity: 'HIGH', message: 'Aggressive sales language' }
                ],
                auditId: 'audit-456',
                correctionHints: ['Soften sales language'],
                scannedAt: new Date().toISOString(),
                profileUsed: 'PROMO_SCRIPT_DE_V1',
            };

            mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

            const result = await client.scanScript('BUY NOW! Limited time offer!', 'en');

            expect(result.approved).toBe(false);
            expect(result.score).toBe(60);
            expect(result.violations).toContain('Aggressive sales language');
            expect(result.correctionHints).toContain('Soften sales language');
        });

        it('should gracefully degrade when API is unavailable', async () => {
            mockAxiosInstance.post.mockRejectedValue(new Error('Connection refused'));

            const result = await client.scanScript('Test script', 'de');

            expect(result.approved).toBe(true);
            expect(result.score).toBe(0);
            expect(result.auditId).toBe('guardian-unavailable');
            expect(result.correctionHints).toContain('Guardian API unavailable, compliance not verified');
        });

        it('should send correct request payload for German content', async () => {
            const mockResponse: GuardianScanResponse = {
                status: 'APPROVED',
                score: 100,
                signals: [],
                violations: [],
                auditId: 'audit-789',
                correctionHints: [],
                scannedAt: new Date().toISOString(),
                profileUsed: 'PROMO_SCRIPT_DE_V1',
            };

            mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

            await client.scanScript('Willkommen bei uns.', 'de');

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                '/api/guardian/scan',
                expect.objectContaining({
                    projectId: 'instagram-reel-poster',
                    content: expect.objectContaining({
                        text: 'Willkommen bei uns.',
                        language: 'de',
                    }),
                    profileId: 'PROMO_SCRIPT_DE_V1',
                    formalityMode: 'strict',
                })
            );
        });

        it('should skip formality check for non-German content', async () => {
            const mockResponse: GuardianScanResponse = {
                status: 'APPROVED',
                score: 100,
                signals: [],
                violations: [],
                auditId: 'audit-000',
                correctionHints: [],
                scannedAt: new Date().toISOString(),
                profileUsed: 'PROMO_SCRIPT_DE_V1',
            };

            mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

            await client.scanScript('Welcome to our restaurant.', 'en');

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                '/api/guardian/scan',
                expect.objectContaining({
                    formalityMode: 'skip',
                })
            );
        });
    });

    describe('isAvailable()', () => {
        it('should return true when API is healthy', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: { status: 'healthy' } });

            const result = await client.isAvailable();

            expect(result).toBe(true);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/guardian/health', { timeout: 3000 });
        });

        it('should return false when API returns degraded', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: { status: 'degraded' } });

            const result = await client.isAvailable();

            expect(result).toBe(false);
        });

        it('should return false when health check fails', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Timeout'));

            const result = await client.isAvailable();

            expect(result).toBe(false);
        });
    });

    describe('constructor options', () => {
        it('should accept custom baseUrl', () => {
            const customClient = new GuardianClient({ baseUrl: 'https://guardian.example.com' });
            expect(customClient).toBeDefined();
        });

        it('should accept custom projectId', async () => {
            const customClient = new GuardianClient({ projectId: 'custom-project' });

            const mockResponse: GuardianScanResponse = {
                status: 'APPROVED',
                score: 100,
                signals: [],
                violations: [],
                auditId: 'audit-custom',
                correctionHints: [],
                scannedAt: new Date().toISOString(),
                profileUsed: 'TEST',
            };

            mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

            await customClient.scanScript('Test', 'en');

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                '/api/guardian/scan',
                expect.objectContaining({
                    projectId: 'custom-project',
                })
            );
        });
    });
});
