import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface OptimizedUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
}

export class OptimizedVideoUploadService {
  static async uploadOptimizedVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<OptimizedUploadResult> {
    console.log('Starting optimized video upload with compression');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/download_${Date.now()}.mp4`;
      const optimizedFile = `/tmp/optimized_${Date.now()}.mp4`;
      
      console.log('Downloading video file');
      
      // Download with aria2c for speed
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `aria2c -x 8 -s 8 --file-allocation=none --check-certificate=false -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand, { timeout: 180000 });
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Download failed');
      }
      
      const downloadStats = fs.statSync(downloadFile);
      const downloadSizeMB = downloadStats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${downloadSizeMB.toFixed(1)}MB`);
      
      if (downloadSizeMB < 10) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small');
      }
      
      // Optimize video to under 50MB for reliable Facebook upload
      console.log('Optimizing video for Facebook compatibility');
      
      const optimizeCommand = `ffmpeg -i "${downloadFile}" -vcodec libx264 -acodec aac -b:v 2000k -maxrate 2500k -bufsize 5000k -preset medium -movflags +faststart -f mp4 "${optimizedFile}"`;
      
      await execAsync(optimizeCommand, { timeout: 300000 });
      
      if (!fs.existsSync(optimizedFile)) {
        fs.unlinkSync(downloadFile);
        throw new Error('Video optimization failed');
      }
      
      const optimizedStats = fs.statSync(optimizedFile);
      const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
      
      console.log(`Optimized to: ${optimizedSizeMB.toFixed(1)}MB`);
      
      // Clean up download file
      fs.unlinkSync(downloadFile);
      
      // Upload optimized video to Facebook
      console.log('Uploading optimized video to Facebook');
      
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(optimizedFile);
      
      formData.append('access_token', accessToken);
      formData.append('description', `Google Drive Video - Optimized ${optimizedSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4',
        knownLength: optimizedStats.size
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Optimized video uploaded successfully');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video - Optimized ${optimizedSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(optimizedFile);
          
          console.log('Upload completed successfully');
          console.log('Database Post ID:', newPost.id);
          console.log('Live URL: https://facebook.com/' + uploadResult.id);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: optimizedSizeMB
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Facebook API error:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(optimizedFile);
      
      return {
        success: false,
        error: `Facebook API error: ${uploadResponse.status} - ${errorText}`,
        sizeMB: optimizedSizeMB
      };
      
    } catch (error) {
      console.log('Optimized upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}