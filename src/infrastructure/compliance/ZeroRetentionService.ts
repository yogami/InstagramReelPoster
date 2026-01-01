/**
 * ZeroRetentionService - Data flush protocol for GDPR compliance
 * 
 * Implements a data purge protocol that:
 * 1. Deletes temporary files after render completion
 * 2. Purges job data after configurable retention period
 * 3. Generates deletion certificates for audit trail
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Deletion certificate for audit trail
 */
export interface DeletionCertificate {
    /** Unique certificate ID */
    certificateId: string;
    /** Job ID for which data was deleted */
    jobId: string;
    /** Types of data that were deleted */
    deletedDataTypes: ('temp_files' | 'job_data' | 'audio' | 'images' | 'video')[];
    /** Timestamp of deletion */
    deletedAt: Date;
    /** Retention period that was applied (hours) */
    retentionHoursApplied: number;
    /** SHA-256 hash of deletion operation for integrity */
    operationHash: string;
    /** Whether deletion was successful */
    success: boolean;
    /** Any errors encountered */
    errors?: string[];
}

/**
 * Configuration for ZeroRetentionService
 */
export interface ZeroRetentionConfig {
    /** Retention period in hours (default: 24) */
    retentionHours: number;
    /** Path to temp directory for purging */
    tempDir: string;
    /** Whether to generate deletion certificates */
    enableCertificates: boolean;
    /** Directory to store deletion certificates */
    certificateDir?: string;
}

const DEFAULT_CONFIG: ZeroRetentionConfig = {
    retentionHours: 24,
    tempDir: './data/temp',
    enableCertificates: true,
    certificateDir: './data/certificates',
};

/**
 * ZeroRetentionService - Implements privacy-first data lifecycle
 */
export class ZeroRetentionService {
    private readonly config: ZeroRetentionConfig;

    constructor(config?: Partial<ZeroRetentionConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Delete temporary files for a specific job
     */
    async deleteTempFiles(jobId: string): Promise<{ deleted: string[]; errors: string[] }> {
        const deleted: string[] = [];
        const errors: string[] = [];

        const jobTempDir = path.join(this.config.tempDir, jobId);

        try {
            const exists = await this.pathExists(jobTempDir);
            if (exists) {
                const files = await fs.readdir(jobTempDir);
                for (const file of files) {
                    try {
                        await fs.unlink(path.join(jobTempDir, file));
                        deleted.push(file);
                    } catch (e) {
                        errors.push(`Failed to delete ${file}: ${e}`);
                    }
                }
                // Remove the directory itself
                await fs.rmdir(jobTempDir);
                console.log(`[ZeroRetention] Deleted ${deleted.length} temp files for job ${jobId}`);
            }
        } catch (e) {
            errors.push(`Failed to access temp directory: ${e}`);
        }

        return { deleted, errors };
    }

    /**
     * Generate a deletion certificate for audit trail
     */
    async generateDeletionCertificate(
        jobId: string,
        deletedDataTypes: DeletionCertificate['deletedDataTypes'],
        success: boolean,
        errors?: string[]
    ): Promise<DeletionCertificate> {
        const certificateId = crypto.randomUUID();
        const deletedAt = new Date();

        // Create operation hash for integrity
        const hashInput = `${certificateId}:${jobId}:${deletedDataTypes.join(',')}:${deletedAt.toISOString()}`;
        const operationHash = crypto.createHash('sha256').update(hashInput).digest('hex');

        const certificate: DeletionCertificate = {
            certificateId,
            jobId,
            deletedDataTypes,
            deletedAt,
            retentionHoursApplied: this.config.retentionHours,
            operationHash,
            success,
            errors,
        };

        // Persist certificate if enabled
        if (this.config.enableCertificates && this.config.certificateDir) {
            await this.persistCertificate(certificate);
        }

        return certificate;
    }

    /**
     * Schedule job data for deletion after retention period
     */
    schedulePurge(jobId: string, callback: () => Promise<void>): NodeJS.Timeout {
        const delayMs = this.config.retentionHours * 60 * 60 * 1000;

        console.log(`[ZeroRetention] Scheduled purge for job ${jobId} in ${this.config.retentionHours} hours`);

        return setTimeout(async () => {
            console.log(`[ZeroRetention] Executing scheduled purge for job ${jobId}`);
            try {
                await callback();
                const { deleted, errors } = await this.deleteTempFiles(jobId);
                await this.generateDeletionCertificate(
                    jobId,
                    ['temp_files', 'job_data'],
                    errors.length === 0,
                    errors.length > 0 ? errors : undefined
                );
            } catch (e) {
                console.error(`[ZeroRetention] Purge failed for job ${jobId}:`, e);
            }
        }, delayMs);
    }

    /**
     * Immediate purge (for testing or manual cleanup)
     */
    async purgeNow(jobId: string): Promise<DeletionCertificate> {
        const { deleted, errors } = await this.deleteTempFiles(jobId);

        return this.generateDeletionCertificate(
            jobId,
            ['temp_files'],
            errors.length === 0,
            errors.length > 0 ? errors : undefined
        );
    }

    /**
     * Check if retention period has elapsed for a job
     */
    hasRetentionElapsed(createdAt: Date): boolean {
        const now = new Date();
        const elapsedMs = now.getTime() - createdAt.getTime();
        const retentionMs = this.config.retentionHours * 60 * 60 * 1000;
        return elapsedMs >= retentionMs;
    }

    /**
     * Persist deletion certificate to disk
     */
    private async persistCertificate(certificate: DeletionCertificate): Promise<void> {
        try {
            const certDir = this.config.certificateDir!;
            await fs.mkdir(certDir, { recursive: true });

            const filename = `deletion_${certificate.jobId}_${certificate.certificateId}.json`;
            const filepath = path.join(certDir, filename);

            await fs.writeFile(filepath, JSON.stringify(certificate, null, 2), 'utf-8');
            console.log(`[ZeroRetention] Deletion certificate saved: ${filename}`);
        } catch (e) {
            console.error('[ZeroRetention] Failed to persist certificate:', e);
        }
    }

    /**
     * Check if path exists
     */
    private async pathExists(p: string): Promise<boolean> {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Factory function
 */
export function createZeroRetentionService(config?: Partial<ZeroRetentionConfig>): ZeroRetentionService {
    return new ZeroRetentionService(config);
}
