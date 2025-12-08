import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * High-quality video service that maintains maximum available quality
 */
export class HighQualityVideoService {
  
  /**
   * Process video with quality preservation priority
   */
  static async processForMaxQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    quality?: string;
    method?: string;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      // Handle YouTube URLs with adaptive format selection
      if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/')) {
        return await this.processYouTubeMaxQuality(videoUrl);
      }
      
      // Handle Google Drive URLs
      if (videoUrl.includes('drive.google.com') || videoUrl.includes('docs.google.com')) {
        return await this.processGoogleDriveMaxQuality(videoUrl);
      }
      
      return {
        success: false,
        error: 'Unsupported video URL format'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `High-quality processing failed: ${error}`
      };
    }
  }
  
  /**
   * Process YouTube video with maximum quality retention
   */
  static async processYouTubeMaxQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    quality?: string;
    method?: string;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const ytdl = await import('@distube/ytdl-core');
      const info = await ytdl.default.getInfo(videoUrl);
      
      // Get all available formats for analysis
      const videoFormats = ytdl.default.filterFormats(info.formats, 'videoonly')
        .filter(format => format.height && format.height >= 720)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      
      const audioFormats = ytdl.default.filterFormats(info.formats, 'audioonly')
        .filter(format => format.audioBitrate)
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      
      const combinedFormats = ytdl.default.filterFormats(info.formats, 'videoandaudio')
        .filter(format => format.height && format.height >= 720)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      
      console.log(`📊 QUALITY ANALYSIS FOR ${info.videoDetails.title}:`);
      console.log(`   Best video-only: ${videoFormats[0]?.height || 'None'}p (${videoFormats[0]?.container || 'N/A'})`);
      console.log(`   Best audio-only: ${audioFormats[0]?.audioBitrate || 'None'}kbps`);
      console.log(`   Best combined: ${combinedFormats[0]?.height || 'None'}p (${combinedFormats[0]?.container || 'N/A'})`);
      
      // Check if this video has quality limitations
      const maxAvailableQuality = Math.max(
        videoFormats[0]?.height || 0,
        combinedFormats[0]?.height || 0
      );
      
      if (maxAvailableQuality < 720) {
        console.log(`⚠️ QUALITY WARNING: This video only provides ${maxAvailableQuality}p maximum quality`);
        console.log(`   Recommendation: Use original source file for higher quality uploads`);
      }
      
      // Try adaptive (separate video+audio) for maximum quality
      if (videoFormats.length > 0 && audioFormats.length > 0) {
        const bestVideo = videoFormats[0];
        const bestAudio = audioFormats[0];
        
        if (bestVideo.height && bestVideo.height >= 1080) {
          console.log(`🎯 USING ADAPTIVE DOWNLOAD: ${bestVideo.height}p + ${bestAudio.audioBitrate}kbps`);
          return await this.downloadAdaptiveFormat(videoUrl, bestVideo, bestAudio);
        }
      }
      
      // Fall back to best combined format
      if (combinedFormats.length > 0) {
        const bestCombined = combinedFormats[0];
        console.log(`🎯 USING COMBINED FORMAT: ${bestCombined.height}p`);
        return await this.downloadCombinedFormat(videoUrl, bestCombined);
      }
      
      // Final fallback - use existing VideoProcessor
      console.log(`⚠️ QUALITY LIMITED: Using standard download`);
      const { VideoProcessor } = await import('./videoProcessor');
      const result = await VideoProcessor.processVideo(videoUrl);
      
      if (result.success && result.filePath) {
        const stats = statSync(result.filePath);
        return {
          success: true,
          filePath: result.filePath,
          originalSize: stats.size,
          quality: 'Standard',
          method: 'fallback',
          cleanup: result.cleanup
        };
      }
      
      return {
        success: false,
        error: 'All quality download methods failed'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `YouTube max quality processing failed: ${error}`
      };
    }
  }
  
  /**
   * Download adaptive format (separate video + audio) for maximum quality
   */
  static async downloadAdaptiveFormat(videoUrl: string, videoFormat: any, audioFormat: any) {
    try {
      const videoId = this.extractVideoId(videoUrl);
      const timestamp = Date.now();
      
      const videoPath = `/tmp/hq_video_${videoId}_${timestamp}.mp4`;
      const audioPath = `/tmp/hq_audio_${videoId}_${timestamp}.m4a`;
      const outputPath = `/tmp/hq_merged_${videoId}_${timestamp}.mp4`;
      
      const ytdl = await import('@distube/ytdl-core');
      const { createWriteStream } = await import('fs');
      const { pipeline } = await import('stream/promises');
      
      // Download video stream
      console.log('📹 DOWNLOADING HIGH-QUALITY VIDEO...');
      const videoStream = ytdl.default(videoUrl, { format: videoFormat });
      const videoWriteStream = createWriteStream(videoPath);
      await pipeline(videoStream, videoWriteStream);
      
      // Download audio stream
      console.log('🎵 DOWNLOADING HIGH-QUALITY AUDIO...');
      const audioStream = ytdl.default(videoUrl, { format: audioFormat });
      const audioWriteStream = createWriteStream(audioPath);
      await pipeline(audioStream, audioWriteStream);
      
      // Merge with FFmpeg
      console.log('🔀 MERGING HIGH-QUALITY STREAMS...');
      const { spawn } = await import('child_process');
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoPath,
          '-i', audioPath,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg merge failed: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      const stats = statSync(outputPath);
      
      const cleanup = () => {
        [videoPath, audioPath, outputPath].forEach(path => {
          if (existsSync(path)) unlinkSync(path);
        });
        console.log('🗑️ HIGH-QUALITY FILES CLEANED');
      };
      
      return {
        success: true,
        filePath: outputPath,
        originalSize: stats.size,
        quality: `${videoFormat.height}p`,
        method: 'adaptive',
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Adaptive download failed: ${error}`
      };
    }
  }
  
  /**
   * Download combined format
   */
  static async downloadCombinedFormat(videoUrl: string, format: any) {
    try {
      const videoId = this.extractVideoId(videoUrl);
      const outputPath = `/tmp/hq_combined_${videoId}_${Date.now()}.mp4`;
      
      const ytdl = await import('@distube/ytdl-core');
      const { createWriteStream } = await import('fs');
      const { pipeline } = await import('stream/promises');
      
      console.log(`📡 DOWNLOADING COMBINED: ${format.height}p`);
      const stream = ytdl.default(videoUrl, { format });
      const writeStream = createWriteStream(outputPath);
      await pipeline(stream, writeStream);
      
      const stats = statSync(outputPath);
      
      const cleanup = () => {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
          console.log('🗑️ COMBINED VIDEO CLEANED');
        }
      };
      
      return {
        success: true,
        filePath: outputPath,
        originalSize: stats.size,
        quality: `${format.height}p`,
        method: 'combined',
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Combined download failed: ${error}`
      };
    }
  }
  
  /**
   * Process Google Drive maintaining original quality
   */
  static async processGoogleDriveMaxQuality(videoUrl: string) {
    try {
      const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        return {
          success: false,
          error: 'Invalid Google Drive URL format'
        };
      }
      
      const fileId = fileIdMatch[1];
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      
      console.log('📥 DOWNLOADING ORIGINAL QUALITY from Google Drive...');
      
      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        return {
          success: false,
          error: `Google Drive access failed (${response.status}). Ensure file is shared publicly.`
        };
      }
      
      const tempPath = `/tmp/gdrive_max_quality_${fileId}_${Date.now()}.mp4`;
      const { createWriteStream } = await import('fs');
      const { pipeline } = await import('stream/promises');
      
      const fileStream = createWriteStream(tempPath);
      await pipeline(response.body, fileStream);
      
      const stats = statSync(tempPath);
      
      if (stats.size === 0) {
        unlinkSync(tempPath);
        return {
          success: false,
          error: 'Google Drive video is empty. Check sharing permissions.'
        };
      }
      
      const cleanup = () => {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
          console.log('🗑️ GOOGLE DRIVE VIDEO CLEANED');
        }
      };
      
      return {
        success: true,
        filePath: tempPath,
        originalSize: stats.size,
        quality: 'Original',
        method: 'direct',
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Google Drive processing failed: ${error}`
      };
    }
  }
  
  /**
   * Extract YouTube video ID
   */
  static extractVideoId(url: string): string {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return 'unknown';
  }
}