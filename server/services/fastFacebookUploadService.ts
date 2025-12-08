import * as fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface FastUploadResult {
  success: boolean;
  videoId?: string;
  error?: string;
  method?: string;
  uploadSpeed?: string;
  uploadTime?: number;
}

export class FastFacebookUploadService {
  
  /**
   * Fast Facebook video upload with optimized techniques
   */
  static async uploadVideoFast(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[] = []
  ): Promise<FastUploadResult> {
    const startTime = Date.now();
    
    try {
      const fileStats = fs.statSync(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      console.log('FAST FACEBOOK VIDEO UPLOAD');
      console.log('File:', filePath);
      console.log('Size:', fileSizeMB.toFixed(1) + 'MB');
      console.log('Applying speed optimizations...');
      
      // Choose optimal upload strategy based on file size
      if (fileSizeMB > 200) {
        console.log('Using chunked upload for large file');
        return await this.uploadWithChunkedOptimization(filePath, pageId, accessToken, message, customLabels, startTime, fileSizeMB);
      } else {
        console.log('Using optimized direct upload');
        return await this.uploadWithDirectOptimization(filePath, pageId, accessToken, message, customLabels, startTime, fileSizeMB);
      }
      
    } catch (error) {
      console.log('Fast upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        uploadTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Chunked upload optimization for large files
   */
  private static async uploadWithChunkedOptimization(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    startTime: number,
    fileSizeMB: number
  ): Promise<FastUploadResult> {
    try {
      console.log('Initializing chunked upload session...');
      
      // Step 1: Initialize upload session
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: new URLSearchParams({
          upload_phase: 'start',
          access_token: accessToken
        })
      });
      
      const initData = await initResponse.json() as any;
      
      if (!initData.upload_session_id) {
        throw new Error('Failed to initialize upload session');
      }
      
      const sessionId = initData.upload_session_id;
      console.log('Session created:', sessionId);
      
      // Step 2: Upload file in optimized chunks
      const fileBuffer = fs.readFileSync(filePath);
      const chunkSize = 4 * 1024 * 1024; // 4MB chunks
      const totalChunks = Math.ceil(fileBuffer.length / chunkSize);
      
      console.log('Uploading', totalChunks, 'chunks...');
      
      // Upload chunks with controlled concurrency
      const maxConcurrent = 3; // Optimal for Facebook API
      for (let i = 0; i < totalChunks; i += maxConcurrent) {
        const chunkPromises = [];
        
        for (let j = 0; j < maxConcurrent && (i + j) < totalChunks; j++) {
          const chunkIndex = i + j;
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, fileBuffer.length);
          const chunk = fileBuffer.slice(start, end);
          
          chunkPromises.push(this.uploadChunk(sessionId, chunkIndex, chunk, start, accessToken));
        }
        
        await Promise.all(chunkPromises);
        
        const progress = Math.round(((i + chunkPromises.length) / totalChunks) * 100);
        console.log('Progress:', progress + '%');
      }
      
      // Step 3: Finalize upload
      console.log('Finalizing upload...');
      const finalizeUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const finalizeResponse = await fetch(finalizeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          upload_phase: 'finish',
          upload_session_id: sessionId,
          access_token: accessToken,
          description: message,
          custom_labels: customLabels.length > 0 ? JSON.stringify(customLabels.slice(0, 10)) : '',
          privacy: JSON.stringify({ value: 'EVERYONE' })
        })
      });
      
      const finalResult = await finalizeResponse.json() as any;
      
      if (finalResult.id) {
        const uploadTime = Date.now() - startTime;
        const speed = (fileSizeMB / (uploadTime / 1000)).toFixed(1);
        
        console.log('Chunked upload successful in', Math.round(uploadTime / 1000) + 's');
        console.log('Average speed:', speed + ' MB/s');
        console.log('Facebook Video ID:', finalResult.id);
        
        return {
          success: true,
          videoId: finalResult.id,
          method: 'chunked_optimization',
          uploadSpeed: speed + ' MB/s',
          uploadTime
        };
      } else {
        throw new Error('Upload finalization failed: ' + JSON.stringify(finalResult));
      }
      
    } catch (error) {
      console.log('Chunked upload error:', (error as Error).message);
      throw error;
    }
  }
  
  /**
   * Direct upload optimization for medium files
   */
  private static async uploadWithDirectOptimization(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[],
    startTime: number,
    fileSizeMB: number
  ): Promise<FastUploadResult> {
    try {
      console.log('Creating optimized direct upload...');
      
      const formData = new FormData();
      
      // Optimized parameters
      formData.append('access_token', accessToken);
      formData.append('description', message);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      
      // Custom labels for Meta Insights
      if (customLabels.length > 0) {
        formData.append('custom_labels', JSON.stringify(customLabels.slice(0, 10)));
      }
      
      // Optimized file stream
      const fileStream = fs.createReadStream(filePath, {
        highWaterMark: 2 * 1024 * 1024 // 2MB buffer
      });
      
      formData.append('source', fileStream, {
        filename: 'optimized_video.mp4',
        contentType: 'video/mp4'
      });
      
      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Uploading with direct optimization...');
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders()
        }
      });
      
      const result = await response.json() as any;
      
      if (result.id) {
        const uploadTime = Date.now() - startTime;
        const speed = (fileSizeMB / (uploadTime / 1000)).toFixed(1);
        
        console.log('Direct upload successful in', Math.round(uploadTime / 1000) + 's');
        console.log('Average speed:', speed + ' MB/s');
        console.log('Facebook Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          method: 'direct_optimization',
          uploadSpeed: speed + ' MB/s',
          uploadTime
        };
      } else {
        throw new Error('Direct upload failed: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.log('Direct upload error:', (error as Error).message);
      throw error;
    }
  }
  
  /**
   * Upload individual chunk
   */
  private static async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Buffer,
    startOffset: number,
    accessToken: string
  ): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v18.0/${sessionId}`;
      const formData = new FormData();
      
      formData.append('upload_phase', 'transfer');
      formData.append('start_offset', startOffset.toString());
      formData.append('upload_session_id', sessionId);
      formData.append('access_token', accessToken);
      formData.append('video_file_chunk', chunk, {
        filename: `chunk_${chunkIndex}.mp4`,
        contentType: 'application/octet-stream'
      });
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json() as any;
      return result.success === true;
      
    } catch (error) {
      console.log('Chunk upload error:', (error as Error).message);
      return false;
    }
  }
}