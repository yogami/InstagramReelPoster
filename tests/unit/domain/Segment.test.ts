import {
    createSegment,
    getSegmentDuration,
    Segment,
} from '../../../src/domain/entities/Segment';

describe('Segment', () => {
    describe('createSegment', () => {
        it('should create a valid segment with all required properties', () => {
            const segment = createSegment({
                index: 0,
                startSeconds: 0,
                endSeconds: 5,
                commentary: 'This is the first segment.',
                imagePrompt: 'A serene mountain landscape at dawn',
            });

            expect(segment.index).toBe(0);
            expect(segment.startSeconds).toBe(0);
            expect(segment.endSeconds).toBe(5);
            expect(segment.commentary).toBe('This is the first segment.');
            expect(segment.imagePrompt).toBe('A serene mountain landscape at dawn');
            expect(segment.imageUrl).toBeUndefined();
            expect(segment.caption).toBeUndefined();
        });

        it('should create a segment with optional properties', () => {
            const segment = createSegment({
                index: 1,
                startSeconds: 5,
                endSeconds: 10,
                commentary: 'Second segment.',
                imagePrompt: 'Abstract spiritual imagery',
                imageUrl: 'https://example.com/image.jpg',
                caption: 'The inner journey',
            });

            expect(segment.imageUrl).toBe('https://example.com/image.jpg');
            expect(segment.caption).toBe('The inner journey');
        });

        it('should trim whitespace from text fields', () => {
            const segment = createSegment({
                index: 0,
                startSeconds: 0,
                endSeconds: 5,
                commentary: '  Some commentary with spaces  ',
                imagePrompt: '  Image prompt  ',
                caption: '  Caption  ',
            });

            expect(segment.commentary).toBe('Some commentary with spaces');
            expect(segment.imagePrompt).toBe('Image prompt');
            expect(segment.caption).toBe('Caption');
        });

        it('should throw error for negative index', () => {
            expect(() =>
                createSegment({
                    index: -1,
                    startSeconds: 0,
                    endSeconds: 5,
                    commentary: 'Test',
                    imagePrompt: 'Test',
                })
            ).toThrow('Segment index must be non-negative');
        });

        it('should throw error for negative startSeconds', () => {
            expect(() =>
                createSegment({
                    index: 0,
                    startSeconds: -1,
                    endSeconds: 5,
                    commentary: 'Test',
                    imagePrompt: 'Test',
                })
            ).toThrow('Segment startSeconds must be non-negative');
        });

        it('should throw error when endSeconds <= startSeconds', () => {
            expect(() =>
                createSegment({
                    index: 0,
                    startSeconds: 5,
                    endSeconds: 5,
                    commentary: 'Test',
                    imagePrompt: 'Test',
                })
            ).toThrow('Segment endSeconds must be greater than startSeconds');

            expect(() =>
                createSegment({
                    index: 0,
                    startSeconds: 5,
                    endSeconds: 3,
                    commentary: 'Test',
                    imagePrompt: 'Test',
                })
            ).toThrow('Segment endSeconds must be greater than startSeconds');
        });

        it('should throw error for empty commentary', () => {
            expect(() =>
                createSegment({
                    index: 0,
                    startSeconds: 0,
                    endSeconds: 5,
                    commentary: '   ',
                    imagePrompt: 'Test',
                })
            ).toThrow('Segment commentary cannot be empty');
        });

        it('should throw error for empty imagePrompt', () => {
            expect(() =>
                createSegment({
                    index: 0,
                    startSeconds: 0,
                    endSeconds: 5,
                    commentary: 'Test',
                    imagePrompt: '',
                })
            ).toThrow('Segment imagePrompt cannot be empty');
        });
    });

    describe('getSegmentDuration', () => {
        it('should calculate correct duration', () => {
            const segment: Segment = {
                index: 0,
                startSeconds: 2.5,
                endSeconds: 7.5,
                commentary: 'Test',
                imagePrompt: 'Test',
            };

            expect(getSegmentDuration(segment)).toBe(5);
        });

        it('should handle decimal durations', () => {
            const segment: Segment = {
                index: 0,
                startSeconds: 0,
                endSeconds: 3.7,
                commentary: 'Test',
                imagePrompt: 'Test',
            };

            expect(getSegmentDuration(segment)).toBeCloseTo(3.7);
        });
    });
});
