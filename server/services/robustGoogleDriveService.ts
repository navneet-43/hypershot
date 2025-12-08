import fetch from 'node-fetch';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class RobustGoogleDriveService {
  
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /folders\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  static async downloadVideo(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎬 ROBUST GOOGLE DRIVE DOWNLOAD');
    console.log('📁 URL:', url);
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/robust_video_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Target file:', outputFile);

    // Method 1: Direct HTTP download with proper headers
    console.log('🔄 Method 1: Direct HTTP download');
    const directResult = await this.directDownload(fileId, outputFile);
    if (directResult.success && directResult.sizeMB && directResult.sizeMB > 5) {
      return directResult;
    }

    // Method 2: wget with user agent
    console.log('🔄 Method 2: wget download');
    const wgetResult = await this.wgetDownload(fileId, outputFile);
    if (wgetResult.success && wgetResult.sizeMB && wgetResult.sizeMB > 5) {
      return wgetResult;
    }

    // Method 3: curl with session handling
    console.log('🔄 Method 3: curl download');
    const curlResult = await this.curlDownload(fileId, outputFile);
    if (curlResult.success && curlResult.sizeMB && curlResult.sizeMB > 5) {
      return curlResult;
    }

    return { success: false, error: 'All download methods failed' };
  }

  static async directDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    try {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
      });

      if (response.ok && response.body) {
        const writer = fs.createWriteStream(outputFile);
        
        return new Promise((resolve) => {
          response.body!.pipe(writer);
          
          writer.on('finish', () => {
            if (fs.existsSync(outputFile)) {
              const stats = fs.statSync(outputFile);
              const sizeMB = stats.size / (1024 * 1024);
              
              console.log(`Direct download: ${sizeMB.toFixed(1)}MB`);
              resolve({
                success: true,
                filePath: outputFile,
                sizeMB: sizeMB
              });
            } else {
              resolve({ success: false, error: 'File not created' });
            }
          });
          
          writer.on('error', (error) => {
            resolve({ success: false, error: error.message });
          });
        });
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
      
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  static async wgetDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      const wget = spawn('wget', [
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--no-check-certificate',
        '--content-disposition',
        '-O', outputFile,
        downloadUrl
      ]);

      wget.stdout.on('data', (data) => {
        console.log('wget:', data.toString().trim());
      });

      wget.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('saved')) {
          console.log('wget progress:', output.trim());
        }
      });

      wget.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`wget download: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `wget failed with code ${code}` });
        }
      });

      wget.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        wget.kill();
        resolve({ success: false, error: 'wget timeout' });
      }, 300000);
    });
  }

  static async curlDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const curl = spawn('curl', [
        '-L',
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-o', outputFile,
        downloadUrl
      ]);

      curl.stdout.on('data', (data) => {
        console.log('curl:', data.toString().trim());
      });

      curl.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('downloaded')) {
          console.log('curl progress:', output.trim());
        }
      });

      curl.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`curl download: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `curl failed with code ${code}` });
        }
      });

      curl.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        curl.kill();
        resolve({ success: false, error: 'curl timeout' });
      }, 300000);
    });
  }
}