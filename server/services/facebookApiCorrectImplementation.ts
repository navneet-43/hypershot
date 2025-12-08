import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';

interface FacebookAccount {
  id: number;
  pageId: string;
  accessToken: string;
  name: string;
}

interface VideoUploadResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  publishedLink?: string;
  error?: string;
  method?: string;
  fileSize?: number;
}

export class FacebookApiCorrectImplementation {
  
  /**
   * Uploads video using Facebook Graph API specifications from the documentation
   * Supports files up to 1GB (standard) or 1.75GB (resumable)
   */
  async uploadVideoWithCorrectApi(
    videoFilePath: string,
    account: FacebookAccount,
    title: string,
    description: string
  ): Promise<VideoUploadResult> {
    
    try {
      if (!fs.existsSync(videoFilePath)) {
        throw new Error('Video file not found: ' + videoFilePath);
      }
      
      const stats = fs.statSync(videoFilePath);
      const fileSizeBytes = stats.size;
      const fileSizeMB = fileSizeBytes / (1024 * 1024);
      
      console.log(`Uploading ${fileSizeMB.toFixed(1)}MB video using Facebook Graph API`);
      
      // Use standard upload for files under 500MB, resumable for larger files
      if (fileSizeMB < 500) {
        return await this.standardMultipartUpload(videoFilePath, account, title, description, fileSizeMB);
      } else {
        return await this.resumableUpload(videoFilePath, account, title, description, fileSizeMB);
      }
      
    } catch (error) {
      console.error('Facebook API upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Standard multipart/form-data upload (up to 1GB)
   * As documented in Facebook Graph API Reference
   */
  private async standardMultipartUpload(
    videoFilePath: string,
    account: FacebookAccount,
    title: string,
    description: string,
    fileSizeMB: number
  ): Promise<VideoUploadResult> {
    
    console.log('Using standard multipart/form-data upload method');
    
    const formData = new FormData();
    const fileStream = fs.createReadStream(videoFilePath);
    
    // Required parameters per Facebook documentation
    formData.append('access_token', account.accessToken);
    formData.append('source', fileStream, {
      filename: 'video.mp4',
      contentType: 'video/mp4'
    });
    
    // Video metadata
    formData.append('title', title);
    formData.append('description', description);
    formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
    formData.append('published', 'true');
    formData.append('content_category', 'OTHER');
    formData.append('embeddable', 'true');
    
    const uploadUrl = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
    
    console.log('Uploading to Facebook Graph API...');
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 300000 // 5 minute timeout
    });
    
    console.log(`Upload response status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json() as any;
      console.log('Standard upload successful - Facebook Video ID:', result.id);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verify publication
      const verificationResult = await this.verifyVideoPublication(account, result.id);
      
      return {
        success: true,
        facebookVideoId: result.id,
        facebookPostId: verificationResult.postId,
        publishedLink: verificationResult.publishedLink,
        method: 'standard_multipart',
        fileSize: fileSizeMB
      };
      
    } else {
      const errorText = await response.text();
      console.error('Standard upload failed:', response.status, errorText);
      
      return {
        success: false,
        error: `Standard upload failed: ${response.status} - ${errorText}`,
        method: 'standard_multipart',
        fileSize: fileSizeMB
      };
    }
  }
  
  /**
   * Resumable upload for large files (up to 1.75GB)
   * As documented in Facebook Graph API Reference
   */
  private async resumableUpload(
    videoFilePath: string,
    account: FacebookAccount,
    title: string,
    description: string,
    fileSizeMB: number
  ): Promise<VideoUploadResult> {
    
    console.log('Using resumable upload method for large file');
    
    try {
      // Step 1: Initialize upload session
      const initFormData = new FormData();
      initFormData.append('access_token', account.accessToken);
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fs.statSync(videoFilePath).size.toString());
      
      const initUrl = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
      
      console.log('Initializing resumable upload session...');
      
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initFormData,
        headers: initFormData.getHeaders()
      });
      
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Session initialization failed: ${initResponse.status} - ${errorText}`);
      }
      
      const initResult = await initResponse.json() as any;
      const uploadSessionId = initResult.upload_session_id;
      
      console.log('Upload session initialized:', uploadSessionId);
      
      // Step 2: Upload video data in chunks
      const chunkSize = 1024 * 1024 * 4; // 4MB chunks as recommended
      const fileSize = fs.statSync(videoFilePath).size;
      let startOffset = 0;
      
      while (startOffset < fileSize) {
        const endOffset = Math.min(startOffset + chunkSize, fileSize);
        const chunkBuffer = Buffer.alloc(endOffset - startOffset);
        
        const fd = fs.openSync(videoFilePath, 'r');
        fs.readSync(fd, chunkBuffer, 0, chunkBuffer.length, startOffset);
        fs.closeSync(fd);
        
        const chunkFormData = new FormData();
        chunkFormData.append('access_token', account.accessToken);
        chunkFormData.append('upload_phase', 'transfer');
        chunkFormData.append('upload_session_id', uploadSessionId);
        chunkFormData.append('start_offset', startOffset.toString());
        chunkFormData.append('video_file_chunk', chunkBuffer, {
          filename: 'chunk.mp4',
          contentType: 'video/mp4'
        });
        
        console.log(`Uploading chunk: ${startOffset}-${endOffset} (${((endOffset/fileSize)*100).toFixed(1)}%)`);
        
        const chunkResponse = await fetch(initUrl, {
          method: 'POST',
          body: chunkFormData,
          headers: chunkFormData.getHeaders(),
          timeout: 120000 // 2 minute timeout per chunk
        });
        
        if (!chunkResponse.ok) {
          const errorText = await chunkResponse.text();
          throw new Error(`Chunk upload failed: ${chunkResponse.status} - ${errorText}`);
        }
        
        startOffset = endOffset;
      }
      
      console.log('All chunks uploaded successfully');
      
      // Step 3: Finalize upload with metadata
      const finalFormData = new FormData();
      finalFormData.append('access_token', account.accessToken);
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', uploadSessionId);
      finalFormData.append('title', title);
      finalFormData.append('description', description);
      finalFormData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      finalFormData.append('published', 'true');
      finalFormData.append('content_category', 'OTHER');
      finalFormData.append('embeddable', 'true');
      
      console.log('Finalizing resumable upload...');
      
      const finalResponse = await fetch(initUrl, {
        method: 'POST',
        body: finalFormData,
        headers: finalFormData.getHeaders(),
        timeout: 180000 // 3 minute timeout
      });
      
      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        throw new Error(`Upload finalization failed: ${finalResponse.status} - ${errorText}`);
      }
      
      const finalResult = await finalResponse.json() as any;
      console.log('Resumable upload successful - Facebook Video ID:', finalResult.id);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Verify publication
      const verificationResult = await this.verifyVideoPublication(account, finalResult.id);
      
      return {
        success: true,
        facebookVideoId: finalResult.id,
        facebookPostId: verificationResult.postId,
        publishedLink: verificationResult.publishedLink,
        method: 'resumable_upload',
        fileSize: fileSizeMB
      };
      
    } catch (error) {
      console.error('Resumable upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        method: 'resumable_upload',
        fileSize: fileSizeMB
      };
    }
  }
  
  /**
   * Verify that the video was published successfully
   */
  private async verifyVideoPublication(account: FacebookAccount, videoId: string): Promise<{
    postId?: string;
    publishedLink?: string;
    published: boolean;
  }> {
    
    try {
      console.log('Verifying video publication...');
      
      // Check page posts for the video
      const postsUrl = `https://graph.facebook.com/v18.0/${account.pageId}/posts?fields=id,message,attachments,created_time&access_token=${account.accessToken}&limit=10`;
      
      const response = await fetch(postsUrl);
      if (response.ok) {
        const data = await response.json() as any;
        
        // Look for posts with video attachments from last 5 minutes
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        for (const post of data.data) {
          const postTime = new Date(post.created_time).getTime();
          
          if (postTime > fiveMinutesAgo) {
            const isVideo = post.attachments?.data?.[0]?.type === 'video_inline';
            
            if (isVideo) {
              console.log('Video publication verified - Post ID:', post.id);
              
              return {
                postId: post.id,
                publishedLink: `https://facebook.com/${post.id}`,
                published: true
              };
            }
          }
        }
      }
      
      console.log('Video uploaded but publication verification pending');
      
      return {
        published: false
      };
      
    } catch (error) {
      console.error('Verification error:', error);
      return {
        published: false
      };
    }
  }
}