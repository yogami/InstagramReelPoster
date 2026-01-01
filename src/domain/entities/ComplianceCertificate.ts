/**
 * ComplianceCertificate - Sidecar output alongside video
 * 
 * Documents compliance status and asset provenance for each generated reel.
 * Provides audit trail for privacy and regulatory compliance.
 */

/**
 * Asset provenance for audit trail
 */
export interface AssetProvenance {
    /** Music asset details */
    music?: {
        source: string;
        trackId: string;
        license: string;
        catalogId: string;
    };
    /** Image assets used */
    images: Array<{
        source: 'flux' | 'scraped' | 'stock';
        prompt?: string;
        originalUrl?: string;
        synthetic: boolean;
    }>;
    /** Voice synthesis details */
    voice: {
        provider: string;
        voiceId: string;
        synthetic: boolean;
        language: string;
    };
}

/**
 * Compliance scan result summary
 */
export interface ComplianceScanResult {
    status: 'APPROVED' | 'REJECTED' | 'REVIEW_REQUIRED' | 'NOT_SCANNED';
    score: number;
    auditId: string;
    violations: string[];
    correctionHints: string[];
}

/**
 * Compliance Certificate - attached to each generated video
 */
export interface ComplianceCertificate {
    /** Unique video identifier */
    videoId: string;
    /** Job that generated this video */
    jobId: string;
    /** Timestamp of certificate generation */
    generatedAt: Date;
    /** Compliance scan result */
    compliance: ComplianceScanResult;
    /** Asset provenance for transparency */
    assetProvenance: AssetProvenance;
    /** Data retention policy info */
    dataRetention: {
        /** When source data will be purged */
        purgeDue: Date;
        /** Retention period in hours */
        retentionHours: number;
        /** Whether deletion certificate will be issued */
        deletionCertificateEnabled: boolean;
    };
    /** Version of the compliance framework */
    frameworkVersion: string;
}

/**
 * Factory to create a compliance certificate
 */
export function createComplianceCertificate(
    videoId: string,
    jobId: string,
    compliance: ComplianceScanResult,
    assetProvenance: AssetProvenance,
    retentionHours: number = 24
): ComplianceCertificate {
    const now = new Date();
    const purgeDue = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);

    return {
        videoId,
        jobId,
        generatedAt: now,
        compliance,
        assetProvenance,
        dataRetention: {
            purgeDue,
            retentionHours,
            deletionCertificateEnabled: true,
        },
        frameworkVersion: '1.0.0',
    };
}

/**
 * Create a default "not scanned" certificate when Guardian is unavailable
 */
export function createNotScannedCertificate(
    videoId: string,
    jobId: string,
    assetProvenance: AssetProvenance
): ComplianceCertificate {
    return createComplianceCertificate(
        videoId,
        jobId,
        {
            status: 'NOT_SCANNED',
            score: 0,
            auditId: 'not-scanned',
            violations: [],
            correctionHints: ['Compliance scan was not performed'],
        },
        assetProvenance
    );
}

/**
 * Serialize certificate to JSON for file output
 */
export function serializeCertificate(certificate: ComplianceCertificate): string {
    return JSON.stringify(certificate, null, 2);
}
