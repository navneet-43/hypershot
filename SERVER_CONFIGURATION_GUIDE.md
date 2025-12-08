# 88TB Storage Server Configuration Guide
## Apache WebDAV + Public HTTP Media Serving Setup

**Purpose:** Configure Apache server to accept WebDAV uploads (password-protected) and serve media files publicly via HTTP for Instagram API integration.

**Server Details:**
- IP Address: `157.180.4.20`
- Web Server: Apache 2.4.58 (Ubuntu)
- Storage Path: `/var/www/webdav/disk4`
- Public Access Path: `/var/www/html/media`

---

## Table of Contents
1. [Prerequisites Check](#prerequisites-check)
2. [WebDAV Configuration](#webdav-configuration)
3. [Public HTTP Serving Setup](#public-http-serving-setup)
4. [Testing & Verification](#testing--verification)
5. [Troubleshooting](#troubleshooting)
6. [Security Considerations](#security-considerations)

---

## Prerequisites Check

### Step 1: Verify Apache Installation
```bash
# Check Apache version
apache2 -v

# Expected output: Apache/2.4.58 (Ubuntu) or similar
```

### Step 2: Enable Required Apache Modules
```bash
# Enable WebDAV modules
sudo a2enmod dav
sudo a2enmod dav_fs
sudo a2enmod dav_lock

# Enable authentication modules
sudo a2enmod auth_digest
sudo a2enmod authn_file
sudo a2enmod authz_user

# Enable headers module (for CORS if needed)
sudo a2enmod headers

# Restart Apache to apply modules
sudo systemctl restart apache2
```

### Step 3: Verify Modules are Loaded
```bash
apache2ctl -M | grep dav

# Expected output:
# dav_module (shared)
# dav_fs_module (shared)
# dav_lock_module (shared)
```

---

## WebDAV Configuration

### Step 1: Create Storage Directory Structure
```bash
# Create WebDAV root directory
sudo mkdir -p /var/www/webdav/disk4

# Set proper ownership
sudo chown -R www-data:www-data /var/www/webdav

# Set proper permissions
sudo chmod -R 755 /var/www/webdav

# Create DAV lock database directory
sudo mkdir -p /var/lock/apache2/davlock
sudo chown -R www-data:www-data /var/lock/apache2/davlock
```

### Step 2: Create WebDAV Virtual Host Configuration
```bash
# Create new WebDAV configuration file
sudo nano /etc/apache2/sites-available/webdav.conf
```

**Paste this configuration:**
```apache
<VirtualHost *:80>
    ServerName 157.180.4.20
    ServerAdmin admin@yourdomain.com
    
    DocumentRoot /var/www/html
    
    # WebDAV Directory (Password Protected for Uploads)
    Alias /webdav /var/www/webdav
    
    <Directory /var/www/webdav>
        DAV On
        Options +Indexes +FollowSymLinks
        AllowOverride None
        
        # Enable Digest Authentication
        AuthType Digest
        AuthName "webdav"
        AuthDigestProvider file
        AuthUserFile /etc/apache2/.htdigest
        Require valid-user
        
        # DAV Lock Database
        DavLockDB /var/lock/apache2/davlock/DAVLock
        
        # Set permissions for WebDAV operations
        <LimitExcept GET OPTIONS>
            Require valid-user
        </LimitExcept>
    </Directory>
    
    # Specific configuration for disk4 directory
    <Directory /var/www/webdav/disk4>
        DAV On
        Options +Indexes
        Require valid-user
    </Directory>
    
    # Logging
    ErrorLog ${APACHE_LOG_DIR}/webdav_error.log
    CustomLog ${APACHE_LOG_DIR}/webdav_access.log combined
    LogLevel warn
</VirtualHost>
```

**Save and exit:** Press `Ctrl + X`, then `Y`, then `Enter`

### Step 3: Create Authentication Credentials
```bash
# Create digest authentication file with user 'admin'
sudo htdigest -c /etc/apache2/.htdigest webdav admin

# You will be prompted to enter password twice
# Use a strong password and save it securely
# This password will be used in the Replit application secrets
```

**Important:** Save these credentials:
- Username: `admin`
- Password: `[the password you just created]`
- Realm: `webdav`

### Step 4: Enable WebDAV Site
```bash
# Enable the WebDAV configuration
sudo a2ensite webdav.conf

# Test Apache configuration for syntax errors
sudo apache2ctl configtest

# Expected output: "Syntax OK"

# If errors appear, review the configuration file
# If warnings about ServerName appear, you can ignore them

# Restart Apache to apply changes
sudo systemctl restart apache2
```

---

## Public HTTP Serving Setup

### Step 1: Create Public Media Directory
```bash
# Create public media directory
sudo mkdir -p /var/www/html/media

# Set ownership
sudo chown -R www-data:www-data /var/www/html/media

# Set permissions (world-readable for public access)
sudo chmod -R 755 /var/www/html/media
```

### Step 2: Create Symlink from WebDAV to Public Directory
```bash
# Option A: Symlink (Recommended - Same storage, two access paths)
sudo ln -s /var/www/webdav/disk4 /var/www/html/media

# Verify symlink was created
ls -la /var/www/html/ | grep media

# Expected output: media -> /var/www/webdav/disk4
```

**Alternative Option B: Separate Directories**
```bash
# If you prefer separate directories instead of symlink
# Skip the symlink command above and use separate paths
# Upload destination: /var/www/webdav/disk4
# Public serving: /var/www/html/media
# (Files would need to be copied between them)
```

### Step 3: Configure Public Access in Apache
```bash
# Edit the default site configuration
sudo nano /etc/apache2/sites-available/000-default.conf
```

**Add this configuration inside the `<VirtualHost *:80>` block:**
```apache
    # Public Media Directory (NO PASSWORD - for Instagram API access)
    <Directory /var/www/html/media>
        Options +Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        
        # Enable CORS for cross-origin requests (optional but recommended)
        Header set Access-Control-Allow-Origin "*"
        Header set Access-Control-Allow-Methods "GET, OPTIONS"
        Header set Access-Control-Allow-Headers "Content-Type"
    </Directory>
```

**Save and exit:** Press `Ctrl + X`, then `Y`, then `Enter`

### Step 4: Apply Configuration Changes
```bash
# Test configuration
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2

# Check Apache status
sudo systemctl status apache2

# Expected output: "active (running)"
```

---

## Testing & Verification

### Test 1: Verify Apache is Running
```bash
# Check Apache status
sudo systemctl status apache2

# Expected: "active (running)" in green
```

### Test 2: Test WebDAV Authentication
```bash
# Test WebDAV endpoint (should return 401 Unauthorized)
curl -I http://157.180.4.20/webdav/

# Expected output:
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Digest realm="webdav"
```

### Test 3: Test WebDAV with Credentials
```bash
# Replace YOUR_PASSWORD with the password you created
curl -u admin:YOUR_PASSWORD --digest -I http://157.180.4.20/webdav/disk4/

# Expected output:
# HTTP/1.1 200 OK
# or
# HTTP/1.1 404 Not Found (if directory is empty - this is OK)
```

### Test 4: Upload a Test File via WebDAV
```bash
# Create a test file
echo "WebDAV Upload Test - $(date)" > /tmp/test_upload.txt

# Upload via WebDAV using curl
curl -u admin:YOUR_PASSWORD --digest -T /tmp/test_upload.txt \
  http://157.180.4.20/webdav/disk4/test_upload.txt

# Expected output: Empty response or "Created" (HTTP 201)
```

### Test 5: Verify File Exists in WebDAV
```bash
# List files in WebDAV directory
curl -u admin:YOUR_PASSWORD --digest -X PROPFIND \
  http://157.180.4.20/webdav/disk4/ | grep test_upload

# Or check directly on server
ls -la /var/www/webdav/disk4/
```

### Test 6: Test Public HTTP Access (CRITICAL for Instagram)
```bash
# Access the uploaded file WITHOUT password via public URL
curl http://157.180.4.20/media/test_upload.txt

# Expected output: File content displayed
# "WebDAV Upload Test - [date]"

# If this fails, Instagram won't be able to download videos!
```

### Test 7: Upload and Access a Video File
```bash
# Download a sample video for testing
wget -O /tmp/sample_video.mp4 https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4

# Upload via WebDAV
curl -u admin:YOUR_PASSWORD --digest -T /tmp/sample_video.mp4 \
  http://157.180.4.20/webdav/disk4/sample_video.mp4

# Access via public HTTP (this is what Instagram will use)
curl -I http://157.180.4.20/media/sample_video.mp4

# Expected output:
# HTTP/1.1 200 OK
# Content-Type: video/mp4
# Content-Length: [file size]
```

### Test 8: Test from External Network (Critical!)
```bash
# From a different computer or use online tools like:
# https://reqbin.com/

# Test public access:
curl -I http://157.180.4.20/media/test_upload.txt

# Should return HTTP/1.1 200 OK
# If this fails, check firewall rules
```

---

## Troubleshooting

### Issue 1: 401 Unauthorized Even with Correct Password

**Symptoms:**
```bash
curl -u admin:PASSWORD --digest http://157.180.4.20/webdav/
# Returns: 401 Unauthorized
```

**Solutions:**
```bash
# 1. Verify password file exists
sudo ls -la /etc/apache2/.htdigest

# 2. Recreate the password
sudo htdigest /etc/apache2/.htdigest webdav admin

# 3. Check file permissions
sudo chmod 644 /etc/apache2/.htdigest
sudo chown root:www-data /etc/apache2/.htdigest

# 4. Verify realm matches in both .htdigest and webdav.conf
# Realm in config: AuthName "webdav"
# Realm in htdigest creation: webdav
# These MUST match exactly!

# 5. Restart Apache
sudo systemctl restart apache2
```

### Issue 2: 404 Not Found on /media/ Path

**Symptoms:**
```bash
curl http://157.180.4.20/media/
# Returns: 404 Not Found
```

**Solutions:**
```bash
# 1. Check if symlink exists
ls -la /var/www/html/ | grep media

# 2. Recreate symlink if missing
sudo rm -f /var/www/html/media
sudo ln -s /var/www/webdav/disk4 /var/www/html/media

# 3. Verify target directory exists
ls -la /var/www/webdav/disk4/

# 4. Check Apache configuration includes Directory directive
sudo nano /etc/apache2/sites-available/000-default.conf
# Verify <Directory /var/www/html/media> block exists

# 5. Restart Apache
sudo systemctl restart apache2
```

### Issue 3: Permission Denied Errors

**Symptoms:**
```
403 Forbidden
or
Unable to PUT file
```

**Solutions:**
```bash
# 1. Check directory ownership
ls -la /var/www/webdav/

# Should show: drwxr-xr-x www-data www-data

# 2. Fix ownership recursively
sudo chown -R www-data:www-data /var/www/webdav
sudo chown -R www-data:www-data /var/www/html/media

# 3. Fix permissions
sudo chmod -R 755 /var/www/webdav
sudo chmod -R 755 /var/www/html/media

# 4. Check DAV lock directory
sudo chown -R www-data:www-data /var/lock/apache2/davlock
sudo chmod -R 755 /var/lock/apache2/davlock

# 5. Restart Apache
sudo systemctl restart apache2
```

### Issue 4: Firewall Blocking External Access

**Symptoms:**
- Tests work from localhost
- Tests fail from external networks/Replit

**Solutions:**
```bash
# 1. Check firewall status
sudo ufw status

# 2. Allow HTTP traffic (port 80)
sudo ufw allow 80/tcp

# 3. For UFW (Ubuntu Firewall)
sudo ufw allow 'Apache Full'

# 4. For iptables
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables-save

# 5. Verify port is listening
sudo netstat -tlnp | grep :80

# Expected output: Apache listening on 0.0.0.0:80
```

### Issue 5: Apache Won't Start

**Symptoms:**
```bash
sudo systemctl restart apache2
# Job for apache2.service failed
```

**Solutions:**
```bash
# 1. Check Apache error logs
sudo tail -50 /var/log/apache2/error.log

# 2. Test configuration syntax
sudo apache2ctl configtest

# Fix any syntax errors reported

# 3. Check if port 80 is already in use
sudo lsof -i :80

# 4. Check detailed service status
sudo systemctl status apache2 -l

# 5. Try starting manually for more details
sudo apache2ctl -k start
```

### Issue 6: Files Upload but Can't be Accessed Publicly

**Symptoms:**
- WebDAV upload succeeds
- Public URL returns 404

**Solutions:**
```bash
# 1. Verify file actually exists
ls -la /var/www/webdav/disk4/

# 2. Check symlink is working
ls -la /var/www/html/media/

# 3. Test direct file access
cat /var/www/html/media/test_upload.txt

# 4. Check Apache is following symlinks
# In 000-default.conf, ensure:
# Options +FollowSymLinks

# 5. Verify Apache has read permissions
sudo -u www-data cat /var/www/html/media/test_upload.txt
```

---

## Security Considerations

### 1. WebDAV Password Security
```bash
# Use strong passwords (minimum 16 characters)
# Example: Use a password generator
openssl rand -base64 24

# Store credentials securely (e.g., password manager)
# Share credentials only through secure channels
```

### 2. Limit WebDAV Access by IP (Optional)
```apache
# Add to /etc/apache2/sites-available/webdav.conf
# Inside <Directory /var/www/webdav> block:

<RequireAll>
    Require valid-user
    # Only allow access from Replit IPs (example)
    Require ip 35.190.0.0/16
    Require ip 34.74.0.0/16
</RequireAll>
```

### 3. Enable HTTPS (Recommended for Production)
```bash
# Install Certbot for free SSL
sudo apt install certbot python3-certbot-apache

# Get SSL certificate
sudo certbot --apache -d yourdomain.com

# Auto-renew will be configured automatically
```

### 4. Rate Limiting (Prevent Abuse)
```bash
# Install mod_evasive
sudo apt install libapache2-mod-evasive

# Enable module
sudo a2enmod evasive

# Configure in /etc/apache2/mods-enabled/evasive.conf
```

### 5. Regular Log Monitoring
```bash
# Monitor WebDAV access
sudo tail -f /var/log/apache2/webdav_access.log

# Monitor errors
sudo tail -f /var/log/apache2/webdav_error.log

# Set up log rotation
sudo nano /etc/logrotate.d/apache2
```

---

## Credentials Summary

**After completing this setup, provide these credentials to the Replit application:**

```
WEBDAV_URL=http://157.180.4.20/webdav/
WEBDAV_USERNAME=admin
WEBDAV_PASSWORD=[the password you created with htdigest]
WEBDAV_BASE_PATH=/disk4
WEBDAV_PUBLIC_URL=http://157.180.4.20/media
```

---

## Verification Checklist

Before marking setup as complete, verify:

- [ ] Apache modules enabled: `dav`, `dav_fs`, `dav_lock`, `auth_digest`
- [ ] Directory `/var/www/webdav/disk4` exists with www-data ownership
- [ ] WebDAV returns 401 on unauthenticated requests: `curl -I http://157.180.4.20/webdav/`
- [ ] WebDAV accepts authenticated requests: `curl -u admin:PASS --digest -I http://157.180.4.20/webdav/disk4/`
- [ ] Test file uploaded successfully via WebDAV
- [ ] Symlink exists: `/var/www/html/media -> /var/www/webdav/disk4`
- [ ] Public URL works WITHOUT password: `curl http://157.180.4.20/media/test_upload.txt`
- [ ] Video file (.mp4) accessible via public URL
- [ ] External network can access public URL (test from different network)
- [ ] Firewall allows port 80 traffic
- [ ] Apache starts without errors: `sudo systemctl status apache2`
- [ ] Credentials documented and securely shared

---

## Support & Contact

**Apache Logs Location:**
- Access Log: `/var/log/apache2/webdav_access.log`
- Error Log: `/var/log/apache2/webdav_error.log`
- Main Error Log: `/var/log/apache2/error.log`

**Useful Commands:**
```bash
# View recent errors
sudo tail -100 /var/log/apache2/webdav_error.log

# Monitor logs in real-time
sudo tail -f /var/log/apache2/webdav_access.log

# Restart Apache
sudo systemctl restart apache2

# Check Apache status
sudo systemctl status apache2

# Test configuration
sudo apache2ctl configtest
```

---

**Document Version:** 1.0  
**Last Updated:** November 4, 2025  
**Tested On:** Ubuntu Server with Apache 2.4.58

---

## Quick Setup Summary (For Experienced Admins)

```bash
# 1. Enable modules
sudo a2enmod dav dav_fs dav_lock auth_digest headers

# 2. Create directories
sudo mkdir -p /var/www/webdav/disk4 /var/lock/apache2/davlock
sudo chown -R www-data:www-data /var/www/webdav /var/lock/apache2/davlock

# 3. Create auth file
sudo htdigest -c /etc/apache2/.htdigest webdav admin

# 4. Create WebDAV config (see full config above)
sudo nano /etc/apache2/sites-available/webdav.conf

# 5. Enable site
sudo a2ensite webdav.conf

# 6. Create public symlink
sudo ln -s /var/www/webdav/disk4 /var/www/html/media

# 7. Configure public access in 000-default.conf
sudo nano /etc/apache2/sites-available/000-default.conf

# 8. Restart
sudo systemctl restart apache2

# 9. Test
curl -I http://157.180.4.20/webdav/  # Should return 401
curl -u admin:PASS --digest -T /tmp/test.txt http://157.180.4.20/webdav/disk4/test.txt
curl http://157.180.4.20/media/test.txt  # Should return file content
```
