import { promises as fs } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { storage } from '../storage';

interface VideoUploadResult {
  success: boolean;
  facebookPostId?: string;
  error?: string;
  uploadDetails?: {
    videoId?: string;
    uploadSessionId?: string;
  };
}

export class FacebookVideoUploader {
  /**
   * Upload video file to Facebook page
   */
  static async uploadVideo(
    filePath: string,
    accountId: number,
    content: string,
    videoInfo?: { title?: string; duration?: string }
  ): Promise<VideoUploadResult> {
    try {
      console.log('📤 Starting Facebook video upload...');

      // Get Facebook account details
      const account = await storage.getFacebookAccount(accountId);
      if (!account) {
        return { success: false, error: 'Facebook account not found' };
      }

      const { accessToken, pageId } = account;
      
      // Check if file exists
      const fileStats = await fs.stat(filePath);
      if (!fileStats.isFile()) {
        return { success: false, error: 'Video file not found' };
      }

      console.log(`📊 Video file size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

      // For large files (>200MB), use resumable upload
      if (fileStats.size > 200 * 1024 * 1024) {
        return await this.uploadLargeVideo(filePath, pageId, accessToken, content, videoInfo);
      } else {
        return await this.uploadSmallVideo(filePath, pageId, accessToken, content, videoInfo);
      }

    } catch (error) {
      console.error('❌ Error uploading video to Facebook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload small video files (<200MB) using direct upload
   */
  private static async uploadSmallVideo(
    filePath: string,
    pageId: string,
    accessToken: string,
    content: string,
    videoInfo?: { title?: string; duration?: string }
  ): Promise<VideoUploadResult> {
    try {
      console.log('📤 Using direct upload for small video...');

      const formData = new FormData();
      const fileBuffer = await fs.readFile(filePath);
      
      formData.append('source', fileBuffer, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      formData.append('description', content);
      if (videoInfo?.title) {
        formData.append('title', videoInfo.title);
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      const result = await response.json() as any;

      if (!response.ok) {
        console.error('❌ Facebook API error:', result);
        return {
          success: false,
          error: result.error?.message || 'Upload failed'
        };
      }

      console.log('✅ Video uploaded successfully:', result.id);
      return {
        success: true,
        facebookPostId: result.id,
        uploadDetails: {
          videoId: result.id
        }
      };

    } catch (error) {
      console.error('❌ Error in small video upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Small video upload failed'
      };
    }
  }

  /**
   * Upload large video files (>200MB) using resumable upload
   */
  private static async uploadLargeVideo(
    filePath: string,
    pageId: string,
    accessToken: string,
    content: string,
    videoInfo?: { title?: string; duration?: string }
  ): Promise<VideoUploadResult> {
    try {
      console.log('📤 Using resumable upload for large video...');

      const fileStats = await fs.stat(filePath);
      const fileSize = fileStats.size;

      // Step 1: Initialize upload session
      const initResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          upload_phase: 'start',
          file_size: fileSize
        })
      });

      const initResult = await initResponse.json() as any;
      if (!initResponse.ok) {
        console.error('❌ Failed to initialize upload session:', initResult);
        return {
          success: false,
          error: initResult.error?.message || 'Failed to initialize upload'
        };
      }

      const uploadSessionId = initResult.upload_session_id;
      const videoId = initResult.video_id;
      console.log('✅ Upload session initialized:', uploadSessionId);

      // Step 2: Upload video chunks
      const chunkSize = 32 * 1024 * 1024; // 32MB chunks
      const fileHandle = await fs.open(filePath, 'r');
      let offset = 0;

      try {
        while (offset < fileSize) {
          const remainingBytes = fileSize - offset;
          const currentChunkSize = Math.min(chunkSize, remainingBytes);
          
          console.log(`📤 Uploading chunk: ${offset}-${offset + currentChunkSize - 1}/${fileSize}`);

          const buffer = Buffer.alloc(currentChunkSize);
          await fileHandle.read(buffer, 0, currentChunkSize, offset);

          const chunkResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
              'Content-Range': `bytes ${offset}-${offset + currentChunkSize - 1}/${fileSize}`
            },
            body: JSON.stringify({
              upload_phase: 'transfer',
              upload_session_id: uploadSessionId,
              start_offset: offset,
              video_file_chunk: buffer.toString('base64')
            })
          });

          const chunkResult = await chunkResponse.json() as any;
          if (!chunkResponse.ok) {
            console.error('❌ Chunk upload failed:', chunkResult);
            throw new Error(chunkResult.error?.message || 'Chunk upload failed');
          }

          offset += currentChunkSize;
        }

        console.log('✅ All chunks uploaded successfully');

        // Step 3: Finalize upload
        const finalizeResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            upload_phase: 'finish',
            upload_session_id: uploadSessionId,
            description: content,
            title: videoInfo?.title || 'Uploaded Video'
          })
        });

        const finalResult = await finalizeResponse.json() as any;
        if (!finalizeResponse.ok) {
          console.error('❌ Failed to finalize upload:', finalResult);
          return {
            success: false,
            error: finalResult.error?.message || 'Failed to finalize upload'
          };
        }

        console.log('✅ Large video upload completed:', videoId);
        return {
          success: true,
          facebookPostId: videoId,
          uploadDetails: {
            videoId,
            uploadSessionId
          }
        };

      } finally {
        await fileHandle.close();
      }

    } catch (error) {
      console.error('❌ Error in large video upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Large video upload failed'
      };
    }
  }

  /**
   * Check upload status for resumable uploads
   */
  static async checkUploadStatus(
    uploadSessionId: string,
    pageId: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    status?: string;
    progress?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const result = await response.json() as any;
      
      if (!response.ok) {
        return {
          success: false,
          error: result.error?.message || 'Failed to check status'
        };
      }

      return {
        success: true,
        status: result.status || 'processing',
        progress: result.progress || 0
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Status check failed'
      };
    }
  }
}