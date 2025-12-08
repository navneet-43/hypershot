import { spawn } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export interface VideoInfo {
  codec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  bitrate?: number;
  aspectRatio?: number;
  pixelFormat?: string;
}

export interface ProcessingResult {
  success: boolean;
  needsProcessing: boolean;
  outputPath?: string;
  error?: string;
  originalInfo?: VideoInfo;
  processedInfo?: VideoInfo;
}

/**
 * Instagram Video Processor
 * Ensures videos meet Instagram's strict format requirements
 * 
 * Instagram Requirements:
 * - Codec: H.264
 * - Audio: AAC
 * - Pixel Format: yuv420p
 * - Frame Rate: 23-60 FPS
 * - Aspect Ratio: 4:5 to 1.91:1 (vertical to horizontal)
 * - Max Duration: 60 seconds (Reels), 60 minutes (regular video)
 * - Max File Size: 100MB
 */
export class InstagramVideoProcessor {
  private static readonly INSTAGRAM_VIDEO_REQUIREMENTS = {
    codec: 'h264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    minFPS: 23,
    maxFPS: 60,
    minAspectRatio: 0.5, // 9:16 (Reels format) = 0.5625
    maxAspectRatio: 1.91, // 1.91:1 (landscape)
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxDuration: 60 * 60, // 60 minutes
    targetBitrate: '8M', // Higher quality - preserve original quality
    targetAudioBitrate: '256k' // Higher audio quality
  };

  /**
   * Get video information using FFprobe
   */
  static async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const { stdout } = await execPromise(command);
      const data = JSON.parse(stdout);
      
      const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
      const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');
      
      if (!videoStream) {
        throw new Error('No video stream found');
      }

      const width = videoStream.width;
      const height = videoStream.height;
      const aspectRatio = width && height ? width / height : undefined;
      
      // Parse FPS from r_frame_rate (e.g., "30/1" or "30000/1001")
      let fps = undefined;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? num / den : num;
      }

      const info: VideoInfo = {
        codec: videoStream.codec_name?.toLowerCase(),
        audioCodec: audioStream?.codec_name?.toLowerCase(),
        width,
        height,
        fps: fps ? Math.round(fps) : undefined,
        duration: parseFloat(data.format.duration || videoStream.duration || 0),
        bitrate: parseInt(data.format.bit_rate || videoStream.bit_rate || 0),
        aspectRatio,
        pixelFormat: videoStream.pix_fmt?.toLowerCase()
      };

      console.log('📊 Video Info:', {
        codec: info.codec,
        audioCodec: info.audioCodec,
        resolution: `${width}x${height}`,
        fps: info.fps,
        duration: `${Math.round(info.duration || 0)}s`,
        aspectRatio: aspectRatio?.toFixed(2),
        pixelFormat: info.pixelFormat
      });

      return info;
    } catch (error) {
      console.error('❌ Error getting video info:', error);
      throw error;
    }
  }

  /**
   * Check if video needs processing for Instagram
   */
  static needsProcessing(info: VideoInfo): { needs: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const req = this.INSTAGRAM_VIDEO_REQUIREMENTS;

    // Check codec
    if (info.codec !== req.codec) {
      reasons.push(`Codec ${info.codec} (needs ${req.codec})`);
    }

    // Check audio codec (if audio exists)
    if (info.audioCodec && info.audioCodec !== req.audioCodec) {
      reasons.push(`Audio codec ${info.audioCodec} (needs ${req.audioCodec})`);
    }

    // Check pixel format
    if (info.pixelFormat && info.pixelFormat !== req.pixelFormat) {
      reasons.push(`Pixel format ${info.pixelFormat} (needs ${req.pixelFormat})`);
    }

    // Check FPS
    if (info.fps && (info.fps < req.minFPS || info.fps > req.maxFPS)) {
      reasons.push(`FPS ${info.fps} (needs ${req.minFPS}-${req.maxFPS})`);
    }

    // Check aspect ratio
    if (info.aspectRatio && (info.aspectRatio < req.minAspectRatio || info.aspectRatio > req.maxAspectRatio)) {
      reasons.push(`Aspect ratio ${info.aspectRatio.toFixed(2)} (needs ${req.minAspectRatio}-${req.maxAspectRatio})`);
    }

    return {
      needs: reasons.length > 0,
      reasons
    };
  }

  /**
   * Process video to meet Instagram requirements
   * PRODUCTION-SAFE: Falls back to original video if processing fails
   */
  static async processForInstagram(inputPath: string): Promise<ProcessingResult> {
    let outputPath: string | undefined;
    
    try {
      console.log('🔍 Analyzing video for Instagram compatibility...');
      
      // Check if file exists
      if (!existsSync(inputPath)) {
        console.error('❌ Input video file does not exist:', inputPath);
        return {
          success: false,
          needsProcessing: false,
          error: 'Input video file not found'
        };
      }
      
      // Get video info - with fallback for production
      let originalInfo: VideoInfo;
      try {
        originalInfo = await this.getVideoInfo(inputPath);
      } catch (ffprobeError) {
        console.warn('⚠️ FFprobe analysis failed, proceeding with original video:', ffprobeError);
        // If we can't analyze the video, assume it's good and let Instagram handle it
        return {
          success: true,
          needsProcessing: false,
          outputPath: inputPath,
          originalInfo: {}
        };
      }
      
      // Check if processing is needed
      const { needs, reasons } = this.needsProcessing(originalInfo);
      
      if (!needs) {
        console.log('✅ Video already meets Instagram requirements - no processing needed');
        return {
          success: true,
          needsProcessing: false,
          outputPath: inputPath,
          originalInfo
        };
      }

      console.log('🔧 Video needs processing for Instagram:', reasons.join(', '));
      
      // Generate output path
      const timestamp = Date.now();
      outputPath = inputPath.replace(/\.(mp4|mov|avi)$/i, `_instagram_${timestamp}.mp4`);
      
      // Build FFmpeg command for Instagram compatibility
      const ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium', // Balance between speed and quality
        '-crf', '23', // Good quality
        '-maxrate', this.INSTAGRAM_VIDEO_REQUIREMENTS.targetBitrate,
        '-bufsize', '4M',
        '-pix_fmt', 'yuv420p', // Required by Instagram
        '-c:a', 'aac',
        '-b:a', this.INSTAGRAM_VIDEO_REQUIREMENTS.targetAudioBitrate,
        '-ar', '48000', // 48kHz audio sample rate
        '-movflags', '+faststart', // Optimize for streaming
        '-r', '30', // 30 FPS (safe for Instagram)
        '-y', // Overwrite output
        outputPath
      ];

      // Note: We no longer force aspect ratio changes since Instagram Reels support 9:16 (0.5625)
      // Only log a warning for extreme aspect ratios
      if (originalInfo.aspectRatio) {
        if (originalInfo.aspectRatio < this.INSTAGRAM_VIDEO_REQUIREMENTS.minAspectRatio) {
          console.log('⚠️ Video has unusual aspect ratio (very vertical), proceeding anyway');
        } else if (originalInfo.aspectRatio > this.INSTAGRAM_VIDEO_REQUIREMENTS.maxAspectRatio) {
          console.log('⚠️ Video has unusual aspect ratio (very horizontal), proceeding anyway');
        }
      }

      console.log('🎬 Processing video with FFmpeg...');
      console.log('📝 Command:', 'ffmpeg', ffmpegArgs.join(' '));

      // Run FFmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        
        let errorOutput = '';

        ffmpegProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          // Log progress
          const progressMatch = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
          if (progressMatch) {
            process.stdout.write(`\r⏳ Processing: ${progressMatch[1]}`);
          }
        });

        ffmpegProcess.on('close', (code) => {
          console.log(''); // New line after progress
          if (code === 0) {
            console.log('✅ FFmpeg processing complete');
            resolve();
          } else {
            console.error('❌ FFmpeg failed with code:', code);
            console.error('Error output:', errorOutput);
            reject(new Error(`FFmpeg failed with code ${code}`));
          }
        });

        ffmpegProcess.on('error', (error) => {
          console.error('❌ FFmpeg process error:', error);
          reject(error);
        });
      });

      // Verify output file exists and get info
      if (!existsSync(outputPath)) {
        throw new Error('FFmpeg did not produce output file');
      }

      const stats = statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);
      console.log(`📦 Processed video size: ${sizeMB.toFixed(2)}MB`);

      // Check if still too large
      if (stats.size > this.INSTAGRAM_VIDEO_REQUIREMENTS.maxFileSize) {
        console.warn('⚠️ Processed video still exceeds 100MB limit - may fail on Instagram');
      }

      const processedInfo = await this.getVideoInfo(outputPath);
      
      return {
        success: true,
        needsProcessing: true,
        outputPath,
        originalInfo,
        processedInfo
      };
    } catch (error) {
      // Clean up output file on error
      if (outputPath && existsSync(outputPath)) {
        try {
          unlinkSync(outputPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      console.error('❌ Video processing failed:', error);
      return {
        success: false,
        needsProcessing: true,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      };
    }
  }

  /**
   * Quick check if FFmpeg is available
   */
  static async checkFFmpegAvailable(): Promise<boolean> {
    try {
      await execPromise('ffmpeg -version');
      return true;
    } catch {
      return false;
    }
  }
}
