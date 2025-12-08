import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

export interface GoogleDriveDownloadOptions {
  googleDriveUrl: string;
  outputPath?: string;
}

export interface GoogleDriveDownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export class EnhancedGoogleDriveDownloader {
  
  private extractFileId(url: string): string {
    // Handle various Google Drive URL formats
    const patterns = [
      /\/d\/([\w-]+)/,
      /open\?id=([\w-]+)/,
      /file\/d\/([\w-]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // If it's already a file ID
    if (url.match(/^[\w-]+$/)) {
      return url;
    }
    
    throw new Error(`Cannot extract file ID from URL: ${url}`);
  }
  
  private async getConfirmationToken(response: any): Promise<{ confirm: string | null, uuid: string | null }> {
    const html = await response.text();
    
    // Look for confirmation form using regex patterns (matching your Python script)
    const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/);
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
    
    return {
      confirm: confirmMatch ? confirmMatch[1] : null,
      uuid: uuidMatch ? uuidMatch[1] : null
    };
  }
  
  async downloadLargeFile(options: GoogleDriveDownloadOptions, retryCount: number = 0): Promise<GoogleDriveDownloadResult> {
    try {
      const fileId = this.extractFileId(options.googleDriveUrl);
      const outputPath = options.outputPath || `/tmp/google_drive_${Date.now()}.mp4`;
      
      console.log(`Downloading Google Drive file: ${fileId}`);
      
      // Step 1: Initial request to get download page
      const baseUrl = 'https://drive.google.com/uc?export=download';
      const initialResponse = await fetch(`${baseUrl}&id=${fileId}`);
      
      if (!initialResponse.ok) {
        throw new Error(`Initial request failed: ${initialResponse.status}`);
      }
      
      const contentType = initialResponse.headers.get('content-type') || '';
      const contentLength = parseInt(initialResponse.headers.get('content-length') || '0');
      
      // Check if we got the file directly (small files)
      if (!contentType.toLowerCase().includes('html') && contentLength > 1000000) {
        console.log('Direct download detected for small file');
        return await this.streamDownload(initialResponse, outputPath);
      }
      
      // Step 2: Extract confirmation token (for large files)
      console.log('Large file detected, extracting confirmation token');
      const { confirm, uuid } = await this.getConfirmationToken(initialResponse);
      
      if (!confirm || !uuid) {
        throw new Error('Could not extract confirmation token from Google Drive response');
      }
      
      console.log('Confirmation token extracted, downloading with token');
      
      // Step 3: Download with confirmation token
      const confirmUrl = 'https://drive.usercontent.google.com/download';
      const params = new URLSearchParams({
        id: fileId,
        export: 'download',
        confirm: confirm,
        uuid: uuid
      });
      
      const downloadResponse = await fetch(`${confirmUrl}?${params}`);
      
      if (!downloadResponse.ok) {
        throw new Error(`Download request failed: ${downloadResponse.status}`);
      }
      
      // Step 4: Validate response and stream download
      const downloadContentType = downloadResponse.headers.get('content-type') || '';
      const downloadContentLength = parseInt(downloadResponse.headers.get('content-length') || '0');
      
      if (downloadContentType.toLowerCase().includes('html') || downloadContentLength < 1000000) {
        throw new Error('Received invalid content type - possibly access restricted file');
      }
      
      return await this.streamDownload(downloadResponse, outputPath);
      
    } catch (error) {
      console.error('Google Drive download error:', error);
      
      // Retry logic for incomplete downloads
      if (retryCount < 2 && (error as Error).message.includes('Incomplete download')) {
        console.log(`Retrying download (attempt ${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        return this.downloadLargeFile(options, retryCount + 1);
      }
      
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  private async streamDownload(response: any, outputPath: string): Promise<GoogleDriveDownloadResult> {
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    console.log(`Streaming download: ${(contentLength / (1024 * 1024)).toFixed(1)}MB`);
    
    const writeStream = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    let lastProgressReport = 0;
    
    return new Promise((resolve, reject) => {
      response.body.on('data', (chunk: Buffer) => {
        writeStream.write(chunk);
        downloadedBytes += chunk.length;
        
        // Report progress every 5MB
        if (contentLength && downloadedBytes - lastProgressReport > 5 * 1024 * 1024) {
          const progress = (downloadedBytes / contentLength * 100).toFixed(1);
          console.log(`Download progress: ${progress}% (${(downloadedBytes / (1024 * 1024)).toFixed(1)}MB)`);
          lastProgressReport = downloadedBytes;
        }
      });
      
      response.body.on('end', () => {
        writeStream.end();
        
        if (!fs.existsSync(outputPath)) {
          reject(new Error('Download completed but file not found'));
          return;
        }
        
        const finalSize = fs.statSync(outputPath).size;
        const finalSizeMB = finalSize / (1024 * 1024);
        
        console.log(`Download completed: ${finalSizeMB.toFixed(3)}MB`);
        
        // Enhanced validation: Check for complete download
        if (contentLength > 0) {
          const expectedSizeMB = contentLength / (1024 * 1024);
          const sizeDifference = Math.abs(finalSize - contentLength);
          const sizeDifferencePercent = (sizeDifference / contentLength) * 100;
          
          console.log(`Expected: ${expectedSizeMB.toFixed(3)}MB, Downloaded: ${finalSizeMB.toFixed(3)}MB`);
          console.log(`Size difference: ${(sizeDifference / (1024 * 1024)).toFixed(3)}MB (${sizeDifferencePercent.toFixed(3)}%)`);
          
          if (sizeDifferencePercent > 0.05) { // More than 0.05% difference (stricter validation)
            console.warn(`WARNING: Incomplete download detected - missing ${(sizeDifference / (1024 * 1024)).toFixed(3)}MB`);
            
            if (sizeDifferencePercent > 0.15) { // More than 0.15% difference triggers retry
              fs.unlinkSync(outputPath);
              reject(new Error(`Incomplete download: Expected ${expectedSizeMB.toFixed(3)}MB, got ${finalSizeMB.toFixed(3)}MB (missing ${(sizeDifference / (1024 * 1024)).toFixed(3)}MB)`));
              return;
            }
          }
        }
        
        // Validate minimum file size
        if (finalSize < 1000000) { // Less than 1MB
          fs.unlinkSync(outputPath);
          reject(new Error(`Downloaded file too small: ${finalSizeMB.toFixed(1)}MB - possibly access restricted`));
          return;
        }
        
        resolve({
          success: true,
          filePath: outputPath,
          fileSize: finalSize
        });
      });
      
      response.body.on('error', (error: Error) => {
        writeStream.destroy();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
      
      writeStream.on('error', (error: Error) => {
        response.body.destroy();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
    });
  }
  
  async downloadAndValidate(options: GoogleDriveDownloadOptions): Promise<GoogleDriveDownloadResult> {
    const result = await this.downloadLargeFile(options);
    
    if (!result.success) {
      return result;
    }
    
    // Additional validation
    if (!result.filePath || !fs.existsSync(result.filePath)) {
      return {
        success: false,
        error: 'Download completed but file not accessible'
      };
    }
    
    const stats = fs.statSync(result.filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log(`Download validation passed: ${sizeMB.toFixed(1)}MB`);
    
    return {
      success: true,
      filePath: result.filePath,
      fileSize: stats.size
    };
  }
}