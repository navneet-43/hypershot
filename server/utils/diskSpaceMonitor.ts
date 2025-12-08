import { statfs } from 'fs/promises';
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { rm, readdir, stat } from 'fs/promises';
import path from 'path';
import { tempFileManager } from './tempFileManager';

export interface DiskSpaceInfo {
  available: number; // bytes available
  total: number; // total bytes
  used: number; // bytes used
  percentUsed: number;
  availableMB: number;
  totalMB: number;
  usedMB: number;
}

export class DiskSpaceMonitor {
  private static readonly TEMP_DIR = '/tmp';
  private static readonly CRITICAL_THRESHOLD_MB = 50; // 50MB minimum for Reserved VM
  private static readonly WARNING_THRESHOLD_MB = 150; // 150MB warning threshold
  private static readonly PRE_DOWNLOAD_BUFFER_MB = 200; // Extra buffer before downloads

  // All directories that might contain temp files
  private static readonly CLEANUP_DIRS = [
    '/tmp',
    '/tmp/fb_reels',
    '/tmp/fb_videos',
    '/tmp/google_drive',
    '/tmp/instagram',
    '/tmp/temp-media',
    'temp/downloads',
    'uploads',
    '.cache'
  ];

  /**
   * Get current disk space info for /tmp or root filesystem
   */
  static async getDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      // Try /tmp first, then fall back to root
      let stats;
      try {
        stats = await statfs(this.TEMP_DIR);
      } catch {
        stats = await statfs('/');
      }
      
      const available = stats.bavail * stats.bsize;
      const total = stats.blocks * stats.bsize;
      const used = total - available;
      const percentUsed = (used / total) * 100;

      return {
        available,
        total,
        used,
        percentUsed,
        availableMB: available / (1024 * 1024),
        totalMB: total / (1024 * 1024),
        usedMB: used / (1024 * 1024)
      };
    } catch (error) {
      console.error('❌ Failed to get disk space:', error);
      // Return conservative defaults if we can't check
      return {
        available: 100 * 1024 * 1024, // Assume 100MB
        total: 1024 * 1024 * 1024,
        used: 924 * 1024 * 1024,
        percentUsed: 90,
        availableMB: 100,
        totalMB: 1024,
        usedMB: 924
      };
    }
  }

  /**
   * Check if there's enough space for a download
   */
  static async hasEnoughSpace(requiredMB: number): Promise<{ 
    hasSpace: boolean; 
    available: number; 
    required: number;
    message: string;
  }> {
    const diskSpace = await this.getDiskSpace();
    const requiredBytes = requiredMB * 1024 * 1024;
    const hasSpace = diskSpace.available >= requiredBytes;

    return {
      hasSpace,
      available: diskSpace.availableMB,
      required: requiredMB,
      message: hasSpace 
        ? `✅ Sufficient space: ${diskSpace.availableMB.toFixed(1)}MB available for ${requiredMB.toFixed(1)}MB download`
        : `❌ Insufficient space: ${diskSpace.availableMB.toFixed(1)}MB available, need ${requiredMB.toFixed(1)}MB`
    };
  }

  /**
   * Check if disk space is critically low
   */
  static async isCriticallyLow(): Promise<boolean> {
    const diskSpace = await this.getDiskSpace();
    return diskSpace.availableMB < this.CRITICAL_THRESHOLD_MB;
  }

  /**
   * ULTRA-AGGRESSIVE cleanup - deletes everything possible
   */
  static async ultraAggressiveCleanup(): Promise<{
    success: boolean;
    freedMB: number;
    filesDeleted: number;
    message: string;
  }> {
    console.log('🚨🚨🚨 ULTRA-AGGRESSIVE CLEANUP - DELETING ALL TEMP FILES 🚨🚨🚨');
    
    const beforeSpace = await this.getDiskSpace();
    console.log(`📊 Before: ${beforeSpace.availableMB.toFixed(1)}MB available`);
    
    let totalFreed = 0;
    let totalDeleted = 0;

    for (const dir of this.CLEANUP_DIRS) {
      try {
        if (!existsSync(dir)) continue;
        
        const result = await this.forceCleanDirectory(dir);
        totalFreed += result.bytesFreed;
        totalDeleted += result.filesDeleted;
      } catch (error) {
        console.warn(`⚠️ Could not clean ${dir}:`, error);
      }
    }

    // Also run temp file manager sweep
    try {
      const sweepResult = await tempFileManager.sweepTempDirs();
      totalFreed += sweepResult.bytesFreed;
      totalDeleted += sweepResult.filesDeleted;
    } catch (error) {
      console.warn('⚠️ Temp file sweep error:', error);
    }

    const afterSpace = await this.getDiskSpace();
    const freedMB = totalFreed / (1024 * 1024);
    
    console.log(`📊 After: ${afterSpace.availableMB.toFixed(1)}MB available`);
    console.log(`✅ ULTRA cleanup: ${totalDeleted} files, ${freedMB.toFixed(1)}MB freed`);

    return {
      success: true,
      freedMB,
      filesDeleted: totalDeleted,
      message: `Ultra cleanup: ${totalDeleted} files deleted, ${freedMB.toFixed(1)}MB freed, now ${afterSpace.availableMB.toFixed(1)}MB available`
    };
  }

  /**
   * Force clean a directory - delete all files older than 10 minutes
   * 10 minutes provides safe buffer for large video uploads and processing
   */
  private static async forceCleanDirectory(dirPath: string): Promise<{
    filesDeleted: number;
    bytesFreed: number;
  }> {
    let filesDeleted = 0;
    let bytesFreed = 0;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 minutes - safe for large video uploads

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        try {
          if (entry.isFile()) {
            const stats = statSync(fullPath);
            const age = now - stats.mtime.getTime();
            
            // Delete files older than 1 minute
            if (age > maxAge) {
              bytesFreed += stats.size;
              unlinkSync(fullPath);
              filesDeleted++;
              console.log(`🗑️ Force deleted: ${entry.name} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
            }
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            // Recursively clean subdirectories
            const subResult = await this.forceCleanDirectory(fullPath);
            filesDeleted += subResult.filesDeleted;
            bytesFreed += subResult.bytesFreed;
            
            // Try to remove empty directories
            try {
              const remaining = readdirSync(fullPath);
              if (remaining.length === 0) {
                rmdirSync(fullPath);
                console.log(`📁 Removed empty directory: ${entry.name}`);
              }
            } catch {}
          }
        } catch (err) {
          // Ignore individual file errors
        }
      }
    } catch (error) {
      // Directory might not exist or be inaccessible
    }

    return { filesDeleted, bytesFreed };
  }

  /**
   * Emergency cleanup when disk space is critically low
   */
  static async emergencyCleanup(): Promise<{
    success: boolean;
    freedMB: number;
    message: string;
  }> {
    console.log('🚨 EMERGENCY DISK SPACE CLEANUP TRIGGERED');
    
    const beforeSpace = await this.getDiskSpace();
    console.log(`📊 Before cleanup: ${beforeSpace.availableMB.toFixed(1)}MB available (${beforeSpace.percentUsed.toFixed(1)}% used)`);

    // Run aggressive temp file sweep
    const result = await tempFileManager.sweepTempDirs();
    
    const afterSpace = await this.getDiskSpace();
    const freedMB = (result.bytesFreed) / (1024 * 1024);

    console.log(`📊 After cleanup: ${afterSpace.availableMB.toFixed(1)}MB available (${afterSpace.percentUsed.toFixed(1)}% used)`);
    console.log(`✅ Emergency cleanup freed: ${freedMB.toFixed(1)}MB`);

    // If still critically low, run ultra aggressive cleanup
    if (afterSpace.availableMB < this.CRITICAL_THRESHOLD_MB) {
      console.log('⚠️ Still critically low after normal cleanup, running ultra-aggressive cleanup...');
      const ultraResult = await this.ultraAggressiveCleanup();
      return {
        success: true,
        freedMB: freedMB + ultraResult.freedMB,
        message: ultraResult.message
      };
    }

    return {
      success: true,
      freedMB,
      message: `Emergency cleanup completed: ${freedMB.toFixed(1)}MB freed, ${afterSpace.availableMB.toFixed(1)}MB now available`
    };
  }

  /**
   * Proactive cleanup before downloads - CRITICAL FOR PRODUCTION
   * Ensures minimum free space threshold BEFORE attempting download
   */
  static async ensureMinimumSpace(requiredMB: number = 0): Promise<void> {
    const diskSpace = await this.getDiskSpace();
    const totalRequired = requiredMB + this.PRE_DOWNLOAD_BUFFER_MB;

    console.log(`💾 Pre-download check: ${diskSpace.availableMB.toFixed(1)}MB available, need ${totalRequired.toFixed(1)}MB`);

    // ALWAYS run cleanup before large downloads
    if (requiredMB > 50 || diskSpace.availableMB < totalRequired) {
      console.log('🧹 Running proactive cleanup before download...');
      await this.emergencyCleanup();
      
      // Re-check after cleanup
      const newDiskSpace = await this.getDiskSpace();
      
      if (newDiskSpace.availableMB < totalRequired) {
        // Try ultra aggressive cleanup
        console.log('⚠️ Still insufficient space, running ultra-aggressive cleanup...');
        await this.ultraAggressiveCleanup();
        
        // Final check
        const finalSpace = await this.getDiskSpace();
        if (finalSpace.availableMB < requiredMB + this.CRITICAL_THRESHOLD_MB) {
          throw new Error(
            `Insufficient disk space after cleanup: ${finalSpace.availableMB.toFixed(1)}MB available, need ${(requiredMB + this.CRITICAL_THRESHOLD_MB).toFixed(1)}MB. Please try again in a few minutes.`
          );
        }
        console.log(`✅ After ultra cleanup: ${finalSpace.availableMB.toFixed(1)}MB available`);
      } else {
        console.log(`✅ After cleanup: ${newDiskSpace.availableMB.toFixed(1)}MB available`);
      }
    }
  }

  /**
   * Log current disk space status
   */
  static async logStatus(): Promise<void> {
    try {
      const diskSpace = await this.getDiskSpace();
      console.log(`💾 Disk Space: ${diskSpace.availableMB.toFixed(1)}MB free / ${diskSpace.totalMB.toFixed(1)}MB total (${diskSpace.percentUsed.toFixed(1)}% used)`);
      
      if (diskSpace.availableMB < this.CRITICAL_THRESHOLD_MB) {
        console.log(`🚨 CRITICAL: Disk space below ${this.CRITICAL_THRESHOLD_MB}MB threshold!`);
        // Auto-trigger cleanup
        await this.emergencyCleanup();
      } else if (diskSpace.availableMB < this.WARNING_THRESHOLD_MB) {
        console.log(`⚠️ WARNING: Disk space below ${this.WARNING_THRESHOLD_MB}MB threshold`);
      }
    } catch (error) {
      console.warn('⚠️ Could not log disk space status:', error);
    }
  }

  /**
   * Get detailed cleanup report
   */
  static async getCleanupReport(): Promise<{
    diskSpace: DiskSpaceInfo;
    tempDirs: { path: string; exists: boolean; files: number; sizeMB: number }[];
    recommendations: string[];
  }> {
    const diskSpace = await this.getDiskSpace();
    const tempDirs: { path: string; exists: boolean; files: number; sizeMB: number }[] = [];
    const recommendations: string[] = [];

    for (const dir of this.CLEANUP_DIRS) {
      try {
        if (existsSync(dir)) {
          const files = readdirSync(dir);
          let totalSize = 0;
          for (const file of files) {
            try {
              const stats = statSync(path.join(dir, file));
              if (stats.isFile()) totalSize += stats.size;
            } catch {}
          }
          tempDirs.push({
            path: dir,
            exists: true,
            files: files.length,
            sizeMB: totalSize / (1024 * 1024)
          });
        } else {
          tempDirs.push({ path: dir, exists: false, files: 0, sizeMB: 0 });
        }
      } catch {
        tempDirs.push({ path: dir, exists: false, files: 0, sizeMB: 0 });
      }
    }

    // Generate recommendations
    if (diskSpace.availableMB < this.CRITICAL_THRESHOLD_MB) {
      recommendations.push('CRITICAL: Run ultra-aggressive cleanup immediately');
    } else if (diskSpace.availableMB < this.WARNING_THRESHOLD_MB) {
      recommendations.push('Run emergency cleanup to free space');
    }

    const largeDirs = tempDirs.filter(d => d.sizeMB > 100);
    if (largeDirs.length > 0) {
      recommendations.push(`Large temp directories: ${largeDirs.map(d => `${d.path} (${d.sizeMB.toFixed(1)}MB)`).join(', ')}`);
    }

    return { diskSpace, tempDirs, recommendations };
  }
}
