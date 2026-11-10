import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from backend.app.models import ActivityLog, User

def log_activity(
    db: Session,
    activity_type: str,
    description: str,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    email: Optional[str] = None,
    status: str = "SUCCESS",
    ip_address: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None
) -> ActivityLog:
    """
    Records an immutable audit activity log entry in the database.
    Catches any exceptions to ensure main business logic is never blocked.
    """
    try:
        # If user_id provided but missing username/email, fetch from User
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                if not username:
                    username = user.full_name or user.username
                if not email:
                    email = user.email

        log_entry = ActivityLog(
            user_id=user_id,
            username=username or "System / Anonymous",
            email=email or "—",
            activity_type=activity_type,
            description=description,
            timestamp=datetime.datetime.utcnow(),
            status=status,
            ip_address=ip_address or "127.0.0.1",
            metadata_json=metadata_json
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as e:
        db.rollback()
        print(f"[ActivityLogger Error] Failed to write log: {e}")
        return None

