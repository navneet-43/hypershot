import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface YouTubeVideoUploadOptions {
  accessToken: string;
  pageId: string;
  youtubeUrl: string;
  targetSizeMB?: number;
}

export interface VideoUploadResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  publishedLink?: string;
  attachmentType?: string;
  sizeMB?: number;
  error?: string;
  uploadType: 'actual_video_file' | 'link_post' | 'failed';
}

export class WorkingYouTubeVideoUpload {
  
  async downloadYouTubeVideo(youtubeUrl: string): Promise<string> {
    console.log('Downloading YouTube video: ' + youtubeUrl);
    
    const ytdl = require('@distube/ytdl-core');
    
    const info = await ytdl.getInfo(youtubeUrl);
    console.log('Video: ' + info.videoDetails.title);
    
    // Get best quality with video and audio
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    const bestFormat = ytdl.chooseFormat(formats, { quality: 'highest' });
    
    const outputPath = '/tmp/youtube_download_' + Date.now() + '.mp4';
    
    const videoStream = ytdl(youtubeUrl, { format: bestFormat });
    const writeStream = fs.createWriteStream(outputPath);
    
    await new Promise((resolve, reject) => {
      videoStream.pipe(writeStream);
      videoStream.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Download failed');
    }
    
    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log('Downloaded: ' + sizeMB.toFixed(1) + 'MB');
    
    return outputPath;
  }
  
  async optimizeForFacebook(inputPath: string, targetSizeMB: number = 25): Promise<string> {
    console.log('Optimizing video for Facebook upload (target: ' + targetSizeMB + 'MB)');
    
    const outputPath = '/tmp/facebook_optimized_' + Date.now() + '.mp4';
    
    // Calculate bitrate for target size (assuming 3 minutes duration)
    const targetBitrateKbps = Math.floor((targetSizeMB * 8 * 1024) / 180); // 3 minutes
    
    const optimizeCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -crf 25 -b:v ${targetBitrateKbps}k -maxrate ${Math.floor(targetBitrateKbps * 1.2)}k -bufsize ${targetBitrateKbps * 2}k -c:a aac -b:a 96k -ac 2 -ar 44100 -movflags +faststart -vf "scale=1280:720" -y "${outputPath}"`;
    
    await execAsync(optimizeCmd, { timeout: 180000 });
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Optimization failed');
    }
    
    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log('Optimized: ' + sizeMB.toFixed(1) + 'MB');
    
    // Cleanup original
    try { fs.unlinkSync(inputPath); } catch {}
    
    if (sizeMB < 5) {
      throw new Error('Optimization produced file too small: ' + sizeMB.toFixed(1) + 'MB');
    }
    
    return outputPath;
  }
  
  async uploadVideoFile(videoPath: string, options: YouTubeVideoUploadOptions): Promise<VideoUploadResult> {
    console.log('Uploading video file to Facebook');
    
    const stats = fs.statSync(videoPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    const formData = new FormData();
    const fileStream = fs.createReadStream(videoPath);
    
    formData.append('access_token', options.accessToken);
    formData.append('source', fileStream, {
      filename: 'youtube_video.mp4',
      contentType: 'video/mp4'
    });
    
    const title = 'YouTube Video - High Quality Upload';
    const description = 'High quality video from YouTube uploaded as actual video file to Facebook - Original: ' + options.youtubeUrl + ' - Size: ' + sizeMB.toFixed(1) + 'MB';
    
    formData.append('title', title);
    formData.append('description', description);
    formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
    formData.append('published', 'true');
    formData.append('content_category', 'ENTERTAINMENT');
    formData.append('embeddable', 'true');
    
    const uploadUrl = `https://graph.facebook.com/v18.0/${options.pageId}/videos`;
    
    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        console.log('Upload successful - Facebook Video ID: ' + result.id);
        
        return {
          success: true,
          facebookVideoId: result.id,
          sizeMB: sizeMB,
          uploadType: 'actual_video_file'
        };
      } else {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      
    } finally {
      // Cleanup video file
      try { fs.unlinkSync(videoPath); } catch {}
    }
  }
  
  async verifyVideoUpload(facebookVideoId: string, options: YouTubeVideoUploadOptions): Promise<VideoUploadResult> {
    console.log('Verifying video upload on Facebook');
    
    // Wait for Facebook processing
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    const postsUrl = `https://graph.facebook.com/v18.0/${options.pageId}/posts?fields=id,message,attachments,created_time&access_token=${options.accessToken}&limit=5`;
    
    const response = await fetch(postsUrl);
    if (!response.ok) {
      throw new Error('Verification failed: ' + response.status);
    }
    
    const data = await response.json() as any;
    const threeMinutesAgo = Date.now() - (3 * 60 * 1000);
    
    for (const post of data.data) {
      const postTime = new Date(post.created_time).getTime();
      
      if (postTime > threeMinutesAgo && post.attachments?.data?.[0]?.type === 'video_inline') {
        const ageMinutes = (Date.now() - postTime) / (1000 * 60);
        
        console.log('Video verified as actual video file');
        console.log('Facebook Post ID: ' + post.id);
        console.log('Age: ' + ageMinutes.toFixed(1) + ' minutes');
        
        return {
          success: true,
          facebookVideoId: facebookVideoId,
          facebookPostId: post.id,
          publishedLink: 'https://facebook.com/' + post.id,
          attachmentType: 'video_inline',
          uploadType: 'actual_video_file'
        };
      }
    }
    
    return {
      success: true,
      facebookVideoId: facebookVideoId,
      uploadType: 'actual_video_file',
      error: 'Upload successful but verification pending'
    };
  }
  
  async uploadYouTubeAsActualVideo(options: YouTubeVideoUploadOptions): Promise<VideoUploadResult> {
    try {
      console.log('Starting YouTube to Facebook actual video upload');
      
      // Step 1: Download YouTube video
      const downloadedPath = await this.downloadYouTubeVideo(options.youtubeUrl);
      
      // Step 2: Optimize for Facebook
      const optimizedPath = await this.optimizeForFacebook(downloadedPath, options.targetSizeMB || 25);
      
      // Step 3: Upload as video file
      const uploadResult = await this.uploadVideoFile(optimizedPath, options);
      
      if (!uploadResult.success) {
        return uploadResult;
      }
      
      // Step 4: Verify upload
      const verificationResult = await this.verifyVideoUpload(uploadResult.facebookVideoId!, options);
      
      return {
        ...uploadResult,
        ...verificationResult
      };
      
    } catch (error) {
      console.error('YouTube video upload error:', error);
      
      return {
        success: false,
        error: (error as Error).message,
        uploadType: 'failed'
      };
    }
  }
}