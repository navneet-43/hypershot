import fetch from 'node-fetch';

export interface MediaInfo {
  isValid: boolean;
  size?: number;
  type?: string;
  error?: string;
  optimizedUrl?: string;
}

/**
 * Media optimization service for Facebook publishing
 * Handles large files, format conversion, and validation
 */
export class MediaOptimizer {
  
  // Facebook's recommended limits
  static readonly MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
  static readonly MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB
  static readonly SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];
  static readonly SUPPORTED_PHOTO_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

  /**
   * Check if media URL is accessible and get basic info
   */
  static async validateMediaUrl(url: string): Promise<MediaInfo> {
    try {
      console.log('🔍 MEDIA VALIDATION: Checking URL accessibility:', url);
      
      // Make HEAD request to check if file is accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          isValid: false,
          error: `Media URL not accessible: ${response.status} ${response.statusText}`
        };
      }

      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      
      const size = contentLength ? parseInt(contentLength, 10) : 0;
      
      console.log('📊 MEDIA INFO:', {
        size: `${(size / 1024 / 1024).toFixed(2)} MB`,
        type: contentType,
        url: url.substring(0, 100) + '...'
      });

      return {
        isValid: true,
        size,
        type: contentType || 'unknown',
        optimizedUrl: url
      };

    } catch (error) {
      console.error('❌ MEDIA VALIDATION ERROR:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }

  /**
   * Get optimized media strategy based on file size and type
   */
  static getOptimizationStrategy(mediaInfo: MediaInfo, mediaType: string): {
    strategy: 'direct' | 'chunked' | 'resize' | 'fallback';
    reason: string;
    recommendation?: string;
  } {
    if (!mediaInfo.isValid) {
      return {
        strategy: 'fallback',
        reason: 'Media file is not accessible',
        recommendation: 'Check Google Drive sharing permissions or try a different file'
      };
    }

    const size = mediaInfo.size || 0;
    const isVideo = mediaType === 'video' || mediaInfo.type?.includes('video');
    const isPhoto = mediaType === 'photo' || mediaInfo.type?.includes('image');

    // Video optimization strategy
    if (isVideo) {
      if (size > this.MAX_VIDEO_SIZE) {
        return {
          strategy: 'fallback',
          reason: `Video file too large: ${(size / 1024 / 1024 / 1024).toFixed(2)}GB (max: 4GB)`,
          recommendation: 'Compress video or use a shorter clip'
        };
      } else if (size > 500 * 1024 * 1024) { // 500MB
        return {
          strategy: 'chunked',
          reason: 'Large video file - using chunked upload for better reliability'
        };
      } else {
        return {
          strategy: 'direct',
          reason: 'Video size acceptable for direct upload'
        };
      }
    }

    // Photo optimization strategy
    if (isPhoto) {
      if (size > this.MAX_PHOTO_SIZE) {
        return {
          strategy: 'resize',
          reason: `Image too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: 8MB)`,
          recommendation: 'Image will be resized automatically'
        };
      } else {
        return {
          strategy: 'direct',
          reason: 'Image size acceptable for direct upload'
        };
      }
    }

    return {
      strategy: 'direct',
      reason: 'Unknown media type - attempting direct upload'
    };
  }

  /**
   * Convert Google Drive sharing URL to direct download with validation
   */
  static optimizeGoogleDriveUrl(url: string): string {
    // Handle different Google Drive URL formats
    const patterns = [
      /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/,
      /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/edit/,
      /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
      /https:\/\/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const fileId = match[1];
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }

    // If already a direct download URL, return as-is
    if (url.includes('drive.google.com/uc?export=download')) {
      return url;
    }

    // If no pattern matches, return original URL
    console.warn('⚠️ Could not optimize Google Drive URL:', url);
    return url;
  }

  /**
   * Get alternative media hosting suggestions
   */
  static getAlternativeHostingSuggestions(): string[] {
    return [
      'Upload videos to YouTube and use YouTube links',
      'Use Vimeo for high-quality video hosting',
      'Try Dropbox or OneDrive with direct download links',
      'Use a CDN service like Cloudinary or AWS S3',
      'Compress videos using HandBrake or similar tools',
      'Split long videos into shorter segments'
    ];
  }

  /**
   * Create fallback text post when media fails
   */
  static createMediaFallbackPost(originalContent: string, mediaUrl: string, error: string): {
    content: string;
    link?: string;
  } {
    const fallbackContent = `${originalContent}

📹 Video content available at: ${mediaUrl}

Note: Direct video upload temporarily unavailable. Click the link above to view the content.`;

    return {
      content: fallbackContent,
      link: mediaUrl.includes('drive.google.com') ? 
        mediaUrl.replace('/uc?export=download&id=', '/file/d/').replace(/&.*$/, '/view?usp=sharing') : 
        mediaUrl
    };
  }
}