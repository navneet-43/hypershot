import { spawn } from 'child_process';
import { existsSync } from 'fs';

interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  format: string;
  aspectRatio: number;
}

interface ReelsValidationResult {
  isValid: boolean;
  videoInfo?: VideoInfo;
  error?: string;
  needsUpscaling?: boolean;
  recommendations?: string[];
}

/**
 * Facebook Reels Validator
 * Validates video requirements and suggests fixes
 */
export class ReelsValidator {
  
  // Facebook Reels requirements
  static readonly MIN_HEIGHT = 960; // Minimum height for Reels
  static readonly MIN_WIDTH = 540;  // Minimum width for Reels
  static readonly PREFERRED_ASPECT_RATIO = 9/16; // 9:16 aspect ratio
  static readonly MIN_DURATION = 3; // 3 seconds
  static readonly MAX_DURATION = 90; // 90 seconds
  static readonly MAX_SIZE_MB = 250; // 250MB max
  
  /**
   * Get video information using FFprobe
   */
  static async getVideoInfo(filePath: string): Promise<VideoInfo | null> {
    if (!existsSync(filePath)) {
      console.log('❌ Video file not found for analysis');
      return null;
    }
    
    console.log('🔍 Analyzing video with FFprobe...');
    
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);
      
      let output = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          console.log('❌ FFprobe failed');
          resolve(null);
          return;
        }
        
        try {
          const info = JSON.parse(output);
          const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
          
          if (!videoStream) {
            console.log('❌ No video stream found');
            resolve(null);
            return;
          }
          
          const width = parseInt(videoStream.width);
          const height = parseInt(videoStream.height);
          const duration = parseFloat(info.format.duration || '0');
          const format = info.format.format_name || 'unknown';
          const aspectRatio = width / height;
          
          console.log(`📊 Video analysis: ${width}x${height}, ${duration}s, ${format}, aspect ${aspectRatio.toFixed(3)}`);
          
          resolve({
            width,
            height,
            duration,
            format,
            aspectRatio
          });
          
        } catch (error) {
          console.log('❌ Failed to parse FFprobe output:', error);
          resolve(null);
        }
      });
      
      ffprobe.on('error', (error) => {
        console.log('❌ FFprobe error:', error);
        resolve(null);
      });
    });
  }
  
  /**
   * Validate video for Facebook Reels requirements
   */
  static async validateForReels(filePath: string): Promise<ReelsValidationResult> {
    console.log('🎬 VALIDATING VIDEO FOR FACEBOOK REELS...');
    
    const videoInfo = await this.getVideoInfo(filePath);
    
    if (!videoInfo) {
      return {
        isValid: false,
        error: 'Unable to analyze video file',
        recommendations: ['Check if file is a valid video format', 'Try a different video file']
      };
    }
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    let needsUpscaling = false;
    
    // Check height requirement
    if (videoInfo.height < this.MIN_HEIGHT) {
      issues.push(`Height ${videoInfo.height}px is below minimum ${this.MIN_HEIGHT}px`);
      recommendations.push(`Upscale video to minimum ${this.MIN_WIDTH}x${this.MIN_HEIGHT} resolution`);
      needsUpscaling = true;
    }
    
    // Check width requirement
    if (videoInfo.width < this.MIN_WIDTH) {
      issues.push(`Width ${videoInfo.width}px is below minimum ${this.MIN_WIDTH}px`);
      needsUpscaling = true;
    }
    
    // Check duration
    if (videoInfo.duration < this.MIN_DURATION) {
      issues.push(`Duration ${videoInfo.duration}s is below minimum ${this.MIN_DURATION}s`);
      recommendations.push('Video must be at least 3 seconds long');
    }
    
    if (videoInfo.duration > this.MAX_DURATION) {
      issues.push(`Duration ${videoInfo.duration}s exceeds maximum ${this.MAX_DURATION}s`);
      recommendations.push('Video must be 90 seconds or shorter');
    }
    
    // Check aspect ratio (allow some tolerance)
    const aspectDiff = Math.abs(videoInfo.aspectRatio - this.PREFERRED_ASPECT_RATIO);
    if (aspectDiff > 0.1) {
      issues.push(`Aspect ratio ${videoInfo.aspectRatio.toFixed(3)} differs from preferred 9:16 (${this.PREFERRED_ASPECT_RATIO.toFixed(3)})`);
      recommendations.push('Consider using 9:16 aspect ratio for optimal Reels display');
    }
    
    // Results
    if (issues.length === 0) {
      console.log('✅ VIDEO MEETS ALL FACEBOOK REELS REQUIREMENTS');
      return {
        isValid: true,
        videoInfo
      };
    } else {
      console.log('❌ VIDEO DOES NOT MEET REELS REQUIREMENTS:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      
      return {
        isValid: false,
        videoInfo,
        error: `Video validation failed: ${issues.join(', ')}`,
        needsUpscaling,
        recommendations
      };
    }
  }
  
  /**
   * Upscale video to meet minimum Reels requirements
   */
  static async upscaleForReels(inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    error?: string;
    cleanup?: () => void;
  }> {
    const outputPath = inputPath.replace(/\.(mp4|avi|mov|wmv)$/i, '_reels_upscaled.mp4');
    
    console.log(`📈 UPSCALING VIDEO FOR REELS: ${inputPath} -> ${outputPath}`);
    console.log(`🎯 Target: minimum ${this.MIN_WIDTH}x${this.MIN_HEIGHT}, 9:16 aspect ratio`);
    
    // Use scale filter to upscale to minimum requirements while maintaining aspect ratio
    const ffmpegArgs = [
      '-i', inputPath,
      '-vf', `scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18', // Higher quality for upscaling
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];
    
    console.log('🎬 Upscaling with FFmpeg:', ffmpegArgs.join(' '));
    
    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.stderr.on('data', (data) => {
          console.log('FFmpeg:', data.toString().trim());
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Video upscaling completed successfully');
            resolve();
          } else {
            reject(new Error(`Upscaling failed with code: ${code}`));
          }
        });
        
        ffmpeg.on('error', (error) => {
          reject(error);
        });
      });
      
      if (!existsSync(outputPath)) {
        return { success: false, error: 'Upscaling failed - no output file' };
      }
      
      const cleanup = () => {
        if (existsSync(outputPath)) {
          const fs = require('fs');
          fs.unlinkSync(outputPath);
        }
      };
      
      return {
        success: true,
        outputPath,
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Upscaling failed: ${error}`
      };
    }
  }
  
  /**
   * Check if video needs processing before upload
   */
  static async shouldSkipProcessing(filePath: string): Promise<{
    shouldSkip: boolean;
    reason?: string;
  }> {
    const validation = await this.validateForReels(filePath);
    
    if (validation.isValid) {
      return {
        shouldSkip: true,
        reason: 'Video already meets all Facebook Reels requirements'
      };
    }
    
    if (validation.needsUpscaling) {
      return {
        shouldSkip: false,
        reason: 'Video needs upscaling to meet minimum height requirement'
      };
    }
    
    return {
      shouldSkip: false,
      reason: 'Video needs processing for Reels compatibility'
    };
  }
}