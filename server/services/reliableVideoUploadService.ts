import * as fs from 'fs';
import { storage } from '../storage';

interface UploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  method?: string;
}

export class ReliableVideoUploadService {
  static async uploadGoogleDriveVideo(
    videoUrl: string,
    accountId: number
  ): Promise<UploadResult> {
    try {
      console.log('Starting reliable Google Drive video upload');

      // Step 1: Download video
      const videoFile = await this.downloadVideo(videoUrl);
      
      if (!videoFile) {
        throw new Error('Video download failed');
      }

      // Step 2: Upload using multiple methods
      const account = await storage.getFacebookAccount(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const stats = fs.statSync(videoFile);
      const fileSizeMB = stats.size / (1024 * 1024);

      console.log(`Uploading ${fileSizeMB.toFixed(1)}MB video`);

      // Try buffer method first (most reliable for large files)
      const result = await this.uploadWithBuffer(videoFile, account, fileSizeMB);

      if (result.success) {
        // Save to database
        const newPost = await storage.createPost({
          userId: 3,
          accountId: account.id,
          content: `Google Drive Video - ${fileSizeMB.toFixed(1)}MB - Uploaded Successfully`,
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
          postId: newPost.id,
          method: result.method
        };
      }

      // Clean up on failure
      fs.unlinkSync(videoFile);
      
      return {
        success: false,
        error: result.error,
        method: result.method
      };

    } catch (error) {
      console.error('Upload service error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async downloadVideo(videoUrl: string): Promise<string | null> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const fileId = videoUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (!fileId) {
        throw new Error('Invalid Google Drive URL');
      }

      const outputFile = `/tmp/reliable_video_${Date.now()}.mp4`;
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

      console.log('Downloading with aria2c...');

      const downloadCommand = `aria2c -x 8 -s 8 -k 1M --file-allocation=none --check-certificate=false -d /tmp -o ${outputFile.split('/').pop()} '${downloadUrl}'`;

      await execAsync(downloadCommand, { timeout: 300000 });

      if (!fs.existsSync(outputFile)) {
        throw new Error('Download failed - file not created');
      }

      const stats = fs.statSync(outputFile);
      if (stats.size < 1024 * 1024) { // Less than 1MB
        throw new Error('Download failed - file too small');
      }

      console.log(`Downloaded ${(stats.size / (1024 * 1024)).toFixed(1)}MB`);
      return outputFile;

    } catch (error) {
      console.error('Download error:', error);
      return null;
    }
  }

  private static async uploadWithBuffer(
    videoFile: string,
    account: any,
    fileSizeMB: number
  ): Promise<{ success: boolean; videoId?: string; error?: any; method: string }> {
    try {
      console.log('Uploading with buffer method to avoid file access issues');

      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;

      // Read entire file into buffer to avoid file access issues
      const fileBuffer = fs.readFileSync(videoFile);
      console.log(`File read into buffer: ${fileBuffer.length} bytes`);

      const formData = new FormData();
      formData.append('access_token', account.accessToken);
      formData.append('description', `Google Drive Video - ${fileSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileBuffer, {
        filename: 'google_drive_video.mp4',
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
        console.log('Buffer upload successful:', uploadResult.id);
        return {
          success: true,
          videoId: uploadResult.id,
          method: 'buffer'
        };
      } else {
        console.log('Buffer upload failed:', uploadResult);
        return {
          success: false,
          error: uploadResult,
          method: 'buffer'
        };
      }

    } catch (error) {
      console.error('Buffer upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        method: 'buffer'
      };
    }
  }
}