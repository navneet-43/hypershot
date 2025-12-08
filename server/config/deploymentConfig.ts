// Deployment-specific configuration for handling large video uploads
export const deploymentConfig = {
  // Extended timeouts for large video processing
  REQUEST_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  RESPONSE_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  
  // Memory configuration for video processing
  MAX_MEMORY_SIZE: '4096', // 4GB for FFmpeg processing
  
  // Upload configuration
  MAX_CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for stable upload
  MAX_CONCURRENT_CHUNKS: 1, // Sequential upload to avoid timeout
  
  // Progress tracking configuration
  PROGRESS_POLL_INTERVAL: 2000, // 2 seconds
  MAX_POLL_ATTEMPTS: 900, // 30 minutes total (900 * 2 seconds)
  
  // Deployment environment detection
  isDeployment: () => process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === 'true',
  
  // Enhanced error handling for deployment
  getTimeoutMessage: () => 'Large video processing continues in background. Check Recent Activity for completion status.',
  
  // FFmpeg configuration for deployment
  ffmpegConfig: {
    timeout: 25 * 60 * 1000, // 25 minutes for FFmpeg processing
    maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    killSignal: 'SIGKILL'
  }
};

export default deploymentConfig;