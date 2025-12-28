import { StockImageClient } from '../../../src/infrastructure/images/StockImageClient';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StockImageClient', () => {
    let client: StockImageClient;
    const apiKey = 'test_pixabay_key';

    beforeEach(() => {
        client = new StockImageClient(apiKey);
        jest.clearAllMocks();
    });

    it('should throw if api key is missing', () => {
        expect(() => new StockImageClient('')).toThrow('Stock API key is required');
    });

    it('should clean simple prompts', async () => {
        // Mock success response
        mockedAxios.get.mockResolvedValue({
            data: {
                hits: [
                    { largeImageURL: 'http://img1.com', webformatURL: 'http://web1.com' }
                ]
            }
        });

        const result = await client.generateImage('Create an image of a sunset');

        expect(mockedAxios.get).toHaveBeenCalledWith('https://pixabay.com/api/', expect.objectContaining({
            params: expect.objectContaining({
                q: 'sunset' // cleaned
            })
        }));
        expect(result.imageUrl).toBe('http://img1.com');
        expect(result.revisedPrompt).toContain('sunset');
    });

    it('should clean complex prompts', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { hits: [{ largeImageURL: 'url' }] }
        });

        const complex = 'A cinematic, high quality, realistic 8k photo of a dog running on the beach under the moonlight.';
        // Expected cleaning: removes modifiers, keeps core nouns/verbs roughly
        // The implementation removes "photo of", "cinematic", "high quality", etc.
        // It does NOT do NLP noun extraction, so it will leave "dog running on the beach under the moonlight"

        await client.generateImage(complex);

        // We check what the actual implementation produced (stripping punctuation/modifiers)
        const lastCall = mockedAxios.get.mock.calls[0][1];
        const query = lastCall?.params.q;

        expect(query).not.toContain('cinematic');
        expect(query).not.toContain('8k');
        expect(query).toContain('dog running');
    });

    it('should retry with broader query if no results found', async () => {
        // First call returns empty
        mockedAxios.get.mockResolvedValueOnce({ data: { hits: [] } });
        // Second call (retry) returns hit
        mockedAxios.get.mockResolvedValueOnce({
            data: { hits: [{ largeImageURL: 'http://fallback.com' }] }
        });

        const result = await client.generateImage('a very specific query that yields nothing');

        expect(mockedAxios.get).toHaveBeenCalledTimes(2);

        // Assert return is from second call
        expect(result.imageUrl).toBe('http://fallback.com');
    });

    it('should throw error if both attempts fail', async () => {
        mockedAxios.get.mockResolvedValue({ data: { hits: [] } });

        await expect(client.generateImage('nothing found')).rejects.toThrow('No images found on Stock for query');
    });
});
