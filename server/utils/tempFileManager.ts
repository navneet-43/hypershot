import { rm, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

interface TempFileEntry {
  filePath: string;
  owner: string;
  createdAt: number;
  ttlMs: number;
  tags: string[];
  inUse: boolean;
}

interface TempFileOptions {
  owner: string;
  ttlMs?: number; // Default 1 hour
  tags?: string[];
}

interface CleanupResult {
  success: boolean;
  filePath: string;
  bytesFreed?: number;
  error?: string;
}

class TempFileManager {
  private files: Map<string, TempFileEntry> = new Map();
  private sweepInterval: NodeJS.Timeout | null = null;
  // PRODUCTION FIX: Use /tmp instead of persistent storage
  private readonly tempDirs = [
    '/tmp/fb_reels',
    '/tmp/fb_videos', 
    '/tmp/google_drive',
    'temp/downloads'
  ];
  private readonly maxTotalBytes = 5 * 1024 * 1024 * 1024; // 5GB limit
  private readonly defaultTtlMs = 15 * 60 * 1000; // 15 minutes - safe for large uploads
  private readonly sweepIntervalMs = 30 * 1000; // 30 seconds sweep interval

  constructor() {
    this.startBackgroundSweeper();
  }

  /**
   * Register a temporary file for managed cleanup
   */
  register(filePath: string, options: TempFileOptions): {
    token: string;
    cleanup: () => Promise<CleanupResult>;
  } {
    const normalizedPath = path.resolve(filePath);
    const token = this.generateToken(normalizedPath);
    
    const entry: TempFileEntry = {
      filePath: normalizedPath,
      owner: options.owner,
      createdAt: Date.now(),
      ttlMs: options.ttlMs || this.defaultTtlMs,
      tags: options.tags || [],
      inUse: false
    };

    this.files.set(token, entry);
    
    console.log(`📝 TEMP FILE REGISTERED: ${path.basename(filePath)} (${options.owner})`);

    return {
      token,
      cleanup: () => this.cleanup(token)
    };
  }

  /**
   * Mark file as in-use to prevent sweeping
   */
  markInUse(token: string): void {
    const entry = this.files.get(token);
    if (entry) {
      entry.inUse = true;
      console.log(`🔒 TEMP FILE LOCKED: ${path.basename(entry.filePath)}`);
    }
  }

  /**
   * Release file from in-use state
   */
  release(token: string): void {
    const entry = this.files.get(token);
    if (entry) {
      entry.inUse = false;
      console.log(`🔓 TEMP FILE RELEASED: ${path.basename(entry.filePath)}`);
    }
  }

  /**
   * Idempotent cleanup - safe to call multiple times
   */
  async cleanup(tokenOrPath: string): Promise<CleanupResult> {
    let filePath: string;
    let token: string | null = null;

    // Determine if input is token or file path
    if (this.files.has(tokenOrPath)) {
      token = tokenOrPath;
      const entry = this.files.get(token)!;
      filePath = entry.filePath;
    } else {
      filePath = path.resolve(tokenOrPath);
      // Find token by file path
      for (const [t, entry] of Array.from(this.files.entries())) {
        if (entry.filePath === filePath) {
          token = t;
          break;
        }
      }
    }

    const result: CleanupResult = {
      success: false,
      filePath: filePath
    };

    try {
      // Check if file exists before attempting deletion
      if (!existsSync(filePath)) {
        console.log(`🗑️ TEMP FILE ALREADY DELETED: ${path.basename(filePath)}`);
        result.success = true;
        result.bytesFreed = 0;
        
        // Remove from registry if we have the token
        if (token) {
          this.files.delete(token);
        }
        
        return result;
      }

      // Get file size before deletion
      const stats = await stat(filePath);
      const bytesFreed = stats.size;

      // Delete the file with retry logic
      await rm(filePath, { 
        force: true, 
        maxRetries: 3, 
        retryDelay: 100 
      });

      console.log(`✅ TEMP FILE DELETED: ${path.basename(filePath)} (${(bytesFreed / 1024 / 1024).toFixed(1)}MB freed)`);
      
      result.success = true;
      result.bytesFreed = bytesFreed;

      // Remove from registry
      if (token) {
        this.files.delete(token);
      }

    } catch (error: any) {
      // Suppress ENOENT errors as they indicate file is already deleted
      if (error.code === 'ENOENT') {
        console.log(`🗑️ TEMP FILE ALREADY DELETED: ${path.basename(filePath)}`);
        result.success = true;
        result.bytesFreed = 0;
        
        if (token) {
          this.files.delete(token);
        }
      } else {
        console.error(`❌ TEMP FILE DELETION FAILED: ${path.basename(filePath)}`, error.message);
        result.error = error.message;
      }
    }

    return result;
  }

  /**
   * Sweep temporary directories for old files
   */
  async sweepTempDirs(): Promise<{
    filesDeleted: number;
    bytesFreed: number;
    errors: string[];
  }> {
    console.log('🧹 STARTING TEMP FILE SWEEP...');
    
    let totalFilesDeleted = 0;
    let totalBytesFreed = 0;
    const errors: string[] = [];

    for (const tempDir of this.tempDirs) {
      try {
        const result = await this.sweepDirectory(tempDir);
        totalFilesDeleted += result.filesDeleted;
        totalBytesFreed += result.bytesFreed;
        errors.push(...result.errors);
      } catch (error: any) {
        console.warn(`⚠️ SWEEP FAILED FOR ${tempDir}:`, error.message);
        errors.push(`${tempDir}: ${error.message}`);
      }
    }

    // Also clean up expired registered files
    const expiredResult = await this.cleanupExpiredFiles();
    totalFilesDeleted += expiredResult.filesDeleted;
    totalBytesFreed += expiredResult.bytesFreed;

    console.log(`🧹 SWEEP COMPLETE: ${totalFilesDeleted} files deleted, ${(totalBytesFreed / 1024 / 1024).toFixed(1)}MB freed`);

    return {
      filesDeleted: totalFilesDeleted,
      bytesFreed: totalBytesFreed,
      errors
    };
  }

  /**
   * Sweep a specific directory
   */
  private async sweepDirectory(dirPath: string): Promise<{
    filesDeleted: number;
    bytesFreed: number;
    errors: string[];
  }> {
    if (!existsSync(dirPath)) {
      return { filesDeleted: 0, bytesFreed: 0, errors: [] };
    }

    const files = await readdir(dirPath);
    const fileInfos: { path: string; stats: any; age: number }[] = [];
    
    // Get file info and calculate ages
    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file);
        const stats = await stat(fullPath);
        const age = Date.now() - stats.mtime.getTime();
        
        fileInfos.push({ path: fullPath, stats, age });
      } catch (error) {
        console.warn(`⚠️ Could not stat file ${file}:`, error);
      }
    }

    // Calculate current directory size
    const totalSize = fileInfos.reduce((sum, info) => sum + info.stats.size, 0);
    
    // Determine which files to delete
    const filesToDelete: typeof fileInfos = [];
    
    // Delete files older than 15 minutes - safe for large uploads
    const maxAge = 15 * 60 * 1000; // 15 minutes
    for (const info of fileInfos) {
      if (info.age > maxAge && !this.isFileInUse(info.path)) {
        filesToDelete.push(info);
      }
    }

    // If directory is too large, delete oldest files until we reach low-water mark (70% of cap)
    const lowWaterMark = this.maxTotalBytes * 0.7; // 70% of max capacity
    if (totalSize > this.maxTotalBytes) {
      console.log(`🚨 Directory ${dirPath} over limit (${(totalSize/1024/1024).toFixed(1)}MB > ${(this.maxTotalBytes/1024/1024).toFixed(1)}MB), cleaning to low-water mark...`);
      
      const sortedByAge = fileInfos
        .filter(info => !this.isFileInUse(info.path))
        .sort((a, b) => b.age - a.age); // Oldest first
      
      let currentSize = totalSize;
      for (const info of sortedByAge) {
        if (currentSize <= lowWaterMark) break; // Clean to 70% instead of exact limit
        if (!filesToDelete.some(f => f.path === info.path)) {
          filesToDelete.push(info);
          currentSize -= info.stats.size;
        }
      }
    }

    // Delete files
    let filesDeleted = 0;
    let bytesFreed = 0;
    const errors: string[] = [];

    for (const info of filesToDelete) {
      try {
        await rm(info.path, { force: true });
        filesDeleted++;
        bytesFreed += info.stats.size;
        console.log(`🗑️ SWEPT: ${path.basename(info.path)} (${(info.stats.size / 1024 / 1024).toFixed(1)}MB, ${Math.round(info.age / 60000)}min old)`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          errors.push(`${info.path}: ${error.message}`);
        }
      }
    }

    return { filesDeleted, bytesFreed, errors };
  }

  /**
   * Clean up expired registered files
   */
  private async cleanupExpiredFiles(): Promise<{
    filesDeleted: number;
    bytesFreed: number;
  }> {
    const now = Date.now();
    const expiredTokens: string[] = [];

    for (const [token, entry] of Array.from(this.files.entries())) {
      if (!entry.inUse && (now - entry.createdAt) > entry.ttlMs) {
        expiredTokens.push(token);
      }
    }

    let filesDeleted = 0;
    let bytesFreed = 0;

    for (const token of expiredTokens) {
      const result = await this.cleanup(token);
      if (result.success) {
        filesDeleted++;
        bytesFreed += result.bytesFreed || 0;
      }
    }

    return { filesDeleted, bytesFreed };
  }

  /**
   * Check if file is currently in use
   */
  private isFileInUse(filePath: string): boolean {
    const normalizedPath = path.resolve(filePath);
    for (const entry of Array.from(this.files.values())) {
      if (entry.filePath === normalizedPath && entry.inUse) {
        return true;
      }
    }
    return false;
  }

  /**
   * Protect a file from cleanup (for Instagram processing)
   * Creates a temporary entry if file not already registered
   */
  protectFile(filePath: string): void {
    const normalizedPath = path.resolve(filePath);
    
    // Check if already registered
    for (const [token, entry] of Array.from(this.files.entries())) {
      if (entry.filePath === normalizedPath) {
        entry.inUse = true;
        console.log(`🛡️ PROTECTED: ${path.basename(filePath)}`);
        return;
      }
    }
    
    // Not registered, create a temporary entry
    const token = this.generateToken(normalizedPath);
    this.files.set(token, {
      filePath: normalizedPath,
      owner: 'instagram-processing',
      createdAt: Date.now(),
      ttlMs: 30 * 60 * 1000, // 30 minutes protection for Instagram processing
      tags: ['protected', 'instagram'],
      inUse: true
    });
    
    console.log(`🛡️ PROTECTED (auto-registered): ${path.basename(filePath)}`);
  }

  /**
   * Unprotect a file from cleanup (Instagram processing complete)
   */
  unprotectFile(filePath: string): void {
    const normalizedPath = path.resolve(filePath);
    
    for (const [token, entry] of Array.from(this.files.entries())) {
      if (entry.filePath === normalizedPath) {
        entry.inUse = false;
        console.log(`🔓 UNPROTECTED: ${path.basename(filePath)}`);
        return;
      }
    }
    
    console.warn(`⚠️ Cannot unprotect file - not found in registry: ${path.basename(filePath)}`);
  }

  /**
   * Generate a unique token for a file
   */
  private generateToken(filePath: string): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${path.basename(filePath)}`;
  }

  /**
   * Start background sweeper
   */
  private startBackgroundSweeper(): void {
    console.log('🧹 TEMP FILE MANAGER: Background sweeper started');
    
    // Initial sweep on startup
    setTimeout(() => this.sweepTempDirs(), 5000); // Wait 5 seconds after startup
    
    // Schedule periodic sweeps
    this.sweepInterval = setInterval(() => {
      this.sweepTempDirs().catch(error => {
        console.error('❌ Background sweep failed:', error);
      });
    }, this.sweepIntervalMs);
  }

  /**
   * Stop background sweeper
   */
  stopBackgroundSweeper(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
      console.log('🧹 TEMP FILE MANAGER: Background sweeper stopped');
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    registeredFiles: number;
    inUseFiles: number;
    totalSize: string;
  } {
    const inUseCount = Array.from(this.files.values()).filter(f => f.inUse).length;
    
    return {
      registeredFiles: this.files.size,
      inUseFiles: inUseCount,
      totalSize: `${this.files.size} tracked files`
    };
  }
}

// Singleton instance
export const tempFileManager = new TempFileManager();

// Export for testing
export { TempFileManager };

// Cleanup function for graceful shutdown
process.on('SIGTERM', () => {
  tempFileManager.stopBackgroundSweeper();
});

process.on('SIGINT', () => {
  tempFileManager.stopBackgroundSweeper();
});