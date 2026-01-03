
export interface DatasetSample {
    id: string;
    imageUrl: string;
    caption?: string;
}

export class Dataset {
    constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly samples: DatasetSample[],
        public readonly status: 'CREATED' | 'PROCESSING' | 'READY' | 'FAILED',
        public readonly trainingDataUrl?: string
    ) { }
}
