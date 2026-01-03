
import { v2 as cloudinary } from 'cloudinary';
import { IReelRepository, ReelData } from "../ports/IReelRepository";
import { getConfig } from '../../../config';

export class CloudinaryReelRepository implements IReelRepository {
    constructor() {
        const config = getConfig();
        cloudinary.config({
            cloud_name: config.cloudinaryCloudName,
            api_key: config.cloudinaryApiKey,
            api_secret: config.cloudinaryApiSecret,
            secure: true,
        });
    }

    async getReelsByIds(ids: string[]): Promise<ReelData[]> {
        // Cloudinary doesn't have a bulk get by ID that returns resource info easily same as Search
        // But we can iterate or use search with OR
        if (ids.length === 0) return [];

        const expression = ids.map(id => `public_id:${id}`).join(' OR ');

        try {
            const result = await cloudinary.search
                .expression(expression)
                .execute();

            return result.resources.map((res: any) => ({
                id: res.public_id,
                url: res.secure_url,
                // Add more metadata if needed
            }));
        } catch (error) {
            console.error('Error fetching reels by IDs from Cloudinary:', error);
            return [];
        }
    }

    async getReelsFromFolder(folder: string): Promise<ReelData[]> {
        try {
            // Using Search API to find resources in folder
            const result = await cloudinary.search
                .expression(`folder:${folder} AND resource_type:video`)
                .sort_by('created_at', 'desc')
                .max_results(100)
                .execute();

            return result.resources.map((res: any) => ({
                id: res.public_id,
                url: res.secure_url,
            }));
        } catch (error) {
            console.error(`Error fetching reels from folder ${folder}:`, error);
            throw error;
        }
    }

    async getReelsByTag(tag: string): Promise<ReelData[]> {
        try {
            // Using Search API to find resources by tag
            // tags include 'tagname'
            const result = await cloudinary.search
                .expression(`tags:${tag} AND resource_type:video`)
                .sort_by('created_at', 'desc')
                .max_results(100)
                .execute();

            return result.resources.map((res: any) => ({
                id: res.public_id,
                url: res.secure_url,
            }));
        } catch (error) {
            console.error(`Error fetching reels with tag ${tag}:`, error);
            throw error;
        }
    }
}
