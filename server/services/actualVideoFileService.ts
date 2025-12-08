import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export class ActualVideoFileService {
  static async uploadAsActualVideo(
    googleDriveUrl: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[] = [],
    language: string = 'en'
  ) {
    console.log('🎬 ACTUAL VIDEO FILE SERVICE');
    console.log('📁 URL:', googleDriveUrl);
    console.log('🎯 Goal: Upload as actual video file, not link');

    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL format');
      }

      const fileId = fileIdMatch[1];
      console.log('📋 File ID:', fileId);

      // Try multiple download strategies
      const downloadResult = await this.downloadVideoFile(fileId);
      
      if (!downloadResult.success) {
        throw new Error('Failed to download video file');
      }

      console.log(`✅ Downloaded video file: ${downloadResult.sizeMB.toFixed(1)}MB`);

      // Upload as actual video to Facebook
      const uploadResult = await this.uploadActualVideoToFacebook(
        downloadResult.filePath,
        pageId,
        accessToken,
        message,
        customLabels,
        language
      );

      // Cleanup
      try {
        fs.unlinkSync(downloadResult.filePath);
        console.log('🧹 Cleaned up temporary file');
      } catch (e) {
        // Ignore cleanup errors
      }

      return uploadResult;

    } catch (error) {
      console.log('❌ Actual video upload failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  private static async downloadVideoFile(fileId: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number }> {
    const tempFile = path.join('/tmp', `actual_video_${fileId}_${Date.now()}.mp4`);
    
    // Strategy 1: Direct download URL
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    console.log('📥 Trying direct download...');
    
    const directResult = await this.tryDirectDownload(directUrl, tempFile);
    if (directResult.success) {
      return { success: true, filePath: tempFile, sizeMB: directResult.sizeMB };
    }

    // Strategy 2: Alternative Google Drive URL
    const altUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    console.log('📥 Trying alternative URL...');
    
    const altResult = await this.tryDirectDownload(altUrl, tempFile);
    if (altResult.success) {
      return { success: true, filePath: tempFile, sizeMB: altResult.sizeMB };
    }

    // Strategy 3: Use curl with follow redirects
    console.log('📥 Trying curl with redirects...');
    const curlResult = await this.downloadWithCurl(fileId, tempFile);
    if (curlResult.success) {
      return { success: true, filePath: tempFile, sizeMB: curlResult.sizeMB };
    }

    return { success: false };
  }

  private static async tryDirectDownload(url: string, outputFile: string): Promise<{ success: boolean; sizeMB?: number }> {
    try {
      console.log('🌐 Fetching:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        follow: 10,
        timeout: 300000, // 5 minutes
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const fileStream = fs.createWriteStream(outputFile);
      
      return new Promise((resolve) => {
        response.body.pipe(fileStream);
        
        fileStream.on('finish', () => {
          if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile);
            const sizeMB = stats.size / (1024 * 1024);
            
            if (sizeMB > 1) { // At least 1MB
              console.log(`✅ Direct download successful: ${sizeMB.toFixed(1)}MB`);
              resolve({ success: true, sizeMB });
            } else {
              console.log('❌ Downloaded file too small');
              resolve({ success: false });
            }
          } else {
            resolve({ success: false });
          }
        });

        fileStream.on('error', (error) => {
          console.log('❌ Stream error:', error.message);
          resolve({ success: false });
        });
      });

    } catch (error) {
      console.log('❌ Direct download failed:', error.message);
      return { success: false };
    }
  }

  private static async downloadWithCurl(fileId: string, outputFile: string): Promise<{ success: boolean; sizeMB?: number }> {
    return new Promise((resolve) => {
      const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      const curl = spawn('curl', [
        '-L', // Follow redirects
        '--max-time', '300',
        '--retry', '3',
        '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        '-o', outputFile,
        url
      ]);

      curl.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%')) {
          console.log('📊 Curl:', output.trim());
        }
      });

      curl.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 1) {
            console.log(`✅ Curl download successful: ${sizeMB.toFixed(1)}MB`);
            resolve({ success: true, sizeMB });
          } else {
            console.log('❌ Curl downloaded file too small');
            resolve({ success: false });
          }
        } else {
          console.log('❌ Curl failed with code:', code);
          resolve({ success: false });
        }
      });

      curl.on('error', (error) => {
        console.log('❌ Curl error:', error.message);
        resolve({ success: false });
      });
    });
  }

  private static async uploadActualVideoToFacebook(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    language: string
  ) {
    console.log('🎬 Uploading actual video file to Facebook...');

    try {
      const FormData = require('form-data');
      const form = new FormData();
      
      // Add the actual video file
      form.append('source', fs.createReadStream(filePath));
      form.append('description', message);
      form.append('access_token', accessToken);
      form.append('published', 'true');
      
      if (customLabels.length > 0) {
        form.append('custom_labels', JSON.stringify(customLabels));
      }

      console.log('📤 Uploading video file to Facebook Graph API...');
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: form,
        timeout: 300000 // 5 minutes for large files
      });

      const result = await response.json() as any;

      if (result.id) {
        console.log('✅ ACTUAL VIDEO UPLOADED:', result.id);
        console.log('🎯 This is a real video file, not a link');
        
        return {
          success: true,
          postId: result.id,
          url: `https://facebook.com/${result.id}`,
          message: 'Actual video file uploaded successfully',
          source: 'facebook_video_file'
        };
      } else {
        throw new Error(result.error?.message || 'Video upload failed');
      }

    } catch (error) {
      console.log('❌ Facebook video upload failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}