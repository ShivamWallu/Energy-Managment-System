import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from backend.app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(String(20), default="auditor", nullable=False) # admin, manager, auditor
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    reports = relationship("ReportFile", back_populates="uploaded_by_user")

class ReportFile(Base):
    __tablename__ = "report_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), index=True, nullable=False)
    report_name = Column(String(100), nullable=True)
    report_description = Column(String(255), nullable=True)
    report_type = Column(String(50), nullable=True)
    trigger_type = Column(String(50), nullable=True)
    created_by_in_report = Column(String(100), nullable=True)
    report_created_on = Column(String(50), nullable=True)
    time_range = Column(String(100), nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    upload_timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    
    total_intervals = Column(Integer, default=0)
    total_columns = Column(Integer, default=0)
    validation_status = Column(String(20), default="PENDING") # VALID, WARNINGS, ANOMALIES_DETECTED
    
    # Store complete metadata summary as JSON for lightning-fast retrieval
    metadata_json = Column(JSON, nullable=True)

    uploaded_by_user = relationship("User", back_populates="reports")
    raw_readings = relationship("RawReading", back_populates="report_file", cascade="all, delete-orphan")
    findings = relationship("ValidationFinding", back_populates="report_file", cascade="all, delete-orphan")
    metrics = relationship("ShiftCalculation", back_populates="report_file", cascade="all, delete-orphan")

class RawReading(Base):
    __tablename__ = "raw_readings"

    id = Column(Integer, primary_key=True, index=True)
    report_file_id = Column(Integer, ForeignKey("report_files.id"), index=True, nullable=False)
    interval_index = Column(Integer, nullable=False) # 0 to 47
    timestamp_str = Column(String(30), nullable=False)
    timestamp = Column(DateTime, nullable=True, index=True)
    col_index = Column(Integer, nullable=False, index=True)
    source_name = Column(String(100), nullable=False, index=True)
    location = Column(String(100), nullable=True)
    measurement_point = Column(String(50), nullable=True)
    unit = Column(String(20), default="kWh")
    
    # Exact original string preserved as in source file
    raw_value_str = Column(String(50), nullable=False)
    numeric_value = Column(Float, nullable=True) # None if empty/blank
    cell_style = Column(String(50), nullable=True) # e.g. 'green', 'soft_red', 'normal'
    is_duplicate_col = Column(Boolean, default=False)

    report_file = relationship("ReportFile", back_populates="raw_readings")

class ValidationFinding(Base):
    __tablename__ = "validation_findings"

    id = Column(Integer, primary_key=True, index=True)
    report_file_id = Column(Integer, ForeignKey("report_files.id"), index=True, nullable=False)
    severity = Column(String(20), nullable=False) # CRITICAL, WARNING, INFO
    category = Column(String(50), nullable=False) # DUPLICATE_COL, OVERLOAD, IDLE, TELEMETRY_SPIKE, BREAKDOWN, SUM_DISCREPANCY
    source_name = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)
    timestamp_str = Column(String(30), nullable=True)
    row_num = Column(Integer, nullable=True)
    col_num = Column(Integer, nullable=True)
    observed_value = Column(String(50), nullable=True)
    expected_range = Column(String(50), nullable=True)
    explanation = Column(Text, nullable=False)

    report_file = relationship("ReportFile", back_populates="findings")

class ShiftCalculation(Base):
    __tablename__ = "shift_calculations"

    id = Column(Integer, primary_key=True, index=True)
    report_file_id = Column(Integer, ForeignKey("report_files.id"), index=True, nullable=False)
    col_index = Column(Integer, nullable=False, index=True)
    source_name = Column(String(100), nullable=False)
    location = Column(String(100), nullable=True)
    motor_hp = Column(Integer, nullable=True)
    rated_15m_kwh = Column(Float, nullable=True)
    
    # Pre-existing values from original Excel summary rows
    excel_min = Column(String(30), nullable=True)
    excel_max = Column(String(30), nullable=True)
    excel_avg = Column(String(30), nullable=True)
    excel_sum = Column(String(30), nullable=True)
    
    # Calculated strictly from raw 15-minute intervals
    calc_min = Column(Float, nullable=True)
    calc_max = Column(Float, nullable=True)
    calc_avg = Column(Float, nullable=True)
    calc_sum = Column(Float, nullable=True)
    
    count_valid = Column(Integer, default=0)
    count_zero = Column(Integer, default=0)
    count_blank = Column(Integer, default=0)
    count_overload = Column(Integer, default=0)
    count_idle = Column(Integer, default=0)
    avg_load_pct = Column(Float, nullable=True)
    
    sum_verified = Column(Boolean, default=False)
    verification_diff = Column(Float, default=0.0)

    report_file = relationship("ReportFile", back_populates="metrics")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=False)
    email = Column(String(150), nullable=True)
    activity_type = Column(String(50), index=True, nullable=False) # USER_LOGIN, USER_LOGOUT, NEW_REGISTRATION, EXCEL_UPLOAD, INVALID_EXCEL_UPLOAD
    description = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    status = Column(String(20), default="SUCCESS", index=True) # SUCCESS, FAILED, WARNING
    ip_address = Column(String(50), nullable=True)
    metadata_json = Column(JSON, nullable=True)

    user = relationship("User", backref="activity_logs")

class OtpVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), index=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    otp_code = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_verified = Column(Boolean, default=False)


