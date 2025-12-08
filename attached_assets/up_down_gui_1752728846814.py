import os
import requests
import re
import logging
from bs4 import BeautifulSoup
import tkinter as tk
from tkinter import messagebox, filedialog
from tkinter.scrolledtext import ScrolledText
import threading

# --- CONFIG ---
TEMP_FILENAME = "temp_video.mp4"
LOG_FILE = "upload_log.txt"
ERROR_HTML_FILE = "error.html"
CHUNK_SIZE = 10 * 1024 * 1024  # 10MB

# --- Setup logging ---
logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format='%(asctime)s - %(message)s')

# --- Google Drive conversion ---
def convert_drive_link_to_file_id(url):
    match = re.search(r"/d/([\w-]+)", url)
    if match:
        return match.group(1)
    elif "open?id=" in url:
        return url.split("open?id=")[-1]
    else:
        return url

# --- STEP 1: Download video file with confirmation token handling ---
def download_video_file(file_id, dest_filename, log):
    session = requests.Session()
    base_url = "https://drive.google.com/uc?export=download"
    response = session.get(base_url, params={"id": file_id}, stream=True)

    def get_confirm_info_from_form(resp):
        soup = BeautifulSoup(resp.text, "html.parser")
        form = soup.find("form", {"id": "download-form"})
        if not form:
            return None, None
        confirm = form.find("input", {"name": "confirm"})
        uuid = form.find("input", {"name": "uuid"})
        if confirm and uuid:
            return confirm.get("value"), uuid.get("value")
        return None, None

    token, uuid_val = get_confirm_info_from_form(response)
    if token and uuid_val:
        confirm_url = "https://drive.usercontent.google.com/download"
        params = {
            "id": file_id,
            "export": "download",
            "confirm": token,
            "uuid": uuid_val
        }
        response = session.get(confirm_url, params=params, stream=True)

    content_type = response.headers.get("content-type", "")
    content_length = int(response.headers.get("content-length", 0))

    if "html" in content_type.lower() or content_length < 1000000:
        error_msg = "❌ Received invalid content type."
        log.insert(tk.END, error_msg + "\n")
        with open(ERROR_HTML_FILE, "w", encoding="utf-8") as err:
            err.write(response.text)
        return False

    try:
        with open(dest_filename, "wb") as f:
            downloaded = 0
            for chunk in response.iter_content(32768):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if content_length:
                        progress = min(100, int(downloaded * 100 / content_length))
                        log.insert(tk.END, f"Download progress: {progress}%\n")
                        log.see(tk.END)
        log.insert(tk.END, "✅ Download complete.\n")
        return True
    except Exception as e:
        log.insert(tk.END, f"❌ Download failed: {e}\n")
        return False

# --- STEP 2: Upload to Facebook Graph API with multi-chunk support ---
def upload_to_facebook(filepath, page_id, access_token, log):
    try:
        file_size = os.path.getsize(filepath)
        log.insert(tk.END, f"Uploading {file_size / (1024*1024):.2f}MB video to Facebook...\n")
        start_url = f"https://graph-video.facebook.com/v19.0/{page_id}/videos"
        params = {
            "upload_phase": "start",
            "access_token": access_token,
            "file_size": file_size
        }
        start_res = requests.post(start_url, params=params).json()
        session_id = start_res.get("upload_session_id")
        video_id = start_res.get("video_id")
        start_offset = start_res.get("start_offset")
        end_offset = start_res.get("end_offset")

        if not session_id:
            log.insert(tk.END, f"❌ Upload session failed: {start_res}\n")
            return

        with open(filepath, "rb") as f:
            while True:
                f.seek(int(start_offset))
                chunk = f.read(int(end_offset) - int(start_offset))
                if not chunk:
                    break

                upload_url = f"https://graph-video.facebook.com/v19.0/{page_id}/videos"
                files = {"video_file_chunk": chunk}
                params = {
                    "upload_phase": "transfer",
                    "upload_session_id": session_id,
                    "start_offset": start_offset,
                    "access_token": access_token
                }
                transfer_res = requests.post(upload_url, files=files, params=params).json()

                if 'error' in transfer_res:
                    log.insert(tk.END, f"❌ Transfer error: {transfer_res['error']}\n")
                    return

                start_offset = transfer_res.get("start_offset")
                end_offset = transfer_res.get("end_offset")

                log.insert(tk.END, f"Chunk uploaded. Next: {start_offset} to {end_offset}\n")
                log.see(tk.END)

                if start_offset == end_offset:
                    break

        finish_url = f"https://graph-video.facebook.com/v19.0/{page_id}/videos"
        params = {
            "upload_phase": "finish",
            "upload_session_id": session_id,
            "access_token": access_token
        }
        finish_res = requests.post(finish_url, params=params).json()
        fb_link = f"https://www.facebook.com/video.php?v={video_id}"
        log.insert(tk.END, f"✅ Uploaded: {fb_link}\n")
        log.see(tk.END)
    except Exception as e:
        log.insert(tk.END, f"❌ Facebook upload failed: {e}\n")
        log.see(tk.END)

# --- Token Test ---
def test_token(token, page_id, log):
    url = f"https://graph.facebook.com/v19.0/{page_id}?access_token={token}"
    res = requests.get(url).json()
    if 'id' in res:
        log.insert(tk.END, "✅ Token is valid for this page.\n")
    else:
        log.insert(tk.END, f"❌ Invalid token or page ID: {res}\n")
    log.see(tk.END)

# --- GUI Setup ---
def run_gui():
    root = tk.Tk()
    root.title("Google Drive to Facebook Video Uploader")

    tk.Label(root, text="Google Drive URL").pack()
    url_entry = tk.Entry(root, width=80)
    url_entry.pack()

    tk.Label(root, text="Facebook Page ID").pack()
    page_entry = tk.Entry(root, width=50)
    page_entry.pack()

    tk.Label(root, text="Facebook Access Token").pack()
    token_entry = tk.Entry(root, width=80, show="*")
    token_entry.pack()

    log_box = ScrolledText(root, height=15, width=100)
    log_box.pack()

    def threaded_process():
        url = url_entry.get()
        page_id = page_entry.get()
        token = token_entry.get()
        file_id = convert_drive_link_to_file_id(url)
        success = download_video_file(file_id, TEMP_FILENAME, log_box)
        if success:
            upload_to_facebook(TEMP_FILENAME, page_id, token, log_box)

    def start_process():
        threading.Thread(target=threaded_process).start()

    def run_token_test():
        token = token_entry.get()
        page_id = page_entry.get()
        threading.Thread(target=test_token, args=(token, page_id, log_box)).start()

    tk.Button(root, text="Download & Upload", command=start_process).pack(pady=5)
    tk.Button(root, text="Test Token", command=run_token_test).pack()

    root.mainloop()

# --- MAIN ---
if __name__ == "__main__":
    run_gui()