import SFTPClient from 'ssh2-sftp-client';
import { promises as fs } from 'fs';
import path from 'path';

export class FTPStorageService {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private publicUrl: string;
  private remoteBasePath: string;

  constructor() {
    this.host = process.env.FTP_HOST || '';
    this.port = parseInt(process.env.FTP_PORT || '22');
    this.username = process.env.FTP_USERNAME || '';
    this.password = process.env.FTP_PASSWORD || '';
    this.publicUrl = process.env.FTP_PUBLIC_URL || '';
    this.remoteBasePath = '/var/www/webdav/disk4';

    if (!this.host || !this.username || !this.password) {
      throw new Error('SFTP credentials not configured. Please set FTP_HOST, FTP_USERNAME, and FTP_PASSWORD environment variables.');
    }

    console.log('📡 Initializing SFTP Storage Service');
    console.log(`🖥️  SFTP Host: ${this.host}:${this.port}`);
    console.log(`👤 SFTP User: ${this.username}`);
    console.log(`📂 Remote Path: ${this.remoteBasePath}`);
    console.log(`🔗 Public URL: ${this.publicUrl}`);
  }

  /**
   * Create and connect SFTP client
   */
  private async createClient(): Promise<SFTPClient> {
    const client = new SFTPClient();

    try {
      await client.connect({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
        readyTimeout: 10000,
        retries: 2,
      });
      return client;
    } catch (error: any) {
      console.error(`❌ SFTP connection failed:`, error.message);
      throw new Error(`SFTP connection failed: ${error.message}`);
    }
  }

  /**
   * Upload a file from local path to SFTP server
   */
  async uploadFile(localFilePath: string, remoteFileName: string): Promise<string> {
    let client: SFTPClient | null = null;

    try {
      const remotePath = path.posix.join(this.remoteBasePath, remoteFileName);
      console.log(`⬆️  Uploading to SFTP: ${localFilePath} → ${remotePath}`);

      client = await this.createClient();

      // Ensure remote directory exists
      await client.mkdir(this.remoteBasePath, true).catch(() => {
        // Directory may already exist, ignore error
      });

      await client.put(localFilePath, remotePath);

      console.log(`✅ SFTP upload successful: ${remotePath}`);
      return remoteFileName;
    } catch (error: any) {
      console.error(`❌ SFTP upload failed:`, error.message);
      throw new Error(`SFTP upload failed: ${error.message}`);
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Upload a buffer directly to SFTP server
   */
  async uploadBuffer(buffer: Buffer, remoteFileName: string): Promise<string> {
    let client: SFTPClient | null = null;

    try {
      const remotePath = path.posix.join(this.remoteBasePath, remoteFileName);
      console.log(`⬆️  Uploading buffer to SFTP: ${remotePath} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);

      client = await this.createClient();

      // Ensure remote directory exists
      await client.mkdir(this.remoteBasePath, true).catch(() => {
        // Directory may already exist, ignore error
      });

      await client.put(buffer, remotePath);

      console.log(`✅ SFTP buffer upload successful: ${remotePath}`);
      return remoteFileName;
    } catch (error: any) {
      console.error(`❌ SFTP buffer upload failed:`, error.message);
      throw new Error(`SFTP buffer upload failed: ${error.message}`);
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Download a file from SFTP server to local path
   */
  async downloadFile(remoteFileName: string, localFilePath: string): Promise<void> {
    let client: SFTPClient | null = null;

    try {
      const remotePath = path.posix.join(this.remoteBasePath, remoteFileName);
      console.log(`⬇️  Downloading from SFTP: ${remotePath} → ${localFilePath}`);

      client = await this.createClient();
      await client.get(remotePath, localFilePath);

      console.log(`✅ SFTP download successful: ${localFilePath}`);
    } catch (error: any) {
      console.error(`❌ SFTP download failed:`, error.message);
      throw new Error(`SFTP download failed: ${error.message}`);
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Delete a file from SFTP server
   */
  async deleteFile(remoteFileName: string): Promise<void> {
    let client: SFTPClient | null = null;

    try {
      const remotePath = path.posix.join(this.remoteBasePath, remoteFileName);
      console.log(`🗑️  Deleting from SFTP: ${remotePath}`);

      client = await this.createClient();
      await client.delete(remotePath);

      console.log(`✅ SFTP delete successful: ${remotePath}`);
    } catch (error: any) {
      console.error(`❌ SFTP delete failed:`, error.message);
      throw new Error(`SFTP delete failed: ${error.message}`);
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Check if a file exists on SFTP server
   */
  async fileExists(remoteFileName: string): Promise<boolean> {
    let client: SFTPClient | null = null;

    try {
      const remotePath = path.posix.join(this.remoteBasePath, remoteFileName);
      client = await this.createClient();
      const exists = await client.exists(remotePath);
      return exists !== false;
    } catch (error: any) {
      console.error(`❌ SFTP exists check failed:`, error.message);
      return false;
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Get public HTTP URL for a file stored on SFTP server
   */
  getPublicUrl(remoteFileName: string): string {
    if (!this.publicUrl) {
      throw new Error('FTP_PUBLIC_URL not configured');
    }

    const cleanFileName = remoteFileName.startsWith('/') ? remoteFileName.substring(1) : remoteFileName;
    const publicUrl = `${this.publicUrl}/${cleanFileName}`;

    console.log(`🔗 Public URL generated: ${publicUrl}`);
    return publicUrl;
  }

  /**
   * List files in SFTP server directory
   */
  async listFiles(remotePath: string = this.remoteBasePath): Promise<string[]> {
    let client: SFTPClient | null = null;

    try {
      client = await this.createClient();
      const fileList = await client.list(remotePath);
      return fileList.map((file: any) => file.name);
    } catch (error: any) {
      console.error(`❌ SFTP list files failed:`, error.message);
      throw new Error(`SFTP list files failed: ${error.message}`);
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }

  /**
   * Test connection to SFTP server
   */
  async testConnection(): Promise<boolean> {
    let client: SFTPClient | null = null;

    try {
      console.log('🔌 Testing SFTP connection...');
      client = await this.createClient();
      
      // Try to list files in the remote directory
      const fileList = await client.list(this.remoteBasePath);
      console.log(`✅ SFTP connection successful (${fileList.length} files found in ${this.remoteBasePath})`);
      return true;
    } catch (error: any) {
      console.error(`❌ SFTP connection test failed:`, error.message);
      return false;
    } finally {
      if (client) {
        await client.end().catch(() => {});
      }
    }
  }
}

let ftpStorageInstance: FTPStorageService | null = null;

export function getFTPStorage(): FTPStorageService {
  if (!ftpStorageInstance) {
    ftpStorageInstance = new FTPStorageService();
  }
  return ftpStorageInstance;
}
