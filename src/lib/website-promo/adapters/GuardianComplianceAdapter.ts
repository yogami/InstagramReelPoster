import { ICompliancePort, ComplianceRequest, ComplianceReport } from '../ports/ICompliancePort';
import { GuardianClient } from '../../../infrastructure/compliance/GuardianClient';
import { ZeroRetentionService } from '../../../infrastructure/compliance/ZeroRetentionService';
import * as Provenance from '../../../infrastructure/compliance/AssetProvenanceService';

/**
 * Guardian Compliance Adapter
 * 
 * Bridges the Website Promo slice to the enterprise compliance engine.
 * Specifically tuned for the Berlin/DACH market 'Sie vs Du' and UWG scans.
 */
export class GuardianComplianceAdapter implements ICompliancePort {
    private readonly guardian: GuardianClient;
    private readonly zeroRetention: ZeroRetentionService;

    constructor(
        guardian: GuardianClient,
        zeroRetention: ZeroRetentionService
    ) {
        this.guardian = guardian;
        this.zeroRetention = zeroRetention;
    }

    async checkScript(request: ComplianceRequest): Promise<ComplianceReport> {
        console.log(`[Guardian] Scanning script for market: ${request.market || 'global'}, formality: ${request.formality || 'default'}`);

        const result = await this.guardian.scanScript(
            request.text,
            request.language
        );

        // Map risk level based on score
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (result.score < 0.5) riskLevel = 'high';
        else if (result.score < 0.8) riskLevel = 'medium';

        return {
            approved: result.approved,
            score: result.score,
            auditId: result.auditId,
            violations: result.violations,
            correctionHints: result.correctionHints,
            riskLevel
        };
    }

    async generateDeletionCertificate(jobId: string): Promise<string> {
        const cert = await this.zeroRetention.purgeNow(jobId);
        return cert.certificateId;
    }

    async recordProvenance(jobId: string, metadata: any): Promise<string> {
        // Use the functional infrastructure to generate and write the manifest
        const manifest = Provenance.generateCreditsManifest(jobId, {
            music: metadata.music || Provenance.createAiMusicCredit(),
            images: metadata.images || [],
            voice: metadata.voice || { provider: 'fish_audio', voiceId: 'default', synthetic: true, language: 'en' },
            complianceAuditId: metadata.auditId,
            complianceApproved: metadata.approved,
            complianceScore: metadata.score
        });

        const outputDir = `./data/provenance/${jobId}`;
        return await Provenance.writeCreditsManifest(manifest, outputDir);
    }
}
