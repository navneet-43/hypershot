import { FacebookVideoDownloader } from './facebookVideoDownloader';
import { FacebookReelDownloader } from './facebookReelDownloader';
import { WorkingGoogleDriveService } from './workingGoogleDriveService';

export interface MediaLinkInfo {
  type: 'facebook' | 'facebook-reel' | 'google-drive' | 'unknown';
  url: string;
  isVideo: boolean;
}

export class MediaLinkDetector {
  private googleDriveService: WorkingGoogleDriveService;

  constructor() {
    this.googleDriveService = new WorkingGoogleDriveService();
  }

  /**
   * Automatically detect the type of media link and return platform info
   */
  detectMediaLink(url: string): MediaLinkInfo {
    if (!url) {
      return { type: 'unknown', url, isVideo: false };
    }

    // Facebook reel detection (check reels first as they're more specific)
    if (this.isFacebookReelUrl(url)) {
      return { type: 'facebook-reel', url, isVideo: true };
    }

    // Facebook video detection
    if (this.isFacebookVideoUrl(url)) {
      return { type: 'facebook', url, isVideo: true };
    }

    // Google Drive detection
    if (this.isGoogleDriveUrl(url)) {
      return { type: 'google-drive', url, isVideo: this.isLikelyVideo(url) };
    }

    return { type: 'unknown', url, isVideo: false };
  }

  /**
   * Download media automatically based on detected type
   */
  async downloadMedia(url: string): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
    mediaType?: string;
  }> {
    const linkInfo = this.detectMediaLink(url);
    
    console.log(`🔍 Detected media type: ${linkInfo.type} for URL: ${url}`);

    try {
      switch (linkInfo.type) {
        case 'facebook':
          console.log('📱 Downloading Facebook video...');
          const fbResult = await FacebookVideoDownloader.downloadVideo(url);
          return {
            ...fbResult,
            mediaType: 'facebook-video'
          };

        case 'facebook-reel':
          console.log('🎬 Downloading Facebook reel with enhanced downloader...');
          const { EnhancedFacebookReelDownloader } = await import('./enhancedFacebookReelDownloader');
          const reelResult = await EnhancedFacebookReelDownloader.downloadReel(url);
          return {
            ...reelResult,
            mediaType: 'facebook-reel'
          };

        case 'google-drive':
          console.log('📁 Downloading Google Drive file...');
          // Note: We'll implement a simple download method here
          // For now, return the URL for processing via existing CSV system
          return {
            success: true,
            filePath: url, // Pass the URL for now, CSV system handles Google Drive
            mediaType: linkInfo.isVideo ? 'google-drive-video' : 'google-drive-file'
          };

        default:
          return {
            success: false,
            error: `Unsupported media URL type: ${linkInfo.type}`,
          };
      }
    } catch (error) {
      console.error('❌ Media download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error',
      };
    }
  }

  /**
   * Check if URL is a Facebook reel
   */
  private isFacebookReelUrl(url: string): boolean {
    const facebookReelPatterns = [
      /facebook\.com\/reel\/\d+/,
      /facebook\.com\/.*\/reel\/\d+/,
      /m\.facebook\.com\/reel\/\d+/,
      /fb\.watch\/.*reel/i, // Some FB reels use fb.watch with reel indicator
    ];

    return facebookReelPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a Facebook video (excludes reels)
   */
  private isFacebookVideoUrl(url: string): boolean {
    // Exclude reels from regular video detection
    if (this.isFacebookReelUrl(url)) {
      return false;
    }

    const facebookVideoPatterns = [
      /facebook\.com\/.*\/videos\//,
      /fb\.watch\//,
      /facebook\.com\/watch/,
      /m\.facebook\.com\/.*\/videos\//,
    ];

    return facebookVideoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a Google Drive link
   */
  private isGoogleDriveUrl(url: string): boolean {
    const googleDrivePatterns = [
      /drive\.google\.com\/file\/d\//,
      /drive\.google\.com\/open\?id=/,
      /docs\.google\.com\/file\/d\//,
    ];

    return googleDrivePatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if the URL is likely a video based on file extension or context
   */
  private isLikelyVideo(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp'];
    const urlLower = url.toLowerCase();
    
    return videoExtensions.some(ext => urlLower.includes(ext)) || 
           urlLower.includes('video') ||
           urlLower.includes('movie');
  }

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): string[] {
    return ['facebook', 'facebook-reel', 'google-drive'];
  }

  /**
   * Check if a URL is supported for automatic download
   */
  isSupported(url: string): boolean {
    const linkInfo = this.detectMediaLink(url);
    return linkInfo.type !== 'unknown';
  }
}