import fetch from 'node-fetch';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface ChunkedUploadOptions {
  accessToken: string;
  pageId: string;
  filePath: string;
  title?: string;
  description?: string;
  customLabels?: string[];
  language?: string;
  isReel?: boolean;
}

export interface ChunkedUploadResult {
  success: boolean;
  videoId?: string;
  facebookUrl?: string;
  uploadSessionId?: string;
  error?: string;
  totalSize?: number;
  uploadedBytes?: number;
}

export class ChunkedVideoUploadService {
  
  async startUploadSession(options: ChunkedUploadOptions): Promise<{
    success: boolean;
    sessionId?: string;
    videoId?: string;
    startOffset?: number;
    endOffset?: number;
    uploadUrl?: string;
    error?: string;
  }> {
    
    const fileSize = fs.statSync(options.filePath).size;
    
    console.log(`Starting Facebook upload session for ${(fileSize / (1024 * 1024)).toFixed(1)}MB video`);
    
    // Use appropriate endpoint - for Reels, we use the Page's video_reels endpoint
    const startUrl = options.isReel 
      ? `https://graph.facebook.com/v23.0/${options.pageId}/video_reels`
      : `https://graph-video.facebook.com/v20.0/${options.pageId}/videos`;
      
    console.log(`Using ${options.isReel ? 'REEL' : 'VIDEO'} endpoint: ${startUrl}`);
    
    const params = new URLSearchParams({
      upload_phase: 'start',
      access_token: options.accessToken
    });
    
    // Only add file_size for regular videos, not for Reels (per Facebook docs)
    if (!options.isReel) {
      params.append('file_size', fileSize.toString());
    }
    
    try {
      const response = await fetch(startUrl, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Start phase failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Start phase error: ${result.error.message || result.error}`);
      }
      
      // Handle different response formats for Reels vs regular videos
      if (options.isReel) {
        // For Reels API, Facebook returns video_id and upload_url instead of upload_session_id
        if (!result.video_id || !result.upload_url) {
          throw new Error(`Incomplete Reel response: ${JSON.stringify(result)}`);
        }
        
        console.log(`Reel upload session started`);
        console.log(`Video ID: ${result.video_id}`);
        console.log(`Upload URL: ${result.upload_url}`);
        
        // For Reels, we use the video_id as session identifier
        return {
          success: true,
          sessionId: result.video_id, // Use video_id as session identifier for Reels
          videoId: result.video_id,
          uploadUrl: result.upload_url, // Store the upload URL for Reels
          startOffset: 0, // Reels typically start from 0
          endOffset: fileSize // Upload entire file for Reels
        };
      } else {
        // Regular video upload
        if (!result.upload_session_id) {
          throw new Error(`No session ID returned: ${JSON.stringify(result)}`);
        }
        
        console.log(`Upload session started: ${result.upload_session_id}`);
        console.log(`Video ID: ${result.video_id}`);
        console.log(`First chunk: ${result.start_offset} to ${result.end_offset}`);
        
        return {
          success: true,
          sessionId: result.upload_session_id,
          videoId: result.video_id,
          startOffset: parseInt(result.start_offset),
          endOffset: parseInt(result.end_offset)
        };
      }
      
    } catch (error) {
      console.error('Start upload session error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async transferChunk(options: {
    pageId: string;
    accessToken: string;
    sessionId: string;
    filePath: string;
    startOffset: number;
    endOffset: number;
  }): Promise<{
    success: boolean;
    nextStartOffset?: number;
    nextEndOffset?: number;
    isComplete?: boolean;
    error?: string;
  }> {
    
    const chunkSize = options.endOffset - options.startOffset;
    console.log(`Transferring chunk: ${options.startOffset} to ${options.endOffset} (${(chunkSize / (1024 * 1024)).toFixed(1)}MB)`);
    
    try {
      // Read the specific chunk from file
      const fileHandle = fs.openSync(options.filePath, 'r');
      const buffer = Buffer.alloc(chunkSize);
      fs.readSync(fileHandle, buffer, 0, chunkSize, options.startOffset);
      fs.closeSync(fileHandle);
      
      // Transfer phase always uses the same endpoint structure regardless of Reels
    const transferUrl = `https://graph-video.facebook.com/v20.0/${options.pageId}/videos`;
      
      const formData = new FormData();
      formData.append('upload_phase', 'transfer');
      formData.append('upload_session_id', options.sessionId);
      formData.append('start_offset', options.startOffset.toString());
      formData.append('access_token', options.accessToken);
      formData.append('video_file_chunk', buffer, {
        filename: 'chunk.mp4',
        contentType: 'video/mp4'
      });
      
      const response = await fetch(transferUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transfer failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Transfer error: ${result.error.message || result.error}`);
      }
      
      const nextStart = parseInt(result.start_offset);
      const nextEnd = parseInt(result.end_offset);
      const isComplete = nextStart === nextEnd;
      
      console.log(`Chunk transferred. Next: ${nextStart} to ${nextEnd}${isComplete ? ' (Complete)' : ''}`);
      
      return {
        success: true,
        nextStartOffset: nextStart,
        nextEndOffset: nextEnd,
        isComplete: isComplete
      };
      
    } catch (error) {
      console.error('Transfer chunk error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async finishUpload(options: {
    pageId: string;
    accessToken: string;
    sessionId: string;
    title?: string;
    description?: string;
    customLabels?: string[];
    language?: string;
    isReel?: boolean;
  }): Promise<{
    success: boolean;
    videoId?: string;
    facebookUrl?: string;
    error?: string;
  }> {
    
    console.log('Finishing upload session');
    
    try {
      // Use appropriate endpoint for Reels vs regular videos
      const finishUrl = options.isReel 
        ? `https://graph.facebook.com/v20.0/${options.pageId}/video_reels`
        : `https://graph-video.facebook.com/v20.0/${options.pageId}/videos`;
        
      console.log(`Using finish endpoint: ${finishUrl}`);
      
      const params = new URLSearchParams({
        access_token: options.accessToken
      });
      
      if (options.isReel) {
        // For Reels, use video_id and publish parameters as per Facebook docs
        params.append('video_id', options.sessionId); // sessionId contains video_id for Reels
        params.append('upload_phase', 'finish');
        params.append('video_state', 'PUBLISHED');
      } else {
        // For regular videos
        params.append('upload_phase', 'finish');
        params.append('upload_session_id', options.sessionId);
      }
      
      if (options.title) {
        params.append('title', options.title);
      }
      
      if (options.description) {
        params.append('description', options.description);
      }
      
      // Add custom labels for Meta Insights tracking with enhanced format
      if (options.customLabels && options.customLabels.length > 0) {
        const { CustomLabelValidator } = await import('./customLabelValidator');
        const customLabelsParam = CustomLabelValidator.createFacebookParameter(options.customLabels);
        
        if (customLabelsParam) {
          params.append('custom_labels', customLabelsParam);
          console.log('✅ META INSIGHTS: Adding validated custom labels to chunked video upload (v20.0)');
        }
      }
      
      // Include language metadata if provided
      if (options.language) {
        params.append('locale', options.language);
      }
      
      // Add privacy and publishing settings with enhanced Meta Insights parameters
      params.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      params.append('published', 'true');
      params.append('content_category', 'OTHER');
      
      // Add explicit Meta Insights enablement parameters
      params.append('insights_enabled', 'true');
      params.append('tracking_enabled', 'true');
      params.append('embeddable', 'true');
      
      const response = await fetch(finishUrl, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Finish phase failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Finish phase error: ${result.error.message || result.error}`);
      }
      
      const videoId = result.id || result.video_id || result.post_id;
      // Use different URL formats for reels vs regular videos
      const facebookUrl = videoId ? 
        (options.isReel ? `https://www.facebook.com/${videoId}` : `https://www.facebook.com/video.php?v=${videoId}`) : 
        'Processing...';
      
      console.log(`Upload completed successfully`);
      console.log(`Video ID: ${videoId}`);
      console.log(`Facebook URL: ${facebookUrl}`);
      console.log(`Full result: ${JSON.stringify(result)}`);
      
      return {
        success: true,
        videoId: videoId,
        facebookUrl: facebookUrl
      };
      
    } catch (error) {
      console.error('Finish upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async uploadVideoInChunks(options: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
    try {
      const fileSize = fs.statSync(options.filePath).size;
      const sizeMB = fileSize / (1024 * 1024);
      
      console.log(`Starting chunked upload for ${sizeMB.toFixed(1)}MB video`);
      
      // Phase 1: Start upload session
      const startResult = await this.startUploadSession(options);
      
      if (!startResult.success) {
        return {
          success: false,
          error: `Start phase failed: ${startResult.error}`,
          totalSize: fileSize
        };
      }
      
      // Handle Reels differently - they use direct upload to rupload.facebook.com
      if (options.isReel && startResult.uploadUrl && startResult.videoId) {
        console.log('🎬 REEL UPLOAD: Using Facebook official upload method');
        console.log(`Upload URL: ${startResult.uploadUrl}`);
        console.log(`Video ID: ${startResult.videoId}`);
        
        try {
          const fileBuffer = fs.readFileSync(options.filePath);
          
          // Upload directly to rupload.facebook.com as per Facebook documentation
          const uploadResponse = await fetch(startResult.uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': `OAuth ${options.accessToken}`,
              'offset': '0',
              'file_size': fileSize.toString(),
              'Content-Type': 'application/octet-stream'
            },
            body: fileBuffer
          });
          
          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Reel upload failed: ${uploadResponse.status} - ${errorText}`);
          }
          
          const uploadResult = await uploadResponse.json();
          console.log('✅ REEL UPLOADED SUCCESSFULLY:', uploadResult);
          
          // Phase 3: Finish and publish for Reels
          const finishResult = await this.finishUpload({
            pageId: options.pageId,
            accessToken: options.accessToken,
            sessionId: startResult.videoId, // Use video_id for Reels
            title: options.title,
            description: options.description,
            customLabels: options.customLabels,
            language: options.language,
            isReel: options.isReel
          });
          
          return {
            success: finishResult.success,
            videoId: finishResult.videoId || startResult.videoId,
            facebookUrl: finishResult.facebookUrl,
            uploadSessionId: startResult.videoId,
            error: finishResult.error,
            totalSize: fileSize,
            uploadedBytes: fileSize // Full file uploaded for Reels
          };
          
        } catch (error) {
          console.error('❌ REEL UPLOAD ERROR:', error);
          return {
            success: false,
            error: `Reel upload failed: ${(error as Error).message}`,
            uploadSessionId: startResult.videoId,
            totalSize: fileSize,
            uploadedBytes: 0
          };
        }
      }
      
      let currentStartOffset = startResult.startOffset!;
      let currentEndOffset = startResult.endOffset!;
      let uploadedBytes = 0;
      
      // Phase 2: Transfer chunks (for regular videos only)
      while (true) {
        const transferResult = await this.transferChunk({
          pageId: options.pageId,
          accessToken: options.accessToken,
          sessionId: startResult.sessionId!,
          filePath: options.filePath,
          startOffset: currentStartOffset,
          endOffset: currentEndOffset
        });
        
        if (!transferResult.success) {
          return {
            success: false,
            error: `Transfer failed: ${transferResult.error}`,
            uploadSessionId: startResult.sessionId,
            totalSize: fileSize,
            uploadedBytes: uploadedBytes
          };
        }
        
        uploadedBytes = currentEndOffset;
        const progressPercent = (uploadedBytes / fileSize * 100).toFixed(1);
        console.log(`Upload progress: ${progressPercent}% (${(uploadedBytes / (1024 * 1024)).toFixed(1)}MB)`);
        
        if (transferResult.isComplete) {
          console.log('All chunks transferred successfully');
          break;
        }
        
        currentStartOffset = transferResult.nextStartOffset!;
        currentEndOffset = transferResult.nextEndOffset!;
      }
      
      // Phase 3: Finish upload
      const finishResult = await this.finishUpload({
        pageId: options.pageId,
        accessToken: options.accessToken,
        sessionId: startResult.sessionId!,
        title: options.title,
        description: options.description,
        customLabels: options.customLabels,
        language: options.language
      });
      
      if (!finishResult.success) {
        return {
          success: false,
          error: `Finish phase failed: ${finishResult.error}`,
          uploadSessionId: startResult.sessionId,
          totalSize: fileSize,
          uploadedBytes: uploadedBytes
        };
      }
      
      return {
        success: true,
        videoId: finishResult.videoId,
        facebookUrl: finishResult.facebookUrl,
        uploadSessionId: startResult.sessionId,
        totalSize: fileSize,
        uploadedBytes: fileSize
      };
      
    } catch (error) {
      console.error('Chunked upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        totalSize: fs.existsSync(options.filePath) ? fs.statSync(options.filePath).size : 0
      };
    } finally {
      // Cleanup temp file
      try {
        if (fs.existsSync(options.filePath)) {
          fs.unlinkSync(options.filePath);
          console.log('Temp file cleaned up');
        }
      } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError);
      }
    }
  }

  /**
   * Upload video to Facebook with Reel support
   */
  async uploadVideoToFacebook(options: {
    videoFilePath: string;
    pageId: string;
    pageAccessToken: string;
    description?: string;
    customLabels?: string[];
    language?: string;
    isReel?: boolean;
  }): Promise<ChunkedUploadResult> {
    
    console.log(`🎬 Starting Facebook ${options.isReel ? 'Reel' : 'video'} upload`);
    
    return await this.uploadVideoInChunks({
      accessToken: options.pageAccessToken,
      pageId: options.pageId,
      filePath: options.videoFilePath,
      title: options.description || (options.isReel ? 'Reel Upload' : 'Video Upload'),
      description: options.description,
      customLabels: options.customLabels || [],
      language: options.language || 'en',
      isReel: options.isReel || false
    });
  }
}