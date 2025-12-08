import { createClient, WebDAVClient } from 'webdav';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export class WebDAVStorageService {
  private client: WebDAVClient;
  private basePath: string;
  private publicUrl: string;

  constructor() {
    const webdavUrl = process.env.WEBDAV_URL;
    const username = process.env.WEBDAV_USERNAME;
    const password = process.env.WEBDAV_PASSWORD;
    this.basePath = process.env.WEBDAV_BASE_PATH || '/disk4';
    this.publicUrl = process.env.WEBDAV_PUBLIC_URL || '';

    if (!webdavUrl || !username || !password) {
      throw new Error('WebDAV credentials not configured. Please set WEBDAV_URL, WEBDAV_USERNAME, and WEBDAV_PASSWORD environment variables.');
    }

    console.log('🌐 Initializing WebDAV Storage Service');
    console.log(`📂 WebDAV URL: ${webdavUrl}`);
    console.log(`📂 Base Path: ${this.basePath}`);
    console.log(`🔗 Public URL: ${this.publicUrl}`);

    this.client = createClient(webdavUrl, {
      username,
      password,
    });
  }

  /**
   * Upload a file from local path to WebDAV storage
   */
  async uploadFile(localFilePath: string, remoteFileName: string): Promise<string> {
    try {
      const remotePath = path.posix.join(this.basePath, remoteFileName);
      console.log(`⬆️ Uploading to WebDAV: ${localFilePath} → ${remotePath}`);

      const fileBuffer = await fs.readFile(localFilePath);
      await this.client.putFileContents(remotePath, fileBuffer);

      console.log(`✅ Upload successful: ${remotePath}`);
      return remotePath;
    } catch (error: any) {
      console.error(`❌ WebDAV upload failed:`, error.message);
      throw new Error(`WebDAV upload failed: ${error.message}`);
    }
  }

  /**
   * Upload a buffer directly to WebDAV storage
   */
  async uploadBuffer(buffer: Buffer, remoteFileName: string): Promise<string> {
    try {
      const remotePath = path.posix.join(this.basePath, remoteFileName);
      console.log(`⬆️ Uploading buffer to WebDAV: ${remotePath} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);

      await this.client.putFileContents(remotePath, buffer);

      console.log(`✅ Buffer upload successful: ${remotePath}`);
      return remotePath;
    } catch (error: any) {
      console.error(`❌ WebDAV buffer upload failed:`, error.message);
      throw new Error(`WebDAV buffer upload failed: ${error.message}`);
    }
  }

  /**
   * Download a file from WebDAV storage to local path
   */
  async downloadFile(remotePath: string, localFilePath: string): Promise<void> {
    try {
      console.log(`⬇️ Downloading from WebDAV: ${remotePath} → ${localFilePath}`);

      const fileBuffer = await this.client.getFileContents(remotePath) as Buffer;
      await fs.writeFile(localFilePath, fileBuffer);

      console.log(`✅ Download successful: ${localFilePath}`);
    } catch (error: any) {
      console.error(`❌ WebDAV download failed:`, error.message);
      throw new Error(`WebDAV download failed: ${error.message}`);
    }
  }

  /**
   * Delete a file from WebDAV storage
   */
  async deleteFile(remotePath: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting from WebDAV: ${remotePath}`);
      await this.client.deleteFile(remotePath);
      console.log(`✅ Delete successful: ${remotePath}`);
    } catch (error: any) {
      console.error(`❌ WebDAV delete failed:`, error.message);
      throw new Error(`WebDAV delete failed: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in WebDAV storage
   */
  async fileExists(remotePath: string): Promise<boolean> {
    try {
      return await this.client.exists(remotePath);
    } catch (error: any) {
      console.error(`❌ WebDAV exists check failed:`, error.message);
      return false;
    }
  }

  /**
   * Get public HTTP URL for a file stored on WebDAV server
   */
  getPublicUrl(remotePath: string): string {
    if (!this.publicUrl) {
      throw new Error('WEBDAV_PUBLIC_URL not configured');
    }

    // Remove base path from remotePath if it's included
    let fileName = remotePath;
    if (remotePath.startsWith(this.basePath)) {
      fileName = remotePath.substring(this.basePath.length);
    }

    // Ensure no double slashes
    const cleanFileName = fileName.startsWith('/') ? fileName.substring(1) : fileName;
    const publicUrl = `${this.publicUrl}/${cleanFileName}`;

    console.log(`🔗 Public URL generated: ${publicUrl}`);
    return publicUrl;
  }

  /**
   * Create a directory in WebDAV storage
   */
  async createDirectory(remotePath: string): Promise<void> {
    try {
      console.log(`📁 Creating directory: ${remotePath}`);
      await this.client.createDirectory(remotePath);
      console.log(`✅ Directory created: ${remotePath}`);
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.status === 405) {
        console.log(`📁 Directory already exists: ${remotePath}`);
        return;
      }
      console.error(`❌ WebDAV directory creation failed:`, error.message);
      throw new Error(`WebDAV directory creation failed: ${error.message}`);
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(remotePath: string): Promise<string[]> {
    try {
      const result = await this.client.getDirectoryContents(remotePath);
      const contents = Array.isArray(result) ? result : result.data;
      return contents.map((item: any) => item.filename);
    } catch (error: any) {
      console.error(`❌ WebDAV list files failed:`, error.message);
      throw new Error(`WebDAV list files failed: ${error.message}`);
    }
  }

  /**
   * Test connection to WebDAV server
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔌 Testing WebDAV connection...');
      const exists = await this.client.exists(this.basePath);
      console.log(`✅ WebDAV connection successful (base path exists: ${exists})`);
      return true;
    } catch (error: any) {
      console.error(`❌ WebDAV connection test failed:`, error.message);
      return false;
    }
  }
}

// Singleton instance
let webdavStorageInstance: WebDAVStorageService | null = null;

export function getWebDAVStorage(): WebDAVStorageService {
  if (!webdavStorageInstance) {
    webdavStorageInstance = new WebDAVStorageService();
  }
  return webdavStorageInstance;
}
