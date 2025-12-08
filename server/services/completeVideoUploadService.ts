import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader';
import { progressTracker } from './progressTrackingService';
import { ChunkedVideoUploadService } from './chunkedVideoUploadService';
import { storage } from '../storage';
import { statSync, unlinkSync } from 'fs';
import { deploymentConfig } from '../config/deploymentConfig';

export interface CompleteVideoUploadOptions {
  googleDriveUrl: string;
  accountId: number;
  userId: number;
  content?: string;
  customLabels?: string[];
  language?: string;
  uploadId?: string;
}

export interface CompleteVideoUploadResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  facebookUrl?: string;
  downloadedSize?: number;
  uploadedSize?: number;
  uploadedSizeMB?: number;
  postId?: string;
  videoId?: string;
  error?: string;
  method: 'google_drive_chunked_upload' | 'processed_video_file_upload';
  steps?: string[];
}

export class CompleteVideoUploadService {
  private downloader = new CorrectGoogleDriveDownloader();
  private uploader = new ChunkedVideoUploadService();
  
  async uploadGoogleDriveVideoInChunks(options: CompleteVideoUploadOptions): Promise<CompleteVideoUploadResult> {
    const steps: string[] = [];
    const uploadId = options.uploadId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`Starting complete Google Drive to Facebook chunked upload with ID: ${uploadId}`);
      steps.push('Process initiated');
      
      // Initialize progress tracking
      progressTracker.updateProgress(uploadId, 'Starting Google Drive download...', 5, 'Initializing Enhanced Google Drive download process');
      
      // Step 1: Get Facebook account details
      const account = await storage.getFacebookAccount(options.accountId);
      if (!account) {
        throw new Error('Facebook account not found');
      }
      
      steps.push('Facebook account validated');
      console.log(`Using Facebook account: ${account.name} (${account.pageId})`);
      
      // Step 2: Download from Google Drive using enhanced downloader
      console.log('Step 1: Downloading from Google Drive with token confirmation');
      steps.push('Starting Google Drive download');
      
      // Progress tracking for download start
      progressTracker.updateProgress(uploadId, 'Downloading from Google Drive...', 15, 'Enhanced downloader with token confirmation initiated');
      
      const downloadResult = await this.downloader.downloadVideoFile({
        googleDriveUrl: options.googleDriveUrl
      });
      
      if (!downloadResult.success) {
        throw new Error(`Google Drive download failed: ${downloadResult.error}`);
      }
      
      if (!downloadResult.filePath || !downloadResult.fileSize) {
        throw new Error('Download completed but file information missing');
      }
      
      const downloadSizeMB = downloadResult.fileSize / (1024 * 1024);
      steps.push(`Downloaded: ${downloadSizeMB.toFixed(1)}MB`);
      console.log(`Download successful: ${downloadSizeMB.toFixed(1)}MB`);
      
      // Progress tracking for download complete
      progressTracker.updateProgress(uploadId, 'Download completed, starting Facebook upload...', 40, `Downloaded ${downloadSizeMB.toFixed(1)}MB from Google Drive`);
      
      // Step 3: Upload to Facebook using chunked upload
      console.log('Step 2: Uploading to Facebook using chunked upload API');
      steps.push('Starting Facebook chunked upload');
      
      // Progress tracking for upload start
      progressTracker.updateProgress(uploadId, 'Processing video with FFmpeg...', 50, 'Preparing video for Facebook upload with chunked method');
      
      // Use the actual CSV content as both title and description to preserve original content
      const title = options.content || 'Google Drive Video Upload';
      const description = options.content || `Video uploaded from Google Drive (${downloadSizeMB.toFixed(1)}MB)`;
      
      const uploadResult = await this.uploader.uploadVideoInChunks({
        accessToken: account.accessToken,
        pageId: account.pageId,
        filePath: downloadResult.filePath,
        title: title,
        description: description,
        customLabels: options.customLabels,
        language: options.language
      });
      
      if (!uploadResult.success) {
        throw new Error(`Facebook upload failed: ${uploadResult.error}`);
      }
      
      const uploadSizeMB = (uploadResult.totalSize || 0) / (1024 * 1024);
      steps.push(`Uploaded: ${uploadSizeMB.toFixed(1)}MB`);
      steps.push('Chunked upload completed');
      
      // Progress tracking for upload complete
      progressTracker.updateProgress(uploadId, 'Facebook upload completed!', 95, `Uploaded ${uploadSizeMB.toFixed(1)}MB video to Facebook successfully`);
      
      console.log(`Upload successful: ${uploadResult.videoId}`);
      console.log(`Facebook URL: ${uploadResult.facebookUrl}`);
      
      // Step 4: Wait for Facebook processing and get post ID
      console.log('Step 3: Waiting for Facebook processing');
      steps.push('Waiting for Facebook processing');
      
      // Progress tracking for Facebook processing
      progressTracker.updateProgress(uploadId, 'Facebook processing video...', 98, 'Video uploaded successfully, waiting for Facebook processing to complete');
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      
      // Get recent posts to find the uploaded video
      const posts = await this.getRecentFacebookPosts(account.accessToken, account.pageId);
      const videoPost = posts.find(post => 
        post.attachments?.data?.[0]?.type === 'video_inline' &&
        (Date.now() - new Date(post.created_time).getTime()) < 5 * 60 * 1000 // Within 5 minutes
      );
      
      let facebookPostId = videoPost?.id;
      
      if (facebookPostId) {
        steps.push('Video post identified');
        console.log(`Facebook Post ID: ${facebookPostId}`);
      } else {
        steps.push('Video uploaded, post ID pending');
        console.log('Video uploaded successfully, post ID will be available after processing');
      }
      
      // Step 5: Save to database
      const postData = {
        userId: options.userId,
        accountId: options.accountId,
        content: `Google Drive video uploaded successfully using chunked upload method - Video ID: ${uploadResult.videoId} - Size: ${downloadSizeMB.toFixed(1)}MB - Original: ${options.googleDriveUrl}`,
        mediaUrl: options.googleDriveUrl,
        mediaType: 'video' as const,
        customLabels: options.customLabels || [],
        language: options.language || 'en',
        status: 'published' as const,
        publishedAt: new Date(),
        facebookPostId: uploadResult.videoId
      };
      
      await storage.createPost(postData);
      steps.push('Database record created');
      
      return {
        success: true,
        facebookVideoId: uploadResult.videoId,
        facebookPostId: facebookPostId,
        facebookUrl: uploadResult.facebookUrl,
        downloadedSize: downloadResult.fileSize,
        uploadedSize: uploadResult.totalSize,
        method: 'google_drive_chunked_upload',
        steps: steps
      };
      
    } catch (error) {
      console.error('Complete video upload error:', error);
      steps.push(`Error: ${(error as Error).message}`);
      
      return {
        success: false,
        error: (error as Error).message,
        method: 'google_drive_chunked_upload',
        steps: steps
      };
    }
  }
  
  private async getRecentFacebookPosts(accessToken: string, pageId: string): Promise<any[]> {
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,attachments,created_time&access_token=${accessToken}&limit=10`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Facebook API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      return data.data || [];
      
    } catch (error) {
      console.error('Error fetching Facebook posts:', error);
      return [];
    }
  }
  
  async testGoogleDriveChunkedUpload(googleDriveUrl: string): Promise<CompleteVideoUploadResult> {
    try {
      // Get Tamil account for testing
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
      
      if (!tamilAccount) {
        throw new Error('Alright Tamil account not found for testing');
      }
      
      console.log('Testing Google Drive chunked upload with Alright Tamil page');
      
      return await this.uploadGoogleDriveVideoInChunks({
        googleDriveUrl: googleDriveUrl,
        accountId: tamilAccount.id,
        userId: 3,
        content: 'Testing chunked upload method for large Google Drive videos',
        language: 'en'
      });
      
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        method: 'google_drive_chunked_upload'
      };
    }
  }

  async uploadProcessedVideoFile(options: {
    videoFilePath: string;
    pageId: string;
    pageAccessToken: string;
    description: string;
    customLabels: string[];
    language: string;
    isReel?: boolean;
  }): Promise<CompleteVideoUploadResult> {
    try {
      console.log('Starting upload of processed video file');
      
      const fileStats = statSync(options.videoFilePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      console.log(`Video file size: ${fileSizeMB.toFixed(1)}MB`);
      
      let uploadResult;
      
      // Use chunked upload for larger files (>50MB)
      if (fileSizeMB > 50) {
        console.log(`Using chunked upload for large ${options.isReel ? 'reel' : 'video'} file`);
        uploadResult = await this.uploader.uploadVideoInChunks({
          accessToken: options.pageAccessToken,
          pageId: options.pageId,
          filePath: options.videoFilePath,
          title: options.description || 'Video Upload',
          description: options.description,
          customLabels: options.customLabels || [],
          language: options.language || 'en',
          isReel: options.isReel || false
        });
      } else {
        console.log(`Using standard upload for ${options.isReel ? 'reel' : 'video'} file`);
        // For smaller files, still use chunked upload as it's more reliable
        uploadResult = await this.uploader.uploadVideoInChunks({
          accessToken: options.pageAccessToken,
          pageId: options.pageId,
          filePath: options.videoFilePath,
          title: options.description || 'Video Upload',
          description: options.description,
          customLabels: options.customLabels || [],
          language: options.language || 'en',
          isReel: options.isReel || false
        });
      }
      
      if (uploadResult.success) {
        console.log('✅ Processed video file uploaded successfully');
        
        // File cleanup is now handled by TempFileManager - no manual cleanup needed
        
        return {
          success: true,
          facebookVideoId: uploadResult.videoId,
          postId: uploadResult.videoId, // Add postId field for consistency
          videoId: uploadResult.videoId, // Also add videoId field
          method: 'processed_video_file_upload',
          uploadedSizeMB: fileSizeMB
        };
      } else {
        return {
          success: false,
          error: uploadResult.error || 'Video upload failed',
          method: 'processed_video_file_upload'
        };
      }
      
    } catch (error) {
      console.error('Processed video file upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        method: 'processed_video_file_upload'
      };
    }
  }

  /**
   * Upload processed reel file to Facebook using Reels endpoint
   */
  async uploadProcessedReelFile(options: {
    videoFilePath: string;
    pageId: string;
    pageAccessToken: string;
    description?: string;
    customLabels?: string[];
    language?: string;
  }): Promise<CompleteVideoUploadResult> {
    
    console.log('🎬 Starting Facebook Reel upload for processed file');
    
    try {
      const stats = statSync(options.videoFilePath);
      const fileSizeMB = (stats.size / 1024 / 1024);
      console.log(`Reel file size: ${fileSizeMB.toFixed(1)}MB`);
      
      if (fileSizeMB > 250) { // Facebook Reels size limit
        throw new Error(`Reel file too large: ${fileSizeMB.toFixed(1)}MB (max 250MB for Reels)`);
      }
      
      // Use chunked upload but target Reels endpoint
      const reelUploadResult = await this.uploader.uploadVideoToFacebook({
        videoFilePath: options.videoFilePath,
        pageId: options.pageId,
        pageAccessToken: options.pageAccessToken,
        description: options.description || 'Reel upload',
        customLabels: options.customLabels || [],
        language: options.language || 'en',
        isReel: true // Special flag for Reel upload
      });
      
      if (reelUploadResult.success) {
        console.log('✅ Reel uploaded successfully to Facebook');
        
        // Clean up temp file
        try {
          unlinkSync(options.videoFilePath);
          console.log('🗑️ Temp reel file cleaned up');
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temporary reel file:', cleanupError);
        }
        
        return {
          success: true,
          method: 'processed_video_file_upload',
          uploadedSizeMB: fileSizeMB,
          postId: reelUploadResult.videoId,
          videoId: reelUploadResult.videoId
        };
      } else {
        console.error('❌ Facebook Reel upload failed:', reelUploadResult.error);
        return {
          success: false,
          method: 'processed_video_file_upload',
          error: reelUploadResult.error || 'Facebook Reel upload failed'
        };
      }
      
    } catch (error) {
      console.error('Error in reel upload process:', error);
      return {
        success: false,
        method: 'processed_video_file_upload',
        error: error instanceof Error ? error.message : 'Unknown reel upload error'
      };
    }
  }
}