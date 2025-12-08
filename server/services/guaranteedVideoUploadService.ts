import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GuaranteedUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
}

export class GuaranteedVideoUploadService {
  static async uploadGuaranteedVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<GuaranteedUploadResult> {
    console.log('Starting guaranteed video upload');
    
    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const outputFile = `/tmp/guaranteed_video_${Date.now()}.mp4`;
      
      console.log('Downloading video file');
      
      // Use multiple download strategies
      const downloadStrategies = [
        // Strategy 1: Direct usercontent download
        `aria2c -x 16 -s 16 -k 1M --file-allocation=none --check-certificate=false -o "${outputFile}" "https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t"`,
        
        // Strategy 2: Curl with follow redirects
        `curl -L -o "${outputFile}" "https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t"`,
        
        // Strategy 3: wget with user agent
        `wget -O "${outputFile}" --user-agent="Mozilla/5.0" "https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t"`
      ];
      
      let downloadSuccess = false;
      
      for (const strategy of downloadStrategies) {
        try {
          console.log('Trying download strategy:', strategy.split(' ')[0]);
          await execAsync(strategy, { timeout: 300000 }); // 5 minute timeout
          
          if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile);
            const fileSizeMB = stats.size / (1024 * 1024);
            
            if (fileSizeMB > 50) { // Require at least 50MB for valid video
              console.log(`Download successful: ${fileSizeMB.toFixed(1)}MB`);
              downloadSuccess = true;
              break;
            } else {
              console.log(`File too small: ${fileSizeMB.toFixed(1)}MB, trying next strategy`);
              fs.unlinkSync(outputFile);
            }
          }
        } catch (error) {
          console.log('Download strategy failed:', (error as Error).message);
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
          }
        }
      }
      
      if (!downloadSuccess) {
        throw new Error('All download strategies failed');
      }
      
      const stats = fs.statSync(outputFile);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Uploading ${fileSizeMB.toFixed(1)}MB video to Facebook`);
      
      // Use Facebook Video API (not Posts API)
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(outputFile);
      
      formData.append('access_token', accessToken);
      formData.append('description', `Google Drive Video - ${fileSizeMB.toFixed(1)}MB - Guaranteed Upload`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      // Use /videos endpoint for guaranteed video upload
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders()
        }
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Video uploaded successfully to Facebook');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video - ${fileSizeMB.toFixed(1)}MB - Guaranteed Upload`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(outputFile);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Facebook API error:', errorText);
      
      // Clean up on failure
      fs.unlinkSync(outputFile);
      
      return {
        success: false,
        error: errorText,
        sizeMB: fileSizeMB
      };
      
    } catch (error) {
      console.log('Guaranteed upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}