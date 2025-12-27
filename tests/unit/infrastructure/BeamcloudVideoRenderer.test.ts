import axios from 'axios';
import { BeamcloudVideoRenderer } from '../../../src/infrastructure/video/BeamcloudVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BeamcloudVideoRenderer', () => {
    const apiKey = 'test-beam-api-key';
    const endpointUrl = 'https://app.beam.cloud/endpoint/ffmpeg-render';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new BeamcloudVideoRenderer('', endpointUrl)).toThrow('Beamcloud API key is required');
        });

        test('should throw error if endpointUrl is empty', () => {
            expect(() => new BeamcloudVideoRenderer(apiKey, '')).toThrow('Beamcloud render endpoint URL is required');
        });

        test('should create renderer with valid parameters', () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);
            expect(renderer).toBeInstanceOf(BeamcloudVideoRenderer);
        });
    });

    describe('render', () => {
        const testManifest: ReelManifest = {
            durationSeconds: 30,
            voiceoverUrl: 'https://example.com/voiceover.mp3',
            musicUrl: 'https://example.com/music.mp3',
            subtitlesUrl: 'https://example.com/subs.srt',
            segments: [
                { imageUrl: 'https://example.com/img1.png', start: 0, end: 10, index: 0 },
                { imageUrl: 'https://example.com/img2.png', start: 10, end: 20, index: 1 },
            ],
        };

        test('should return video URL on successful render', async () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    video_url: 'https://cloudinary.com/rendered_video.mp4',
                    render_id: 'abc123',
                }
            });

            const result = await renderer.render(testManifest);

            expect(result.videoUrl).toBe('https://cloudinary.com/rendered_video.mp4');
            expect(result.renderId).toBe('abc123');
        });

        test('should send correct manifest data to endpoint', async () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { video_url: 'https://test.com/video.mp4' }
            });

            await renderer.render(testManifest);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                endpointUrl,
                expect.objectContaining({
                    voiceover_url: testManifest.voiceoverUrl,
                    music_url: testManifest.musicUrl,
                    subtitles_url: testManifest.subtitlesUrl,
                    duration_seconds: testManifest.durationSeconds,
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${apiKey}`,
                    })
                })
            );
        });

        test('should handle url field in response', async () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { url: 'https://alt-format.com/video.mp4' }
            });

            const result = await renderer.render(testManifest);

            expect(result.videoUrl).toBe('https://alt-format.com/video.mp4');
        });
    });

    describe('error handling', () => {
        const testManifest: ReelManifest = {
            durationSeconds: 30,
            voiceoverUrl: 'https://example.com/voiceover.mp3',
            subtitlesUrl: 'https://example.com/subs.srt',
        };

        test('should throw with error message on API failure', async () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: { error: 'FFmpeg processing failed' }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(renderer.render(testManifest))
                .rejects.toThrow('Beamcloud render failed: FFmpeg processing failed');
        });

        test('should throw if no video URL in response', async () => {
            const renderer = new BeamcloudVideoRenderer(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { status: 'completed' }
            });

            await expect(renderer.render(testManifest))
                .rejects.toThrow('Could not extract video URL from Beamcloud render response');
        });
    });
});
