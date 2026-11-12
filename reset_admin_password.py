import sys
import os

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.app.database import SessionLocal
from backend.app.models import User
from backend.app.auth import get_password_hash

def change_admin_password(new_password: str):
    if not new_password or len(new_password) < 6:
        print("[ERROR] Password must be at least 6 characters long.")
        sys.exit(1)
        
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            print("[INFO] 'admin' user not found in database. Creating root admin account...")
            admin_user = User(
                username="admin",
                email="admin@emsintelligence.io",
                hashed_password=get_password_hash(new_password),
                full_name="System Administrator",
                role="admin",
                is_active=True
            )
            db.add(admin_user)
        else:
            admin_user.hashed_password = get_password_hash(new_password)
            admin_user.is_active = True
            
        db.commit()
        print(f"[SUCCESS] Admin password successfully updated to: {new_password}")
        print("[SUCCESS] You can now log in at https://ems.khandelia.online/ with:")
        print("          Username: admin")
        print(f"          Password: {new_password}")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to update admin password: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        pwd = sys.argv[1].strip()
    else:
        pwd = "Admin@Mashal2026!"
    change_admin_password(pwd)

