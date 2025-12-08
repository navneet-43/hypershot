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
  qualityPreserved?: boolean;
}

export class WorkingGoogleDriveService {
  static async uploadGoogleDriveVideoComplete(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<WorkingUploadResult> {
    console.log('Starting working Google Drive video upload with quality preservation');
    
    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL format');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/working_${Date.now()}.mp4`;
      
      console.log('Downloading Google Drive video with multiple methods');
      
      // Method 1: Direct download with aria2c
      try {
        const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const aria2Command = `aria2c -x 16 -s 16 -k 1M --file-allocation=none --check-certificate=false --timeout=300 --retry-wait=5 --max-tries=3 -o "${downloadFile}" "${directUrl}"`;
        
        console.log('Attempting direct download with aria2c');
        await execAsync(aria2Command, { timeout: 600000 });
        
        if (fs.existsSync(downloadFile)) {
          const stats = fs.statSync(downloadFile);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`Direct download successful: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB > 10) {
            return await this.uploadToFacebook(downloadFile, sizeMB, accountId, pageId, accessToken, storage, googleDriveUrl);
          }
        }
      } catch (error) {
        console.log('Direct download failed, trying alternative methods');
      }
      
      // Method 2: Enhanced Google Drive access
      try {
        const enhancedUrls = [
          `https://drive.google.com/uc?export=download&id=${fileId}`,
          `https://docs.google.com/uc?export=download&id=${fileId}`,
          `https://drive.usercontent.google.com/u/0/uc?id=${fileId}&export=download`
        ];
        
        for (const url of enhancedUrls) {
          console.log('Trying enhanced URL method');
          const curlCommand = `curl -L -C - --max-time 600 --retry 3 --retry-delay 10 -o "${downloadFile}" "${url}"`;
          
          try {
            await execAsync(curlCommand, { timeout: 700000 });
            
            if (fs.existsSync(downloadFile)) {
              const stats = fs.statSync(downloadFile);
              const sizeMB = stats.size / (1024 * 1024);
              console.log(`Enhanced download successful: ${sizeMB.toFixed(1)}MB`);
              
              if (sizeMB > 10) {
                return await this.uploadToFacebook(downloadFile, sizeMB, accountId, pageId, accessToken, storage, googleDriveUrl);
              }
            }
          } catch (urlError) {
            console.log('URL method failed, trying next');
            continue;
          }
        }
      } catch (error) {
        console.log('Enhanced methods failed');
      }
      
      // Method 3: wget with user agent
      try {
        console.log('Trying wget with user agent');
        const wgetUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const wgetCommand = `wget --timeout=600 --tries=3 --wait=10 --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -O "${downloadFile}" "${wgetUrl}"`;
        
        await execAsync(wgetCommand, { timeout: 700000 });
        
        if (fs.existsSync(downloadFile)) {
          const stats = fs.statSync(downloadFile);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`wget download successful: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB > 10) {
            return await this.uploadToFacebook(downloadFile, sizeMB, accountId, pageId, accessToken, storage, googleDriveUrl);
          }
        }
      } catch (error) {
        console.log('wget method failed');
      }
      
      // Clean up failed download
      if (fs.existsSync(downloadFile)) {
        fs.unlinkSync(downloadFile);
      }
      
      throw new Error('All download methods failed - file may be access restricted');
      
    } catch (error) {
      console.log('Working upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        qualityPreserved: false
      };
    }
  }
  
  private static async uploadToFacebook(
    videoFile: string,
    sizeMB: number,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any,
    originalUrl: string
  ): Promise<WorkingUploadResult> {
    console.log(`Uploading ${sizeMB.toFixed(1)}MB video to Facebook with quality preservation`);
    
    try {
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      // Use standard upload for better compatibility
      const formData = new FormData();
      const fileStream = fs.createReadStream(videoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Google Drive Video - ${sizeMB.toFixed(1)}MB (Quality Preserved)`);
      formData.append('description', `Quality Preserved Upload - ${sizeMB.toFixed(1)}MB from Google Drive`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Uploading to Facebook with preserved quality');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Facebook upload successful');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Quality Preserved - ${sizeMB.toFixed(1)}MB (Original Quality Maintained)`,
            mediaUrl: originalUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(videoFile);
          
          console.log('Upload completed successfully');
          console.log('Database Post ID:', newPost.id);
          console.log('Live URL: https://facebook.com/' + uploadResult.id);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: sizeMB,
            qualityPreserved: true
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Facebook upload failed:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(videoFile);
      
      return {
        success: false,
        error: `Facebook upload failed: ${uploadResponse.status} - ${errorText}`,
        sizeMB: sizeMB,
        qualityPreserved: false
      };
      
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(videoFile)) {
        fs.unlinkSync(videoFile);
      }
      
      console.log('Upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        sizeMB: sizeMB,
        qualityPreserved: false
      };
    }
  }
}