import os
import shutil
import glob
import datetime
from typing import List, Dict, Any

BACKUP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploaded_reports_backup"))
MAX_BACKUP_RETENTION = 30 # Retain last 30 uploads (new + previous backups), auto-pruning older ones

def ensure_backup_dir():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)

def save_report_backup(original_filename: str, file_bytes: bytes) -> str:
    """
    Saves a timestamped backup of the uploaded Excel report.
    Automatically keeps latest and previous backups while pruning older files.
    """
    ensure_backup_dir()
    
    # Generate timestamped filename
    now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = os.path.basename(original_filename).replace(" ", "_")
    backup_filename = f"{now_str}_{safe_name}"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    with open(backup_path, "wb") as f:
        f.write(file_bytes)
        
    # Prune old backups beyond retention limit
    prune_old_backups(keep_count=MAX_BACKUP_RETENTION)
    
    return backup_path

def prune_old_backups(keep_count: int = 10):
    """
    Ensures recent backups are always safely preserved,
    while automatically deleting older files exceeding the retention limit.
    """
    ensure_backup_dir()
    files = glob.glob(os.path.join(BACKUP_DIR, "*.xlsx")) + glob.glob(os.path.join(BACKUP_DIR, "*.xls"))
    # Sort by modification time, newest first
    files.sort(key=os.path.getmtime, reverse=True)
    
    if len(files) > keep_count:
        for old_file in files[keep_count:]:
            try:
                os.remove(old_file)
                print(f"[Backup Pruned] Removed old report backup: {os.path.basename(old_file)}")
            except Exception as e:
                print(f"Error removing old backup {old_file}: {e}")

def list_backups() -> List[Dict[str, Any]]:
    """Returns metadata of all backed up Excel reports."""
    ensure_backup_dir()
    files = glob.glob(os.path.join(BACKUP_DIR, "*.xlsx")) + glob.glob(os.path.join(BACKUP_DIR, "*.xls"))
    files.sort(key=os.path.getmtime, reverse=True)
    
    results = []
    for idx, f in enumerate(files):
        size_bytes = os.path.getsize(f)
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(f))
        bname = os.path.basename(f)
        
        status_tag = "Latest Upload" if idx == 0 else ("Previous Upload" if idx == 1 else "Archived Backup")
        results.append({
            "backup_filename": bname,
            "original_filename": bname.split("_", 2)[-1] if "_" in bname else bname,
            "timestamp": mtime.strftime("%Y-%m-%d %H:%M:%S"),
            "size_kb": round(size_bytes / 1024, 2),
            "status_tag": status_tag,
            "rank": idx + 1
        })
    return results
