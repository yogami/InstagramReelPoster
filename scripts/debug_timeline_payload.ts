import { TimelineVideoRenderer } from '../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../src/domain/entities/ReelManifest';
import * as fs from 'fs';

const manifest: ReelManifest = {
    durationSeconds: 15,
    voiceoverUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp3',
    musicUrl: 'https://res.cloudinary.com/demo/video/upload/bumblebee.mp3',
    musicDurationSeconds: 15,
    subtitlesUrl: '',
    segments: [
        {
            index: 0,
            imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            caption: 'First scene',
            start: 0,
            end: 7.5
        },
        {
            index: 1,
            imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
            caption: 'Last scene',
            start: 7.5,
            end: 15
        }
    ],
    logoUrl: 'https://res.cloudinary.com/demo/image/upload/sample_logo.png',
    logoPosition: 'overlay',
    branding: {
        logoUrl: 'https://res.cloudinary.com/demo/image/upload/sample_logo.png',
        businessName: 'Test Business',
        address: 'Friedrichstraße 123, 10117 Berlin',
        phone: '+49 30 12345678',
        email: 'test@example.com'
    }
};

const renderer = new TimelineVideoRenderer('dummy-key');
const timelineEdit = (renderer as any).mapManifestToTimelineEdit(manifest);

console.log('\n=== TIMELINE EDIT PAYLOAD ===\n');
console.log(JSON.stringify(timelineEdit, null, 2));

// Save to file for inspection
fs.writeFileSync('timeline_payload.json', JSON.stringify(timelineEdit, null, 2));
console.log('\n✅ Saved to timeline_payload.json');

// Check branding track specifically
const brandingTrack = (renderer as any).createBrandingTrack(manifest);
if (brandingTrack) {
    console.log('\n=== BRANDING TRACK ===\n');
    console.log('Start:', brandingTrack.clips[0].start);
    console.log('Length:', brandingTrack.clips[0].length);
    console.log('Position:', brandingTrack.clips[0].position);
    console.log('HTML Preview:', brandingTrack.clips[0].asset.html.substring(0, 200));
} else {
    console.log('\n❌ NO BRANDING TRACK CREATED');
}
