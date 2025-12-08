import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DirectVideoResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
}

export class DirectGoogleDriveVideoService {
  static async uploadGoogleDriveVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<DirectVideoResult> {
    console.log('Starting direct Google Drive video upload');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/gdrive_${Date.now()}.mp4`;
      
      console.log('Downloading Google Drive video');
      
      // Direct download with multiple fallback methods
      const downloadUrls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://docs.google.com/uc?export=download&id=${fileId}`
      ];
      
      let downloadSuccess = false;
      
      for (const url of downloadUrls) {
        try {
          console.log('Trying download method');
          const command = `curl -L --max-time 180 -o "${downloadFile}" "${url}"`;
          await execAsync(command);
          
          if (fs.existsSync(downloadFile)) {
            const stats = fs.statSync(downloadFile);
            const sizeMB = stats.size / (1024 * 1024);
            
            if (sizeMB > 5) { // At least 5MB for valid video
              console.log(`Downloaded: ${sizeMB.toFixed(1)}MB`);
              downloadSuccess = true;
              break;
            } else {
              fs.unlinkSync(downloadFile);
            }
          }
        } catch (error) {
          if (fs.existsSync(downloadFile)) {
            fs.unlinkSync(downloadFile);
          }
        }
      }
      
      if (!downloadSuccess) {
        throw new Error('All download methods failed');
      }
      
      const stats = fs.statSync(downloadFile);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Uploading ${fileSizeMB.toFixed(1)}MB to Facebook`);
      
      // Upload to Facebook
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(downloadFile);
      
      formData.append('access_token', accessToken);
      formData.append('description', `Google Drive Video - ${fileSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
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
          console.log('Video uploaded successfully');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video - ${fileSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(downloadFile);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Upload error:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(downloadFile);
      
      return {
        success: false,
        error: `Upload failed: ${uploadResponse.status} - ${errorText}`,
        sizeMB: fileSizeMB
      };
      
    } catch (error) {
      console.log('Direct upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}