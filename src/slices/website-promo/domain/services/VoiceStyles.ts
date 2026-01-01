/**
 * VoiceStyles Service
 * 
 * Maps high-level voice style names to Fish Audio voice IDs.
 * Provides a user-friendly abstraction for voice selection.
 */

export type VoiceStyle = 'professional' | 'friendly' | 'energetic' | 'calm';

/**
 * Mapping of voice styles to Fish Audio voice IDs.
 * 
 * Note: These IDs should ideally come from environment config for flexibility.
 * For now, hardcoded with sensible defaults.
 */
export const VOICE_STYLE_MAP: Record<VoiceStyle, string> = {
    // Professional: Clear, authoritative, business-appropriate
    professional: 'd7fd9eee-6b30-4844-a7d1-2ae7f0dd48bf',

    // Friendly: Warm, approachable, conversational
    friendly: 'de7d8354-bed5-40e8-b8e0-017f99e892e0',

    // Energetic: Dynamic, enthusiastic, high-energy
    energetic: 'dd47d6f4-3a99-4282-b5b5-5401d04b97cc',

    // Calm: Soothing, measured, relaxed pace
    calm: 'd7fd9eee-6b30-4844-a7d1-2ae7f0dd48bf'
};

/**
 * Resolves the final voice ID to use for TTS.
 * 
 * Priority:
 * 1. Explicit voiceId (highest priority - user override)
 * 2. Voice style mapping
 * 3. Default to 'professional'
 * 
 * @param style - Optional high-level voice style
 * @param explicitVoiceId - Optional explicit voice ID override
 * @returns The Fish Audio voice ID to use
 */
export function resolveVoiceId(style?: VoiceStyle, explicitVoiceId?: string): string {
    // Explicit ID always wins
    if (explicitVoiceId) {
        return explicitVoiceId;
    }

    // Map style to ID, default to professional
    return VOICE_STYLE_MAP[style || 'professional'];
}
