/**
 * GuardianClient - HTTP adapter for calling ConvoGuard's Guardian API
 * 
 * Integrates InstagramReelPoster with the privacy/compliance engine
 * for script validation and audit trail generation.
 */
import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../../config';

/**
 * Content payload for compliance scanning
 */
export interface GuardianContentPayload {
    text: string;
    imageUrls?: string[];
    language?: string;
}

/**
 * Request to scan content
 */
export interface GuardianScanRequest {
    projectId: string;
    content: GuardianContentPayload;
    profileId: string;
    formalityMode?: 'strict' | 'lenient' | 'skip';
}

/**
 * Response from compliance scan
 */
export interface GuardianScanResponse {
    status: 'APPROVED' | 'REJECTED' | 'REVIEW_REQUIRED';
    score: number;
    signals: Array<{
        type: string;
        source: string;
        confidence: number;
        metadata?: Record<string, string>;
    }>;
    violations: Array<{
        ruleId: string;
        category: string;
        severity: string;
        message: string;
    }>;
    auditId: string;
    correctionHints: string[];
    scannedAt: string;
    profileUsed: string;
}

/**
 * Compliance check result
 */
export interface ComplianceResult {
    approved: boolean;
    score: number;
    auditId: string;
    violations: string[];
    correctionHints: string[];
}

/**
 * Interface for compliance client (for DI)
 */
export interface IComplianceClient {
    scanScript(script: string, language: string): Promise<ComplianceResult>;
    isAvailable(): Promise<boolean>;
}

/**
 * GuardianClient - Calls ConvoGuard's Guardian API
 */
export class GuardianClient implements IComplianceClient {
    private readonly client: AxiosInstance;
    private readonly baseUrl: string;
    private readonly projectId: string;
    private readonly defaultProfile: string;

    constructor(options?: {
        baseUrl?: string;
        projectId?: string;
        defaultProfile?: string;
    }) {
        const config = getConfig();

        this.baseUrl = options?.baseUrl || config.guardianApiUrl || 'http://localhost:3001';
        this.projectId = options?.projectId || 'instagram-reel-poster';
        this.defaultProfile = options?.defaultProfile || 'PROMO_SCRIPT_DE_V1';

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Scan a script for compliance issues
     */
    async scanScript(script: string, language: string = 'de'): Promise<ComplianceResult> {
        try {
            const request: GuardianScanRequest = {
                projectId: this.projectId,
                content: {
                    text: script,
                    language,
                },
                profileId: this.defaultProfile,
                formalityMode: language === 'de' ? 'strict' : 'skip',
            };

            const response = await this.client.post<GuardianScanResponse>(
                '/api/guardian/scan',
                request
            );

            const data = response.data;

            return {
                approved: data.status === 'APPROVED',
                score: data.score,
                auditId: data.auditId,
                violations: data.violations.map(v => v.message),
                correctionHints: data.correctionHints,
            };
        } catch (error) {
            console.warn('[GuardianClient] Scan failed, proceeding with warning:', error);

            // Graceful degradation: return approved with warning
            return {
                approved: true,
                score: 0,
                auditId: 'guardian-unavailable',
                violations: [],
                correctionHints: ['Guardian API unavailable, compliance not verified'],
            };
        }
    }

    /**
     * Check if Guardian API is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await this.client.get('/api/guardian/health', {
                timeout: 3000,
            });
            return response.data?.status === 'healthy';
        } catch {
            return false;
        }
    }
}

/**
 * Factory function for creating GuardianClient
 */
export function createGuardianClient(options?: {
    baseUrl?: string;
    projectId?: string;
    defaultProfile?: string;
}): IComplianceClient {
    return new GuardianClient(options);
}
