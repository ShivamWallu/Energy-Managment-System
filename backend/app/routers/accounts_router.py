import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.database import get_db
from backend.app.models import User, ActivityLog
from backend.app.auth import get_current_user, require_role
from backend.app.activity_logger import log_activity

router = APIRouter(prefix="/accounts", tags=["User Accounts Management"])

# Indian Standard Time (IST = UTC + 05:30) for local plant telemetry
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def to_ist(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(IST)

@router.get("", dependencies=[Depends(require_role(["admin"]))])
def list_accounts(
    page: int = Query(1, ge=1, description="Page number"),
    limit: Optional[int] = Query(10, ge=1, le=100, description="Items per page (default 10)"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    status_filter: Optional[str] = Query("ALL", description="Filter by status: ALL, ACTIVE, BLOCKED"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin-only endpoint listing all registered plant accounts with IST registration date, status, and pagination.
    """
    query = db.query(User)

    if status_filter and status_filter.upper() == "ACTIVE":
        query = query.filter(User.is_active == True)
    elif status_filter and status_filter.upper() == "BLOCKED":
        query = query.filter(User.is_active == False)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.username.ilike(term),
                User.email.ilike(term),
                User.role.ilike(term)
            )
        )

    total_records = query.count()
    
    # Pagination calculation
    page_limit = limit if limit and limit > 0 else 10
    total_pages = max(1, (total_records + page_limit - 1) // page_limit)
    offset = (page - 1) * page_limit
    
    users = query.order_by(User.id.desc()).offset(offset).limit(page_limit).all()

    items = []
    for u in users:
        # Convert created_at to accurate Indian Standard Time (IST)
        ist_dt = to_ist(u.created_at)
        reg_date_str = ist_dt.strftime("%d/%m/%Y, %I:%M %p") if ist_dt else "—"
        items.append({
            "id": u.id,
            "name": u.full_name or u.username,
            "email": u.email,
            "username": u.username,
            "role": u.role,
            "registration_date": reg_date_str,
            "created_at_iso": ist_dt.isoformat() if ist_dt else None,
            "status": "ACTIVE" if u.is_active else "BLOCKED",
            "is_active": u.is_active,
            "is_current_admin": (u.id == current_user.id)
        })

    return {
        "total": total_records,
        "page": page,
        "limit": page_limit,
        "total_pages": total_pages,
        "items": items
    }

@router.post("/{user_id}/toggle-status", dependencies=[Depends(require_role(["admin"]))])
def toggle_account_status(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Allows Admin to block or unblock any registered account.
    Blocked users are strictly prevented from logging into the platform.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block your own active administrator account.")

    # Toggle status
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    action_label = "unblocked" if user.is_active else "blocked"
    status_label = "ACTIVE" if user.is_active else "BLOCKED"

    # Automatically log admin action
    log_activity(
        db=db,
        activity_type="USER_ACCOUNT_BLOCKED" if not user.is_active else "USER_ACCOUNT_UNBLOCKED",
        description=f"Administrator '{current_user.full_name or current_user.username}' {action_label} account: '{user.full_name or user.username}' ({user.email}). Account status changed to {status_label}.",
        user_id=current_user.id,
        username=current_user.full_name or current_user.username,
        email=current_user.email,
        status="WARNING" if not user.is_active else "SUCCESS"
    )

    return {
        "message": f"Account '{user.full_name or user.username}' is now {status_label}.",
        "user_id": user.id,
        "is_active": user.is_active,
        "status": status_label
    }

@router.delete("/{user_id}", dependencies=[Depends(require_role(["admin"]))])
def delete_account(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Allows Admin to permanently delete any user account from the system registry.
    Strictly restricted to Administrators.
    Admin cannot delete their own active account.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Security Violation: Cannot delete your own active administrator account.")

    del_name = user.full_name or user.username
    del_username = user.username
    del_email = user.email

    # Disassociate foreign key references in ActivityLog if any
    db.query(ActivityLog).filter(ActivityLog.user_id == user.id).update({"user_id": None})
    
    db.delete(user)
    db.commit()

    # Log permanent account deletion in Audit Trail
    log_activity(
        db=db,
        activity_type="USER_ACCOUNT_DELETED",
        description=f"Administrator '{current_user.full_name or current_user.username}' permanently deleted account '{del_name}' (@{del_username}, {del_email}).",
        user_id=current_user.id,
        username=current_user.full_name or current_user.username,
        email=current_user.email,
        status="WARNING"
    )

    return {
        "message": f"Account '{del_name}' (@{del_username}) has been permanently deleted from plant registry.",
        "user_id": user_id
    }


