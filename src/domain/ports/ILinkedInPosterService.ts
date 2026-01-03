/**
 * ILinkedInPosterService Port
 * 
 * Service interface for posting content to LinkedIn via webhook.
 */

/**
 * Payload structure for LinkedIn post via Make.com webhook.
 * Supports both simple image posts and more complex article/media posts.
 */
export interface LinkedInPostPayload {
    /** Root type of the post (e.g., 'ARTICLE', 'IMAGE') */
    type?: string;
    /** Main text of the post */
    content: string;
    /** Visibility of the post */
    visibility?: 'PUBLIC' | 'CONNECTIONS';
    /** URL of the image to post (legacy/simple support) */
    originalUrl?: string;
    /** Title of the post/image (legacy/simple support) */
    title?: string;
    /** Alternative text for accessibility (legacy/simple support) */
    altText?: string;
    /** Rich media object for structured posts */
    media?: {
        originalUrl?: string;
        title?: string;
        description?: string;
        thumbnail?: {
            fileName?: string;
            data?: string | null;
        };
    };
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
