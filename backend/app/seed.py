import os
import hashlib
from sqlalchemy.orm import Session
from backend.app.database import engine, SessionLocal, Base
from backend.app.models import User, ReportFile, RawReading, ValidationFinding, ShiftCalculation, ActivityLog
from backend.app.auth import get_password_hash
from backend.app.excel_parser import parse_ems_excel_file
from backend.app.engine import compute_plant_energy_balance
import datetime

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    
    try:
        # 1. Seed Default Users
        users = [
            ("admin", "admin@emsintelligence.io", "AdminPassword2026!", "System Administrator", "admin"),
            ("manager", "manager@emsintelligence.io", "ManagerPassword2026!", "Plant Operations Manager", "manager"),
            ("auditor", "auditor@emsintelligence.io", "AuditorPassword2026!", "Energy Auditor & Inspector", "auditor")
        ]
        
        for username, email, pwd, name, role in users:
            existing = db.query(User).filter(User.username == username).first()
            if not existing:
                u = User(
                    username=username,
                    email=email,
                    hashed_password=get_password_hash(pwd),
                    full_name=name,
                    role=role,
                    is_active=True
                )
                db.add(u)
        db.commit()
        print("Default users seeded.")


        # 2. Sample reports auto-seeding is disabled so user has a 100% clean dashboard for their own Excel uploads
        pass

        # 3. Seed Realistic Audit Activity Logs if empty
        if db.query(ActivityLog).count() == 0:
            print("Seeding initial audit activity logs...")
            now = datetime.datetime.utcnow()
            initial_logs = [
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="NEW_REGISTRATION",
                    description="Root administrator account initialized with system role 'ADMIN'.",
                    timestamp=now - datetime.timedelta(days=9, hours=4),
                    status="SUCCESS",
                    ip_address="127.0.0.1"
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="USER_LOGIN",
                    description="User 'System Administrator' (ADMIN) logged in successfully.",
                    timestamp=now - datetime.timedelta(days=9, hours=3, minutes=45),
                    status="SUCCESS",
                    ip_address="127.0.0.1"
                ),
                ActivityLog(
                    user_id=2,
                    username="Plant Operations Manager",
                    email="manager@emsintelligence.io",
                    activity_type="NEW_REGISTRATION",
                    description="Operations account registered for 'Plant Operations Manager' (Role: MANAGER).",
                    timestamp=now - datetime.timedelta(days=8, hours=2),
                    status="SUCCESS",
                    ip_address="192.168.1.104"
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="EXCEL_UPLOAD",
                    description="Excel Shift Report 'Reports_Shift_110232026_7_00 PM.XLSX' uploaded and validated (48 intervals, 59 core columns, ANOMALIES_DETECTED). Total Energy: 7,867.0 kWh.",
                    timestamp=now - datetime.timedelta(days=8, hours=1, minutes=20),
                    status="SUCCESS",
                    ip_address="127.0.0.1",
                    metadata_json={"filename": "Reports_Shift_110232026_7_00 PM.XLSX", "report_id": 1, "intervals": 48}
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="EXCEL_UPLOAD",
                    description="Excel Shift Report 'Reports_Shift_210242026_7_00 AM.XLSX' uploaded and validated (48 intervals, 59 core columns, WARNINGS). Total Energy: 8,098.0 kWh.",
                    timestamp=now - datetime.timedelta(days=7, hours=6),
                    status="SUCCESS",
                    ip_address="127.0.0.1",
                    metadata_json={"filename": "Reports_Shift_210242026_7_00 AM.XLSX", "report_id": 2, "intervals": 48}
                ),
                ActivityLog(
                    user_id=2,
                    username="Plant Operations Manager",
                    email="manager@emsintelligence.io",
                    activity_type="USER_LOGIN",
                    description="User 'Plant Operations Manager' (MANAGER) logged in successfully.",
                    timestamp=now - datetime.timedelta(days=6, hours=5),
                    status="SUCCESS",
                    ip_address="192.168.1.104"
                ),
                ActivityLog(
                    user_id=2,
                    username="Plant Operations Manager",
                    email="manager@emsintelligence.io",
                    activity_type="INVALID_EXCEL_UPLOAD",
                    description="Invalid Excel upload failed for 'Shift_Summary_Draft_Unsorted.xlsx'. Column Sequence Mismatch at Column B (Col #2): Expected 'INC EXPELLER 1', but found 'TOTAL_PLANT_METER'.",
                    timestamp=now - datetime.timedelta(days=6, hours=4, minutes=12),
                    status="FAILED",
                    ip_address="192.168.1.104",
                    metadata_json={"filename": "Shift_Summary_Draft_Unsorted.xlsx", "error": "Column Sequence Mismatch at Column B (Col #2)"}
                ),
                ActivityLog(
                    user_id=2,
                    username="Plant Operations Manager",
                    email="manager@emsintelligence.io",
                    activity_type="USER_LOGOUT",
                    description="User 'Plant Operations Manager' logged out securely.",
                    timestamp=now - datetime.timedelta(days=6, hours=3, minutes=30),
                    status="SUCCESS",
                    ip_address="192.168.1.104"
                ),
                ActivityLog(
                    user_id=3,
                    username="Energy Auditor & Inspector",
                    email="auditor@emsintelligence.io",
                    activity_type="NEW_REGISTRATION",
                    description="Auditor account registered for 'Energy Auditor & Inspector' (Role: AUDITOR).",
                    timestamp=now - datetime.timedelta(days=4, hours=8),
                    status="SUCCESS",
                    ip_address="192.168.1.115"
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="EXCEL_UPLOAD",
                    description="Excel Shift Report 'Reports_Shift_11142026_7_00 PM.XLSX' uploaded and validated (48 intervals, 59 columns, ANOMALIES_DETECTED). Total Energy: 7,213.0 kWh.",
                    timestamp=now - datetime.timedelta(days=1, hours=3),
                    status="SUCCESS",
                    ip_address="127.0.0.1",
                    metadata_json={"filename": "Reports_Shift_11142026_7_00 PM.XLSX", "report_id": 3, "intervals": 48}
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="EXCEL_UPLOAD",
                    description="Excel Shift Report 'Reports_Shift_21152026_7_00 AM.XLSX' uploaded and validated (48 intervals, 59 columns, ANOMALIES_DETECTED). Total Energy: 7,857.0 kWh.",
                    timestamp=now - datetime.timedelta(hours=14),
                    status="SUCCESS",
                    ip_address="127.0.0.1",
                    metadata_json={"filename": "Reports_Shift_21152026_7_00 AM.XLSX", "report_id": 4, "intervals": 48}
                ),
                ActivityLog(
                    user_id=1,
                    username="System Administrator",
                    email="admin@emsintelligence.io",
                    activity_type="USER_LOGIN",
                    description="User 'System Administrator' (ADMIN) logged in successfully from secure terminal.",
                    timestamp=now - datetime.timedelta(minutes=45),
                    status="SUCCESS",
                    ip_address="127.0.0.1"
                )
            ]
            db.bulk_save_objects(initial_logs)
            db.commit()
            print("Audit activity logs seeded successfully.")
                
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
