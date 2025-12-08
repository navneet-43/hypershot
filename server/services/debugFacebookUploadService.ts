import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';

export class DebugFacebookUploadService {
  
  static async testVideoFileUpload(filePath: string, pageId: string, accessToken: string): Promise<any> {
    console.log('🔍 DEBUG FACEBOOK UPLOAD TEST');
    console.log('📁 File:', filePath);
    console.log('📄 Page ID:', pageId);
    console.log('🔑 Token length:', accessToken.length);
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ File does not exist');
      return { success: false, error: 'File not found' };
    }
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log('📊 File size:', sizeMB.toFixed(1) + 'MB');
    
    // Test 1: Basic video upload
    console.log('🔄 Test 1: Basic video upload');
    try {
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('source', fs.createReadStream(filePath));
      formData.append('description', 'DEBUG TEST - Google Drive Video Upload as Actual File');
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      console.log('📤 Upload URL:', uploadUrl);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      const responseText = await response.text();
      console.log('📨 Response status:', response.status);
      console.log('📨 Response:', responseText);
      
      if (response.ok) {
        const result = JSON.parse(responseText);
        console.log('✅ Test 1 SUCCESS - Video uploaded');
        console.log('🎬 Video ID:', result.id);
        
        return {
          success: true,
          method: 'basic_upload',
          videoId: result.id,
          sizeMB: sizeMB
        };
      } else {
        console.log('❌ Test 1 FAILED');
        
        // Test 2: Chunked upload for large files
        if (sizeMB > 25) {
          console.log('🔄 Test 2: Chunked upload for large file');
          return await this.testChunkedUpload(filePath, pageId, accessToken, sizeMB);
        }
        
        return { 
          success: false, 
          error: `Upload failed: ${response.status} - ${responseText}` 
        };
      }
      
    } catch (error) {
      console.log('❌ Test 1 ERROR:', (error as Error).message);
      
      // Test 2: Chunked upload fallback
      if (sizeMB > 25) {
        console.log('🔄 Test 2: Chunked upload fallback');
        return await this.testChunkedUpload(filePath, pageId, accessToken, sizeMB);
      }
      
      return { success: false, error: (error as Error).message };
    }
  }
  
  static async testChunkedUpload(filePath: string, pageId: string, accessToken: string, sizeMB: number): Promise<any> {
    console.log('🔄 Testing chunked upload');
    
    try {
      // Step 1: Initialize upload session
      const initFormData = new FormData();
      initFormData.append('access_token', accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fs.statSync(filePath).size.toString());
      
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initFormData,
        headers: initFormData.getHeaders()
      });
      
      const initResult = await initResponse.text();
      console.log('📨 Init response:', initResult);
      
      if (!initResponse.ok) {
        return { success: false, error: `Init failed: ${initResult}` };
      }
      
      const { upload_session_id } = JSON.parse(initResult);
      console.log('🔗 Upload session ID:', upload_session_id);
      
      // Step 2: Upload file in chunks
      const fileStream = fs.createReadStream(filePath);
      const chunkSize = 1024 * 1024; // 1MB chunks
      const buffer = Buffer.allocUnsafe(chunkSize);
      let startOffset = 0;
      
      const fileHandle = fs.openSync(filePath, 'r');
      
      while (startOffset < fs.statSync(filePath).size) {
        const bytesRead = fs.readSync(fileHandle, buffer, 0, chunkSize, startOffset);
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
        
        const chunkResponse = await fetch(initUrl, {
          method: 'POST',
          body: chunkFormData,
          headers: chunkFormData.getHeaders()
        });
        
        const chunkResult = await chunkResponse.text();
        console.log(`📦 Chunk ${Math.floor(startOffset/chunkSize + 1)}: ${chunkResponse.status}`);
        
        if (!chunkResponse.ok) {
          fs.closeSync(fileHandle);
          return { success: false, error: `Chunk upload failed: ${chunkResult}` };
        }
        
        startOffset += bytesRead;
      }
      
      fs.closeSync(fileHandle);
      
      // Step 3: Finalize upload
      const finalFormData = new FormData();
      finalFormData.append('access_token', accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', upload_session_id);
      finalFormData.append('description', 'DEBUG CHUNKED - Google Drive Video as Actual Facebook Video');
      
      const finalResponse = await fetch(initUrl, {
        method: 'POST',
        body: finalFormData,
        headers: finalFormData.getHeaders()
      });
      
      const finalResult = await finalResponse.text();
      console.log('📨 Final response:', finalResult);
      
      if (finalResponse.ok) {
        const result = JSON.parse(finalResult);
        console.log('✅ Chunked upload SUCCESS');
        console.log('🎬 Video ID:', result.id);
        
        return {
          success: true,
          method: 'chunked_upload',
          videoId: result.id,
          sizeMB: sizeMB
        };
      } else {
        return { success: false, error: `Finalize failed: ${finalResult}` };
      }
      
    } catch (error) {
      console.log('❌ Chunked upload ERROR:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
}