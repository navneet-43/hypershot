import fs from 'fs';

interface GoogleDriveDownloadOptions {
  googleDriveUrl: string;
  outputPath?: string;
}

interface GoogleDriveDownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export class CorrectGoogleDriveDownloader {
  
  /**
   * Check available disk space in /tmp before downloading
   * Returns available space in MB and total disk size in MB
   */
  private async checkAvailableSpace(): Promise<{ available: number; total: number }> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('df -m /tmp | tail -1').toString();
      const parts = output.trim().split(/\s+/);
      const totalMB = parseInt(parts[1], 10);
      const availableMB = parseInt(parts[3], 10);
      console.log(`💾 /tmp disk: ${availableMB}MB available / ${totalMB}MB total`);
      return { available: availableMB, total: totalMB };
    } catch (error) {
      console.log('⚠️ Could not check disk space, assuming limited capacity');
      return { available: 100, total: 1000 }; // Assume very limited space if we can't check
    }
  }
  
  /**
   * Get production-adaptive threshold based on total disk size
   * Smaller deployments get lower thresholds
   */
  private getAdaptiveThreshold(totalDiskMB: number): number {
    // For very constrained environments (< 5GB total), only require 50MB free
    if (totalDiskMB < 5000) {
      console.log(`📊 CONSTRAINED environment detected (${totalDiskMB}MB total) - requiring only 50MB free`);
      return 50;
    }
    
    // For medium environments (< 20GB total), require 100MB free (reduced for production stability)
    if (totalDiskMB < 20000) {
      console.log(`📊 MEDIUM environment detected (${totalDiskMB}MB total) - requiring 100MB free`);
      return 100;
    }
    
    // For standard production environments, require 300MB free
    if (process.env.NODE_ENV === 'production') {
      console.log(`📊 STANDARD production environment (${totalDiskMB}MB total) - requiring 300MB free`);
      return 300;
    }
    
    // Development environment - require full 500MB for safety
    console.log(`📊 DEVELOPMENT environment (${totalDiskMB}MB total) - requiring 500MB free`);
    return 500;
  }

  private extractFileId(url: string): string {
    // Handle multiple Google Drive URL formats
    console.log(`🔍 Extracting file ID from URL: ${url}`);
    
    // Format 1: /file/d/FILE_ID/view or /file/d/FILE_ID/edit
    let match = url.match(/\/file\/d\/([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from /file/d/ format)`);
      return match[1];
    }
    
    // Format 2: /d/FILE_ID
    match = url.match(/\/d\/([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from /d/ format)`);
      return match[1];
    }
    
    // Format 3: ?id=FILE_ID or open?id=FILE_ID
    match = url.match(/[?&]id=([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from ?id= format)`);
      return match[1];
    }
    
    // Format 4: Already a file ID (fallback)
    if (url.match(/^[\w-]+$/)) {
      console.log(`✅ URL appears to be file ID: ${url}`);
      return url;
    }
    
    console.log(`⚠️ Could not extract file ID from URL, using as-is: ${url}`);
    return url;
  }

  private async getConfirmationInfoFromForm(html: string): Promise<{ confirm: string | null; uuid: string | null }> {
    // Parse HTML to find download form (matching Python BeautifulSoup approach)
    const formMatch = html.match(/<form[^>]*id="download-form"[^>]*>([\s\S]*?)<\/form>/);
    
    if (!formMatch) {
      return { confirm: null, uuid: null };
    }
    
    const formContent = formMatch[1];
    
    // Extract confirm and uuid values from input elements
    const confirmMatch = formContent.match(/<input[^>]*name="confirm"[^>]*value="([^"]+)"/);
    const uuidMatch = formContent.match(/<input[^>]*name="uuid"[^>]*value="([^"]+)"/);
    
    return {
      confirm: confirmMatch ? confirmMatch[1] : null,
      uuid: uuidMatch ? uuidMatch[1] : null
    };
  }

  private async handleVirusScanWarning(html: string, fileId: string, headers: any): Promise<string> {
    // Check if this is a virus scan warning page
    if (html.includes('virus scan') || html.includes('Google Drive can\'t scan') || html.includes('Download anyway')) {
      console.log('🦠 Virus scan warning detected - bypassing...');
      
      // Extract the bypass URL from the "Download anyway" link
      const downloadAnywayMatch = html.match(/href="([^"]*download[^"]*confirm=t[^"]*)"/);
      if (downloadAnywayMatch) {
        const bypassUrl = downloadAnywayMatch[1].replace(/&amp;/g, '&');
        console.log('🔓 Found virus scan bypass URL');
        return bypassUrl;
      }
      
      // Alternative method: construct bypass URL manually
      const confirmMatch = html.match(/confirm=([^&"]+)/);
      if (confirmMatch) {
        const confirmToken = confirmMatch[1];
        const bypassUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmToken}`;
        console.log('🔧 Constructed virus scan bypass URL');
        return bypassUrl;
      }
      
      // Fallback: try direct download with confirm=t parameter
      console.log('⚡ Using fallback virus scan bypass method');
      return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    }
    
    return '';
  }

  async downloadVideoFile(options: GoogleDriveDownloadOptions): Promise<GoogleDriveDownloadResult> {
    const fileId = this.extractFileId(options.googleDriveUrl);
    const outputPath = options.outputPath || `/tmp/google_drive_${Date.now()}.mp4`;
    
    // PRODUCTION FIX: Check available disk space with adaptive thresholds
    const { available, total } = await this.checkAvailableSpace();
    const requiredSpaceMB = this.getAdaptiveThreshold(total);
    
    if (available < requiredSpaceMB) {
      const errorMsg = `❌ INSUFFICIENT DISK SPACE: Only ${available}MB available in /tmp (need ${requiredSpaceMB}MB). Your environment has ${total}MB total disk space. Please use smaller videos or contact Replit support to upgrade your deployment tier.`;
      console.log(errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
    
    console.log(`✅ Disk space check passed: ${available}MB available (${requiredSpaceMB}MB required)`);
    
    
    console.log(`Starting correct Google Drive download for file: ${fileId}`);
    
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Use session approach like Python requests.Session()
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };
      
      // Step 1: Initial request to get download page (matching Python script)
      const baseUrl = "https://drive.google.com/uc?export=download";
      const response = await fetch(`${baseUrl}&id=${fileId}`, { 
        headers,
        redirect: 'follow'
      });
      
      if (!response.ok) {
        throw new Error(`Initial request failed: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Step 2: Check for virus scan warning and handle bypass
      const virusBypassUrl = await this.handleVirusScanWarning(html, fileId, headers);
      let downloadResponse;
      
      if (virusBypassUrl) {
        console.log('🦠 Using virus scan bypass URL');
        downloadResponse = await fetch(virusBypassUrl, {
          headers,
          redirect: 'follow'
        });
      } else {
        // Step 3: Extract confirmation info from form (matching Python BeautifulSoup approach)
        const { confirm, uuid } = await this.getConfirmationInfoFromForm(html);
        
        if (!confirm || !uuid) {
          // Try alternative virus scan bypass methods
          console.log('⚠️ No confirmation tokens found, trying virus scan bypass...');
          const bypassUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
          downloadResponse = await fetch(bypassUrl, {
            headers,
            redirect: 'follow'
          });
        } else {
          console.log(`Confirmation token extracted: ${confirm.substring(0, 10)}...`);
          
          // Step 4: Download with confirmation token using session headers
          const confirmUrl = "https://drive.usercontent.google.com/download";
          const params = new URLSearchParams({
            id: fileId,
            export: 'download',
            confirm: confirm,
            uuid: uuid
          });
          
          downloadResponse = await fetch(`${confirmUrl}?${params}`, {
            headers,
            redirect: 'follow'
          });
        }
      }
      
      if (!downloadResponse.ok) {
        throw new Error(`Download request failed: ${downloadResponse.status}`);
      }
      
      // Step 4: Validate content (matching Python script validation)
      const contentType = downloadResponse.headers.get('content-type') || '';
      const contentLength = parseInt(downloadResponse.headers.get('content-length') || '0');
      
      // Allow smaller files for images (photos can be under 1MB)
      const isLikelyImage = contentType.toLowerCase().includes('image') || 
                           contentLength < 1000000; // Images can be smaller
      
      if (contentType.toLowerCase().includes('html') || (contentLength < 100000 && !isLikelyImage)) {
        console.error('❌ Received invalid content type.');
        
        // Save error HTML for debugging (matching Python script)
        const errorHtml = await downloadResponse.text();
        fs.writeFileSync('/tmp/error.html', errorHtml, 'utf-8');
        
        // Check for specific Google Drive error patterns
        if (errorHtml.includes('access_denied') || errorHtml.includes('403')) {
          throw new Error('Google Drive file access denied. Please ensure the file is publicly accessible with "Anyone with the link can view" permission.');
        } else if (errorHtml.includes('login') || errorHtml.includes('signin')) {
          throw new Error('Google Drive file requires authentication. Please make the file publicly accessible.');
        } else if (errorHtml.includes('not found') || errorHtml.includes('404')) {
          throw new Error('Google Drive file not found. Please check the URL is correct and the file exists.');
        } else {
          throw new Error('Google Drive file access restricted. Please ensure sharing is set to "Anyone with the link can view".');
        }
      }
      
      const fileSizeMB = (contentLength / (1024 * 1024)).toFixed(1);
      const fileType = contentLength < 10 * 1024 * 1024 ? 'image/media file' : 'video file';
      console.log(`Downloading ${fileSizeMB}MB ${fileType}...`);
      
      // Step 5: Stream download with robust chunk handling (32KB chunks like Python)
      return await this.robustStreamDownload(downloadResponse, outputPath, contentLength);
      
    } catch (error) {
      console.error('Google Drive download error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async robustStreamDownload(response: any, outputPath: string, expectedSize: number): Promise<GoogleDriveDownloadResult> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 32768 }); // 32KB buffer like Python
      let downloadedBytes = 0;
      let lastReportedProgress = -1;
      let stagnationTimer: NodeJS.Timeout | null = null;
      let lastProgressTime = Date.now();
      
      // Set up stagnation detection
      const checkStagnation = () => {
        const now = Date.now();
        if (now - lastProgressTime > 30000) { // No progress for 30 seconds
          reject(new Error('Download stagnated - no progress for 30 seconds'));
          return;
        }
        stagnationTimer = setTimeout(checkStagnation, 10000);
      };
      stagnationTimer = setTimeout(checkStagnation, 10000);
      
      response.body.on('data', (chunk: Buffer) => {
        writeStream.write(chunk);
        
        downloadedBytes += chunk.length;
        lastProgressTime = Date.now();
        
        // Progress reporting (matching Python script style)
        if (expectedSize > 0) {
          const progress = Math.min(100, Math.floor((downloadedBytes * 100) / expectedSize));
          if (progress !== lastReportedProgress && progress % 5 === 0) {  // Report every 5%
            console.log(`Download progress: ${progress}%`);
            lastReportedProgress = progress;
          }
        }
      });
      
      response.body.on('end', () => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        
        writeStream.end((error: any) => {
          if (error) {
            reject(error);
            return;
          }
          
          if (!fs.existsSync(outputPath)) {
            reject(new Error('Download completed but file not found'));
            return;
          }
          
          const finalSize = fs.statSync(outputPath).size;
          const finalSizeMB = finalSize / (1024 * 1024);
          
          console.log(`✅ Download complete: ${finalSizeMB.toFixed(3)}MB`);
          
          // Enhanced size validation
          if (expectedSize > 0) {
            const sizeDifference = Math.abs(finalSize - expectedSize);
            const sizeDifferencePercent = (sizeDifference / expectedSize) * 100;
            
            console.log(`Expected: ${(expectedSize / (1024 * 1024)).toFixed(3)}MB`);
            console.log(`Downloaded: ${finalSizeMB.toFixed(3)}MB`);
            console.log(`Difference: ${(sizeDifference / (1024 * 1024)).toFixed(3)}MB (${sizeDifferencePercent.toFixed(4)}%)`);
            
            if (sizeDifferencePercent > 0.001) { // More than 0.001% difference
              console.warn(`⚠️  Size mismatch detected: ${sizeDifferencePercent.toFixed(4)}% difference`);
              
              if (sizeDifferencePercent > 0.1) { // More than 0.1% is significant
                reject(new Error(`Significant size mismatch: Expected ${(expectedSize / (1024 * 1024)).toFixed(3)}MB, got ${finalSizeMB.toFixed(3)}MB`));
                return;
              }
            }
          }
          
          resolve({
            success: true,
            filePath: outputPath,
            fileSize: finalSize
          });
        });
      });
      
      response.body.on('error', (error: Error) => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        writeStream.destroy();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
      
      writeStream.on('error', (error: Error) => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        reject(error);
      });
    });
  }
}