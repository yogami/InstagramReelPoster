/**
 * ILinkedInDraftService Port
 * 
 * Service interface for generating LinkedIn post drafts from raw notes.
 */

import { LinkedInDraft, LinkedInDraftContent } from '../entities/LinkedInDraft';

/**
 * Port for LinkedIn draft generation service.
 */
export interface ILinkedInDraftService {
    /**
     * Generates a structured LinkedIn draft from a raw note.
     * @param rawNote The user's raw thoughts/transcript
     * @returns Generated draft content (tension, hook, bullets, closers)
     */
    generateDraftContent(rawNote: string): Promise<LinkedInDraftContent>;
}
