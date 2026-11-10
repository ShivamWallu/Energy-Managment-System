import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import User, ReportFile, ShiftCalculation
from backend.app.auth import get_current_user

router = APIRouter(prefix="/export", tags=["Exports & Reporting"])

@router.get("/csv")
def export_shift_csv(
    report_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rep = db.query(ReportFile).filter(ReportFile.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found.")
        
    calcs = db.query(ShiftCalculation).filter(ShiftCalculation.report_file_id == report_id).order_by(ShiftCalculation.col_index.asc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "Column Index", "Source Name", "Location", "Motor HP", "Rated 15m kWh",
        "Calculated Sum (kWh)", "Excel Reported Sum", "Verification Diff", "Sum Verified",
        "Calculated Avg (kWh)", "Excel Reported Avg", "Calculated Min", "Calculated Max",
        "Valid Intervals", "Zero Intervals", "Blank/Breakdown Intervals", "Overload Events", "Idle Events", "Avg Load %"
    ])
    
    for c in calcs:
        writer.writerow([
            c.col_index, c.source_name, c.location, c.motor_hp or "", c.rated_15m_kwh or "",
            c.calc_sum, c.excel_sum or "", c.verification_diff, "YES" if c.sum_verified else "NO",
            c.calc_avg, c.excel_avg or "", c.calc_min, c.calc_max,
            c.count_valid, c.count_zero, c.count_blank, c.count_overload, c.count_idle, c.avg_load_pct or ""
        ])
        
    output.seek(0)
    filename = f"EMS_Shift_Audit_{rep.report_name or rep.id}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

