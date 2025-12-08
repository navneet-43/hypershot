import { existsSync, unlinkSync, statSync, createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Multiple solutions for handling large video files while ensuring actual video uploads
 */
export class LargeVideoSolutionsService {
  
  /**
   * Solution 1: Smart Segmentation - Split large videos into smaller segments
   */
  static async segmentLargeVideo(filePath: string, maxSizeMB: number = 50): Promise<{
    success: boolean;
    segments?: string[];
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const stats = statSync(filePath);
      const fileSizeMB = stats.size / 1024 / 1024;
      
      if (fileSizeMB <= maxSizeMB) {
        return {
          success: true,
          segments: [filePath],
          cleanup: () => {}
        };
      }
      
      console.log(`📹 SEGMENTING LARGE VIDEO: ${fileSizeMB.toFixed(2)}MB into ${maxSizeMB}MB segments`);
      
      const ffmpeg = await import('fluent-ffmpeg');
      const segmentDuration = Math.ceil((maxSizeMB / fileSizeMB) * 180); // Estimate duration per segment
      const outputPattern = `/tmp/segment_%03d_${Date.now()}.mp4`;
      
      await new Promise((resolve, reject) => {
        ffmpeg.default(filePath)
          .outputOptions([
            '-c copy', // Copy without re-encoding to maintain quality
            '-map 0',
            '-segment_time', segmentDuration.toString(),
            '-f segment',
            '-reset_timestamps 1'
          ])
          .output(outputPattern)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // Find created segments
      const segments: string[] = [];
      let segmentIndex = 0;
      while (true) {
        const segmentPath = `/tmp/segment_${segmentIndex.toString().padStart(3, '0')}_${Date.now()}.mp4`;
        if (existsSync(segmentPath)) {
          segments.push(segmentPath);
          segmentIndex++;
        } else {
          break;
        }
      }
      
      console.log(`✅ VIDEO SEGMENTED: Created ${segments.length} segments`);
      
      return {
        success: true,
        segments,
        cleanup: () => {
          segments.forEach(segment => {
            if (existsSync(segment)) {
              unlinkSync(segment);
            }
          });
          console.log('🗑️ VIDEO SEGMENTS CLEANED');
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Video segmentation failed: ${error}`
      };
    }
  }
  
  /**
   * Solution 2: Quality-Preserving Compression - Reduce file size while maintaining visual quality
   */
  static async compressForFacebookUpload(filePath: string): Promise<{
    success: boolean;
    compressedPath?: string;
    originalSize?: number;
    compressedSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const stats = statSync(filePath);
      const originalSizeMB = stats.size / 1024 / 1024;
      
      console.log(`🔧 QUALITY-PRESERVING COMPRESSION: ${originalSizeMB.toFixed(2)}MB`);
      
      const compressedPath = `/tmp/compressed_quality_${Date.now()}.mp4`;
      const ffmpeg = await import('fluent-ffmpeg');
      
      await new Promise((resolve, reject) => {
        ffmpeg.default(filePath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions([
            '-crf 18', // High quality (lower = better quality)
            '-preset medium', // Balanced encoding speed/quality
            '-movflags +faststart', // Web optimization
            '-pix_fmt yuv420p', // Facebook compatibility
            '-profile:v high',
            '-level 4.0',
            '-b:a 128k' // Good audio quality
          ])
          .output(compressedPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      const compressedStats = statSync(compressedPath);
      const compressedSizeMB = compressedStats.size / 1024 / 1024;
      const reductionPercent = ((originalSizeMB - compressedSizeMB) / originalSizeMB * 100);
      
      console.log(`✅ QUALITY COMPRESSION: ${compressedSizeMB.toFixed(2)}MB (${reductionPercent.toFixed(1)}% reduction)`);
      
      return {
        success: true,
        compressedPath,
        originalSize: stats.size,
        compressedSize: compressedStats.size,
        cleanup: () => {
          if (existsSync(compressedPath)) {
            unlinkSync(compressedPath);
            console.log('🗑️ COMPRESSED VIDEO CLEANED');
          }
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Quality compression failed: ${error}`
      };
    }
  }
  
  /**
   * Solution 3: Facebook-Optimized Encoding - Encode specifically for Facebook's requirements
   */
  static async optimizeForFacebook(filePath: string): Promise<{
    success: boolean;
    optimizedPath?: string;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      console.log('🎯 FACEBOOK-OPTIMIZED ENCODING');
      
      const optimizedPath = `/tmp/facebook_optimized_${Date.now()}.mp4`;
      const ffmpeg = await import('fluent-ffmpeg');
      
      await new Promise((resolve, reject) => {
        ffmpeg.default(filePath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .size('1920x1080') // Facebook recommended resolution
          .videoBitrate('8000k') // High quality bitrate
          .audioBitrate('128k')
          .fps(30) // Standard framerate
          .outputOptions([
            '-preset fast',
            '-crf 23', // Good quality/size balance
            '-movflags +faststart',
            '-pix_fmt yuv420p',
            '-profile:v baseline',
            '-level 3.0'
          ])
          .output(optimizedPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      const stats = statSync(optimizedPath);
      const sizeMB = stats.size / 1024 / 1024;
      console.log(`✅ FACEBOOK OPTIMIZATION: ${sizeMB.toFixed(2)}MB`);
      
      return {
        success: true,
        optimizedPath,
        cleanup: () => {
          if (existsSync(optimizedPath)) {
            unlinkSync(optimizedPath);
            console.log('🗑️ OPTIMIZED VIDEO CLEANED');
          }
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Facebook optimization failed: ${error}`
      };
    }
  }
  
  /**
   * Solution 4: Multi-Pass Upload - Try multiple upload strategies
   */
  static async multiPassUpload(filePath: string, pageId: string, pageAccessToken: string, description?: string, customLabels?: string[], language?: string): Promise<{
    success: boolean;
    postId?: string;
    method?: string;
    error?: string;
  }> {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    const stats = statSync(filePath);
    const fileSizeMB = stats.size / 1024 / 1024;
    
    console.log(`🚀 MULTI-PASS UPLOAD: Trying multiple strategies for ${fileSizeMB.toFixed(2)}MB file`);
    
    // Strategy 1: Direct upload if under 100MB
    if (fileSizeMB < 100) {
      console.log('📤 STRATEGY 1: Direct upload');
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(pageId, pageAccessToken, filePath, description, customLabels, language, () => {});
      if (result.success) {
        return { ...result, method: 'direct' };
      }
    }
    
    // Strategy 2: Chunked upload for large files
    console.log('📤 STRATEGY 2: Chunked upload');
    const chunkedResult = await HootsuiteStyleFacebookService.uploadLargeVideoFileChunked(pageId, pageAccessToken, filePath, description, customLabels, language, () => {});
    if (chunkedResult.success) {
      return { ...chunkedResult, method: 'chunked' };
    }
    
    // Strategy 3: Quality compression then upload
    console.log('📤 STRATEGY 3: Quality compression');
    const compressionResult = await this.compressForFacebookUpload(filePath);
    if (compressionResult.success && compressionResult.compressedPath) {
      const compressedUpload = await HootsuiteStyleFacebookService.uploadVideoFile(pageId, pageAccessToken, compressionResult.compressedPath, description, customLabels, language, compressionResult.cleanup);
      if (compressedUpload.success) {
        return { ...compressedUpload, method: 'compressed' };
      }
    }
    
    // Strategy 4: Facebook optimization then upload
    console.log('📤 STRATEGY 4: Facebook optimization');
    const optimizationResult = await this.optimizeForFacebook(filePath);
    if (optimizationResult.success && optimizationResult.optimizedPath) {
      const optimizedUpload = await HootsuiteStyleFacebookService.uploadVideoFile(pageId, pageAccessToken, optimizationResult.optimizedPath, description, customLabels, language, optimizationResult.cleanup);
      if (optimizedUpload.success) {
        return { ...optimizedUpload, method: 'optimized' };
      }
    }
    
    return {
      success: false,
      error: 'All upload strategies failed'
    };
  }
}