import fetch from 'node-fetch';
import * as fs from 'fs';

export class FixedFacebookVideoService {
  static async uploadVideoFile(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string,
    customLabels: string[] = []
  ) {
    console.log('🎬 FIXED FACEBOOK VIDEO SERVICE');
    console.log('📁 File:', filePath);
    console.log('📄 Page:', pageId);

    if (!fs.existsSync(filePath)) {
      throw new Error('Video file does not exist');
    }

    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`📊 File size: ${sizeMB.toFixed(2)}MB`);

    try {
      // Use form-data for proper file upload
      const FormData = require('form-data');
      const form = new FormData();
      
      // Add video file as stream
      form.append('source', fs.createReadStream(filePath));
      form.append('description', description);
      form.append('access_token', accessToken);
      form.append('published', 'true');
      
      if (customLabels.length > 0) {
        form.append('custom_labels', JSON.stringify(customLabels));
      }

      console.log('📤 Uploading video file to Facebook...');

      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: form,
        headers: {
          ...form.getHeaders()
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('❌ Facebook API Error:', response.status, errorText);
        throw new Error(`Facebook API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as any;

      if (result.id) {
        console.log('✅ VIDEO FILE UPLOADED SUCCESSFULLY');
        console.log('🎯 Facebook Video ID:', result.id);
        console.log('📺 This is an actual video file, not a link post');
        
        return {
          success: true,
          videoId: result.id,
          url: `https://facebook.com/${result.id}`,
          type: 'video_file',
          sizeMB: sizeMB
        };
      } else {
        throw new Error('No video ID returned from Facebook');
      }

    } catch (error) {
      console.log('❌ Video upload failed:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        type: 'upload_failed'
      };
    }
  }

  static async uploadWithChunkedMethod(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string,
    customLabels: string[] = []
  ) {
    console.log('📊 CHUNKED VIDEO UPLOAD');
    
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const sizeMB = fileSize / (1024 * 1024);
    
    console.log(`📊 File size: ${sizeMB.toFixed(2)}MB - using chunked upload`);

    try {
      // Step 1: Create upload session
      const sessionResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          access_token: accessToken,
          upload_phase: 'start',
          file_size: fileSize.toString()
        })
      });

      const sessionResult = await sessionResponse.json() as any;
      
      if (!sessionResult.upload_session_id) {
        throw new Error('Failed to create upload session');
      }

      console.log('📋 Upload session created:', sessionResult.upload_session_id);

      // Step 2: Upload file in chunks
      const chunkSize = 512 * 1024; // 512KB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);
      const fileBuffer = fs.readFileSync(filePath);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = fileBuffer.slice(start, end);

        console.log(`📦 Uploading chunk ${i + 1}/${totalChunks} (${chunk.length} bytes)`);

        const FormData = require('form-data');
        const chunkForm = new FormData();
        
        chunkForm.append('access_token', accessToken);
        chunkForm.append('upload_phase', 'transfer');
        chunkForm.append('upload_session_id', sessionResult.upload_session_id);
        chunkForm.append('start_offset', start.toString());
        chunkForm.append('video_file_chunk', chunk, {
          filename: 'chunk.mp4',
          contentType: 'video/mp4'
        });

        const chunkResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
          method: 'POST',
          body: chunkForm,
          headers: {
            ...chunkForm.getHeaders()
          }
        });

        if (!chunkResponse.ok) {
          const errorText = await chunkResponse.text();
          throw new Error(`Chunk upload failed: ${chunkResponse.status} - ${errorText}`);
        }
      }

      // Step 3: Finalize upload
      console.log('🎯 Finalizing video upload...');
      
      const finalizeResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          access_token: accessToken,
          upload_phase: 'finish',
          upload_session_id: sessionResult.upload_session_id,
          description: description,
          custom_labels: JSON.stringify(customLabels),
          published: 'true'
        })
      });

      const finalResult = await finalizeResponse.json() as any;

      if (finalResult.id) {
        console.log('✅ CHUNKED VIDEO UPLOAD SUCCESSFUL');
        console.log('🎯 Facebook Video ID:', finalResult.id);
        
        return {
          success: true,
          videoId: finalResult.id,
          url: `https://facebook.com/${finalResult.id}`,
          type: 'chunked_video_file',
          sizeMB: sizeMB
        };
      } else {
        throw new Error('Finalize failed: ' + JSON.stringify(finalResult));
      }

    } catch (error) {
      console.log('❌ Chunked upload failed:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        type: 'chunked_failed'
      };
    }
  }
}