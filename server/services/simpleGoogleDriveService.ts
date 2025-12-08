import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export class SimpleGoogleDriveService {
  static async downloadAndUpload(
    googleDriveUrl: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[] = [],
    language: string = 'en'
  ) {
    console.log('🎯 SIMPLE GOOGLE DRIVE SERVICE');
    console.log('📁 URL:', googleDriveUrl);
    console.log('📄 Page:', pageId);

    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL format');
      }

      const fileId = fileIdMatch[1];
      console.log('📋 File ID:', fileId);

      // Simple download approach with direct URL
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const tempFile = path.join('/tmp', `simple_gdrive_${fileId}_${Date.now()}.mp4`);

      console.log('📥 Starting simple download...');
      
      // Use wget for reliable download
      const downloadResult = await this.downloadWithWget(downloadUrl, tempFile);
      
      if (!downloadResult.success) {
        console.log('🔄 Trying alternative download method...');
        return await this.tryAlternativeUpload(googleDriveUrl, pageId, accessToken, message, customLabels, language);
      }

      console.log(`✅ Downloaded: ${downloadResult.sizeMB.toFixed(1)}MB`);

      // Upload to Facebook
      const uploadResult = await this.uploadToFacebook(tempFile, pageId, accessToken, message, customLabels, language);

      // Cleanup
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      return uploadResult;

    } catch (error) {
      console.log('❌ Simple download failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  private static async downloadWithWget(url: string, outputFile: string): Promise<{ success: boolean; sizeMB?: number }> {
    return new Promise((resolve) => {
      const wget = spawn('wget', [
        '--no-check-certificate',
        '--timeout=300',
        '--tries=3',
        '--progress=bar:force',
        '-O', outputFile,
        url
      ]);

      let lastSize = 0;

      wget.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%')) {
          console.log('📊', output.trim());
        }
      });

      wget.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 1) { // At least 1MB
            resolve({ success: true, sizeMB });
          } else {
            resolve({ success: false });
          }
        } else {
          resolve({ success: false });
        }
      });

      wget.on('error', (error) => {
        console.log('Wget error:', error.message);
        resolve({ success: false });
      });
    });
  }

  private static async tryAlternativeUpload(
    originalUrl: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    language: string
  ) {
    console.log('🔄 Using text post with link as fallback');
    
    const postData = {
      message: `${message}\n\nWatch video: ${originalUrl}`,
      access_token: accessToken,
      published: 'true',
      custom_labels: JSON.stringify(customLabels),
      locale: language,
      link: originalUrl
    };

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: 'POST',
        body: new URLSearchParams(postData as any),
        timeout: 30000
      });

      const result = await response.json() as any;

      if (result.id) {
        console.log('✅ Text post with link published:', result.id);
        return {
          success: true,
          postId: result.id,
          url: `https://facebook.com/${result.id}`,
          message: 'Published as text post with video link',
          source: 'link_fallback'
        };
      } else {
        throw new Error('No post ID returned');
      }
    } catch (error) {
      console.log('❌ Fallback post failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  private static async uploadToFacebook(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    language: string
  ) {
    console.log('📤 Uploading to Facebook...');

    try {
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('source', fs.createReadStream(filePath));
      form.append('description', message);
      form.append('access_token', accessToken);
      form.append('published', 'true');
      
      if (customLabels.length > 0) {
        form.append('custom_labels', JSON.stringify(customLabels));
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: form,
        timeout: 120000
      });

      const result = await response.json() as any;

      if (result.id) {
        console.log('✅ Video uploaded successfully:', result.id);
        return {
          success: true,
          postId: result.id,
          url: `https://facebook.com/${result.id}`,
          message: 'Video uploaded successfully',
          source: 'facebook_video'
        };
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }

    } catch (error) {
      console.log('❌ Facebook upload failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}