/**
 * Compliance Port
 * 
 * Defines the contract for content safety, cultural nuance checks,
 * and German legal compliance (UWG/GDPR).
 */

export interface ComplianceRequest {
    text: string;
    language: string;
    market?: 'berlin' | 'dach' | 'global';
    formality?: 'formal' | 'informal';
}

export interface ComplianceReport {
    approved: boolean;
    score: number;
    auditId: string;
    violations: string[];
    correctionHints: string[];
    riskLevel: 'low' | 'medium' | 'high';
}

export interface ICompliancePort {
    /**
     * Checks a script for compliance with local laws and cultural norms.
     */
    checkScript(request: ComplianceRequest): Promise<ComplianceReport>;

    /**
     * Generates a data deletion certificate for GDPR "Right to be Forgotten".
     */
    generateDeletionCertificate(jobId: string): Promise<string>;

    /**
     * Records asset provenance to prevent AI-misinformation claims.
     */
    recordProvenance(jobId: string, metadata: any): Promise<string>;
}
