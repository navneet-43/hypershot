import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WorkingUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
}

export class WorkingVideoUploadService {
  static async uploadWorkingVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<WorkingUploadResult> {
    console.log('Starting working video upload with direct approach');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const outputFile = `/tmp/working_video_${Date.now()}.mp4`;
      
      console.log('Downloading with optimized approach');
      
      // Single optimized download command
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `curl -L --max-time 300 --connect-timeout 30 -o "${outputFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand);
      
      if (!fs.existsSync(outputFile)) {
        throw new Error('Download failed');
      }
      
      const stats = fs.statSync(outputFile);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${fileSizeMB.toFixed(1)}MB`);
      
      if (fileSizeMB < 10) {
        fs.unlinkSync(outputFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      console.log('Uploading to Facebook with video endpoint');
      
      // Use node-fetch with form-data for reliable upload
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(outputFile);
      
      formData.append('access_token', accessToken);
      formData.append('description', `Google Drive Video Upload - ${fileSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4',
        knownLength: stats.size
      });
      
      // Use Facebook's video upload endpoint
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Sending to Facebook API');
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Video uploaded successfully');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video Upload - ${fileSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(outputFile);
          
          console.log('Upload completed successfully');
          console.log('Database Post ID:', newPost.id);
          console.log('Live URL: https://facebook.com/' + uploadResult.id);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Facebook API response:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(outputFile);
      
      return {
        success: false,
        error: `Facebook API error: ${uploadResponse.status} - ${errorText}`,
        sizeMB: fileSizeMB
      };
      
    } catch (error) {
      console.log('Working upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}