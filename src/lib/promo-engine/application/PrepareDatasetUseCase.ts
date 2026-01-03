
import { Dataset, DatasetSample } from "../domain/Dataset";
import { IReelRepository } from "../ports/IReelRepository";
import { v4 as uuidv4 } from 'uuid';

export interface PrepareDatasetCommand {
    name: string;
    sourceReelIds?: string[];
    sourceTag?: string;
}

export class PrepareDatasetUseCase {
    constructor(private reelRepository: IReelRepository) { }

    async execute(command: PrepareDatasetCommand): Promise<Dataset> {
        let reels: any[] = [];

        if (command.sourceTag) {
            reels = await this.reelRepository.getReelsByTag(command.sourceTag);
        } else if (command.sourceReelIds && command.sourceReelIds.length > 0) {
            reels = await this.reelRepository.getReelsByIds(command.sourceReelIds);
        } else {
            throw new Error('Either sourceTag or sourceReelIds must be provided');
        }

        if (reels.length === 0) {
            throw new Error(`No reels found for command: ${JSON.stringify(command)}`);
        }

        // Simulating frame extraction: for each reel, create a few mock samples
        const samples: DatasetSample[] = reels.flatMap(reel => [
            { id: uuidv4(), imageUrl: `${reel.url}/frame_1.jpg`, caption: 'frame 1' },
            { id: uuidv4(), imageUrl: `${reel.url}/frame_2.jpg`, caption: 'frame 2' },
            { id: uuidv4(), imageUrl: `${reel.url}/frame_3.jpg`, caption: 'frame 3' },
        ]);

        return new Dataset(
            uuidv4(),
            command.name,
            samples,
            'READY',
            'http://mock-storage.com/dataset.zip'
        );
    }
}
