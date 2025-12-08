import * as fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface UploadResult {
  success: boolean;
  videoId?: string;
  error?: string;
  method?: string;
  uploadTime?: number;
}

export class OptimizedFacebookUploadService {
  
  /**
   * Optimized Facebook video upload with multiple strategies for speed
   */
  static async uploadVideoOptimized(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[] = []
  ): Promise<UploadResult> {
    const startTime = Date.now();
    
    try {
      const fileStats = fs.statSync(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      console.log('OPTIMIZED FACEBOOK VIDEO UPLOAD');
      console.log('File:', filePath);
      console.log('Size:', fileSizeMB.toFixed(1) + 'MB');
      console.log('Page ID:', pageId);
      
      // Strategy 1: Parallel chunk upload for large files (>100MB)
      if (fileSizeMB > 100) {
        console.log('Using parallel chunk upload for large file');
        return await this.uploadWithParallelChunks(filePath, pageId, accessToken, message, customLabels, startTime);
      }
      
      // Strategy 2: Optimized form-data upload for medium files (25-100MB)
      if (fileSizeMB > 25) {
        console.log('Using optimized form-data upload');
        return await this.uploadWithOptimizedFormData(filePath, pageId, accessToken, message, customLabels, startTime);
      }
      
      // Strategy 3: Standard optimized upload for smaller files
      console.log('Using standard optimized upload');
      return await this.uploadWithStandardOptimized(filePath, pageId, accessToken, message, customLabels, startTime);
      
    } catch (error) {
      console.log('Upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        uploadTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Parallel chunk upload for maximum speed on large files
   */
  private static async uploadWithParallelChunks(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    startTime: number
  ): Promise<UploadResult> {
    try {
      // Step 1: Initialize upload session
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const initParams = new URLSearchParams({
        upload_phase: 'start',
        access_token: accessToken
      });
      
      console.log('Initializing parallel upload session...');
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initParams,
        timeout: 30000
      });
      
      const initData = await initResponse.json() as any;
      
      if (!initData.upload_session_id) {
        throw new Error('Failed to initialize upload session');
      }
      
      const sessionId = initData.upload_session_id;
      console.log('Upload session created:', sessionId);
      
      // Step 2: Upload file in parallel chunks
      const fileBuffer = fs.readFileSync(filePath);
      const chunkSize = 2 * 1024 * 1024; // 2MB chunks for optimal speed
      const totalChunks = Math.ceil(fileBuffer.length / chunkSize);
      
      console.log('Uploading', totalChunks, 'chunks in parallel...');
      
      // Create chunk upload promises for parallel execution
      const chunkPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileBuffer.length);
        const chunk = fileBuffer.slice(start, end);
        
        chunkPromises.push(this.uploadChunkOptimized(sessionId, i, chunk, accessToken));
      }
      
      // Execute all chunks in parallel with controlled concurrency
      const concurrencyLimit = 4; // Optimal for Facebook API
      const results = [];
      for (let i = 0; i < chunkPromises.length; i += concurrencyLimit) {
        const batch = chunkPromises.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        
        const progress = Math.round(((i + batch.length) / totalChunks) * 100);
        console.log('Upload progress:', progress + '%');
      }
      
      // Step 3: Finalize upload
      console.log('Finalizing upload...');
      const finalizeUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const finalizeData = new URLSearchParams({
        upload_phase: 'finish',
        upload_session_id: sessionId,
        access_token: accessToken,
        description: message
      });
      
      // Add custom labels
      if (customLabels.length > 0) {
        finalizeData.append('custom_labels', JSON.stringify(customLabels.slice(0, 10)));
      }
      
      const finalizeResponse = await fetch(finalizeUrl, {
        method: 'POST',
        body: finalizeData,
        timeout: 60000
      });
      
      const finalizeResult = await finalizeResponse.json() as any;
      
      if (finalizeResult.id) {
        const uploadTime = Date.now() - startTime;
        console.log('Parallel upload successful in', Math.round(uploadTime / 1000) + 's');
        console.log('Facebook Video ID:', finalizeResult.id);
        
        return {
          success: true,
          videoId: finalizeResult.id,
          method: 'parallel_chunks',
          uploadTime
        };
      } else {
        throw new Error('Upload finalization failed: ' + JSON.stringify(finalizeResult));
      }
      
    } catch (error) {
      console.log('Parallel upload error:', (error as Error).message);
      throw error;
    }
  }
  
  /**
   * Upload individual chunk with optimization
   */
  private static async uploadChunkOptimized(
    sessionId: string,
    chunkIndex: number,
    chunk: Buffer,
    accessToken: string
  ): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v18.0/${sessionId}`;
      const formData = new FormData();
      
      formData.append('upload_phase', 'transfer');
      formData.append('start_offset', (chunkIndex * chunk.length).toString());
      formData.append('upload_session_id', sessionId);
      formData.append('access_token', accessToken);
      formData.append('video_file_chunk', chunk, {
        filename: `chunk_${chunkIndex}.mp4`,
        contentType: 'application/octet-stream'
      });
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        timeout: 60000
      });
      
      const result = await response.json() as any;
      return result.success === true;
      
    } catch (error) {
      console.log('Chunk upload error:', (error as Error).message);
      return false;
    }
  }
  
  /**
   * Optimized form-data upload for medium files
   */
  private static async uploadWithOptimizedFormData(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    startTime: number
  ): Promise<UploadResult> {
    try {
      console.log('Creating optimized form data...');
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      // Optimize form data parameters
      formData.append('access_token', accessToken);
      formData.append('description', message);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      
      // Add custom labels for Meta Insights
      if (customLabels.length > 0) {
        formData.append('custom_labels', JSON.stringify(customLabels.slice(0, 10)));
      }
      
      // Append video with optimized settings
      formData.append('source', fileStream, {
        filename: 'optimized_video.mp4',
        contentType: 'video/mp4'
      });
      
      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Uploading with optimized form data...');
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        timeout: 300000, // 5 minute timeout
        headers: {
          ...formData.getHeaders()
        }
      });
      
      const result = await response.json() as any;
      
      if (result.id) {
        const uploadTime = Date.now() - startTime;
        console.log('Optimized upload successful in', Math.round(uploadTime / 1000) + 's');
        console.log('Facebook Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          method: 'optimized_form_data',
          uploadTime
        };
      } else {
        throw new Error('Upload failed: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.log('Optimized form data upload error:', (error as Error).message);
      throw error;
    }
  }
  
  /**
   * Standard optimized upload for smaller files
   */
  private static async uploadWithStandardOptimized(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    startTime: number
  ): Promise<UploadResult> {
    try {
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      formData.append('access_token', accessToken);
      formData.append('description', message);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      
      if (customLabels.length > 0) {
        formData.append('custom_labels', JSON.stringify(customLabels.slice(0, 10)));
      }
      
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        timeout: 180000, // 3 minute timeout
        headers: {
          ...formData.getHeaders()
        }
      });
      
      const result = await response.json() as any;
      
      if (result.id) {
        const uploadTime = Date.now() - startTime;
        console.log('Standard optimized upload successful in', Math.round(uploadTime / 1000) + 's');
        console.log('Facebook Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          method: 'standard_optimized',
          uploadTime
        };
      } else {
        throw new Error('Upload failed: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.log('Standard optimized upload error:', (error as Error).message);
      throw error;
    }
  }
}