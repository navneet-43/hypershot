import fetch from 'node-fetch';
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { FixedGoogleDriveHelper } from './fixedGoogleDriveHelper';
import { FacebookVideoDownloader } from './facebookVideoDownloader';
import { getWebDAVStorage } from './webdavStorageService';
import { getFTPStorage } from './ftpStorageService';
import { DiskSpaceMonitor } from '../utils/diskSpaceMonitor';
import path from 'path';

interface DownloadResult {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  mediaType?: 'image' | 'video';
  sizeMB?: number;
  error?: string;
  webdavPath?: string;
  ftpPath?: string;
  sftpRemotePath?: string; // Remote path on SFTP server for later download
  usedSFTP?: boolean; // Flag to indicate if SFTP was used
}

/**
 * Instagram Media Downloader - Downloads images/videos from any source
 * Supports: Google Drive, Facebook, Instagram, Direct URLs
 * NOW WITH FTP/WEBDAV STORAGE: Files are uploaded to external 88TB storage server
 */
export class InstagramMediaDownloader {
  private static readonly TEMP_DIR = '/tmp';
  private static readonly MAX_IMAGE_SIZE_MB = 8; // Instagram limit
  private static readonly MAX_VIDEO_SIZE_MB = 650; // Instagram limit (up to 10 min videos)
  private static readonly USE_FTP = process.env.FTP_HOST ? true : false;
  private static readonly USE_WEBDAV = process.env.WEBDAV_URL ? true : false;

  /**
   * Upload local file to FTP storage and get public URL
   */
  private static async uploadToFTP(localFilePath: string): Promise<{ ftpPath: string; publicUrl: string }> {
    try {
      if (!this.USE_FTP) {
        throw new Error('FTP not configured');
      }

      const ftp = getFTPStorage();
      const fileName = path.basename(localFilePath);
      
      console.log(`⬆️ Uploading to FTP storage: ${fileName}`);
      const ftpPath = await ftp.uploadFile(localFilePath, fileName);
      const publicUrl = ftp.getPublicUrl(ftpPath);
      
      console.log(`✅ FTP upload successful`);
      console.log(`📂 FTP path: ${ftpPath}`);
      console.log(`🔗 Public URL: ${publicUrl}`);
      
      return { ftpPath, publicUrl };
    } catch (error: any) {
      console.error('❌ FTP upload failed:', error.message);
      throw error;
    }
  }

  /**
   * Upload local file to WebDAV storage and get public URL
   */
  private static async uploadToWebDAV(localFilePath: string): Promise<{ webdavPath: string; publicUrl: string }> {
    try {
      if (!this.USE_WEBDAV) {
        throw new Error('WebDAV not configured');
      }

      const webdav = getWebDAVStorage();
      const fileName = path.basename(localFilePath);
      
      console.log(`⬆️ Uploading to WebDAV storage: ${fileName}`);
      const webdavPath = await webdav.uploadFile(localFilePath, fileName);
      const publicUrl = webdav.getPublicUrl(webdavPath);
      
      console.log(`✅ WebDAV upload successful`);
      console.log(`📂 WebDAV path: ${webdavPath}`);
      console.log(`🔗 Public URL: ${publicUrl}`);
      
      return { webdavPath, publicUrl };
    } catch (error: any) {
      console.error('❌ WebDAV upload failed:', error.message);
      throw error;
    }
  }

  /**
   * Upload local file to external storage (FTP or WebDAV) and get public URL
   * Tries FTP first, then WebDAV as fallback
   */
  private static async uploadToExternalStorage(localFilePath: string): Promise<{ storagePath: string; publicUrl: string; storageType: 'ftp' | 'webdav' }> {
    // Try FTP first if configured
    if (this.USE_FTP) {
      try {
        const { ftpPath, publicUrl } = await this.uploadToFTP(localFilePath);
        return { storagePath: ftpPath, publicUrl, storageType: 'ftp' };
      } catch (ftpError: any) {
        console.warn('⚠️ FTP upload failed, trying WebDAV fallback:', ftpError.message);
      }
    }

    // Fallback to WebDAV if FTP failed or not configured
    if (this.USE_WEBDAV) {
      try {
        const { webdavPath, publicUrl } = await this.uploadToWebDAV(localFilePath);
        return { storagePath: webdavPath, publicUrl, storageType: 'webdav' };
      } catch (webdavError: any) {
        console.error('❌ Both FTP and WebDAV upload failed');
        throw webdavError;
      }
    }

    throw new Error('No external storage configured (FTP or WebDAV)');
  }

  /**
   * Main download method - detects URL type and downloads appropriately
   */
  static async downloadMedia(url: string, mediaTypeHint?: 'image' | 'video'): Promise<DownloadResult> {
    try {
      console.log('📥 Instagram Media Download Request:', url);
      if (mediaTypeHint) {
        console.log(`📝 Media type hint: ${mediaTypeHint}`);
      }

      // PRODUCTION FIX: Always run disk space check BEFORE any download
      const estimatedSize = mediaTypeHint === 'video' ? 200 : 20;
      console.log(`💾 Pre-download disk space check (estimated ${estimatedSize}MB)...`);
      try {
        await DiskSpaceMonitor.ensureMinimumSpace(estimatedSize);
      } catch (spaceError: any) {
        console.error('❌ Disk space error:', spaceError.message);
        // Try ultra-aggressive cleanup
        console.log('🚨 Attempting ultra-aggressive cleanup...');
        await DiskSpaceMonitor.ultraAggressiveCleanup();
        // Re-check
        const finalCheck = await DiskSpaceMonitor.hasEnoughSpace(estimatedSize);
        if (!finalCheck.hasSpace) {
          return {
            success: false,
            error: `Insufficient disk space: ${finalCheck.available.toFixed(1)}MB available, need ${estimatedSize}MB. Please try again later.`
          };
        }
      }

      // Detect URL type and route to appropriate downloader
      if (this.isGoogleDriveUrl(url)) {
        console.log('🔵 Detected: Google Drive URL');
        return await this.downloadFromGoogleDrive(url, mediaTypeHint);
      } else if (this.isFacebookUrl(url)) {
        console.log('🔵 Detected: Facebook URL');
        return await this.downloadFromFacebook(url);
      } else if (this.isInstagramUrl(url)) {
        console.log('🔵 Detected: Instagram URL');
        return await this.downloadFromInstagram(url);
      } else {
        console.log('🔵 Detected: Direct URL');
        return await this.downloadFromDirectUrl(url);
      }
    } catch (error) {
      console.error('❌ Instagram media download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error'
      };
    }
  }

  /**
   * Download from Google Drive
   */
  private static async downloadFromGoogleDrive(url: string, mediaType?: 'image' | 'video'): Promise<DownloadResult> {
    let tempFilePath: string | undefined;
    try {
      const fileId = FixedGoogleDriveHelper.extractFileId(url);
      if (!fileId) {
        return { success: false, error: 'Invalid Google Drive URL format' };
      }

      // Use appropriate extension based on media type hint
      const extension = mediaType === 'image' ? 'jpg' : 'mp4';
      const outputPath = `${this.TEMP_DIR}/instagram_gdrive_${fileId}_${Date.now()}.${extension}`;
      tempFilePath = outputPath;
      
      // PRODUCTION FIX: Check disk space before download
      const estimatedSizeMB = mediaType === 'video' ? 150 : 10; // Conservative estimate
      await DiskSpaceMonitor.ensureMinimumSpace(estimatedSizeMB);
      
      console.log(`⬇️ Downloading from Google Drive (${mediaType || 'auto-detect'})...`);
      const result = await FixedGoogleDriveHelper.downloadVideo(fileId, outputPath);

      if (!result.success) {
        return { success: false, error: result.error || 'Google Drive download failed' };
      }

      const stats = statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);

      console.log(`✅ Google Drive download complete: ${sizeMB.toFixed(2)}MB`);

      // Determine media type from file extension or hint
      const detectedMediaType = mediaType || (outputPath.endsWith('.mp4') || outputPath.endsWith('.mov') ? 'video' : 'image');

      // INSTAGRAM VIDEO PROCESSING: Ensure video meets Instagram requirements
      // PRODUCTION-SAFE: If processing fails, proceed with original video
      let finalOutputPath = outputPath;
      if (detectedMediaType === 'video') {
        console.log('🎬 Checking video for Instagram compatibility...');
        try {
          const { InstagramVideoProcessor } = await import('./instagramVideoProcessor');
          
          const processingResult = await InstagramVideoProcessor.processForInstagram(outputPath);
          
          if (!processingResult.success) {
            console.warn('⚠️ Instagram video processing failed, proceeding with original video:', processingResult.error);
            // Don't fail - try with original video and let Instagram handle it
          } else if (processingResult.needsProcessing && processingResult.outputPath) {
            console.log('✅ Video processed for Instagram compatibility');
            // Delete original unprocessed video
            if (existsSync(outputPath) && outputPath !== processingResult.outputPath) {
              unlinkSync(outputPath);
              console.log('🗑️ Deleted original unprocessed video');
            }
            finalOutputPath = processingResult.outputPath;
            tempFilePath = finalOutputPath;
          } else {
            console.log('✅ Video already meets Instagram requirements - no processing needed');
          }
        } catch (processingError) {
          console.warn('⚠️ Video processing error, proceeding with original:', processingError);
          // Continue with original video - let Instagram API handle it
        }
      }

      // Upload to SFTP if configured (DELETE local file after upload to save space)
      if (this.USE_FTP) {
        try {
          const ftp = getFTPStorage();
          const fileName = path.basename(finalOutputPath);
          console.log(`⬆️ Uploading to SFTP for backup: ${fileName}`);
          const sftpRemotePath = await ftp.uploadFile(finalOutputPath, fileName);
          console.log(`✅ SFTP backup complete: ${sftpRemotePath}`);
          
          // Get final file size after processing
          const finalStats = statSync(finalOutputPath);
          const finalSizeMB = finalStats.size / (1024 * 1024);
          
          // PRODUCTION FIX: Keep local file for immediate serving, but mark for aggressive cleanup
          // The /temp-media endpoint will auto-download from SFTP if file is missing
          return {
            success: true,
            filePath: finalOutputPath,
            sftpRemotePath,
            usedSFTP: true,
            mediaType: detectedMediaType,
            sizeMB: finalSizeMB
          };
        } catch (sftpError) {
          console.warn('⚠️ SFTP upload failed, continuing with local file only:', sftpError);
        }
      }

      // Get final file size
      const finalStats = statSync(finalOutputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);

      return {
        success: true,
        filePath: finalOutputPath,
        mediaType: detectedMediaType,
        sizeMB: finalSizeMB
      };
    } catch (error) {
      if (tempFilePath) {
        this.cleanupFile(tempFilePath);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google Drive download failed'
      };
    }
  }

  /**
   * Download from Facebook
   */
  private static async downloadFromFacebook(url: string): Promise<DownloadResult> {
    let tempFilePath: string | undefined;
    try {
      // PRODUCTION FIX: Check disk space before download
      await DiskSpaceMonitor.ensureMinimumSpace(50); // Facebook videos typically 30-50MB
      
      console.log('⬇️ Downloading from Facebook...');
      const result = await FacebookVideoDownloader.downloadVideo(url);

      if (!result.success || !result.filePath) {
        return { success: false, error: result.error || 'Facebook download failed' };
      }

      tempFilePath = result.filePath;
      const stats = statSync(result.filePath);
      const sizeMB = stats.size / (1024 * 1024);

      console.log(`✅ Facebook download complete: ${sizeMB.toFixed(2)}MB`);

      // INSTAGRAM VIDEO PROCESSING: Ensure video meets Instagram requirements
      // PRODUCTION-SAFE: If processing fails, proceed with original video
      let finalOutputPath = result.filePath;
      console.log('🎬 Checking video for Instagram compatibility...');
      try {
        const { InstagramVideoProcessor } = await import('./instagramVideoProcessor');
        
        const processingResult = await InstagramVideoProcessor.processForInstagram(result.filePath);
        
        if (!processingResult.success) {
          console.warn('⚠️ Instagram video processing failed, proceeding with original video:', processingResult.error);
          // Don't fail - try with original video
        } else if (processingResult.needsProcessing && processingResult.outputPath) {
          console.log('✅ Video processed for Instagram compatibility');
          // Delete original unprocessed video
          if (existsSync(result.filePath) && result.filePath !== processingResult.outputPath) {
            unlinkSync(result.filePath);
            console.log('🗑️ Deleted original unprocessed video');
          }
          finalOutputPath = processingResult.outputPath;
          tempFilePath = finalOutputPath;
        } else {
          console.log('✅ Video already meets Instagram requirements - no processing needed');
        }
      } catch (processingError) {
        console.warn('⚠️ Video processing error, proceeding with original:', processingError);
        // Continue with original video
      }

      // Upload to SFTP if configured
      if (this.USE_FTP) {
        try {
          const ftp = getFTPStorage();
          const fileName = path.basename(finalOutputPath);
          console.log(`⬆️ Uploading to SFTP for backup: ${fileName}`);
          const sftpRemotePath = await ftp.uploadFile(finalOutputPath, fileName);
          console.log(`✅ SFTP backup complete: ${sftpRemotePath}`);
          
          // Get final file size after processing
          const finalStats = statSync(finalOutputPath);
          const finalSizeMB = finalStats.size / (1024 * 1024);
          
          // PRODUCTION FIX: Keep local file for immediate serving, but mark for aggressive cleanup
          return {
            success: true,
            filePath: finalOutputPath,
            sftpRemotePath,
            usedSFTP: true,
            mediaType: 'video',
            sizeMB: finalSizeMB
          };
        } catch (sftpError) {
          console.warn('⚠️ SFTP upload failed, continuing with local file only:', sftpError);
        }
      }

      // Get final file size
      const finalStats = statSync(finalOutputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);

      return {
        success: true,
        filePath: finalOutputPath,
        mediaType: 'video',
        sizeMB: finalSizeMB
      };
    } catch (error) {
      if (tempFilePath) {
        this.cleanupFile(tempFilePath);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Facebook download failed'
      };
    }
  }

  /**
   * Download from Instagram (for re-posting)
   */
  private static async downloadFromInstagram(url: string): Promise<DownloadResult> {
    // Instagram URLs are typically media CDN links
    return await this.downloadFromDirectUrl(url);
  }

  /**
   * Download from direct URL (images, videos)
   */
  private static async downloadFromDirectUrl(url: string): Promise<DownloadResult> {
    try {
      console.log('⬇️ Downloading from direct URL...');

      // First, check the content type
      const headResponse = await fetch(url, { method: 'HEAD' });
      const contentType = headResponse.headers.get('content-type') || '';
      const contentLength = parseInt(headResponse.headers.get('content-length') || '0');

      let mediaType: 'image' | 'video';
      let fileExtension: string;

      if (contentType.startsWith('image/')) {
        mediaType = 'image';
        fileExtension = contentType.split('/')[1] || 'jpg';
      } else if (contentType.startsWith('video/')) {
        mediaType = 'video';
        fileExtension = contentType.split('/')[1] || 'mp4';
      } else {
        // Guess from URL
        if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
          mediaType = 'image';
          fileExtension = 'jpg';
        } else if (url.match(/\.(mp4|mov|avi)(\?|$)/i)) {
          mediaType = 'video';
          fileExtension = 'mp4';
        } else {
          return { success: false, error: 'Unable to determine media type from URL' };
        }
      }

      // PRODUCTION FIX: Check disk space before download
      const estimatedSizeMB = contentLength > 0 ? (contentLength / (1024 * 1024)) : (mediaType === 'video' ? 50 : 5);
      await DiskSpaceMonitor.ensureMinimumSpace(estimatedSizeMB);

      const outputPath = `${this.TEMP_DIR}/instagram_${mediaType}_${Date.now()}.${fileExtension}`;

      // Download the file
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      if (!response.body) {
        return { success: false, error: 'No response body received' };
      }

      const fileStream = createWriteStream(outputPath);
      let downloadedBytes = 0;

      // Progress tracking
      const progressStream = new Transform({
        transform(chunk: any, encoding: any, callback: any) {
          downloadedBytes += chunk.length;
          callback(null, chunk);
        }
      });

      await pipeline(response.body, progressStream, fileStream);

      // Verify download
      if (!existsSync(outputPath)) {
        return { success: false, error: 'Download file not created' };
      }

      const stats = statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);

      console.log(`✅ Direct URL download complete: ${sizeMB.toFixed(2)}MB (${mediaType})`);

      // Validate size limits for Instagram
      if (mediaType === 'image' && sizeMB > this.MAX_IMAGE_SIZE_MB) {
        unlinkSync(outputPath);
        return { success: false, error: `Image too large: ${sizeMB.toFixed(2)}MB (Instagram limit: ${this.MAX_IMAGE_SIZE_MB}MB)` };
      }

      if (mediaType === 'video' && sizeMB > this.MAX_VIDEO_SIZE_MB) {
        unlinkSync(outputPath);
        return { success: false, error: `Video too large: ${sizeMB.toFixed(2)}MB (Instagram limit: ${this.MAX_VIDEO_SIZE_MB}MB)` };
      }

      // Upload to SFTP if configured
      if (this.USE_FTP) {
        try {
          const ftp = getFTPStorage();
          const fileName = path.basename(outputPath);
          console.log(`⬆️ Uploading to SFTP for backup: ${fileName}`);
          const sftpRemotePath = await ftp.uploadFile(outputPath, fileName);
          console.log(`✅ SFTP backup complete: ${sftpRemotePath}`);
          
          // PRODUCTION FIX: Keep local file for immediate serving, but mark for aggressive cleanup
          return {
            success: true,
            filePath: outputPath,
            sftpRemotePath,
            usedSFTP: true,
            mediaType,
            sizeMB
          };
        } catch (sftpError) {
          console.warn('⚠️ SFTP upload failed, continuing with local file only:', sftpError);
        }
      }

      return {
        success: true,
        filePath: outputPath,
        mediaType,
        sizeMB
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Direct URL download failed'
      };
    }
  }

  /**
   * URL detection helpers
   */
  private static isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com');
  }

  private static isFacebookUrl(url: string): boolean {
    return url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com');
  }

  private static isInstagramUrl(url: string): boolean {
    return url.includes('instagram.com') || url.includes('cdninstagram.com');
  }

  /**
   * Download file from SFTP to local /tmp
   * Used when local file is missing but we have it on SFTP
   */
  static async downloadFromSFTP(sftpRemotePath: string, localFilePath: string): Promise<boolean> {
    try {
      if (!this.USE_FTP) {
        console.warn('⚠️ SFTP not configured, cannot download from SFTP');
        return false;
      }

      const ftp = getFTPStorage();
      console.log(`⬇️ Downloading from SFTP: ${sftpRemotePath} → ${localFilePath}`);
      await ftp.downloadFile(sftpRemotePath, localFilePath);
      console.log(`✅ SFTP download successful: ${localFilePath}`);
      return true;
    } catch (error) {
      console.error('❌ SFTP download failed:', error);
      return false;
    }
  }

  /**
   * Cleanup downloaded file
   */
  static cleanupFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`🗑️ Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.warn('Failed to cleanup file:', error);
    }
  }
}
