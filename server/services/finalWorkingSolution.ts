import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import FormData from 'form-data';

const execAsync = promisify(exec);

export class FinalWorkingSolution {
  
  async uploadLargeVideoAsActualFile(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string
  ): Promise<any> {
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log(`Uploading ${sizeMB.toFixed(1)}MB as actual video file using proven method`);
    
    try {
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      // Core parameters
      formData.append('access_token', accessToken);
      formData.append('title', `Large Video - ${sizeMB.toFixed(1)}MB - Original Quality`);
      formData.append('description', description);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      
      // Enhanced parameters for large video support
      formData.append('content_category', 'OTHER');
      formData.append('embeddable', 'true');
      formData.append('is_crosspost_video', 'false');
      formData.append('slideshow_spec', JSON.stringify({}));
      
      // File upload
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        console.log('Upload successful - Video ID:', result.id);
        
        // Wait for Facebook processing
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Verify it's an actual video
        const verifyUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,attachments&access_token=${accessToken}&limit=5`;
        
        const verifyResponse = await fetch(verifyUrl);
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json() as any;
          const latestPost = verifyData.data?.[0];
          
          if (latestPost) {
            const isActualVideo = latestPost.attachments?.data?.[0]?.type === 'video_inline';
            
            return {
              success: true,
              isActualVideo: isActualVideo,
              sizeMB: sizeMB,
              facebookVideoId: result.id,
              facebookPostId: latestPost.id,
              liveUrl: `https://facebook.com/${latestPost.id}`,
              attachmentType: latestPost.attachments?.data?.[0]?.type,
              method: 'enhanced_parameters'
            };
          }
        }
        
        return {
          success: true,
          uploaded: true,
          facebookVideoId: result.id,
          sizeMB: sizeMB
        };
        
      } else {
        const errorText = await response.text();
        
        // Try alternative approach if standard fails
        if (response.status === 413 || errorText.includes('too large')) {
          console.log('Large file detected, trying resumable upload');
          return await this.uploadViaResumableMethod(filePath, pageId, accessToken, description);
        }
        
        return {
          success: false,
          error: `Upload failed: ${response.status} - ${errorText}`,
          sizeMB: sizeMB
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        sizeMB: sizeMB
      };
    }
  }
  
  async uploadViaResumableMethod(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string
  ): Promise<any> {
    
    console.log('Using resumable upload for large file');
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    try {
      // Create upload session
      const sessionUrl = `https://rupload.facebook.com/video-upload/v18.0/${pageId}`;
      
      const sessionFormData = new FormData();
      sessionFormData.append('access_token', accessToken);
      sessionFormData.append('upload_phase', 'start');
      sessionFormData.append('file_size', stats.size.toString());
      
      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        body: sessionFormData,
        headers: sessionFormData.getHeaders()
      });
      
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json() as any;
        
        // Upload file
        const fileBuffer = fs.readFileSync(filePath);
        const uploadFormData = new FormData();
        uploadFormData.append('access_token', accessToken);
        uploadFormData.append('upload_phase', 'transfer');
        uploadFormData.append('upload_session_id', sessionData.upload_session_id);
        uploadFormData.append('video_file_chunk', fileBuffer);
        
        const uploadResponse = await fetch(sessionUrl, {
          method: 'POST',
          body: uploadFormData,
          headers: uploadFormData.getHeaders()
        });
        
        if (uploadResponse.ok) {
          // Finalize upload
          const finalizeFormData = new FormData();
          finalizeFormData.append('access_token', accessToken);
          finalizeFormData.append('upload_phase', 'finish');
          finalizeFormData.append('upload_session_id', sessionData.upload_session_id);
          
          const finalizeResponse = await fetch(sessionUrl, {
            method: 'POST',
            body: finalizeFormData,
            headers: finalizeFormData.getHeaders()
          });
          
          if (finalizeResponse.ok) {
            // Publish video
            const publishUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
            const publishFormData = new FormData();
            publishFormData.append('access_token', accessToken);
            publishFormData.append('fbuploader_video_file_chunk', sessionData.video_id);
            publishFormData.append('title', `Resumable Upload - ${sizeMB.toFixed(1)}MB`);
            publishFormData.append('description', description);
            publishFormData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
            publishFormData.append('published', 'true');
            
            const publishResponse = await fetch(publishUrl, {
              method: 'POST',
              body: publishFormData,
              headers: publishFormData.getHeaders()
            });
            
            if (publishResponse.ok) {
              const publishData = await publishResponse.json() as any;
              
              return {
                success: true,
                method: 'resumable_upload',
                facebookVideoId: publishData.id,
                sizeMB: sizeMB
              };
            }
          }
        }
      }
      
      return {
        success: false,
        error: 'Resumable upload failed',
        sizeMB: sizeMB
      };
      
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        method: 'resumable_upload_error',
        sizeMB: sizeMB
      };
    }
  }
  
  async processGoogleDriveVideoFinal(
    fileId: string,
    pageId: string,
    accessToken: string
  ): Promise<any> {
    
    console.log('Processing Google Drive video with final working solution');
    
    let downloadedFile: string | null = null;
    
    try {
      // Download with gdown (proven reliable)
      downloadedFile = `/tmp/final_solution_${Date.now()}.mp4`;
      
      console.log('Downloading with gdown for reliable access');
      const gdownCmd = `gdown https://drive.google.com/uc?id=${fileId} -O "${downloadedFile}"`;
      await execAsync(gdownCmd, { timeout: 1800000 });
      
      if (!fs.existsSync(downloadedFile)) {
        throw new Error('Download failed');
      }
      
      const stats = fs.statSync(downloadedFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`Downloaded ${sizeMB.toFixed(1)}MB, uploading as actual video file`);
      
      // Upload using proven method
      const result = await this.uploadLargeVideoAsActualFile(
        downloadedFile,
        pageId,
        accessToken,
        `Google Drive Video - ${sizeMB.toFixed(1)}MB - Final Solution - Original Quality Preserved`
      );
      
      return {
        ...result,
        downloadSizeMB: sizeMB,
        downloadSuccess: true
      };
      
    } finally {
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
      }
    }
  }
}