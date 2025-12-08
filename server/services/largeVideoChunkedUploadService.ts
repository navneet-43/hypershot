import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface LargeVideoUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
  isActualVideo?: boolean;
}

export class LargeVideoChunkedUploadService {
  static async uploadLargeVideoPreserveQuality(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<LargeVideoUploadResult> {
    console.log('Processing large Google Drive video with quality preservation');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/large_quality_${Date.now()}.mp4`;
      
      console.log('Downloading large Google Drive video');
      
      // Download with aria2c for speed and reliability
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `aria2c -x 8 -s 8 -k 1M --file-allocation=none --check-certificate=false -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand, { timeout: 600000 }); // 10 minute timeout
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Download failed');
      }
      
      const stats = fs.statSync(downloadFile);
      const fileSizeMB = stats.size / (1024 * 1024);
      const fileSize = stats.size;
      
      console.log(`Downloaded: ${fileSizeMB.toFixed(1)}MB`);
      
      if (fileSizeMB < 10) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      // Use chunked upload for files over 100MB to preserve quality
      if (fileSizeMB > 100) {
        console.log('Using chunked upload for large file to preserve quality');
        return await this.uploadWithChunkedMethod(
          downloadFile,
          fileSize,
          fileSizeMB,
          pageId,
          accessToken,
          accountId,
          googleDriveUrl,
          storage
        );
      } else {
        // Use standard upload for smaller files
        console.log('Using standard upload for file under 100MB');
        return await this.uploadWithStandardMethod(
          downloadFile,
          fileSizeMB,
          pageId,
          accessToken,
          accountId,
          googleDriveUrl,
          storage
        );
      }
      
    } catch (error) {
      console.log('Large video upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        isActualVideo: false
      };
    }
  }
  
  private static async uploadWithChunkedMethod(
    videoFile: string,
    fileSize: number,
    fileSizeMB: number,
    pageId: string,
    accessToken: string,
    accountId: number,
    googleDriveUrl: string,
    storage: any
  ): Promise<LargeVideoUploadResult> {
    try {
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      // Step 1: Initialize resumable upload session
      const initFormData = new FormData();
      initFormData.append('access_token', accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fileSize.toString());
      initFormData.append('file_type', 'video/mp4');
      
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Initializing chunked upload session');
      
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
      const chunkSize = 1024 * 1024 * 4; // 4MB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);
      
      console.log(`Uploading ${totalChunks} chunks of ${chunkSize / (1024 * 1024)}MB each`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkBuffer = Buffer.alloc(end - start);
        
        const fd = fs.openSync(videoFile, 'r');
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
        
        console.log(`Uploading chunk ${i + 1}/${totalChunks} (${(start / (1024 * 1024)).toFixed(1)}MB - ${(end / (1024 * 1024)).toFixed(1)}MB)`);
        
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
      console.log('Finalizing chunked upload');
      
      const finalFormData = new FormData();
      finalFormData.append('access_token', accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', uploadSessionId);
      finalFormData.append('title', `Large Video Quality Preserved - ${fileSizeMB.toFixed(1)}MB`);
      finalFormData.append('description', `Large Video Chunked Upload - ${fileSizeMB.toFixed(1)}MB - Quality Preserved`);
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
            content: `Large Video Chunked Upload - ${fileSizeMB.toFixed(1)}MB - Quality Preserved`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(videoFile);
          
          // Wait for Facebook processing
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Verify it's an actual video
          const isActualVideo = await this.verifyVideoUpload(pageId, accessToken, 'Quality Preserved');
          
          return {
            success: true,
            videoId: finalResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB,
            isActualVideo: isActualVideo
          };
        }
      }
      
      const errorText = await finalResponse.text();
      console.log('Finalization error:', finalResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(videoFile);
      
      return {
        success: false,
        error: `Finalization failed: ${finalResponse.status} - ${errorText}`,
        sizeMB: fileSizeMB,
        isActualVideo: false
      };
      
    } catch (error) {
      console.log('Chunked upload error:', (error as Error).message);
      
      // Clean up on error
      if (fs.existsSync(videoFile)) {
        fs.unlinkSync(videoFile);
      }
      
      return {
        success: false,
        error: (error as Error).message,
        isActualVideo: false
      };
    }
  }
  
  private static async uploadWithStandardMethod(
    videoFile: string,
    fileSizeMB: number,
    pageId: string,
    accessToken: string,
    accountId: number,
    googleDriveUrl: string,
    storage: any
  ): Promise<LargeVideoUploadResult> {
    try {
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(videoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Standard Video Upload - ${fileSizeMB.toFixed(1)}MB`);
      formData.append('description', `Standard Upload - ${fileSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Standard upload completed');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Standard Upload - ${fileSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(videoFile);
          
          // Verify it's an actual video
          const isActualVideo = await this.verifyVideoUpload(pageId, accessToken, 'Standard Upload');
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: fileSizeMB,
            isActualVideo: isActualVideo
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Standard upload error:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(videoFile);
      
      return {
        success: false,
        error: `Standard upload failed: ${uploadResponse.status} - ${errorText}`,
        sizeMB: fileSizeMB,
        isActualVideo: false
      };
      
    } catch (error) {
      console.log('Standard upload error:', (error as Error).message);
      
      if (fs.existsSync(videoFile)) {
        fs.unlinkSync(videoFile);
      }
      
      return {
        success: false,
        error: (error as Error).message,
        isActualVideo: false
      };
    }
  }
  
  private static async verifyVideoUpload(
    pageId: string,
    accessToken: string,
    searchTerm: string
  ): Promise<boolean> {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Check posts for video attachment
      const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,attachments&access_token=${accessToken}&limit=5`;
      const response = await fetch(postsUrl);
      
      if (response.ok) {
        const data = await response.json() as any;
        
        if (data.data) {
          const videoPost = data.data.find((post: any) => 
            post.message?.includes(searchTerm) &&
            post.attachments &&
            post.attachments.data &&
            post.attachments.data[0].type === 'video_inline'
          );
          
          return !!videoPost;
        }
      }
      
      return false;
    } catch (error) {
      console.log('Verification error:', (error as Error).message);
      return false;
    }
  }
}