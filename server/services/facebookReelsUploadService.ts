import fetch from 'node-fetch';
import * as fs from 'fs';

export interface ReelsUploadOptions {
  accessToken: string;
  pageId: string;
  filePath: string;
  description?: string;
  title?: string;
  customLabels?: string[];
  language?: string;
}

export interface ReelsUploadResult {
  success: boolean;
  videoId?: string;
  reelId?: string;
  error?: string;
  totalSize?: number;
}

export class FacebookReelsUploadService {
  
  /**
   * Step 1: Initialize Reel upload session
   */
  async initializeReelUpload(options: ReelsUploadOptions): Promise<{
    success: boolean;
    videoId?: string;
    uploadUrl?: string;
    error?: string;
  }> {
    
    console.log('🎬 Initializing Facebook Reel upload session');
    
    try {
      const initUrl = `https://graph.facebook.com/v23.0/${options.pageId}/video_reels`;
      
      const response = await fetch(initUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          upload_phase: 'start',
          access_token: options.accessToken
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reel initialization failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Reel init error: ${result.error.message || result.error}`);
      }
      
      if (!result.video_id) {
        throw new Error(`No video ID returned: ${JSON.stringify(result)}`);
      }
      
      console.log(`✅ Reel upload session initialized: ${result.video_id}`);
      console.log(`Upload URL: ${result.upload_url}`);
      
      return {
        success: true,
        videoId: result.video_id,
        uploadUrl: result.upload_url
      };
      
    } catch (error) {
      console.error('Reel initialization error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Step 2: Upload video file to Facebook Reels endpoint
   */
  async uploadReelVideo(options: {
    videoId: string;
    filePath: string;
    accessToken: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    
    console.log(`🚀 Uploading reel video file: ${options.videoId}`);
    
    try {
      const fileStats = fs.statSync(options.filePath);
      const fileSize = fileStats.size;
      const videoBuffer = fs.readFileSync(options.filePath);
      
      console.log(`Uploading ${(fileSize / (1024 * 1024)).toFixed(1)}MB reel to Facebook`);
      
      // Use Facebook's Reels upload endpoint (different from regular videos)
      const uploadUrl = `https://rupload.facebook.com/video-upload/v23.0/${options.videoId}`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${options.accessToken}`,
          'offset': '0',
          'file_size': fileSize.toString(),
          'Content-Type': 'application/octet-stream'
        },
        body: videoBuffer
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reel upload failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.success !== true) {
        throw new Error(`Upload failed: ${JSON.stringify(result)}`);
      }
      
      console.log('✅ Reel video uploaded successfully');
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error('Reel upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Step 3: Publish the uploaded Reel
   */
  async publishReel(options: {
    pageId: string;
    videoId: string;
    accessToken: string;
    description?: string;
    title?: string;
  }): Promise<{
    success: boolean;
    reelId?: string;
    error?: string;
  }> {
    
    console.log(`📱 Publishing reel: ${options.videoId}`);
    
    try {
      const publishUrl = `https://graph.facebook.com/v23.0/${options.pageId}/video_reels`;
      
      const params = new URLSearchParams({
        access_token: options.accessToken,
        video_id: options.videoId,
        upload_phase: 'finish',
        video_state: 'PUBLISHED'
      });
      
      // Add description if provided
      if (options.description) {
        params.append('description', options.description);
      }
      
      // Add title if provided
      if (options.title) {
        params.append('title', options.title);
      }
      
      const response = await fetch(publishUrl, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reel publishing failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Publish error: ${result.error.message || result.error}`);
      }
      
      console.log('✅ Reel published successfully');
      console.log('Reel result:', JSON.stringify(result, null, 2));
      
      return {
        success: true,
        reelId: result.id || options.videoId
      };
      
    } catch (error) {
      console.error('Reel publishing error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Complete Reel upload process
   */
  async uploadReelToFacebook(options: ReelsUploadOptions): Promise<ReelsUploadResult> {
    
    console.log('🎥 Starting complete Facebook Reel upload process');
    
    try {
      const fileStats = fs.statSync(options.filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      if (fileSizeMB > 4096) {
        throw new Error(`Reel file too large: ${fileSizeMB.toFixed(1)}MB (max 4GB for Reels)`);
      }
      
      console.log(`Processing ${fileSizeMB.toFixed(1)}MB reel for Facebook`);
      
      // Step 1: Initialize upload session
      const initResult = await this.initializeReelUpload(options);
      
      if (!initResult.success || !initResult.videoId) {
        return {
          success: false,
          error: `Initialization failed: ${initResult.error}`,
          totalSize: fileStats.size
        };
      }
      
      // Step 2: Upload video file
      const uploadResult = await this.uploadReelVideo({
        videoId: initResult.videoId,
        filePath: options.filePath,
        accessToken: options.accessToken
      });
      
      if (!uploadResult.success) {
        return {
          success: false,
          error: `Upload failed: ${uploadResult.error}`,
          totalSize: fileStats.size
        };
      }
      
      // Step 3: Publish the reel
      const publishResult = await this.publishReel({
        pageId: options.pageId,
        videoId: initResult.videoId,
        accessToken: options.accessToken,
        description: options.description,
        title: options.title
      });
      
      if (!publishResult.success) {
        return {
          success: false,
          error: `Publishing failed: ${publishResult.error}`,
          totalSize: fileStats.size
        };
      }
      
      console.log('🎉 Complete Facebook Reel upload successful!');
      
      return {
        success: true,
        videoId: initResult.videoId,
        reelId: publishResult.reelId,
        totalSize: fileStats.size
      };
      
    } catch (error) {
      console.error('Complete reel upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        totalSize: fs.existsSync(options.filePath) ? fs.statSync(options.filePath).size : 0
      };
    }
  }
}