/**
 * ILinkedInPosterService Port
 * 
 * Service interface for posting content to LinkedIn via webhook.
 */

/**
 * Payload structure for LinkedIn post via Make.com webhook.
 */
export interface LinkedInPostPayload {
    /** Main text of the post (LinkedIn internal: commentary) */
    content: string;
    /** Post visibility setting */
    visibility: 'PUBLIC' | 'CONNECTIONS';
    /** Post type */
    type: 'ARTICLE' | 'IMAGE' | 'VIDEO' | 'NONE';
    /** Media specific fields */
    media?: {
        title?: string;
        description?: string;
        originalUrl?: string;
        thumbnail?: {
            fileName?: string;
            data?: string | null;
        };
    };
    /** LinkedIn user mentions (URNs or handles) */
    mentions?: string[];
}

/**
 * Result of a LinkedIn post operation.
 */
export interface LinkedInPostResult {
    success: boolean;
    postId?: string;
    error?: string;
}

/**
 * Port for LinkedIn posting service.
 */
export interface ILinkedInPosterService {
    /**
     * Posts content to LinkedIn via Make.com webhook.
     * @param payload - The post payload
     * @returns Result with success status and optional postId
     */
    postToLinkedIn(payload: LinkedInPostPayload): Promise<LinkedInPostResult>;
}
