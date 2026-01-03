
export interface ReelData {
    id: string;
    url: string;
    // Add other relevant metadata here
}

export interface IReelRepository {
    getReelsByIds(ids: string[]): Promise<ReelData[]>;
    getReelsFromFolder(folder: string): Promise<ReelData[]>;
    getReelsByTag(tag: string): Promise<ReelData[]>;
}
