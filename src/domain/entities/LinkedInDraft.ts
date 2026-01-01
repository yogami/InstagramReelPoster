/**
 * LinkedInDraft Entity
 * 
 * Represents a structured LinkedIn post draft generated from raw thoughts.
 * Output is a skeleton for manual refinement, not a polished post.
 */

export interface LinkedInDraft {
    /** Unique identifier */
    id: string;
    /** Telegram chat ID of the author */
    chatId: number;
    /** Original raw note/transcript from user */
    rawNote: string;
    /** Core tension: 1-2 sentences identifying the problem/uncomfortable truth */
    coreTension: string;
    /** Hook line: max 18-20 words, scroll-stopping first line */
    hook: string;
    /** Outline bullets: 3-5 sharp ideas to expand */
    outlineBullets: string[];
    /** Closer options: 1-2 closing angles (question or challenge) */
    closerOptions: string[];
    /** Strategic hashtags for LinkedIn discoverability */
    hashtags: string[];
    /** Creation timestamp */
    createdAt: Date;
    /** Status: draft, scheduled, posted */
    status: 'draft' | 'scheduled' | 'posted';
}

/**
 * Input for creating a LinkedIn draft.
 */
export interface LinkedInDraftInput {
    chatId: number;
    rawNote: string;
}

/**
 * LLM-generated content for a LinkedIn draft.
 */
export interface LinkedInDraftContent {
    core_tension: string;
    hook: string;
    outline_bullets: string[];
    closer_options: string[];
    hashtags?: string[];
}

/**
 * Creates a new LinkedInDraft from input and generated content.
 */
export function createLinkedInDraft(
    id: string,
    input: LinkedInDraftInput,
    content: LinkedInDraftContent
): LinkedInDraft {
    if (!id.trim()) {
        throw new Error('LinkedInDraft id cannot be empty');
    }
    if (!input.rawNote.trim()) {
        throw new Error('LinkedInDraft rawNote cannot be empty');
    }
    if (!content.hook.trim()) {
        throw new Error('LinkedInDraft hook cannot be empty');
    }
    if (!content.outline_bullets || content.outline_bullets.length < 3) {
        throw new Error('LinkedInDraft must have at least 3 outline bullets');
    }

    return {
        id: id.trim(),
        chatId: input.chatId,
        rawNote: input.rawNote.trim(),
        coreTension: content.core_tension.trim(),
        hook: content.hook.trim(),
        outlineBullets: content.outline_bullets.map(b => b.trim()),
        closerOptions: content.closer_options.map(c => c.trim()),
        hashtags: (content.hashtags || []).map(h => h.trim()),
        createdAt: new Date(),
        status: 'draft',
    };
}

/**
 * Detects if a message should trigger LinkedIn draft generation.
 * Case-insensitive matching for "linkedin" keyword.
 */
export function isLinkedInRequest(text: string): boolean {
    return /\blinkedin\b/i.test(text);
}

/**
 * Extracts the raw note from a LinkedIn request by removing the "linkedin" keyword.
 */
export function extractRawNote(text: string): string {
    return text.replace(/\blinkedin\b/i, '').trim();
}

export function assemblePostContent(draft: LinkedInDraft): string {
    const parts: string[] = [];

    // Hook (first line) - isolated for maximum impact
    parts.push(draft.hook);
    parts.push('');
    parts.push(''); // Double space after hook to trigger curiosity

    // Core tension - the setup
    parts.push(draft.coreTension);
    parts.push('');
    parts.push('');

    // Outline bullets - using bullets instead of numbers for cleaner look
    draft.outlineBullets.forEach((bullet) => {
        parts.push(`• ${bullet}`);
        parts.push(''); // Line break between bullets for readability
    });
    parts.push('');

    // First closer option as the call-to-action
    if (draft.closerOptions.length > 0) {
        parts.push(draft.closerOptions[0]);
        parts.push('');
        parts.push('');
    }

    // Hashtags on final line
    if (draft.hashtags.length > 0) {
        parts.push(draft.hashtags.join(' '));
    }

    return parts.join('\n').trim();
}

