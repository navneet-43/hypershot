import { spawn } from 'child_process';
import * as fs from 'fs';

export class LargerDownloadService {
  
  static async downloadLargerGoogleDriveVideo(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎯 LARGER GOOGLE DRIVE DOWNLOAD ATTEMPT');
    console.log('📁 URL:', url);
    console.log('🎯 Goal: Download larger portion of 400MB video');
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/larger_video_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Output file:', outputFile);

    // Method 1: aria2c with multiple connections
    console.log('🔄 Method 1: aria2c multi-connection download');
    const aria2Result = await this.aria2cDownload(fileId, outputFile);
    if (aria2Result.success && aria2Result.sizeMB && aria2Result.sizeMB > 100) {
      return aria2Result;
    }

    // Method 2: curl with resume capability  
    console.log('🔄 Method 2: curl with resume and range requests');
    const curlResult = await this.resumableCurlDownload(fileId, outputFile);
    if (curlResult.success && curlResult.sizeMB && curlResult.sizeMB > 100) {
      return curlResult;
    }

    // Method 3: wget with continue and extended timeout
    console.log('🔄 Method 3: wget with continue and extended parameters');
    const wgetResult = await this.extendedWgetDownload(fileId, outputFile);
    if (wgetResult.success && wgetResult.sizeMB && wgetResult.sizeMB > 100) {
      return wgetResult;
    }

    return { success: false, error: 'All larger download methods failed' };
  }

  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  static async aria2cDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const aria2c = spawn('aria2c', [
        '--max-connection-per-server=16',
        '--split=16',
        '--min-split-size=1M',
        '--max-tries=5',
        '--retry-wait=5',
        '--timeout=300',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--header=Accept: */*',
        '--header=Accept-Language: en-US,en;q=0.5',
        '--continue=true',
        '--out=' + outputFile.split('/').pop(),
        '--dir=/tmp',
        downloadUrl
      ]);

      aria2c.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('MiB')) {
          console.log('aria2c progress:', output.trim());
        }
      });

      aria2c.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('completed') || output.includes('%')) {
          console.log('aria2c:', output.trim());
        }
      });

      aria2c.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`aria2c download: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `aria2c failed with code ${code}` });
        }
      });

      aria2c.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 20 minutes
      setTimeout(() => {
        aria2c.kill();
        resolve({ success: false, error: 'aria2c timeout' });
      }, 1200000);
    });
  }

  static async resumableCurlDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const curl = spawn('curl', [
        '-L',
        '-C', '-', // Resume capability
        '--max-time', '1200', // 20 minutes
        '--connect-timeout', '60',
        '--retry', '5',
        '--retry-delay', '5',
        '--retry-max-time', '1200',
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-H', 'Accept: */*',
        '-H', 'Accept-Language: en-US,en;q=0.5',
        '-H', 'Connection: keep-alive',
        '--progress-bar',
        '-o', outputFile,
        downloadUrl
      ]);

      curl.stdout.on('data', (data) => {
        console.log('curl:', data.toString().trim());
      });

      curl.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('#') || output.includes('%')) {
          console.log('curl progress:', output.trim());
        }
      });

      curl.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`curl resumable download: ${sizeMB.toFixed(1)}MB`);
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

      // Timeout after 20 minutes
      setTimeout(() => {
        curl.kill();
        resolve({ success: false, error: 'curl timeout' });
      }, 1200000);
    });
  }

  static async extendedWgetDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const wget = spawn('wget', [
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--no-check-certificate',
        '--content-disposition',
        '--timeout=600', // 10 minutes per connection
        '--tries=10',
        '--retry-connrefused',
        '--waitretry=10',
        '--continue', // Resume downloads
        '--progress=bar:force',
        '--show-progress',
        '-O', outputFile,
        downloadUrl
      ]);

      wget.stdout.on('data', (data) => {
        console.log('wget:', data.toString().trim());
      });

      wget.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('saved') || output.includes('MB')) {
          console.log('wget progress:', output.trim());
        }
      });

      wget.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`wget extended download: ${sizeMB.toFixed(1)}MB`);
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

      // Timeout after 20 minutes
      setTimeout(() => {
        wget.kill();
        resolve({ success: false, error: 'wget timeout' });
      }, 1200000);
    });
  }
}