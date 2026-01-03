/**
 * ILinkedInPosterService Port
 * 
 * Service interface for posting content to LinkedIn via webhook.
 */

/**
 * Payload structure for LinkedIn post via Make.com webhook.
 */
export interface LinkedInPostPayload {
    /** Main text of the post */
    content: string;
    /** URL of the image to post */
    originalUrl: string;
    /** Title of the post/image */
    title: string;
    /** Alternative text for accessibility */
    altText?: string;
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
