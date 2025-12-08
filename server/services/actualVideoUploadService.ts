import * as fs from 'fs';
import { storage } from '../storage';

interface VideoUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
}

export class ActualVideoUploadService {
  static async uploadActualVideo(
    videoUrl: string,
    accountId: number
  ): Promise<VideoUploadResult> {
    try {
      console.log('Starting actual video file upload to Facebook');

      // Step 1: Download video using aria2c
      const videoFile = await this.downloadVideoFile(videoUrl);
      
      if (!videoFile) {
        throw new Error('Video download failed');
      }

      // Step 2: Upload actual video file to Facebook
      const account = await storage.getFacebookAccount(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const stats = fs.statSync(videoFile);
      const fileSizeMB = stats.size / (1024 * 1024);

      console.log(`Uploading actual video file: ${fileSizeMB.toFixed(1)}MB`);

      // Use Facebook's video API to upload actual file
      const result = await this.uploadVideoFile(videoFile, account, fileSizeMB);

      if (result.success) {
        // Save to database
        const newPost = await storage.createPost({
          userId: 3,
          accountId: account.id,
          content: `Actual Video Upload - ${fileSizeMB.toFixed(1)}MB`,
          mediaUrl: videoUrl,
          mediaType: 'video',
          language: 'en',
          status: 'published',
          publishedAt: new Date()
        });

        // Clean up
        fs.unlinkSync(videoFile);

        return {
          success: true,
          videoId: result.videoId,
          postId: newPost.id
        };
      }

      // Clean up on failure
      fs.unlinkSync(videoFile);
      
      return {
        success: false,
        error: result.error
      };

    } catch (error) {
      console.error('Actual video upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async downloadVideoFile(videoUrl: string): Promise<string | null> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const fileId = videoUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (!fileId) {
        throw new Error('Invalid Google Drive URL');
      }

      const timestamp = Date.now();
      const outputFile = `/tmp/actual_video_${timestamp}.mp4`;
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

      console.log('Downloading video file with aria2c...');

      const downloadCommand = `aria2c -x 16 -s 16 -k 1M --file-allocation=none --check-certificate=false -d /tmp -o actual_video_${timestamp}.mp4 '${downloadUrl}'`;

      await execAsync(downloadCommand, { timeout: 300000 });

      if (!fs.existsSync(outputFile)) {
        throw new Error('Download failed - file not created');
      }

      const stats = fs.statSync(outputFile);
      if (stats.size < 1024 * 1024) { // Less than 1MB
        throw new Error('Download failed - file too small');
      }

      console.log(`Downloaded ${(stats.size / (1024 * 1024)).toFixed(1)}MB video file`);
      return outputFile;

    } catch (error) {
      console.error('Download error:', error);
      return null;
    }
  }

  private static async uploadVideoFile(
    videoFile: string,
    account: any,
    fileSizeMB: number
  ): Promise<{ success: boolean; videoId?: string; error?: any }> {
    try {
      console.log('Uploading actual video file to Facebook (not link)');

      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;

      // For large files, use chunked upload
      if (fileSizeMB > 100) {
        console.log('Using chunked upload for large video file');
        return await this.uploadLargeVideoFile(videoFile, account, fileSizeMB);
      }

      // Standard upload for smaller files
      const formData = new FormData();
      const fileStream = fs.createReadStream(videoFile);

      formData.append('access_token', account.accessToken);
      formData.append('description', `Actual Video File - ${fileSizeMB.toFixed(1)}MB - ${new Date().toISOString()}`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });

      const uploadUrl = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders()
        }
      });

      const uploadResult = await uploadResponse.json() as any;

      if (uploadResult.id) {
        console.log('Actual video file uploaded successfully:', uploadResult.id);
        return {
          success: true,
          videoId: uploadResult.id
        };
      } else {
        console.log('Video file upload failed:', uploadResult);
        return {
          success: false,
          error: uploadResult
        };
      }

    } catch (error) {
      console.error('Video file upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async uploadLargeVideoFile(
    videoFile: string,
    account: any,
    fileSizeMB: number
  ): Promise<{ success: boolean; videoId?: string; error?: any }> {
    try {
      console.log('Uploading large video file using resumable upload');

      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const fileSize = fs.statSync(videoFile).size;

      // Step 1: Initialize upload session
      const initFormData = new FormData();
      initFormData.append('access_token', account.accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fileSize.toString());

      const initUrl = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
      
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initFormData,
        headers: initFormData.getHeaders()
      });

      const initResult = await initResponse.json() as any;

      if (!initResult.upload_session_id) {
        throw new Error('Failed to initialize upload session');
      }

      const sessionId = initResult.upload_session_id;
      console.log('Upload session created:', sessionId);

      // Step 2: Upload file in chunks
      const chunkSize = 8 * 1024 * 1024; // 8MB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        
        console.log(`Uploading chunk ${i + 1}/${totalChunks}`);

        const chunk = Buffer.alloc(end - start);
        const fd = fs.openSync(videoFile, 'r');
        fs.readSync(fd, chunk, 0, end - start, start);
        fs.closeSync(fd);

        const chunkFormData = new FormData();
        chunkFormData.append('access_token', account.accessToken);
        chunkFormData.append('upload_phase', 'transfer');
        chunkFormData.append('upload_session_id', sessionId);
        chunkFormData.append('start_offset', start.toString());
        chunkFormData.append('video_file_chunk', chunk, {
          filename: 'chunk',
          contentType: 'application/octet-stream'
        });

        const chunkResponse = await fetch(initUrl, {
          method: 'POST',
          body: chunkFormData,
          headers: chunkFormData.getHeaders()
        });

        const chunkResult = await chunkResponse.json() as any;
        
        if (!chunkResult.success && chunkResponse.status !== 200) {
          throw new Error(`Chunk upload failed: ${JSON.stringify(chunkResult)}`);
        }
      }

      // Step 3: Finalize upload
      const finalFormData = new FormData();
      finalFormData.append('access_token', account.accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', sessionId);
      finalFormData.append('description', `Large Video File - ${fileSizeMB.toFixed(1)}MB - ${new Date().toISOString()}`);
      finalFormData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      finalFormData.append('published', 'true');

      const finalResponse = await fetch(initUrl, {
        method: 'POST',
        body: finalFormData,
        headers: finalFormData.getHeaders()
      });

      const finalResult = await finalResponse.json() as any;

      if (finalResult.id) {
        console.log('Large video file uploaded successfully:', finalResult.id);
        return {
          success: true,
          videoId: finalResult.id
        };
      } else {
        return {
          success: false,
          error: finalResult
        };
      }

    } catch (error) {
      console.error('Large video upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}