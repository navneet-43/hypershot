import { WebSocket } from 'ws';

interface ProgressUpdate {
  uploadId: string;
  step: string;
  percentage: number;
  details: string;
  timestamp: Date;
}

interface ActiveUpload {
  uploadId: string;
  userId: number;
  websocket?: WebSocket;
  progress: ProgressUpdate;
  completed?: boolean;
}

class ProgressTrackingService {
  private activeUploads: Map<string, ActiveUpload> = new Map();
  private clients: Map<string, WebSocket> = new Map();

  // Register a new upload session
  startUpload(uploadId: string, userId: number, websocket?: WebSocket): void {
    console.log(`📊 Starting progress tracking for upload: ${uploadId}`);
    
    const upload: ActiveUpload = {
      uploadId,
      userId,
      websocket,
      progress: {
        uploadId,
        step: 'Initializing upload...',
        percentage: 0,
        details: 'Starting Enhanced Google Drive video processing',
        timestamp: new Date()
      }
    };

    this.activeUploads.set(uploadId, upload);
    
    if (websocket) {
      this.clients.set(uploadId, websocket);
      this.sendProgressUpdate(upload.progress);
    }
  }

  // Update progress for an upload
  updateProgress(uploadId: string, step: string, percentage: number, details: string): void {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) {
      console.warn(`⚠️ Upload not found for progress update: ${uploadId}`);
      return;
    }

    upload.progress = {
      uploadId,
      step,
      percentage: Math.min(100, Math.max(0, percentage)),
      details,
      timestamp: new Date()
    };

    console.log(`📈 Progress update [${uploadId}]: ${step} - ${percentage}% - ${details}`);
    
    this.sendProgressUpdate(upload.progress);
  }

  // Send progress to connected WebSocket client
  private sendProgressUpdate(progress: ProgressUpdate): void {
    const client = this.clients.get(progress.uploadId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type: 'progress',
          data: progress
        }));
      } catch (error) {
        console.error(`❌ Failed to send progress update:`, error);
      }
    }
  }

  // Complete an upload
  completeUpload(uploadId: string, success: boolean, details?: string): void {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) return;

    const finalProgress: ProgressUpdate = {
      uploadId,
      step: success ? 'Upload completed successfully!' : 'Upload failed',
      percentage: success ? 100 : 0,
      details: details || (success ? 'Video uploaded and published to Facebook' : 'Upload failed'),
      timestamp: new Date()
    };

    console.log(`🏁 Upload ${success ? 'completed' : 'failed'} [${uploadId}]: ${details}`);
    
    this.sendProgressUpdate(finalProgress);
    
    // Mark upload as completed but keep progress data briefly for API access
    upload.completed = true;
    
    // Clean up after a longer delay to ensure progress bar can finish displaying
    setTimeout(() => {
      this.cleanupUpload(uploadId);
    }, 60000); // Increased to 60 seconds for extended progress tracking
  }

  // Clean up upload data and WebSocket connections
  private cleanupUpload(uploadId: string): void {
    console.log(`🧹 Cleaning up upload tracking for: ${uploadId}`);
    
    this.activeUploads.delete(uploadId);
    const client = this.clients.get(uploadId);
    if (client) {
      this.clients.delete(uploadId);
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.close();
        } catch (error) {
          console.error(`❌ Error closing WebSocket for ${uploadId}:`, error);
        }
      }
    }
  }

  // Get current progress for an upload
  getProgress(uploadId: string): ProgressUpdate | null {
    const upload = this.activeUploads.get(uploadId);
    return upload ? upload.progress : null;
  }

  // Clean up completed uploads older than threshold
  cleanupCompletedUploads(): void {
    const now = Date.now();
    const threshold = 30 * 60 * 1000; // 30 minutes - increased for better progress tracking
    
    const expiredUploads: string[] = [];
    this.activeUploads.forEach((upload, uploadId) => {
      if (upload.completed && (now - upload.progress.timestamp.getTime()) > threshold) {
        expiredUploads.push(uploadId);
      }
    });
    
    expiredUploads.forEach(uploadId => {
      console.log(`🧹 Auto-cleaning expired upload: ${uploadId}`);
      this.cleanupUpload(uploadId);
    });
  }

  // Register WebSocket client for existing upload
  registerClient(uploadId: string, websocket: WebSocket): void {
    this.clients.set(uploadId, websocket);
    
    // Send current progress if upload exists
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      this.sendProgressUpdate(upload.progress);
    }
  }

  // Remove client
  removeClient(uploadId: string): void {
    this.clients.delete(uploadId);
  }

  // Get all active uploads for debugging
  getActiveUploads(): string[] {
    return Array.from(this.activeUploads.keys());
  }
}

// Export singleton instance
export const progressTracker = new ProgressTrackingService();
export default progressTracker;