import { TimelineVideoRenderer } from '../../../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';
import nock from 'nock';

describe('Caption Logic Regression', () => {
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.shotstack.io/stage';

    beforeEach(() => {
        nock.cleanAll();
    });

    it('should include segment-level captions in the Shotstack payload', async () => {
        const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 10, 1);
        const manifest: ReelManifest = {
            durationSeconds: 10,
            segments: [
                {
                    index: 0,
                    start: 0,
                    end: 5,
                    imageUrl: 'https://example.com/img1.jpg',
                    caption: 'STUNNING HOOK TEXT'
                },
                {
                    index: 1,
                    start: 5,
                    end: 10,
                    imageUrl: 'https://example.com/img2.jpg',
                    caption: 'EPIC CONCLUSION'
                },
            ],
            voiceoverUrl: 'https://example.com/vo.mp3',
            subtitlesUrl: 'https://example.com/subs.srt',
        };

        let capturedPayload: any;
        nock(baseUrl)
            .post('/render', (body) => {
                capturedPayload = body;
                return true;
            })
            .reply(200, { response: { id: 'render-123' } });

        nock(baseUrl)
            .get('/render/render-123')
            .reply(200, { response: { status: 'done', url: 'https://cdn.shotstack.io/final.mp4' } });

        await renderer.render(manifest);

        // Verify that segment captions are present in some track
        const allClips = capturedPayload.timeline.tracks.flatMap((t: any) => t.clips);
        const textClips = allClips.filter((c: any) => c.asset.type === 'html' || c.asset.type === 'text' || c.asset.type === 'title');

        const hookTextClip = textClips.find((c: any) =>
            (c.asset.html && c.asset.html.includes('STUNNING HOOK TEXT')) ||
            (c.asset.text && c.asset.text.includes('STUNNING HOOK TEXT'))
        );

        expect(hookTextClip).toBeDefined();
        expect(hookTextClip.start).toBe(0);
        expect(hookTextClip.length).toBe(5);

        const conclusionTextClip = textClips.find((c: any) =>
            (c.asset.html && c.asset.html.includes('EPIC CONCLUSION')) ||
            (c.asset.text && c.asset.text.includes('EPIC CONCLUSION'))
        );

        expect(conclusionTextClip).toBeDefined();
        expect(conclusionTextClip.start).toBe(5);
        expect(conclusionTextClip.length).toBe(5);
    });
});
