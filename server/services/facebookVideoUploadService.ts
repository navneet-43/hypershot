import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';

export class FacebookVideoUploadService {
  
  static async uploadVideoFile(
    filePath: string, 
    pageId: string, 
    accessToken: string, 
    description: string,
    customLabels: string[] = []
  ): Promise<{ success: boolean; videoId?: string; url?: string; sizeMB?: number; error?: string }> {
    
    console.log('🎬 FACEBOOK VIDEO UPLOAD SERVICE');
    console.log('📁 File:', filePath);
    console.log('📄 Page ID:', pageId);
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Video file not found' };
    }
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    const sizeGB = sizeMB / 1024;
    
    console.log('📊 File size:', sizeMB.toFixed(1) + 'MB');
    
    if (sizeGB > 1) {
      return { success: false, error: 'File too large. Facebook supports up to 1GB.' };
    }
    
    try {
      // For files larger than 100MB, use chunked upload
      if (sizeMB > 100) {
        console.log('📦 Using chunked upload for large file');
        return await this.uploadLargeVideo(filePath, pageId, accessToken, description, customLabels, sizeMB);
      } else {
        console.log('📤 Using standard upload');
        return await this.uploadStandardVideo(filePath, pageId, accessToken, description, customLabels, sizeMB);
      }
      
    } catch (error) {
      console.log('❌ Upload error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
  
  static async uploadStandardVideo(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string,
    customLabels: string[],
    sizeMB: number
  ): Promise<{ success: boolean; videoId?: string; url?: string; sizeMB?: number; error?: string }> {
    
    try {
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('source', fs.createReadStream(filePath));
      formData.append('description', description);
      formData.append('published', 'true');
      
      // Add custom labels for Meta Insights
      if (customLabels.length > 0) {
        const validLabels = customLabels
          .filter(label => label && label.length <= 25)
          .slice(0, 10);
        
        if (validLabels.length > 0) {
          formData.append('custom_labels', JSON.stringify(validLabels));
        }
      }
      
      console.log('📤 Uploading video to Facebook...');
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      const responseText = await response.text();
      console.log('📨 Response status:', response.status);
      
      if (response.ok) {
        const result = JSON.parse(responseText);
        console.log('✅ Video uploaded successfully');
        console.log('🎬 Facebook Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          url: `https://facebook.com/${result.id}`,
          sizeMB: sizeMB
        };
      } else {
        console.log('❌ Upload failed:', responseText);
        return { success: false, error: `Upload failed: ${response.status} - ${responseText}` };
      }
      
    } catch (error) {
      console.log('❌ Standard upload error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
  
  static async uploadLargeVideo(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string,
    customLabels: string[],
    sizeMB: number
  ): Promise<{ success: boolean; videoId?: string; url?: string; sizeMB?: number; error?: string }> {
    
    console.log('📦 Starting chunked upload process...');
    
    try {
      // Step 1: Initialize upload session
      console.log('🔄 Step 1: Initializing upload session');
      
      const initFormData = new FormData();
      initFormData.append('access_token', accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fs.statSync(filePath).size.toString());
      
      const initResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: initFormData,
        headers: initFormData.getHeaders()
      });
      
      const initResult = await initResponse.text();
      
      if (!initResponse.ok) {
        return { success: false, error: `Session init failed: ${initResult}` };
      }
      
      const { upload_session_id } = JSON.parse(initResult);
      console.log('🔗 Upload session ID:', upload_session_id);
      
      // Step 2: Upload file in chunks
      console.log('🔄 Step 2: Uploading file chunks');
      
      const fileSize = fs.statSync(filePath).size;
      const chunkSize = 1024 * 1024 * 4; // 4MB chunks
      const fileHandle = fs.openSync(filePath, 'r');
      let startOffset = 0;
      
      while (startOffset < fileSize) {
        const buffer = Buffer.allocUnsafe(Math.min(chunkSize, fileSize - startOffset));
        const bytesRead = fs.readSync(fileHandle, buffer, 0, buffer.length, startOffset);
        const chunk = buffer.slice(0, bytesRead);
        
        const chunkFormData = new FormData();
        chunkFormData.append('access_token', accessToken);
        chunkFormData.append('upload_phase', 'transfer');
        chunkFormData.append('upload_session_id', upload_session_id);
        chunkFormData.append('start_offset', startOffset.toString());
        chunkFormData.append('video_file_chunk', chunk, {
          filename: 'chunk.mp4',
          contentType: 'video/mp4'
        });
        
        const chunkResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
          method: 'POST',
          body: chunkFormData,
          headers: chunkFormData.getHeaders()
        });
        
        const chunkNumber = Math.floor(startOffset / chunkSize) + 1;
        const totalChunks = Math.ceil(fileSize / chunkSize);
        
        console.log(`📦 Chunk ${chunkNumber}/${totalChunks}: ${chunkResponse.status}`);
        
        if (!chunkResponse.ok) {
          const chunkError = await chunkResponse.text();
          fs.closeSync(fileHandle);
          return { success: false, error: `Chunk ${chunkNumber} failed: ${chunkError}` };
        }
        
        startOffset += bytesRead;
      }
      
      fs.closeSync(fileHandle);
      console.log('✅ All chunks uploaded');
      
      // Step 3: Finalize upload
      console.log('🔄 Step 3: Finalizing upload');
      
      const finalFormData = new FormData();
      finalFormData.append('access_token', accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', upload_session_id);
      finalFormData.append('description', description);
      finalFormData.append('published', 'true');
      
      // Add custom labels
      if (customLabels.length > 0) {
        const validLabels = customLabels
          .filter(label => label && label.length <= 25)
          .slice(0, 10);
        
        if (validLabels.length > 0) {
          finalFormData.append('custom_labels', JSON.stringify(validLabels));
        }
      }
      
      const finalResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: finalFormData,
        headers: finalFormData.getHeaders()
      });
      
      const finalResult = await finalResponse.text();
      
      if (finalResponse.ok) {
        const result = JSON.parse(finalResult);
        console.log('✅ Chunked upload completed successfully');
        console.log('🎬 Facebook Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          url: `https://facebook.com/${result.id}`,
          sizeMB: sizeMB
        };
      } else {
        return { success: false, error: `Finalization failed: ${finalResult}` };
      }
      
    } catch (error) {
      console.log('❌ Chunked upload error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
}