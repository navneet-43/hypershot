import { objectStorageVideoHandler } from './objectStorageVideoHandler';
import { FacebookVideoUploadService } from './facebookVideoUploadService';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

/**
 * Production-optimized video service that uses Object Storage
 * Solves ENOSPC issues by avoiding local filesystem storage
 */
export class ProductionVideoService {
  
  /**
   * Upload Google Drive video in production (uses Object Storage)
   */
  static async uploadGoogleDriveVideo(
    driveUrl: string,
    pageId: string,
    accessToken: string,
    content: string,
    customLabels: string[],
    language: string
  ): Promise<{
    success: boolean;
    postId?: string;
    error?: string;
  }> {
    console.log('🏭 PRODUCTION: Google Drive video upload using Object Storage');
    
    // Extract direct download URL from Google Drive
    const fileId = this.extractGoogleDriveFileId(driveUrl);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

    return await objectStorageVideoHandler.handleVideoUpload(
      directUrl,
      'google_drive',
      async (filePath: string, sizeMB: number) => {
        // Upload to Facebook using existing service
        const uploadResult = sizeMB > 100 
          ? await FacebookVideoUploadService.uploadLargeVideo(filePath, pageId, accessToken, content, customLabels, sizeMB)
          : await FacebookVideoUploadService.uploadStandardVideo(filePath, pageId, accessToken, content, customLabels, sizeMB);

        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error };
        }

        return {
          success: true,
          postId: uploadResult.videoId
        };
      }
    );
  }

  /**
   * Upload Facebook video in production (uses Object Storage)
   */
  static async uploadFacebookVideo(
    facebookUrl: string,
    pageId: string,
    accessToken: string,
    content: string,
    customLabels: string[],
    language: string
  ): Promise<{
    success: boolean;
    postId?: string;
    error?: string;
  }> {
    console.log('🏭 PRODUCTION: Facebook video re-upload using Object Storage');
    
    // For Facebook videos, we need to extract the direct video URL first
    // This is handled by the existing Facebook video downloader
    const { FacebookVideoDownloader } = await import('./facebookVideoDownloader');
    const extractResult = await FacebookVideoDownloader.downloadVideo(facebookUrl);
    
    if (!extractResult.success || !extractResult.filePath) {
      return { 
        success: false, 
        error: extractResult.error || 'Failed to extract Facebook video URL' 
      };
    }

    // The downloader already saved to local filesystem
    // Upload directly to Facebook and cleanup
    try {
      const fs = await import('fs');
      const stats = fs.statSync(extractResult.filePath);
      const sizeMB = stats.size / (1024 * 1024);

      const uploadResult = sizeMB > 100
        ? await FacebookVideoUploadService.uploadLargeVideo(extractResult.filePath, pageId, accessToken, content, customLabels, sizeMB)
        : await FacebookVideoUploadService.uploadStandardVideo(extractResult.filePath, pageId, accessToken, content, customLabels, sizeMB);

      // Cleanup
      fs.unlinkSync(extractResult.filePath);

      if (!uploadResult.success) {
        return { success: false, error: uploadResult.error };
      }

      return {
        success: true,
        postId: uploadResult.videoId
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generic video upload that auto-detects source type
   */
  static async uploadVideo(
    videoUrl: string,
    pageId: string,
    accessToken: string,
    content: string,
    customLabels: string[],
    language: string
  ): Promise<{
    success: boolean;
    postId?: string;
    error?: string;
  }> {
    // Detect video source
    if (videoUrl.includes('drive.google.com') || videoUrl.includes('drive.usercontent.google.com')) {
      return this.uploadGoogleDriveVideo(videoUrl, pageId, accessToken, content, customLabels, language);
    }

    if (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')) {
      return this.uploadFacebookVideo(videoUrl, pageId, accessToken, content, customLabels, language);
    }

    // For other sources, use Object Storage workflow
    return await objectStorageVideoHandler.handleVideoUpload(
      videoUrl,
      'direct',
      async (filePath: string, sizeMB: number) => {
        const uploadResult = sizeMB > 100
          ? await FacebookVideoUploadService.uploadLargeVideo(filePath, pageId, accessToken, content, customLabels, sizeMB)
          : await FacebookVideoUploadService.uploadStandardVideo(filePath, pageId, accessToken, content, customLabels, sizeMB);

        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error };
        }

        return {
          success: true,
          postId: uploadResult.videoId
        };
      }
    );
  }

  /**
   * Extract Google Drive file ID from various URL formats
   */
  private static extractGoogleDriveFileId(url: string): string | null {
    const patterns = [
      /\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /file\/d\/([a-zA-Z0-9-_]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }
}
