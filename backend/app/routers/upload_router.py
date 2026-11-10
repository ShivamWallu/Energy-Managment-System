import os
import glob
import hashlib
import io
import re
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, status
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import User, ReportFile, RawReading, ValidationFinding, ShiftCalculation
from backend.app.auth import get_current_user, require_role
from backend.app.excel_parser import parse_ems_excel_file
from backend.app.engine import compute_plant_energy_balance
from backend.app.backup_manager import save_report_backup, list_backups, BACKUP_DIR
from backend.app.activity_logger import log_activity
from fastapi.responses import FileResponse

router = APIRouter(prefix="/reports", tags=["Reports & Uploads"])

def _process_report_bytes(
    filename: str, 
    file_bytes: bytes, 
    user_id: int, 
    db: Session, 
    request: Optional[Request] = None,
    batch_id: Optional[str] = None
):
    ip = request.client.host if (request and request.client) else "127.0.0.1"

    # Check extension
    ext = os.path.splitext(filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        err_msg = f"Unsupported format '{ext}'. Allowed: {settings.ALLOWED_EXTENSIONS}"
        log_activity(
            db=db,
            activity_type="INVALID_EXCEL_UPLOAD",
            description=f"Invalid file format rejected for '{filename}'. {err_msg}",
            user_id=user_id,
            status="FAILED",
            ip_address=ip,
            metadata_json={"filename": filename, "error": err_msg}
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)

    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        err_msg = f"File exceeds maximum allowed size ({settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)} MB)."
        log_activity(
            db=db,
            activity_type="INVALID_EXCEL_UPLOAD",
            description=f"Upload rejected: '{filename}' exceeds maximum allowed size.",
            user_id=user_id,
            status="FAILED",
            ip_address=ip,
            metadata_json={"filename": filename, "error": err_msg}
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)

    # Save physical timestamped backup
    backup_path = save_report_backup(filename, file_bytes)

    # Compute content hash for tracking
    fhash = hashlib.sha256(file_bytes).hexdigest()

    # Parse Excel with strict preservation
    try:
        parsed = parse_ems_excel_file(io.BytesIO(file_bytes))
    except Exception as e:
        err_detail = str(e)
        log_activity(
            db=db,
            activity_type="INVALID_EXCEL_UPLOAD",
            description=f"Invalid Excel upload failed for '{filename}'. {err_detail}",
            user_id=user_id,
            status="FAILED",
            ip_address=ip,
            metadata_json={"filename": filename, "error": err_detail}
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse EMS Excel report '{filename}': {err_detail}"
        )

    # Assign unique session batch ID for grouping dual-shift or single-shift uploads
    active_batch_id = batch_id or datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    meta = parsed["metadata"]
    crit_count = sum(1 for f in parsed["validation_findings"] if f["severity"] == "CRITICAL")
    warn_count = sum(1 for f in parsed["validation_findings"] if f["severity"] == "WARNING")
    val_status = "ANOMALIES_DETECTED" if crit_count > 0 else ("WARNINGS" if warn_count > 0 else "VALID")

    # Compute plant energy balance
    balance = compute_plant_energy_balance(parsed)
    
    meta_json = {
        "metadata": meta,
        "balance": balance,
        "batch_id": active_batch_id,
        "findings_summary": {
            "total": len(parsed["validation_findings"]),
            "critical": crit_count,
            "warning": warn_count,
            "info": len(parsed["validation_findings"]) - crit_count - warn_count
        }
    }

    rep = ReportFile(
        filename=filename,
        file_hash=fhash,
        report_name=meta.get("report_name") or filename,
        report_description=meta.get("report_description"),
        report_type=meta.get("report_type"),
        trigger_type=meta.get("trigger_type"),
        created_by_in_report=meta.get("created_by"),
        report_created_on=meta.get("created_on"),
        time_range=meta.get("time_range"),
        upload_timestamp=datetime.datetime.now(),
        total_intervals=len(parsed["intervals"]),
        total_columns=len(parsed["columns"]),
        validation_status=val_status,
        metadata_json=meta_json,
        uploaded_by_user_id=user_id
    )
    db.add(rep)
    db.flush()

    # Save validation findings
    for f in parsed["validation_findings"]:
        db.add(ValidationFinding(
            report_file_id=rep.id,
            severity=f["severity"],
            category=f["category"],
            source_name=f.get("source_name"),
            location=f.get("location"),
            timestamp_str=f.get("timestamp_str"),
            row_num=f.get("row_num"),
            col_num=f.get("col_num"),
            observed_value=f.get("observed_value"),
            expected_range=f.get("expected_range"),
            explanation=f["explanation"]
        ))

    # Save verified calculations
    for c in parsed["calculations"]:
        db.add(ShiftCalculation(
            report_file_id=rep.id,
            col_index=c["col_index"],
            source_name=c["source_name"],
            location=c["location"],
            motor_hp=c["motor_hp"],
            rated_15m_kwh=c["rated_15m_kwh"],
            excel_min=c["excel_min"],
            excel_max=c["excel_max"],
            excel_avg=c["excel_avg"],
            excel_sum=c["excel_sum"],
            calc_min=c["calc_min"],
            calc_max=c["calc_max"],
            calc_avg=c["calc_avg"],
            calc_sum=c["calc_sum"],
            count_valid=c["count_valid"],
            count_zero=c["count_zero"],
            count_blank=c["count_blank"],
            count_overload=c["count_overload"],
            count_idle=c["count_idle"],
            avg_load_pct=c["avg_load_pct"],
            sum_verified=c["sum_verified"],
            verification_diff=c["verification_diff"]
        ))

    # Save raw interval readings
    col_by_idx = {col["col_index"]: col for col in parsed["columns"]}
    for it in parsed["intervals"]:
        for c_idx, cell_data in it["readings"].items():
            c_meta = col_by_idx[c_idx]
            db.add(RawReading(
                report_file_id=rep.id,
                interval_index=it["interval_index"],
                timestamp_str=it["timestamp_str"],
                timestamp=it["timestamp"],
                col_index=c_idx,
                source_name=c_meta["source_name"],
                location=c_meta["location"],
                measurement_point=c_meta["measurement_point"],
                unit=c_meta["unit"],
                raw_value_str=cell_data["raw_str"],
                numeric_value=cell_data["numeric_val"],
                cell_style=cell_data["style"],
                is_duplicate_col=c_meta["is_duplicate"]
            ))

    db.commit()

    # Enforce FIFO Retention Policy: Keep maximum N reports (Default: 30)
    # Oldest reports exceeding the limit are cleanly deleted from DB (cascading readings/findings/calculations)
    # and physical files are also removed from disk so frontend & backend stay completely synchronized.
    max_reports = getattr(settings, "MAX_RETAINED_REPORTS", 30)
    total_existing = db.query(ReportFile).count()
    if total_existing > max_reports:
        excess_count = total_existing - max_reports
        oldest_reports = (
            db.query(ReportFile)
            .order_by(ReportFile.id.asc())
            .limit(excess_count)
            .all()
        )
        for old_rep in oldest_reports:
            old_id = old_rep.id
            old_fn = old_rep.filename
            
            # Delete physical file from backup directory as well
            if BACKUP_DIR and os.path.exists(BACKUP_DIR):
                for f_path in glob.glob(os.path.join(BACKUP_DIR, f"*_{os.path.basename(old_fn).replace(' ', '_')}")):
                    try:
                        os.remove(f_path)
                    except Exception:
                        pass

            db.delete(old_rep)
            log_activity(
                db=db,
                activity_type="SYSTEM_MAINTENANCE",
                description=f"Auto-Retention (FIFO): Oldest Report #{old_id} ('{old_fn}') purged from database & disk storage as limit reached ({max_reports} reports).",
                user_id=user_id,
                status="INFO",
                ip_address=ip,
                metadata_json={"purged_report_id": old_id, "filename": old_fn, "max_limit": max_reports}
            )
        db.commit()

    # Audit log successful Excel upload
    log_activity(
        db=db,
        activity_type="EXCEL_UPLOAD",
        description=f"Excel Shift Report '{filename}' uploaded and indexed ({rep.total_intervals} slots, {rep.total_columns} columns, {val_status}). Total Energy: {balance.get('main_incomer_kwh', 0):,.1f} kWh.",
        user_id=user_id,
        status="SUCCESS",
        ip_address=ip,
        metadata_json={
            "filename": filename,
            "report_id": rep.id,
            "time_range": rep.time_range,
            "total_intervals": rep.total_intervals,
            "total_kwh": balance.get("main_incomer_kwh")
        }
    )

    return {
        "message": f"Report '{filename}' uploaded, validated, and indexed successfully.",
        "report_id": rep.id,
        "filename": rep.filename,
        "report_name": rep.report_name,
        "time_range": rep.time_range,
        "total_intervals": rep.total_intervals,
        "validation_status": rep.validation_status,
        "summary": meta_json["findings_summary"],
        "already_existed": False
    }

@router.post("/upload")
async def upload_ems_report(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    batch_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_bytes = await file.read()
    return _process_report_bytes(file.filename, file_bytes, current_user.id, db, request=request, batch_id=batch_id)

@router.post("/upload-multi")
async def upload_multi_ems_reports(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    batch_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    results = []
    for f in files:
        f_bytes = await f.read()
        res = _process_report_bytes(f.filename, f_bytes, current_user.id, db, request=request, batch_id=batch_id)
        results.append(res)
        
    is_dual = len(files) == 2
    msg = f"Both Day & Night shifts ({len(files)} reports) uploaded and indexed successfully!" if is_dual else f"{len(files)} shift report(s) uploaded successfully."
    
    return {
        "message": msg,
        "reports": results,
        "count": len(results),
        "shift_mode": "DUAL" if is_dual else "SINGLE",
        "batch_id": batch_id
    }

@router.get("/template/csv")
def download_standard_template_csv():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    csv_path = os.path.join(base_dir, "sample_data", "EMS_Standard_Column_Template.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Template CSV not found.")
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename="EMS_Standard_Column_Template.csv"
    )

@router.get("/list")
def list_reports(
    only_my_uploads: bool = False,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = db.query(ReportFile)
    if (only_my_uploads or (current_user and current_user.role != "admin")) and current_user:
        query = query.filter(ReportFile.uploaded_by_user_id == current_user.id)
    reports = query.order_by(ReportFile.id.asc()).all()
    out = []
    for r in reports:
        meta_json = r.metadata_json or {}
        bal = meta_json.get("balance", {})
        tr = r.time_range or ""
        fn = r.filename or ""
        cr = r.report_created_on or ""

        # Detect Shift Date from time_range, created_on, or filename
        shift_date_str = None
        shift_date_display = None
        
        # Try time_range, e.g. "04/11/2026 07:00 to 04/11/2026 19:00"
        m_tr = re.search(r'(\d{2}/\d{2}/\d{4})', tr)
        if m_tr:
            shift_date_str = m_tr.group(1)
        elif cr:
            m_cr = re.search(r'(\d{2}/\d{2}/\d{4})', cr)
            if m_cr:
                shift_date_str = m_cr.group(1)
        elif fn:
            # e.g. Reports_Shift_11142026_7_00 PM.XLSX -> MMDDYYYY (11/14/2026)
            m_fn = re.search(r'(\d{2})(\d{2})(\d{4})', fn)
            if m_fn:
                shift_date_str = f"{m_fn.group(2)}/{m_fn.group(1)}/{m_fn.group(3)}"
        
        if not shift_date_str and r.upload_timestamp:
            shift_date_str = r.upload_timestamp.strftime("%d/%m/%Y")
            
        # Format for clean display: e.g. "04 Nov 2026"
        if shift_date_str:
            try:
                dt_obj = datetime.datetime.strptime(shift_date_str, "%d/%m/%Y")
                shift_date_display = dt_obj.strftime("%d %b %Y")
            except Exception:
                shift_date_display = shift_date_str
        else:
            shift_date_display = "Unknown Date"
            shift_date_str = "Unknown"

        # Detect Shift Type (Day vs Night)
        if "07:00 to" in tr:
            shift_type = "DAY"
            shift_label = "Day Shift"
        elif "19:00 to" in tr:
            shift_type = "NIGHT"
            shift_label = "Night Shift"
        elif "Day" in fn or "Shift_1" in fn:
            shift_type = "DAY"
            shift_label = "Day Shift"
        else:
            shift_type = "NIGHT"
            shift_label = "Night Shift"
        
        # User attribution
        user_obj = r.uploaded_by_user
        username = user_obj.username if user_obj else "admin"
        uploader_name = user_obj.full_name if (user_obj and user_obj.full_name) else username
        
        # Upload date & time formatted strictly as DD/MM/YYYY, hh:mm A
        upload_date_str = r.upload_timestamp.strftime("%d/%m/%Y") if r.upload_timestamp else "—"
        upload_time_str = r.upload_timestamp.strftime("%I:%M %p") if r.upload_timestamp else "—"
        formatted_upload_time = r.upload_timestamp.strftime("%d/%m/%Y, %I:%M %p") if r.upload_timestamp else "—"

        # Extract or construct session batch ID
        batch_id = meta_json.get("batch_id")
        if not batch_id and r.upload_timestamp:
            batch_id = r.upload_timestamp.strftime("%Y%m%d_%H%M")
        elif not batch_id:
            batch_id = f"batch_{r.id}"

        out.append({
            "id": r.id,
            "filename": r.filename,
            "report_name": r.report_name,
            "batch_id": batch_id,
            "time_range": r.time_range,
            "shift_date": shift_date_str,
            "shift_date_display": shift_date_display,
            "shift_label": shift_label,
            "shift_type": shift_type,
            "uploaded_by_user_id": r.uploaded_by_user_id or 1,
            "uploaded_by_username": username,
            "uploaded_by_name": uploader_name,
            "total_intervals": r.total_intervals,
            "total_columns": r.total_columns,
            "total_kwh": bal.get("main_incomer_kwh") or 0.0,
            "expeller_kwh": bal.get("total_expeller_incomers_kwh") or 0.0,
            "kohlu_kwh": bal.get("total_kohlu_incomers_kwh") or 0.0,
            "validation_status": r.validation_status,
            "upload_date": upload_date_str,
            "upload_time": upload_time_str,
            "upload_timestamp": formatted_upload_time,
            "upload_timestamp_iso": r.upload_timestamp.isoformat() if r.upload_timestamp else None,
            "findings_summary": meta_json.get("findings_summary")
        })
    return out

@router.get("/{report_id}")
def get_report_detail(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rep = db.query(ReportFile).filter(ReportFile.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Report file not found.")
    return {
        "id": rep.id,
        "filename": rep.filename,
        "report_name": rep.report_name,
        "report_description": rep.report_description,
        "time_range": rep.time_range,
        "validation_status": rep.validation_status,
        "metadata_json": rep.metadata_json
    }

@router.delete("/{report_id}", dependencies=[Depends(require_role(["admin"]))])
def delete_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rep = db.query(ReportFile).filter(ReportFile.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Report file not found.")
    db.delete(rep)
    db.commit()
    return {"message": f"Report ID {report_id} deleted."}

@router.get("/backups/list")
def get_backups_list(current_user: User = Depends(get_current_user)):
    return list_backups()

@router.get("/backups/download/{filename}")
def download_backup_file(filename: str, current_user: User = Depends(get_current_user)):
    safe_name = os.path.basename(filename)
    path = os.path.join(BACKUP_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Backup file not found.")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=safe_name
    )
