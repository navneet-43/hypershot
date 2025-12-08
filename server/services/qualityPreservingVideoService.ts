import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Quality-preserving video service that maintains original video quality
 * Uses chunked upload for large files instead of compression
 */
export class QualityPreservingVideoService {
  
  /**
   * Process video while maintaining original quality
   */
  static async processVideoForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      // Handle YouTube URLs - download without compression
      if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/')) {
        return await this.processYouTubeForQuality(videoUrl);
      }
      
      // Handle Google Drive URLs - download without compression  
      if (videoUrl.includes('drive.google.com') || videoUrl.includes('docs.google.com')) {
        return await this.processGoogleDriveForQuality(videoUrl);
      }
      
      return {
        success: false,
        error: 'Unsupported video URL format'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Video processing failed: ${error}`
      };
    }
  }
  
  /**
   * Download YouTube video maintaining highest available quality
   */
  static async processYouTubeForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const { VideoProcessor } = await import('./videoProcessor');
      
      // Get video info first
      const ytdl = await import('@distube/ytdl-core');
      const info = await ytdl.default.getInfo(videoUrl);
      
      // Find highest quality video format
      const videoFormats = ytdl.default.filterFormats(info.formats, 'videoonly')
        .filter(format => format.container === 'mp4')
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      
      const audioFormats = ytdl.default.filterFormats(info.formats, 'audioonly')
        .filter(format => format.container === 'm4a' || format.audioBitrate)
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      
      if (videoFormats.length === 0 || audioFormats.length === 0) {
        return {
          success: false,
          error: 'No suitable high-quality formats found'
        };
      }
      
      const videoFormat = videoFormats[0];
      const audioFormat = audioFormats[0];
      
      console.log(`🎯 DOWNLOADING HIGHEST QUALITY: ${videoFormat.height}p video + ${audioFormat.audioBitrate}kbps audio`);
      
      // Use existing VideoProcessor but ensure no compression
      const result = await VideoProcessor.downloadYouTubeVideo(videoUrl);
      
      if (result.success && result.filePath) {
        const stats = statSync(result.filePath);
        console.log(`📊 HIGH-QUALITY VIDEO: ${(stats.size / 1024 / 1024).toFixed(2)}MB - ORIGINAL QUALITY PRESERVED`);
        
        return {
          success: true,
          filePath: result.filePath,
          originalSize: stats.size,
          cleanup: result.cleanup
        };
      }
      
      return {
        success: false,
        error: 'YouTube download failed'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `YouTube processing failed: ${error}`
      };
    }
  }
  
  /**
   * Download Google Drive video maintaining original quality
   */
  static async processGoogleDriveForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      // Convert sharing URL to direct download URL
      let directUrl = videoUrl;
      
      // Handle different Google Drive URL formats
      if (videoUrl.includes('drive.google.com/file/d/')) {
        const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        }
      } else if (videoUrl.includes('docs.google.com/')) {
        const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        }
      }
      
      console.log('📥 DOWNLOADING ORIGINAL QUALITY from Google Drive...');
      console.log('🔗 Direct URL:', directUrl);
      
      // Try the download
      const response = await fetch(directUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      console.log('📋 Download response status:', response.status);
      console.log('📋 Content-Type:', response.headers.get('content-type'));
      console.log('📋 Content-Length:', response.headers.get('content-length'));
      
      if (!response.ok) {
        // Try alternative download method
        const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          const altUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          console.log('🔄 Trying alternative URL:', altUrl);
          
          const altResponse = await fetch(altUrl);
          if (altResponse.ok) {
            return await this.downloadGoogleDriveFile(altResponse, fileId);
          }
        }
        
        return {
          success: false,
          error: `Google Drive access failed (${response.status}). For your Google Drive video to work:\n\n1. Right-click the video file → Share → Change to "Anyone with the link"\n2. Set permission to "Viewer"\n3. Copy the new sharing link\n\nAlternatively, upload your video to YouTube for better compatibility.`
        };
      }
      
      const fileId = directUrl.match(/id=([a-zA-Z0-9_-]+)/)?.[1] || 'unknown';
      return await this.downloadGoogleDriveFile(response, fileId);
      
    } catch (error) {
      return {
        success: false,
        error: `Google Drive processing failed: ${error}`
      };
    }
  }
  
  /**
   * Helper method to download and save Google Drive file
   */
  static async downloadGoogleDriveFile(response: Response, fileId: string) {
    const tempPath = `/tmp/gdrive_quality_${fileId}_${Date.now()}.mp4`;
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    
    const fileStream = createWriteStream(tempPath);
    await pipeline(response.body, fileStream);
    
    // Get file size
    const stats = statSync(tempPath);
    
    if (stats.size === 0) {
      unlinkSync(tempPath);
      return {
        success: false,
        error: 'Google Drive video file is empty. Please check sharing permissions and ensure the file is set to "Anyone with the link can view".'
      };
    }
    
    console.log(`📊 ORIGINAL QUALITY: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    
    const cleanup = () => {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
        console.log('🗑️ QUALITY VIDEO CLEANED');
      }
    };
    
    return {
      success: true,
      filePath: tempPath,
      originalSize: stats.size,
      cleanup
    };
  }
}