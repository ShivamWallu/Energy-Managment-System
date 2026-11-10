import secrets
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.database import get_db
from backend.app.models import User, OtpVerification
from backend.app.auth import verify_password, get_password_hash, create_access_token, get_current_user
from backend.app.activity_logger import log_activity
from backend.app.email_service import send_otp_email, send_welcome_registration_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str # Accepts username OR email
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class RequestOtpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    confirm_password: Optional[str] = None

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp_code: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str
    confirm_password: str

@router.post("/login", response_model=TokenResponse)
def login(credentials: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    clean_login = credentials.username.strip()

    # Search by either username OR email
    user = db.query(User).filter(
        or_(
            User.username == clean_login,
            User.email == clean_login.lower()
        )
    ).first()
    
    if not user:
        log_activity(
            db=db,
            activity_type="USER_LOGIN",
            description=f"Login attempt for unregistered account '{clean_login}'.",
            username=clean_login,
            email=clean_login if "@" in clean_login else "—",
            status="FAILED",
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No account found with '{clean_login}'. Please create an account to get started.",
            headers={"X-User-Exists": "false"}
        )

    if not verify_password(credentials.password, user.hashed_password):
        log_activity(
            db=db,
            activity_type="USER_LOGIN",
            description=f"Failed login attempt for '{clean_login}'. Incorrect password.",
            username=user.username,
            email=user.email,
            status="FAILED",
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please verify your password or use 'Forgot Password'.",
            headers={"WWW-Authenticate": "Bearer", "X-User-Exists": "true"},
        )

    # Check if account is blocked by Administrator
    if not user.is_active:
        log_activity(
            db=db,
            activity_type="USER_LOGIN",
            description=f"Login rejected: account '{user.email or user.username}' is blocked by Administrator.",
            user_id=user.id,
            username=user.full_name or user.username,
            email=user.email,
            status="FAILED",
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been blocked by the Administrator. Please contact system admin for access."
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    
    # Audit log successful user login
    log_activity(
        db=db,
        activity_type="USER_LOGIN",
        description=f"User '{user.full_name or user.username}' ({user.role.upper()}) logged in successfully.",
        user_id=user.id,
        username=user.full_name or user.username,
        email=user.email,
        status="SUCCESS",
        ip_address=ip
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }

@router.post("/register/request-otp")
def request_registration_otp(req: RequestOtpRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    clean_email = req.email.strip().lower()
    clean_name = req.name.strip()

    # Prevent duplicate registrations using unique email validation
    existing_user = db.query(User).filter(User.email == clean_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{clean_email}' is already registered. Please sign in or contact administrator."
        )

    if req.confirm_password and req.password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match. Please verify and re-enter."
        )

    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    # Generate secure 6-digit OTP
    otp = f"{secrets.randbelow(900000) + 100000}"
    expires = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)

    # Invalidate previous unverified OTPs for this email
    db.query(OtpVerification).filter(
        OtpVerification.email == clean_email,
        OtpVerification.is_verified == False
    ).delete()

    # Store pending OTP verification
    otp_record = OtpVerification(
        email=clean_email,
        name=clean_name,
        password_hash=get_password_hash(req.password),
        otp_code=otp,
        created_at=datetime.datetime.utcnow(),
        expires_at=expires,
        is_verified=False
    )
    db.add(otp_record)
    db.commit()

    # Dispatch corporate branded email
    email_res = send_otp_email(
        to_email=clean_email,
        recipient_name=clean_name,
        otp_code=otp
    )

    return {
        "message": f"Verification code sent to {clean_email}. Valid for 10 minutes.",
        "email": clean_email,
        "channel": email_res.get("channel"),
        "demo_otp": otp # Used by automated test runners
    }

@router.post("/register/verify-otp")
def verify_registration_otp(req: VerifyOtpRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    clean_email = req.email.strip().lower()
    clean_otp = req.otp_code.strip()

    otp_record = db.query(OtpVerification).filter(
        OtpVerification.email == clean_email,
        OtpVerification.is_verified == False
    ).order_by(OtpVerification.id.desc()).first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending OTP request found for this email. Please request a new verification code."
        )

    now = datetime.datetime.utcnow()
    if otp_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired (10 minutes elapsed). Please request a fresh code."
        )

    if otp_record.otp_code != clean_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your email and try again."
        )

    # Prevent duplicate account creation
    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{clean_email}' has already been registered."
        )

    # Generate unique username from email prefix
    base_uname = clean_email.split("@")[0].replace(".", "_")
    uname = base_uname
    counter = 1
    while db.query(User).filter(User.username == uname).first():
        uname = f"{base_uname}{counter}"
        counter += 1

    new_user = User(
        username=uname,
        email=clean_email,
        full_name=otp_record.name,
        hashed_password=otp_record.password_hash,
        role="auditor",
        is_active=True,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_user)
    otp_record.is_verified = True
    db.commit()
    db.refresh(new_user)

    # Dispatch official welcome & activation email to user
    try:
        send_welcome_registration_email(
            to_email=new_user.email,
            recipient_name=new_user.full_name or new_user.username,
            username=new_user.username,
            role=new_user.role
        )
    except Exception as email_err:
        print(f"[AuthRouter] Warning: Could not deliver welcome email: {email_err}")

    # Automatically record activity log
    log_activity(
        db=db,
        activity_type="NEW_REGISTRATION",
        description=f"New user account registered and OTP verified: '{new_user.full_name}' ({new_user.email}, Role: AUDITOR). Added to Accounts registry.",
        user_id=new_user.id,
        username=new_user.full_name or new_user.username,
        email=new_user.email,
        status="SUCCESS",
        ip_address=ip
    )

    # Create immediate login token
    access_token = create_access_token(data={"sub": new_user.username, "role": new_user.role})

    return {
        "message": f"Account '{new_user.full_name}' successfully verified and activated!",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role
        }
    }

@router.post("/forgot-password/request-otp")
def request_password_reset_otp(req: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    clean_email = req.email.strip().lower()

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No account found associated with email '{clean_email}'. Please verify your email or register."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked by the Administrator. Please contact plant IT administration."
        )

    # Invalidate previous unverified reset OTPs for this email
    db.query(OtpVerification).filter(
        OtpVerification.email == clean_email,
        OtpVerification.is_verified == False
    ).delete()

    otp = f"{secrets.randbelow(900000) + 100000}"
    expires = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)

    otp_record = OtpVerification(
        email=clean_email,
        name="PASSWORD_RESET",
        password_hash="RESET_PENDING",
        otp_code=otp,
        created_at=datetime.datetime.utcnow(),
        expires_at=expires,
        is_verified=False
    )
    db.add(otp_record)
    db.commit()

    email_res = send_otp_email(
        to_email=clean_email,
        recipient_name=user.full_name or user.username,
        otp_code=otp,
        action="PASSWORD_RESET"
    )

    log_activity(
        db=db,
        activity_type="PASSWORD_RESET_OTP",
        description=f"Password reset verification OTP dispatched to '{user.email}' ({user.full_name or user.username}).",
        user_id=user.id,
        username=user.full_name or user.username,
        email=user.email,
        status="SUCCESS",
        ip_address=ip
    )

    return {
        "message": f"Password reset verification code dispatched to {clean_email}.",
        "email": clean_email,
        "channel": email_res.get("channel"),
        "demo_otp": otp
    }

@router.post("/forgot-password/reset")
def reset_password(req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    clean_email = req.email.strip().lower()
    clean_otp = req.otp_code.strip()

    if req.new_password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match. Please verify and re-enter."
        )

    if len(req.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long."
        )

    otp_record = db.query(OtpVerification).filter(
        OtpVerification.email == clean_email,
        OtpVerification.name == "PASSWORD_RESET",
        OtpVerification.is_verified == False
    ).order_by(OtpVerification.id.desc()).first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active password reset request found for this email. Please request a new verification code."
        )

    now = datetime.datetime.utcnow()
    if otp_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired (10 minutes elapsed). Please request a fresh reset code."
        )

    if otp_record.otp_code != clean_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your email and try again."
        )

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    user.hashed_password = get_password_hash(req.new_password)
    otp_record.is_verified = True
    db.commit()

    log_activity(
        db=db,
        activity_type="PASSWORD_RESET_SUCCESS",
        description=f"Password for user '{user.full_name or user.username}' ({user.email}) was updated successfully via OTP verification.",
        user_id=user.id,
        username=user.full_name or user.username,
        email=user.email,
        status="SUCCESS",
        ip_address=ip
    )

    return {
        "message": "Password updated successfully! You can now log in with your new password.",
        "email": clean_email
    }

@router.post("/logout")
def logout(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "127.0.0.1"
    log_activity(
        db=db,
        activity_type="USER_LOGOUT",
        description=f"User '{current_user.full_name or current_user.username}' logged out securely.",
        user_id=current_user.id,
        username=current_user.full_name or current_user.username,
        email=current_user.email,
        status="SUCCESS",
        ip_address=ip
    )
    return {"message": "Logged out successfully."}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role
    }

