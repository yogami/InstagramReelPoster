import 'dotenv/config';
import { FishAudioTtsClient } from './src/infrastructure/tts/FishAudioTtsClient';
import fs from 'fs';
import path from 'path';

const pubDir = path.resolve('scripts/remotion-puppet/public');
const maleId = process.env.FISH_AUDIO_SCENARIO_MALE_VOICE_ID!;
const femaleId = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID!;
const apiKey = process.env.FISH_AUDIO_API_KEY!;

async function gen(text: string, voiceId: string, filename: string) {
  const tts = new FishAudioTtsClient(apiKey, voiceId);
  const result = await tts.synthesize(text);
  const buf = Buffer.from(result.audioUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(pubDir, filename), buf);
  console.log(`${filename}: ${result.durationSeconds.toFixed(1)}s`);
  return result.durationSeconds;
}

async function main() {
  console.log('Male voice:', maleId?.substring(0, 8));
  console.log('Female voice:', femaleId?.substring(0, 8));

  const d1 = await gen('You ever think about how we spend our whole lives chasing something... and then when we get it, we just want more?', maleId, 'test_marco_1.mp3');
  const d2 = await gen('Maybe that is the point though. It is not about arriving. It is about the chase itself.', femaleId, 'test_luna_1.mp3');
  const d3 = await gen('That sounds like something from a fortune cookie, Luna.', maleId, 'test_marco_2.mp3');
  const d4 = await gen('Well maybe you should read more fortune cookies and fewer self-help books.', femaleId, 'test_luna_2.mp3');

  const FPS = 30;
  const GAP = 12;
  let f = 15;
  const timeline: any[] = [];
  
  timeline.push({ speaker: 'marco', line: 'You ever think about how we spend our whole lives chasing something... and then when we get it, we just want more?', audioFile: 'test_marco_1.mp3', startFrame: f, durationFrames: Math.ceil(d1 * FPS) });
  f += Math.ceil(d1 * FPS) + GAP;
  timeline.push({ speaker: 'luna', line: 'Maybe that is the point though. It is not about arriving. It is about the chase itself.', audioFile: 'test_luna_1.mp3', startFrame: f, durationFrames: Math.ceil(d2 * FPS) });
  f += Math.ceil(d2 * FPS) + GAP;
  timeline.push({ speaker: 'marco', line: 'That sounds like something from a fortune cookie, Luna.', audioFile: 'test_marco_2.mp3', startFrame: f, durationFrames: Math.ceil(d3 * FPS) });
  f += Math.ceil(d3 * FPS) + GAP;
  timeline.push({ speaker: 'luna', line: 'Well maybe you should read more fortune cookies and fewer self-help books.', audioFile: 'test_luna_2.mp3', startFrame: f, durationFrames: Math.ceil(d4 * FPS) });

  console.log('\nTIMELINE:');
  console.log(JSON.stringify(timeline));
}

main().catch(console.error);
