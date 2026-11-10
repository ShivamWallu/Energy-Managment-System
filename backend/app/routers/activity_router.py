import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

from backend.app.database import get_db
from backend.app.models import ActivityLog, User
from backend.app.auth import get_current_user, require_role

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs & Audit Trail"])

# Indian Standard Time (IST = UTC + 05:30) for local plant telemetry
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def to_ist(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(IST)

ACTIVITY_TYPE_LABELS = {
    "USER_LOGIN": "User Login",
    "USER_LOGOUT": "User Logout",
    "NEW_REGISTRATION": "New Registration",
    "EXCEL_UPLOAD": "Excel Upload",
    "INVALID_EXCEL_UPLOAD": "Invalid Excel Upload",
}

@router.get("", dependencies=[Depends(require_role(["admin"]))])
def get_activity_logs(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search keyword"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort_by: str = Query("timestamp", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Secure admin-only activity audit log endpoint with pagination, search, sorting, and filtering.
    Restricted strictly to administrators.
    """
    query = db.query(ActivityLog)

    # Filter: Activity Type
    if activity_type and activity_type.upper() != "ALL":
        query = query.filter(ActivityLog.activity_type == activity_type.upper())

    # Filter: Status
    if status and status.upper() != "ALL":
        query = query.filter(ActivityLog.status == status.upper())

    # Search: across username, email, description, and status
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ActivityLog.username.ilike(term),
                ActivityLog.email.ilike(term),
                ActivityLog.description.ilike(term),
                ActivityLog.activity_type.ilike(term),
                ActivityLog.status.ilike(term)
            )
        )

    # Total count matching criteria
    total_records = query.count()

    # Sorting
    sort_col = getattr(ActivityLog, sort_by, ActivityLog.timestamp)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    # Pagination
    total_pages = max(1, (total_records + limit - 1) // limit)
    offset = (page - 1) * limit
    logs = query.offset(offset).limit(limit).all()

    items = []
    for log in logs:
        # Strictly format Date & Time in accurate Indian Standard Time (IST) as DD/MM/YYYY, hh:mm:ss A
        ist_dt = to_ist(log.timestamp)
        dt_str = ist_dt.strftime("%d/%m/%Y, %I:%M:%S %p") if ist_dt else "—"
        type_label = ACTIVITY_TYPE_LABELS.get(log.activity_type, log.activity_type.replace("_", " ").title())

        items.append({
            "id": log.id,
            "user_name": log.username,
            "email": log.email or "—",
            "activity_type": log.activity_type,
            "activity_type_label": type_label,
            "description": log.description,
            "date_time": dt_str,
            "timestamp_iso": ist_dt.isoformat() if ist_dt else None,
            "status": log.status,
            "ip_address": log.ip_address or "127.0.0.1",
            "metadata": log.metadata_json or {}
        })

    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "items": items
    }

@router.get("/summary", dependencies=[Depends(require_role(["admin"]))])
def get_activity_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns high-level activity telemetry metrics for admin dashboard.
    """
    total = db.query(ActivityLog).count()
    logins = db.query(ActivityLog).filter(ActivityLog.activity_type == "USER_LOGIN").count()
    logouts = db.query(ActivityLog).filter(ActivityLog.activity_type == "USER_LOGOUT").count()
    registrations = db.query(ActivityLog).filter(ActivityLog.activity_type == "NEW_REGISTRATION").count()
    uploads = db.query(ActivityLog).filter(ActivityLog.activity_type == "EXCEL_UPLOAD").count()
    invalid_uploads = db.query(ActivityLog).filter(ActivityLog.activity_type == "INVALID_EXCEL_UPLOAD").count()

    return {
        "total_activities": total,
        "total_logins": logins,
        "total_logouts": logouts,
        "total_registrations": registrations,
        "total_uploads": uploads,
        "total_invalid_uploads": invalid_uploads
    }

