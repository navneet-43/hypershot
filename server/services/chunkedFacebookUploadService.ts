import * as fs from 'fs';

interface ChunkedUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
}

export class ChunkedFacebookUploadService {
  static async uploadLargeVideo(
    videoFilePath: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<ChunkedUploadResult> {
    console.log('Starting chunked video upload for large file');
    
    try {
      if (!fs.existsSync(videoFilePath)) {
        throw new Error('Video file not found');
      }
      
      const stats = fs.statSync(videoFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      const fileSize = stats.size;
      
      console.log(`Uploading ${fileSizeMB.toFixed(1)}MB video with chunked upload`);
      
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      // Step 1: Initialize resumable upload session
      const initFormData = new FormData();
      initFormData.append('access_token', accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fileSize.toString());
      
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Initializing upload session');
      
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initFormData,
        headers: initFormData.getHeaders()
      });
      
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Init failed: ${initResponse.status} - ${errorText}`);
      }
      
      const initResult = await initResponse.json() as any;
      const uploadSessionId = initResult.upload_session_id;
      
      if (!uploadSessionId) {
        throw new Error('No upload session ID received');
      }
      
      console.log('Upload session created:', uploadSessionId);
      
      // Step 2: Upload file in chunks
      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);
      
      console.log(`Uploading ${totalChunks} chunks of ${chunkSize / 1024}KB each`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkBuffer = Buffer.alloc(end - start);
        
        const fd = fs.openSync(videoFilePath, 'r');
        fs.readSync(fd, chunkBuffer, 0, end - start, start);
        fs.closeSync(fd);
        
        const chunkFormData = new FormData();
        chunkFormData.append('access_token', accessToken);
        chunkFormData.append('upload_phase', 'transfer');
        chunkFormData.append('start_offset', start.toString());
        chunkFormData.append('upload_session_id', uploadSessionId);
        chunkFormData.append('video_file_chunk', chunkBuffer, {
          filename: `chunk_${i}.mp4`,
          contentType: 'video/mp4'
        });
        
        console.log(`Uploading chunk ${i + 1}/${totalChunks} (${start}-${end})`);
        
        const chunkResponse = await fetch(initUrl, {
          method: 'POST',
          body: chunkFormData,
          headers: chunkFormData.getHeaders()
        });
        
        if (!chunkResponse.ok) {
          const errorText = await chunkResponse.text();
          throw new Error(`Chunk ${i} failed: ${chunkResponse.status} - ${errorText}`);
        }
        
        console.log(`Chunk ${i + 1} uploaded successfully`);
      }
      
      // Step 3: Finalize upload
      console.log('Finalizing upload');
      
      const finalFormData = new FormData();
      finalFormData.append('access_token', accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', uploadSessionId);
      finalFormData.append('description', `Google Drive Video - ${fileSizeMB.toFixed(1)}MB - Chunked Upload`);
      finalFormData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      finalFormData.append('published', 'true');
      
      const finalResponse = await fetch(initUrl, {
        method: 'POST',
        body: finalFormData,
        headers: finalFormData.getHeaders()
      });
      
      if (finalResponse.ok) {
        const finalResult = await finalResponse.json() as any;
        
        if (finalResult.id) {
          console.log('Chunked upload completed successfully');
          console.log('Facebook Video ID:', finalResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video - ${fileSizeMB.toFixed(1)}MB - Chunked Upload`,
            mediaUrl: 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link',
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(videoFilePath);
          
          return {
            success: true,
            videoId: finalResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB
          };
        }
      }
      
      const errorText = await finalResponse.text();
      console.log('Finalization error:', finalResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(videoFilePath);
      
      return {
        success: false,
        error: `Finalization failed: ${finalResponse.status} - ${errorText}`,
        sizeMB: fileSizeMB
      };
      
    } catch (error) {
      console.log('Chunked upload error:', (error as Error).message);
      
      // Clean up on error
      if (fs.existsSync(videoFilePath)) {
        fs.unlinkSync(videoFilePath);
      }
      
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}