/**
 * Mock Avatar Adapter
 * 
 * Placeholder implementation for testing and development.
 * Returns mock data and logs configuration for debugging.
 */

import {
    IAvatarGenerationPort,
    AvatarConfig,
    AvatarVideoResult,
    AvailableAvatar
} from '../ports/IAvatarGenerationPort';

const MOCK_AVATARS: AvailableAvatar[] = [
    {
        id: process.env.AVATAR_IMELDA_CASUAL || 'Imelda_Casual_Front_public',
        name: 'Imelda (Casual)',
        gender: 'female',
        style: 'casual',
        previewUrl: 'https://placeholder.com/avatars/imelda_casual.png',
        voiceId: process.env.HEYGEN_VOICE_ID || '88f5e1546a4245cca66c332671eb6d78'
    },
    {
        id: process.env.AVATAR_IMELDA_SUIT || 'Imelda_Suit_Front_public',
        name: 'Imelda (Suit)',
        gender: 'female',
        style: 'professional',
        previewUrl: 'https://placeholder.com/avatars/imelda_suit.png',
        voiceId: process.env.HEYGEN_VOICE_ID || '88f5e1546a4245cca66c332671eb6d78'
    },
    {
        id: 'avatar-professional-male',
        name: 'Marcus',
        gender: 'male',
        style: 'professional',
        previewUrl: 'https://placeholder.com/avatars/marcus.png',
        voiceId: 'voice-marcus-professional'
    },
    {
        id: 'avatar-professional-female',
        name: 'Elena',
        gender: 'female',
        style: 'professional',
        previewUrl: 'https://placeholder.com/avatars/elena.png',
        voiceId: 'voice-elena-professional'
    },
    {
        id: 'avatar-casual-male',
        name: 'Alex',
        gender: 'male',
        style: 'casual',
        previewUrl: 'https://placeholder.com/avatars/alex.png',
        voiceId: 'voice-alex-casual'
    },
    {
        id: 'avatar-casual-female',
        name: 'Sophie',
        gender: 'female',
        style: 'casual',
        previewUrl: 'https://placeholder.com/avatars/sophie.png',
        voiceId: 'voice-sophie-casual'
    }
];

export class MockAvatarAdapter implements IAvatarGenerationPort {
    async generateAvatarVideo(script: string, config: AvatarConfig, audioUrl?: string): Promise<AvatarVideoResult> {
        console.log('[MockAvatar] Would generate avatar video with config:', {
            avatarId: config.avatarId,
            expression: config.expression || 'neutral',
            background: config.background || 'transparent',
            resolution: config.resolution || '1080p',
            scriptLength: script.length,
            audioUrl: audioUrl || 'none'
        });

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));

        // Estimate duration based on script length (approx 150 words per minute, 5 chars per word)
        const estimatedWords = script.length / 5;
        const estimatedDuration = Math.ceil((estimatedWords / 150) * 60);

        return {
            videoUrl: `https://placeholder.com/avatar-videos/mock-${config.avatarId}-${Date.now()}.mp4`,
            durationSeconds: Math.max(estimatedDuration, 5),
            renderId: `mock-render-${Date.now()}`
        };
    }

    async listAvatars(): Promise<AvailableAvatar[]> {
        return [...MOCK_AVATARS];
    }

    async healthCheck(): Promise<boolean> {
        console.log('[MockAvatar] Health check: OK (mock implementation)');
        return true;
    }
}
