/**
 * ITranscriptionClient - Port for audio transcription services.
 * Implementations: OpenAITranscriptionClient
 */
export interface ITranscriptionClient {
    /**
     * Transcribes audio from a URL to text.
     * @param audioUrl URL to the audio file
     * @returns Transcribed text
     */
    transcribe(audioUrl: string): Promise<string>;
}
