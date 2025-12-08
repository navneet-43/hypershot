import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface QualityPreservingResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
  preservedQuality?: boolean;
  method?: string;
}

export class QualityPreservingService {
  static async uploadWithQualityPreservation(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<QualityPreservingResult> {
    console.log('Starting quality-preserving upload for Google Drive video');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/quality_preserved_${Date.now()}.mp4`;
      
      console.log('Downloading original video with full quality preservation');
      
      // Download using aria2c for maximum speed
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `aria2c -x 16 -s 16 -k 1M --file-allocation=none --check-certificate=false -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand, { timeout: 900000 }); // 15 minutes
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Download failed - file may be access restricted');
      }
      
      const downloadStats = fs.statSync(downloadFile);
      const originalSizeMB = downloadStats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${originalSizeMB.toFixed(1)}MB - preserving original quality`);
      
      if (originalSizeMB < 5) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      // Use Facebook's chunked upload API for large files to preserve quality
      console.log('Using Facebook chunked upload to preserve original quality');
      
      const fetch = (await import('node-fetch')).default;
      
      // Step 1: Initialize upload session
      const initParams = new URLSearchParams({
        access_token: accessToken,
        upload_phase: 'start',
        file_size: downloadStats.size.toString()
      });
      
      const initUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        body: initParams
      });
      
      if (!initResponse.ok) {
        throw new Error(`Upload initialization failed: ${initResponse.status}`);
      }
      
      const initResult = await initResponse.json() as any;
      const uploadSessionId = initResult.upload_session_id;
      
      console.log('Upload session initialized:', uploadSessionId);
      
      // Step 2: Upload file in chunks
      const chunkSize = 1024 * 1024 * 4; // 4MB chunks for stability
      const fileBuffer = fs.readFileSync(downloadFile);
      const totalChunks = Math.ceil(fileBuffer.length / chunkSize);
      
      console.log(`Uploading ${totalChunks} chunks of ${chunkSize / (1024 * 1024)}MB each`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileBuffer.length);
        const chunk = fileBuffer.slice(start, end);
        
        const FormData = (await import('form-data')).default;
        const chunkForm = new FormData();
        
        chunkForm.append('access_token', accessToken);
        chunkForm.append('upload_phase', 'transfer');
        chunkForm.append('upload_session_id', uploadSessionId);
        chunkForm.append('start_offset', start.toString());
        chunkForm.append('video_file_chunk', chunk, {
          filename: `chunk_${i}.mp4`,
          contentType: 'video/mp4'
        });
        
        const chunkResponse = await fetch(initUrl, {
          method: 'POST',
          body: chunkForm,
          headers: chunkForm.getHeaders()
        });
        
        if (!chunkResponse.ok) {
          throw new Error(`Chunk ${i + 1}/${totalChunks} upload failed: ${chunkResponse.status}`);
        }
        
        console.log(`Uploaded chunk ${i + 1}/${totalChunks} (${((i + 1) / totalChunks * 100).toFixed(1)}%)`);
      }
      
      // Step 3: Finalize upload
      const finalParams = new URLSearchParams({
        access_token: accessToken,
        upload_phase: 'finish',
        upload_session_id: uploadSessionId,
        title: `Quality Preserved Video - ${originalSizeMB.toFixed(1)}MB`,
        description: `Original quality preserved - ${originalSizeMB.toFixed(1)}MB Google Drive video`,
        privacy: JSON.stringify({ value: 'EVERYONE' }),
        published: 'true'
      });
      
      const finalResponse = await fetch(initUrl, {
        method: 'POST',
        body: finalParams
      });
      
      if (finalResponse.ok) {
        const finalResult = await finalResponse.json() as any;
        
        if (finalResult.id) {
          console.log('Quality-preserved video uploaded successfully');
          console.log('Facebook Video ID:', finalResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Quality Preserved Video - ${originalSizeMB.toFixed(1)}MB (No Compression)`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(downloadFile);
          
          console.log('Upload completed with original quality preserved');
          console.log('Database Post ID:', newPost.id);
          console.log('Live URL: https://facebook.com/' + finalResult.id);
          
          return {
            success: true,
            videoId: finalResult.id,
            postId: newPost.id,
            sizeMB: originalSizeMB,
            preservedQuality: true,
            method: 'chunked_upload_quality_preserved'
          };
        }
      }
      
      const errorText = await finalResponse.text();
      console.log('Final upload error:', finalResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(downloadFile);
      
      return {
        success: false,
        error: `Quality-preserved upload failed: ${finalResponse.status} - ${errorText}`,
        sizeMB: originalSizeMB,
        preservedQuality: false,
        method: 'chunked_upload_failed'
      };
      
    } catch (error) {
      console.log('Quality preservation error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        preservedQuality: false
      };
    }
  }
}