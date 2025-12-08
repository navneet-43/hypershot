import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import FormData from 'form-data';

const execAsync = promisify(exec);

export class HootsuiteMethodService {
  
  async uploadUsingCreatorStudioMethod(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string
  ): Promise<any> {
    
    console.log('Attempting Creator Studio upload method (Hootsuite approach)');
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    try {
      // Method 1: Try resumable upload session (what Hootsuite likely uses)
      const sessionUrl = `https://rupload.facebook.com/video-upload/v18.0/${pageId}`;
      
      const sessionFormData = new FormData();
      sessionFormData.append('access_token', accessToken);
      sessionFormData.append('upload_phase', 'start');
      sessionFormData.append('file_size', stats.size.toString());
      
      console.log('Creating upload session for', sizeMB.toFixed(1), 'MB file');
      
      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        body: sessionFormData,
        headers: sessionFormData.getHeaders()
      });
      
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json() as any;
        console.log('Upload session created:', sessionData.video_id);
        
        // Upload the actual file in chunks
        const uploadUrl = `https://rupload.facebook.com/video-upload/v18.0/${pageId}`;
        const fileBuffer = fs.readFileSync(filePath);
        
        const uploadFormData = new FormData();
        uploadFormData.append('access_token', accessToken);
        uploadFormData.append('upload_phase', 'transfer');
        uploadFormData.append('upload_session_id', sessionData.upload_session_id);
        uploadFormData.append('video_file_chunk', fileBuffer, {
          filename: 'video.mp4',
          contentType: 'video/mp4'
        });
        
        console.log('Uploading file data...');
        
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: uploadFormData,
          headers: uploadFormData.getHeaders()
        });
        
        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json() as any;
          console.log('File uploaded, finalizing...');
          
          // Finalize the upload
          const finalizeFormData = new FormData();
          finalizeFormData.append('access_token', accessToken);
          finalizeFormData.append('upload_phase', 'finish');
          finalizeFormData.append('upload_session_id', sessionData.upload_session_id);
          
          const finalizeResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: finalizeFormData,
            headers: finalizeFormData.getHeaders()
          });
          
          if (finalizeResponse.ok) {
            const finalizeData = await finalizeResponse.json() as any;
            
            // Now publish the video
            const publishUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
            const publishFormData = new FormData();
            publishFormData.append('access_token', accessToken);
            publishFormData.append('fbuploader_video_file_chunk', sessionData.video_id);
            publishFormData.append('title', `Large Video Upload - ${sizeMB.toFixed(1)}MB`);
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
              console.log('Creator Studio method successful:', publishData.id);
              
              return {
                success: true,
                method: 'creator_studio_resumable',
                videoId: publishData.id,
                sizeMB: sizeMB
              };
            }
          }
        }
      }
      
      console.log('Creator Studio method failed, trying alternative...');
      
    } catch (error) {
      console.log('Creator Studio error:', (error as Error).message);
    }
    
    // Method 2: Try video library upload (another Hootsuite method)
    return await this.uploadToVideoLibrary(filePath, pageId, accessToken, description);
  }
  
  async uploadToVideoLibrary(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string
  ): Promise<any> {
    
    console.log('Attempting video library upload method');
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    try {
      // Upload to video library first, then share as post
      const libraryUrl = `https://graph.facebook.com/v18.0/${pageId}/video_library`;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Library Upload - ${sizeMB.toFixed(1)}MB`);
      formData.append('description', description);
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      console.log('Uploading to video library...');
      
      const response = await fetch(libraryUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        console.log('Video library upload successful:', data.id);
        
        // Now create a post sharing this video
        const postUrl = `https://graph.facebook.com/v18.0/${pageId}/feed`;
        const postFormData = new FormData();
        postFormData.append('access_token', accessToken);
        postFormData.append('message', description);
        postFormData.append('video', data.id);
        postFormData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
        
        const postResponse = await fetch(postUrl, {
          method: 'POST',
          body: postFormData,
          headers: postFormData.getHeaders()
        });
        
        if (postResponse.ok) {
          const postData = await postResponse.json() as any;
          console.log('Video library method successful:', postData.id);
          
          return {
            success: true,
            method: 'video_library_share',
            videoId: data.id,
            postId: postData.id,
            sizeMB: sizeMB
          };
        }
      }
      
      console.log('Video library method failed, trying native video...');
      
    } catch (error) {
      console.log('Video library error:', (error as Error).message);
    }
    
    // Method 3: Try native video endpoint with business parameters
    return await this.uploadWithBusinessParameters(filePath, pageId, accessToken, description);
  }
  
  async uploadWithBusinessParameters(
    filePath: string,
    pageId: string,
    accessToken: string,
    description: string
  ): Promise<any> {
    
    console.log('Attempting business parameters upload method');
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    try {
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Business Upload - ${sizeMB.toFixed(1)}MB`);
      formData.append('description', description);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      
      // Business-specific parameters that Hootsuite might use
      formData.append('content_category', 'OTHER');
      formData.append('embeddable', 'true');
      formData.append('targeting', JSON.stringify({ 
        geo_locations: { countries: ['IN'] },
        age_min: 18 
      }));
      formData.append('call_to_action', JSON.stringify({
        type: 'LEARN_MORE',
        value: { link: 'https://facebook.com/' + pageId }
      }));
      
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Uploading with business parameters...');
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        console.log('Business parameters method successful:', data.id);
        
        return {
          success: true,
          method: 'business_parameters',
          videoId: data.id,
          sizeMB: sizeMB
        };
      } else {
        const errorText = await response.text();
        console.log('Business parameters failed:', response.status, errorText);
        
        return {
          success: false,
          method: 'business_parameters_failed',
          error: errorText,
          sizeMB: sizeMB
        };
      }
      
    } catch (error) {
      console.log('Business parameters error:', (error as Error).message);
      
      return {
        success: false,
        method: 'business_parameters_error',
        error: (error as Error).message,
        sizeMB: sizeMB
      };
    }
  }
  
  async processVideoWithHootsuiteMethod(
    fileId: string,
    pageId: string,
    accessToken: string
  ): Promise<any> {
    
    console.log('Processing video using Hootsuite-style methods');
    
    let downloadedFile: string | null = null;
    
    try {
      // Download the video
      downloadedFile = `/tmp/hootsuite_method_${Date.now()}.mp4`;
      
      console.log('Downloading with gdown...');
      const gdownCmd = `gdown https://drive.google.com/uc?id=${fileId} -O "${downloadedFile}"`;
      await execAsync(gdownCmd, { timeout: 1800000 });
      
      if (!fs.existsSync(downloadedFile)) {
        throw new Error('Download failed');
      }
      
      const stats = fs.statSync(downloadedFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`Downloaded ${sizeMB.toFixed(1)}MB, testing Hootsuite methods`);
      
      // Try all three Hootsuite-style methods
      const methods = [
        () => this.uploadUsingCreatorStudioMethod(downloadedFile!, pageId, accessToken, `Hootsuite Method Test - ${sizeMB.toFixed(1)}MB - Original Quality`),
        () => this.uploadToVideoLibrary(downloadedFile!, pageId, accessToken, `Video Library Method - ${sizeMB.toFixed(1)}MB`),
        () => this.uploadWithBusinessParameters(downloadedFile!, pageId, accessToken, `Business Parameters - ${sizeMB.toFixed(1)}MB`)
      ];
      
      for (const method of methods) {
        const result = await method();
        if (result.success) {
          console.log(`Hootsuite method successful: ${result.method}`);
          return result;
        }
      }
      
      return {
        success: false,
        error: 'All Hootsuite methods failed',
        sizeMB: sizeMB
      };
      
    } finally {
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
      }
    }
  }
}