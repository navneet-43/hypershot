# 88TB Storage Server - FTP Configuration Guide
## FTP Upload + Public HTTP Media Serving Setup

**Purpose:** Configure FTP server for file uploads and Apache HTTP for public media serving (required for Instagram API integration).

**Server Details:**
- IP Address: `157.180.4.20`
- FTP Server: vsftpd (recommended)
- Web Server: Apache 2.4.58 (Ubuntu)
- Storage Path: `/var/www/html/media`
- FTP Upload Path: `/var/www/html/media`
- Public HTTP URL: `http://157.180.4.20/media/`

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [FTP Server Installation](#ftp-server-installation)
4. [FTP Configuration](#ftp-configuration)
5. [Apache HTTP Configuration](#apache-http-configuration)
6. [Testing & Verification](#testing--verification)
7. [Troubleshooting](#troubleshooting)
8. [Security & Best Practices](#security--best-practices)

---

## Architecture Overview

### How It Works:

```
┌─────────────────────────────────────────────────────────┐
│  REPLIT APPLICATION                                      │
│                                                          │
│  1. Download video from Google Drive                    │
│  2. Upload to FTP server                                │
│     Protocol: FTP                                       │
│     Destination: ftp://157.180.4.20/media/video.mp4    │
└─────────────────────────────────────────────────────────┘
                          ↓
                    (FTP Upload)
                          ↓
┌─────────────────────────────────────────────────────────┐
│  YOUR 88TB SERVER (157.180.4.20)                        │
│                                                          │
│  ┌──────────────┐         ┌─────────────────┐          │
│  │  FTP Server  │ ───────→│  File Storage   │          │
│  │   (vsftpd)   │  saves  │ /var/www/html/  │          │
│  │              │  files  │     media/      │          │
│  └──────────────┘         └─────────────────┘          │
│                                    │                     │
│                           (serves publicly)             │
│                                    ↓                     │
│  ┌──────────────┐         ┌─────────────────┐          │
│  │ HTTP Server  │ ←────── │  File Storage   │          │
│  │   (Apache)   │  reads  │ /var/www/html/  │          │
│  │              │  files  │     media/      │          │
│  └──────────────┘         └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
                          ↓
                   (HTTP Download)
                          ↓
┌─────────────────────────────────────────────────────────┐
│  INSTAGRAM API                                           │
│                                                          │
│  3. Receive public URL from Replit                      │
│     URL: http://157.180.4.20/media/video.mp4           │
│  4. Download video via HTTP (NO PASSWORD)               │
│  5. Process and publish Reel                            │
└─────────────────────────────────────────────────────────┘
```

**Key Point:** Instagram can ONLY download from HTTP/HTTPS URLs, NOT from FTP URLs. Therefore:
- **FTP** = Upload mechanism (Replit → Your Server)
- **HTTP** = Download mechanism (Instagram → Your Server)

---

## Prerequisites

### Step 1: Update System Packages
```bash
# Update package list
sudo apt update

# Upgrade existing packages
sudo apt upgrade -y
```

### Step 2: Verify Apache is Running
```bash
# Check Apache status
sudo systemctl status apache2

# If not running, start it
sudo systemctl start apache2
sudo systemctl enable apache2
```

---

## FTP Server Installation

### Step 1: Install vsftpd (Very Secure FTP Daemon)
```bash
# Install vsftpd
sudo apt install vsftpd -y

# Check installation
vsftpd -v

# Expected output: vsftpd: version x.x.x
```

### Step 2: Backup Original Configuration
```bash
# Create backup of default config
sudo cp /etc/vsftpd.conf /etc/vsftpd.conf.backup

# Verify backup exists
ls -la /etc/vsftpd.conf.backup
```

---

## FTP Configuration

### Step 1: Create FTP User Account
```bash
# Create dedicated FTP user 'ftpmedia'
sudo useradd -m -d /var/www/html/media -s /bin/bash ftpmedia

# Set strong password for FTP user
sudo passwd ftpmedia

# You will be prompted to enter password twice
# Use a strong password and save it securely
# This will be used in the Replit application secrets
```

**Important:** Save these credentials:
- Username: `ftpmedia`
- Password: `[the password you just created]`

### Step 2: Set Directory Permissions
```bash
# Create media directory if it doesn't exist
sudo mkdir -p /var/www/html/media

# Set ownership to FTP user
sudo chown -R ftpmedia:ftpmedia /var/www/html/media

# Set permissions
# Owner: read, write, execute
# Apache (www-data group): read, execute
sudo chmod -R 755 /var/www/html/media

# Add www-data to ftpmedia group (allows Apache to read files)
sudo usermod -a -G ftpmedia www-data
```

### Step 3: Configure vsftpd
```bash
# Edit vsftpd configuration
sudo nano /etc/vsftpd.conf
```

**Replace the entire file content with this configuration:**

```conf
# vsftpd Configuration for Media Upload Server
# Purpose: Accept FTP uploads, serve files via HTTP

# ===== BASIC SETTINGS =====
# Run in standalone mode
listen=YES
listen_ipv6=NO

# ===== USER ACCESS =====
# Disable anonymous FTP (security)
anonymous_enable=NO

# Enable local user login
local_enable=YES

# Enable write access for uploads
write_enable=YES

# Default umask for uploaded files (022 = rwxr-xr-x)
local_umask=022

# ===== SECURITY =====
# Chroot users to their home directory (prevents access to other directories)
chroot_local_user=YES

# Allow writing in chroot directory
allow_writeable_chroot=YES

# Hide IDs from user (show as ftp:ftp)
hide_ids=YES

# ===== PASSIVE MODE (Required for most networks) =====
# Enable passive mode
pasv_enable=YES
pasv_min_port=40000
pasv_max_port=40100
pasv_address=157.180.4.20

# ===== FILE UPLOAD SETTINGS =====
# Enable file uploads
file_open_mode=0755

# Preserve file timestamps
use_localtime=YES

# ===== LOGGING =====
# Enable logging
xferlog_enable=YES
xferlog_file=/var/log/vsftpd.log
log_ftp_protocol=YES

# ===== CONNECTION SETTINGS =====
# Maximum clients
max_clients=50

# Maximum connections per IP
max_per_ip=5

# Idle session timeout (seconds)
idle_session_timeout=600

# Data connection timeout (seconds)
data_connection_timeout=120

# ===== PERFORMANCE =====
# Enable async transfers
async_abor_enable=YES

# Enable ASCII mode
ascii_upload_enable=NO
ascii_download_enable=NO

# ===== USER RESTRICTIONS =====
# Restrict users to specific list (recommended for security)
userlist_enable=YES
userlist_file=/etc/vsftpd.userlist
userlist_deny=NO

# ===== WELCOME MESSAGE =====
ftpd_banner=Welcome to 88TB Media Storage FTP Server

# ===== SSL/TLS (Optional but recommended) =====
# Uncomment these lines after setting up SSL certificate
# ssl_enable=YES
# rsa_cert_file=/etc/ssl/certs/vsftpd.pem
# rsa_private_key_file=/etc/ssl/private/vsftpd.key
# allow_anon_ssl=NO
# force_local_data_ssl=YES
# force_local_logins_ssl=YES
# ssl_tlsv1=YES
# ssl_sslv2=NO
# ssl_sslv3=NO
```

**Save and exit:** Press `Ctrl + X`, then `Y`, then `Enter`

### Step 4: Create User List
```bash
# Create userlist file
echo "ftpmedia" | sudo tee /etc/vsftpd.userlist

# Verify file contents
cat /etc/vsftpd.userlist

# Expected output: ftpmedia
```

### Step 5: Configure Firewall for FTP
```bash
# Allow FTP control port (21)
sudo ufw allow 21/tcp

# Allow passive mode port range
sudo ufw allow 40000:40100/tcp

# Allow HTTP (if not already allowed)
sudo ufw allow 80/tcp

# Enable firewall (if not already enabled)
sudo ufw enable

# Check firewall status
sudo ufw status
```

### Step 6: Start and Enable FTP Service
```bash
# Restart vsftpd service
sudo systemctl restart vsftpd

# Enable vsftpd to start on boot
sudo systemctl enable vsftpd

# Check service status
sudo systemctl status vsftpd

# Expected output: "active (running)" in green
```

---

## Apache HTTP Configuration

### Step 1: Configure Public Media Directory
```bash
# Verify Apache is running
sudo systemctl status apache2

# Edit default site configuration
sudo nano /etc/apache2/sites-available/000-default.conf
```

**Add this configuration inside the `<VirtualHost *:80>` block:**

```apache
# Public Media Directory (NO PASSWORD - for Instagram API access)
<Directory /var/www/html/media>
    Options +Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    
    # Enable CORS for cross-origin requests
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type"
    
    # Set proper MIME types for videos
    AddType video/mp4 .mp4
    AddType video/quicktime .mov
    AddType video/x-msvideo .avi
</Directory>
```

**Save and exit:** Press `Ctrl + X`, then `Y`, then `Enter`

### Step 2: Enable Required Apache Modules
```bash
# Enable headers module (for CORS)
sudo a2enmod headers

# Enable mime module (for proper video MIME types)
sudo a2enmod mime

# Test Apache configuration
sudo apache2ctl configtest

# Expected output: "Syntax OK"

# Restart Apache to apply changes
sudo systemctl restart apache2
```

---

## Testing & Verification

### Test 1: Verify vsftpd is Running
```bash
# Check FTP service status
sudo systemctl status vsftpd

# Expected: "active (running)" in green

# Check FTP is listening on port 21
sudo netstat -tlnp | grep :21

# Expected output: tcp ... 0.0.0.0:21 ... LISTEN .../vsftpd
```

### Test 2: Test FTP Connection (Local)
```bash
# Install FTP client if not already installed
sudo apt install ftp -y

# Connect to FTP server locally
ftp localhost

# You will be prompted:
# Name: ftpmedia
# Password: [your FTP password]

# Once connected, you should see: "230 Login successful"

# Test basic commands:
ftp> pwd          # Show current directory
ftp> ls           # List files
ftp> quit         # Exit FTP
```

### Test 3: Upload Test File via FTP
```bash
# Create a test file
echo "FTP Upload Test - $(date)" > /tmp/test_ftp.txt

# Upload using curl (easier than ftp client)
curl -T /tmp/test_ftp.txt ftp://157.180.4.20/test_ftp.txt \
  --user ftpmedia:YOUR_PASSWORD

# Expected output: Empty or progress indicator
```

### Test 4: Verify File Was Uploaded
```bash
# Check file exists on server
ls -la /var/www/html/media/

# Should show: test_ftp.txt

# Check file permissions
ls -la /var/www/html/media/test_ftp.txt

# Should show: -rwxr-xr-x ftpmedia ftpmedia
```

### Test 5: Test Public HTTP Access (CRITICAL for Instagram)
```bash
# Access uploaded file via HTTP (no password)
curl http://157.180.4.20/media/test_ftp.txt

# Expected output: File content displayed
# "FTP Upload Test - [date]"

# Test with headers to verify MIME type
curl -I http://157.180.4.20/media/test_ftp.txt

# Expected output:
# HTTP/1.1 200 OK
# Content-Type: text/plain
```

### Test 6: Upload and Serve Video File
```bash
# Download a sample video
wget -O /tmp/sample_video.mp4 \
  https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4

# Upload via FTP
curl -T /tmp/sample_video.mp4 ftp://157.180.4.20/sample_video.mp4 \
  --user ftpmedia:YOUR_PASSWORD

# Access via public HTTP
curl -I http://157.180.4.20/media/sample_video.mp4

# Expected output:
# HTTP/1.1 200 OK
# Content-Type: video/mp4
# Content-Length: [file size]
```

### Test 7: Test from External Network (Critical!)
```bash
# From a different computer or your local machine:
curl -I http://157.180.4.20/media/test_ftp.txt

# Should return HTTP/1.1 200 OK
# If this fails, check firewall rules and Apache configuration
```

### Test 8: Test FTP Upload Speed
```bash
# Create a larger test file (10MB)
dd if=/dev/zero of=/tmp/speed_test.bin bs=1M count=10

# Upload and time it
time curl -T /tmp/speed_test.bin ftp://157.180.4.20/speed_test.bin \
  --user ftpmedia:YOUR_PASSWORD

# Note the time taken for reference
# Clean up test file
curl -Q "DELE speed_test.bin" ftp://157.180.4.20 \
  --user ftpmedia:YOUR_PASSWORD || rm /var/www/html/media/speed_test.bin
```

---

## Troubleshooting

### Issue 1: FTP Connection Refused

**Symptoms:**
```bash
curl: (7) Failed to connect to 157.180.4.20 port 21: Connection refused
```

**Solutions:**
```bash
# 1. Check if vsftpd is running
sudo systemctl status vsftpd

# If not running:
sudo systemctl start vsftpd

# 2. Check if port 21 is listening
sudo netstat -tlnp | grep :21

# 3. Check firewall
sudo ufw status | grep 21

# If not allowed:
sudo ufw allow 21/tcp

# 4. Check vsftpd logs
sudo tail -50 /var/log/vsftpd.log
```

### Issue 2: Login Failed (530 Login incorrect)

**Symptoms:**
```bash
530 Login incorrect.
```

**Solutions:**
```bash
# 1. Verify user exists
id ftpmedia

# 2. Verify user is in userlist
cat /etc/vsftpd.userlist

# Should show: ftpmedia

# 3. Reset password
sudo passwd ftpmedia

# 4. Check if user is in allowed users
grep ftpmedia /etc/vsftpd.userlist

# 5. Verify local_enable=YES in config
grep local_enable /etc/vsftpd.conf

# 6. Restart vsftpd
sudo systemctl restart vsftpd
```

### Issue 3: Cannot Upload Files (550 Permission denied)

**Symptoms:**
```bash
550 Permission denied
or
Cannot create file
```

**Solutions:**
```bash
# 1. Check directory ownership
ls -la /var/www/html/ | grep media

# Should show: drwxr-xr-x ftpmedia ftpmedia

# 2. Fix ownership
sudo chown -R ftpmedia:ftpmedia /var/www/html/media

# 3. Fix permissions
sudo chmod -R 755 /var/www/html/media

# 4. Verify write_enable=YES
grep write_enable /etc/vsftpd.conf

# Should show: write_enable=YES

# 5. Check chroot settings
grep chroot /etc/vsftpd.conf

# Ensure: allow_writeable_chroot=YES

# 6. Restart vsftpd
sudo systemctl restart vsftpd
```

### Issue 4: Passive Mode Fails

**Symptoms:**
```bash
Failed to establish data connection
or
Entering Passive Mode... Failed
```

**Solutions:**
```bash
# 1. Verify passive mode configuration
grep pasv /etc/vsftpd.conf

# Should show:
# pasv_enable=YES
# pasv_min_port=40000
# pasv_max_port=40100
# pasv_address=157.180.4.20

# 2. Check firewall allows passive ports
sudo ufw status | grep 40000:40100

# If not allowed:
sudo ufw allow 40000:40100/tcp

# 3. Verify server IP is correct
curl ifconfig.me

# Update pasv_address if needed

# 4. Restart vsftpd
sudo systemctl restart vsftpd
```

### Issue 5: Files Upload But Can't Access via HTTP

**Symptoms:**
- FTP upload succeeds
- HTTP returns 404 Not Found

**Solutions:**
```bash
# 1. Verify file actually exists
ls -la /var/www/html/media/

# 2. Check Apache is serving the directory
curl -I http://157.180.4.20/media/

# Should return 200 OK or directory listing

# 3. Verify Apache configuration includes Directory directive
sudo nano /etc/apache2/sites-available/000-default.conf

# Ensure <Directory /var/www/html/media> block exists

# 4. Check Apache has read permissions
sudo -u www-data cat /var/www/html/media/test_ftp.txt

# 5. Restart Apache
sudo systemctl restart apache2
```

### Issue 6: Large Video Uploads Timeout

**Symptoms:**
```bash
Upload times out for files > 100MB
```

**Solutions:**
```bash
# 1. Increase timeouts in vsftpd.conf
sudo nano /etc/vsftpd.conf

# Add or update:
# idle_session_timeout=1800
# data_connection_timeout=300

# 2. Restart vsftpd
sudo systemctl restart vsftpd

# 3. Use FTP client with resume capability
# Or use curl with --continue-at option
curl -C - -T large_video.mp4 ftp://... --user ftpmedia:PASS
```

---

## Security & Best Practices

### 1. Strong Password Policy
```bash
# Enforce strong passwords using PAM
sudo apt install libpam-pwquality

# Configure password requirements
sudo nano /etc/security/pwquality.conf

# Set minimum password length
minlen = 16

# Require mixed case, digits, and special chars
dcredit = -1
ucredit = -1
lcredit = -1
ocredit = -1
```

### 2. Enable SSL/TLS for FTP (FTPS)
```bash
# Create SSL certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/vsftpd.key \
  -out /etc/ssl/certs/vsftpd.pem

# Update vsftpd.conf
sudo nano /etc/vsftpd.conf

# Uncomment and set:
# ssl_enable=YES
# rsa_cert_file=/etc/ssl/certs/vsftpd.pem
# rsa_private_key_file=/etc/ssl/private/vsftpd.key
# force_local_data_ssl=YES
# force_local_logins_ssl=YES

# Restart vsftpd
sudo systemctl restart vsftpd
```

### 3. Limit FTP Access by IP (Optional)
```bash
# Install and configure tcp_wrappers
sudo nano /etc/hosts.allow

# Add (replace with Replit IP ranges):
vsftpd: 35.190.0.0/16, 34.74.0.0/16

# Deny all others
sudo nano /etc/hosts.deny
vsftpd: ALL
```

### 4. Set Up Automated Cleanup (Remove Old Files)
```bash
# Create cleanup script
sudo nano /usr/local/bin/cleanup_media.sh
```

**Script content:**
```bash
#!/bin/bash
# Cleanup media files older than 7 days

MEDIA_DIR="/var/www/html/media"
DAYS_OLD=7

# Remove files older than specified days
find "$MEDIA_DIR" -type f -mtime +$DAYS_OLD -delete

# Log cleanup
echo "$(date): Cleaned up files older than $DAYS_OLD days" >> /var/log/media_cleanup.log
```

```bash
# Make script executable
sudo chmod +x /usr/local/bin/cleanup_media.sh

# Add to crontab (run daily at 2 AM)
sudo crontab -e

# Add this line:
0 2 * * * /usr/local/bin/cleanup_media.sh
```

### 5. Monitor FTP Activity
```bash
# View real-time FTP logs
sudo tail -f /var/log/vsftpd.log

# Monitor failed login attempts
sudo grep "FAIL LOGIN" /var/log/vsftpd.log

# Monitor successful uploads
sudo grep "OK UPLOAD" /var/log/vsftpd.log
```

### 6. Backup Configuration Files
```bash
# Create backup directory
sudo mkdir -p /root/backups/ftp_config

# Backup vsftpd configuration
sudo cp /etc/vsftpd.conf /root/backups/ftp_config/vsftpd.conf.$(date +%Y%m%d)

# Backup Apache configuration
sudo cp /etc/apache2/sites-available/000-default.conf \
  /root/backups/ftp_config/apache-default.conf.$(date +%Y%m%d)
```

---

## Credentials Summary

**After completing this setup, provide these credentials to the Replit application:**

### FTP Credentials (for Replit environment secrets):
```
FTP_HOST=157.180.4.20
FTP_PORT=21
FTP_USERNAME=ftpmedia
FTP_PASSWORD=[the password you created for ftpmedia user]
FTP_UPLOAD_PATH=/
```

### Public HTTP URL Configuration:
```
PUBLIC_MEDIA_URL=http://157.180.4.20/media
```

**Note:** Instagram will use the HTTP URL to download videos, NOT the FTP credentials.

---

## Verification Checklist

Before marking setup as complete, verify all items:

### FTP Server:
- [ ] vsftpd installed and running: `sudo systemctl status vsftpd`
- [ ] Port 21 listening: `sudo netstat -tlnp | grep :21`
- [ ] Passive ports allowed in firewall: `sudo ufw status | grep 40000`
- [ ] FTP user 'ftpmedia' created: `id ftpmedia`
- [ ] User in vsftpd.userlist: `cat /etc/vsftpd.userlist`
- [ ] Directory `/var/www/html/media` exists and owned by ftpmedia

### FTP Functionality:
- [ ] Can connect via FTP: `ftp 157.180.4.20` (login as ftpmedia)
- [ ] Can upload test file via FTP
- [ ] Uploaded file has correct permissions (755)
- [ ] Can upload video file (.mp4)

### HTTP Server:
- [ ] Apache running: `sudo systemctl status apache2`
- [ ] Directory configuration in 000-default.conf
- [ ] Headers module enabled: `apache2ctl -M | grep headers`
- [ ] Public URL works: `curl http://157.180.4.20/media/test_ftp.txt`
- [ ] Video file accessible via HTTP: `curl -I http://157.180.4.20/media/sample_video.mp4`

### External Access:
- [ ] Firewall allows port 21: `sudo ufw status | grep 21`
- [ ] Firewall allows port 80: `sudo ufw status | grep 80`
- [ ] Firewall allows passive ports: `sudo ufw status | grep 40000`
- [ ] External FTP connection works (test from different network)
- [ ] External HTTP access works (test from different network)

### Security:
- [ ] Strong password set for ftpmedia user
- [ ] Anonymous FTP disabled: `grep anonymous_enable /etc/vsftpd.conf` (should be NO)
- [ ] Chroot enabled: `grep chroot /etc/vsftpd.conf`
- [ ] Credentials documented and securely shared

---

## System Information

**Installation Logs:**
- vsftpd Log: `/var/log/vsftpd.log`
- Apache Access Log: `/var/log/apache2/access.log`
- Apache Error Log: `/var/log/apache2/error.log`

**Configuration Files:**
- vsftpd Config: `/etc/vsftpd.conf`
- vsftpd Userlist: `/etc/vsftpd.userlist`
- Apache Default Site: `/etc/apache2/sites-available/000-default.conf`

**Useful Commands:**
```bash
# Check FTP service
sudo systemctl status vsftpd

# Restart FTP service
sudo systemctl restart vsftpd

# Check Apache service
sudo systemctl status apache2

# Restart Apache service
sudo systemctl restart apache2

# View FTP logs
sudo tail -100 /var/log/vsftpd.log

# Monitor FTP activity
sudo tail -f /var/log/vsftpd.log

# Test FTP connection
ftp 157.180.4.20

# Test HTTP access
curl http://157.180.4.20/media/
```

---

## Quick Setup Summary (For Experienced Admins)

```bash
# 1. Install vsftpd
sudo apt update && sudo apt install vsftpd -y

# 2. Create FTP user
sudo useradd -m -d /var/www/html/media -s /bin/bash ftpmedia
sudo passwd ftpmedia

# 3. Set permissions
sudo mkdir -p /var/www/html/media
sudo chown -R ftpmedia:ftpmedia /var/www/html/media
sudo chmod -R 755 /var/www/html/media
sudo usermod -a -G ftpmedia www-data

# 4. Configure vsftpd (see full config above)
sudo nano /etc/vsftpd.conf

# 5. Create userlist
echo "ftpmedia" | sudo tee /etc/vsftpd.userlist

# 6. Configure firewall
sudo ufw allow 21/tcp
sudo ufw allow 40000:40100/tcp
sudo ufw allow 80/tcp

# 7. Start vsftpd
sudo systemctl restart vsftpd
sudo systemctl enable vsftpd

# 8. Configure Apache (see Apache config above)
sudo nano /etc/apache2/sites-available/000-default.conf
sudo a2enmod headers mime
sudo systemctl restart apache2

# 9. Test
echo "Test" > /tmp/test.txt
curl -T /tmp/test.txt ftp://157.180.4.20/test.txt --user ftpmedia:PASSWORD
curl http://157.180.4.20/media/test.txt
```

---

**Document Version:** 1.0  
**Last Updated:** November 4, 2025  
**Tested On:** Ubuntu Server with Apache 2.4.58 and vsftpd 3.0.5

---

## Support Resources

**Official Documentation:**
- vsftpd: https://security.appspot.com/vsftpd.html
- Apache: https://httpd.apache.org/docs/2.4/

**Common vsftpd Error Codes:**
- `500` - Syntax error
- `530` - Login incorrect
- `550` - Permission denied
- `553` - File name not allowed

**For Additional Help:**
Check logs first:
```bash
sudo tail -100 /var/log/vsftpd.log
sudo tail -100 /var/log/apache2/error.log
```
