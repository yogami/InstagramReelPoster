import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Mock the 'beam' module which only exists in the cloud environment
sys.modules['beam'] = MagicMock()

# Now we can import the render script
from scripts.beam_ffmpeg_render import build_ffmpeg_command, get_duration

class TestFFmpegRender(unittest.TestCase):

    def test_build_ffmpeg_command_with_music(self):
        # Scenario: Voiceover + Music + Subtitles + Logo
        voiceover_path = "/tmp/vo.mp3"
        voiceover_duration = 30.0
        music_path = "/tmp/music.mp3"
        subtitles_path = "/tmp/subs.srt"
        video_paths = []
        image_paths = [
            {'path': '/tmp/img1.png', 'start': 0, 'end': 30}
        ]
        logo_path = "/tmp/logo.png"
        logo_position = "end"
        total_duration = 30.0
        output_path = "/tmp/out.mp4"

        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            voiceover_duration=voiceover_duration,
            music_path=music_path,
            subtitles_path=subtitles_path,
            video_paths=video_paths,
            image_paths=image_paths,
            logo_path=logo_path,
            logo_position=logo_position,
            total_duration=total_duration,
            output_path=output_path
        )

        # Assertions
        cmd_str = " ".join(cmd)
        
        # Verify inputs
        self.assertIn("-i /tmp/vo.mp3", cmd_str)
        self.assertIn("-stream_loop -1 -i /tmp/music.mp3", cmd_str)
        
        # Verify Cinematic Ducking elements in filter_complex
        # [bg_standard][vo_standard]sidechaincompress=threshold=0.1:ratio=4:attack=50:release=500[bg_ducked]
        self.assertIn("sidechaincompress", cmd_str)
        self.assertIn("threshold=0.1", cmd_str)
        
        # Verify amix duration=first (The Fix!)
        self.assertIn("amix=inputs=2:duration=first", cmd_str)
        
        # Verify output mapping - either vbase or vburned (if subtitles present)
        v_tag = "[vburned]" if subtitles_path else "[vbase]"
        self.assertIn(f"-map {v_tag}", cmd_str)
        self.assertIn("-map [a_mixed]", cmd_str)

    def test_build_ffmpeg_command_voice_only(self):
        # Scenario: Voiceover only (no music)
        voiceover_path = "/tmp/vo.mp3"
        voiceover_duration = 10.0
        music_path = None
        subtitles_path = None
        video_paths = []
        image_paths = [{'path': '/tmp/img1.png', 'start': 0, 'end': 10}]
        logo_path = None
        logo_position = None
        total_duration = 10.0
        output_path = "/tmp/out.mp4"

        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            voiceover_duration=voiceover_duration,
            music_path=music_path,
            subtitles_path=subtitles_path,
            video_paths=video_paths,
            image_paths=image_paths,
            logo_path=logo_path,
            logo_position=logo_position,
            total_duration=total_duration,
            output_path=output_path
        )

        cmd_str = " ".join(cmd)
        
        # Verify no sidechain or amix
        self.assertNotIn("sidechaincompress", cmd_str)
        self.assertNotIn("amix", cmd_str)
        # Verify audio tag mapping
        self.assertIn("-map [vo_standard]", cmd_str)

    @patch('subprocess.run')
    def test_get_duration(self, mock_run):
        # Mock ffprobe output
        mock_run.return_value = MagicMock(stdout="45.67\n", returncode=0)
        
        duration = get_duration("/tmp/test.mp3")
        
        self.assertEqual(duration, 45.67)
        mock_run.assert_called_with(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', '/tmp/test.mp3'],
            capture_output=True, text=True, check=True
        )

if __name__ == '__main__':
    unittest.main()
