
import { IReelRepository, ReelData } from "../ports/IReelRepository";

export class MockReelRepository implements IReelRepository {
    private reels: Map<string, ReelData> = new Map();

    async addMockReel(reel: ReelData): Promise<void> {
        this.reels.set(reel.id, reel);
    }

    async getReelsByIds(ids: string[]): Promise<ReelData[]> {
        return ids.map(id => this.reels.get(id)).filter((reel): reel is ReelData => !!reel);
    }

    async getReelsFromFolder(folder: string): Promise<ReelData[]> {
        // Return all for mock
        return Array.from(this.reels.values());
    }

    async getReelsByTag(tag: string): Promise<ReelData[]> {
        // Return all for mock, simulating tag match
        return Array.from(this.reels.values());
    }
}
