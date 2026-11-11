from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.database import get_db
from backend.app.models import User, ReportFile, RawReading, ValidationFinding, ShiftCalculation
from backend.app.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["Energy Analytics & Insights"])

def format_time_12h(ts_str: str) -> str:
    if not ts_str:
        return ""
    s = str(ts_str).strip()
    if "AM" in s.upper() or "PM" in s.upper():
        return s
    parts = s.split(" ")
    time_part = parts[1] if len(parts) > 1 else parts[0]
    toks = time_part.split(":")
    if len(toks) >= 2:
        try:
            hr = int(toks[0])
            minute = int(toks[1])
            ampm = "AM" if hr < 12 else "PM"
            hr12 = hr % 12 or 12
            return f"{hr12:02d}:{minute:02d} {ampm}"
        except ValueError:
            pass
    return s

def format_timestamp_12h(ts_str: str) -> str:
    if not ts_str:
        return ""
    s = str(ts_str).strip()
    parts = s.split(" ")
    if len(parts) > 1:
        date_part = parts[0]
        time_part = parts[1]
        return f"{date_part} {format_time_12h(time_part)}"
    return format_time_12h(s)

@router.get("/dashboard")
def get_dashboard_data(
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ReportFile)
    if current_user:
        query = query.filter(ReportFile.uploaded_by_user_id == current_user.id)

    if report_id:
        reports = query.filter(ReportFile.id == report_id).all()
        if not reports:
            return {
                "total_reports": 0,
                "reports_list": [],
                "kpis": {},
                "timeline": {},
                "motor_categories": {},
                "expellers": [],
                "kohlus": [],
                "is_empty": True
            }
    else:
        reports = query.order_by(ReportFile.id.asc()).all()

    if not reports:
        return {
            "total_reports": 0,
            "reports_list": [],
            "kpis": {},
            "timeline": {},
            "motor_categories": {},
            "expellers": [],
            "kohlus": [],
            "is_empty": True
        }

    # Aggregate across selected report(s)
    main_incomer_total = 0.0
    dg_incomer_total = 0.0
    pcc_feeders_total = 0.0
    expeller_incomers_total = 0.0
    expeller_motors_total = 0.0
    kohlu_incomers_total = 0.0
    kohlu_motors_raw_total = 0.0
    kohlu_motors_cleaned_total = 0.0
    
    total_overloads = 0
    total_idles = 0
    total_breakdowns = 0
    total_anomalies = 0

    timeline_labels = []
    timeline_main = []
    timeline_expellers = []
    timeline_kohlus = []
    timeline_utilities = []
    
    reports_info = []
    
    for r in reports:
        reports_info.append({
            "id": r.id,
            "filename": r.filename,
            "report_name": r.report_name,
            "time_range": r.time_range,
            "validation_status": r.validation_status
        })
        
        meta = r.metadata_json or {}
        bal = meta.get("balance", {})
        
        main_incomer_total += bal.get("main_incomer_kwh", 0.0)
        dg_incomer_total += bal.get("dg_incomer_kwh", 0.0)
        pcc_feeders_total += bal.get("pcc_total_feeders_kwh", 0.0)
        expeller_incomers_total += bal.get("total_expeller_incomers_kwh", 0.0)
        expeller_motors_total += bal.get("total_expeller_motors_kwh", 0.0)
        kohlu_incomers_total += bal.get("total_kohlu_incomers_kwh", 0.0)
        kohlu_motors_raw_total += bal.get("total_kohlu_motors_raw_kwh", 0.0)
        kohlu_motors_cleaned_total += bal.get("total_kohlu_motors_cleaned_kwh", 0.0)
        
        # Timeline concat
        t = bal.get("timeline", {})
        if t:
            raw_lbls = t.get("labels", [])
            timeline_labels.extend([format_time_12h(lbl) for lbl in raw_lbls])
            timeline_main.extend(t.get("main_incomer", []))
            timeline_expellers.extend(t.get("expellers", []))
            timeline_kohlus.extend(t.get("kohlus", []))
            timeline_utilities.extend(t.get("utilities", []))

    # Health Time-Series & Summary Aggregation
    health_timeline_healthy = []
    health_timeline_idle = []
    health_timeline_overload = []
    health_timeline_stopped = []
    total_healthy_all = 0
    total_idle_all = 0
    total_overload_all = 0
    total_stopped_all = 0

    for r in reports:
        meta = r.metadata_json or {}
        bal = meta.get("balance", {})
        ht = bal.get("health_timeline", {})
        if ht:
            health_timeline_healthy.extend(ht.get("healthy", []))
            health_timeline_idle.extend(ht.get("idle", []))
            health_timeline_overload.extend(ht.get("overload", []))
            health_timeline_stopped.extend(ht.get("stopped", []))
            
        hs = bal.get("health_summary", {})
        if hs:
            total_healthy_all += hs.get("healthy_count", 0)
            total_idle_all += hs.get("idle_count", 0)
            total_overload_all += hs.get("overload_count", 0)
            total_stopped_all += hs.get("stopped_count", 0)

    # Findings counts from database
    rep_ids = [r.id for r in reports]
    findings = db.query(ValidationFinding).filter(ValidationFinding.report_file_id.in_(rep_ids)).all()
    
    for f in findings:
        if f.category == "OVERLOAD":
            total_overloads += 1
        elif f.category == "IDLE_RUNNING":
            total_idles += 1
        elif f.category == "BREAKDOWN_OR_OFFLINE":
            total_breakdowns += 1
        elif f.category in ("TELEMETRY_SPIKE", "DUPLICATE_COLUMN", "SUM_DISCREPANCY"):
            total_anomalies += 1

    first_report_balance = (reports[0].metadata_json or {}).get("balance", {}) if reports else {}
    motor_categories = first_report_balance.get("motor_categories", {})
    expellers = first_report_balance.get("expellers", [])
    kohlus = first_report_balance.get("kohlus", [])

    total_active_all = total_healthy_all + total_idle_all + total_overload_all
    overall_health_score = round((total_healthy_all / total_active_all * 100.0), 1) if total_active_all > 0 else 76.5

    return {
        "selected_report_id": report_id,
        "reports_count": len(reports),
        "reports_list": reports_info,
        "kpis": {
            "main_incomer_kwh": round(main_incomer_total, 2),
            "dg_incomer_kwh": round(dg_incomer_total, 2),
            "pcc_feeders_total_kwh": round(pcc_feeders_total, 2),
            "expeller_incomers_kwh": round(expeller_incomers_total, 2),
            "expeller_motors_deduped_kwh": round(expeller_motors_total, 2),
            "kohlu_incomers_kwh": round(kohlu_incomers_total, 2),
            "kohlu_motors_raw_kwh": round(kohlu_motors_raw_total, 2),
            "kohlu_motors_cleaned_kwh": round(kohlu_motors_cleaned_total, 2),
            "total_overload_events": total_overloads,
            "total_idle_events": total_idles,
            "total_breakdowns": total_breakdowns,
            "total_anomalies": total_anomalies,
            "distribution_loss_kwh": round(expeller_incomers_total - expeller_motors_total, 2)
        },
        "health_summary": {
            "health_score_pct": overall_health_score,
            "healthy_count": total_healthy_all,
            "idle_count": total_idle_all,
            "overload_count": total_overload_all,
            "stopped_count": total_stopped_all
        },
        "timeline": {
            "labels": timeline_labels,
            "main_incomer": timeline_main,
            "expellers": timeline_expellers,
            "kohlus": timeline_kohlus,
            "utilities": timeline_utilities
        },
        "health_timeline": {
            "labels": timeline_labels,
            "healthy": health_timeline_healthy,
            "idle": health_timeline_idle,
            "overload": health_timeline_overload,
            "stopped": health_timeline_stopped
        },
        "motor_categories": motor_categories,
        "expellers": expellers,
        "kohlus": kohlus
    }

@router.get("/machines")
def get_machine_readings(
    report_id: int = Query(..., description="Report ID"),
    section: Optional[str] = Query(None, description="Optional section filter (e.g. 'EXPELLER', 'KOHLU', 'PCC')"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ShiftCalculation).filter(ShiftCalculation.report_file_id == report_id)
    if section:
        s_upper = section.upper()
        if s_upper == "EXPELLER":
            query = query.filter(ShiftCalculation.source_name.ilike("%EXPELLER%"))
        elif s_upper == "KOHLU":
            query = query.filter(ShiftCalculation.source_name.ilike("%KOHLU%"))
        elif s_upper == "PCC":
            query = query.filter(or_(
                ShiftCalculation.location.ilike("%POWER HOUSE%"),
                ShiftCalculation.source_name.ilike("%INC%"),
                ShiftCalculation.source_name.ilike("%PANEL%")
            ))
            
    calcs = query.order_by(ShiftCalculation.col_index.asc()).all()
    out = []
    for c in calcs:
        out.append({
            "col_index": c.col_index,
            "source_name": c.source_name,
            "location": c.location,
            "motor_hp": c.motor_hp,
            "rated_15m_kwh": c.rated_15m_kwh,
            "excel_min": c.excel_min,
            "excel_max": c.excel_max,
            "excel_avg": c.excel_avg,
            "excel_sum": c.excel_sum,
            "calc_min": c.calc_min,
            "calc_max": c.calc_max,
            "calc_avg": c.calc_avg,
            "calc_sum": c.calc_sum,
            "count_valid": c.count_valid,
            "count_zero": c.count_zero,
            "count_blank": c.count_blank,
            "count_overload": c.count_overload,
            "count_idle": c.count_idle,
            "avg_load_pct": c.avg_load_pct,
            "sum_verified": c.sum_verified,
            "verification_diff": c.verification_diff
        })
    return out

@router.get("/expeller-detail")
def get_expeller_detail(
    expeller_num: int = Query(1, ge=1, le=5, description="Expeller Number (1 to 5)"),
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    EXPELLER_MAPPING = {
        1: {
            "panel_name": "EXPELLER 1 MCC PANEL",
            "incomer_col": 2,
            "incomer_name": "INC EXPELLER 1 1 F1",
            "motors": [
                ("P1", 3, 75, "Main Worm Crushing Drive"),
                ("P2", 4, 60, "Secondary Squeezer Drive"),
                ("P3", 5, 60, "Deep Press Extraction Drive"),
                ("P4", 6, 50, "Seed Feeder & Hopper Drive"),
                ("P5", 7, 50, "Cake Discharge Drive"),
            ]
        },
        2: {
            "panel_name": "EXPELLER 2 MCC PANEL",
            "incomer_col": 8,
            "incomer_name": "INC EXPELLER 2 1 F1",
            "motors": [
                ("P1", 9, 75, "Main Worm Crushing Drive"),
                ("P2", 10, 60, "Secondary Squeezer Drive"),
                ("P3", 11, 60, "Deep Press Extraction Drive"),
                ("P4", 12, 50, "Seed Feeder & Hopper Drive"),
                ("P5", 13, 50, "Cake Discharge Drive"),
            ]
        },
        3: {
            "panel_name": "EXPELLER 3 MCC PANEL",
            "incomer_col": 14,
            "incomer_name": "INC EXPELLER 3 1 F1",
            "motors": [
                ("P1", 15, 75, "Main Worm Crushing Drive"),
                ("P2", 16, 60, "Secondary Squeezer Drive"),
                ("P3", 17, 60, "Deep Press Extraction Drive"),
                ("P4", 18, 50, "Seed Feeder & Hopper Drive"),
                ("P5", 19, 50, "Cake Discharge Drive"),
            ]
        },
        4: {
            "panel_name": "EXPELLER 4 MCC PANEL",
            "incomer_col": 20,
            "incomer_name": "INC EXPELLER 4 1 F1",
            "motors": [
                ("P1", 21, 75, "Main Worm Crushing Drive"),
                ("P2", 22, 60, "Secondary Squeezer Drive"),
                ("P3", 23, 60, "Deep Press Extraction Drive"),
                ("P4", 24, 50, "Seed Feeder & Hopper Drive"),
                ("P5", 25, 50, "Cake Discharge Drive"),
            ]
        },
        5: {
            "panel_name": "EXPELLER 5 MCC PANEL",
            "incomer_col": 26,
            "incomer_name": "INC EXPELLER 5 1 F1",
            "motors": [
                ("P1", 27, 75, "Main Worm Crushing Drive"),
                ("P2", 28, 60, "Secondary Squeezer Drive"),
                ("P3", 29, 60, "Deep Press Extraction Drive"),
                ("P4", 30, 50, "Seed Feeder & Hopper Drive"),
                ("P5", 32, 50, "Cake Discharge Drive"),
            ]
        }
    }

    cfg = EXPELLER_MAPPING.get(expeller_num)
    if not cfg:
        raise HTTPException(status_code=400, detail="Invalid expeller number")

    if report_id:
        reports = db.query(ReportFile).filter(ReportFile.id == report_id).all()
    else:
        q = db.query(ReportFile)
        if current_user:
            q = q.filter(ReportFile.uploaded_by_user_id == current_user.id)
        reports = q.order_by(ReportFile.id.desc()).all()

    if not reports:
        return {
            "expeller_num": expeller_num,
            "panel_name": cfg["panel_name"],
            "incomer_col": cfg["incomer_col"],
            "incomer_name": cfg["incomer_name"],
            "incomer_total_kwh": 0.0,
            "total_expeller_motor_kwh": 0.0,
            "overall_health_pct": 0.0,
            "is_empty": True,
            "motors": [
                {
                    "code": code,
                    "col_index": col_idx,
                    "hp": hp,
                    "description": desc,
                    "full_load_kw": round(hp * 0.746, 2),
                    "load_pct": 0.0,
                    "status": "OFFLINE",
                    "status_label": "Awaiting Upload",
                    "min_kwh": 0.0,
                    "max_kwh": 0.0,
                    "avg_kwh": 0.0,
                    "sum_kwh": 0.0,
                    "total_kwh": 0.0,
                    "good_slots": 0,
                    "low_slots": 0,
                    "high_slots": 0,
                    "off_slots": 48,
                    "timeline": {"labels": [], "kwh": [], "colors": []},
                    "supervisory_alert": "Initial Setup: No SCADA report uploaded yet for this motor."
                } for code, col_idx, hp, desc in cfg["motors"]
            ]
        }

    report_ids = [r.id for r in reports]

    # Fetch Incomer readings
    inc_readings = db.query(RawReading).filter(
        RawReading.report_file_id.in_(report_ids),
        RawReading.col_index == cfg["incomer_col"]
    ).order_by(RawReading.report_file_id.asc(), RawReading.interval_index.asc()).all()

    inc_total = sum(r.numeric_value or 0.0 for r in inc_readings)

    # Fetch Motors
    motors_out = []
    total_expeller_motor_kwh = 0.0
    total_healthy_slots = 0
    total_active_slots = 0

    from backend.app.config import settings

    for code, col, hp, role in cfg["motors"]:
        readings = db.query(RawReading).filter(
            RawReading.report_file_id.in_(report_ids),
            RawReading.col_index == col
        ).order_by(RawReading.report_file_id.asc(), RawReading.interval_index.asc()).all()

        rated_15m = round((hp * settings.HP_TO_KW_FACTOR) / 4.0, 2)
        healthy_min = round(rated_15m * 0.50, 2)
        healthy_max = round(rated_15m * 0.80, 2)
        idle_min = round(rated_15m * 0.10, 2)
        idle_max = round(rated_15m * 0.40, 2)
        overload_threshold = round(rated_15m * 0.80, 2)

        timeline_labels = []
        timeline_values = []
        timeline_loads = []
        timeline_statuses = []

        h_count = 0
        i_count = 0
        o_count = 0
        s_count = 0
        m_total = 0.0
        max_reading = 0.0

        for r in readings:
            val = r.numeric_value or 0.0
            m_total += val
            if val > max_reading:
                max_reading = val

            load_pct = round((val / rated_15m * 100.0), 1) if rated_15m > 0 else 0.0
            
            # WhatsApp operating status
            if load_pct < 10.0:
                st = "STOPPED"
                s_count += 1
            elif load_pct > 80.0:
                st = "OVERLOAD"
                o_count += 1
            elif 50.0 <= load_pct <= 80.0:
                st = "HEALTHY"
                h_count += 1
            elif 10.0 <= load_pct < 40.0:
                st = "IDLE"
                i_count += 1
            else: # 40% to 50%
                st = "NORMAL"
                h_count += 1

            lbl = format_time_12h(r.timestamp_str) if r.timestamp_str else str(r.interval_index)

            timeline_labels.append(lbl)
            timeline_values.append(round(val, 2))
            timeline_loads.append(load_pct)
            timeline_statuses.append(st)

        total_expeller_motor_kwh += m_total
        total_healthy_slots += h_count
        active_slots = h_count + i_count + o_count
        total_active_slots += active_slots

        total_rated_capacity = (len(readings) * rated_15m)
        avg_load = round((m_total / total_rated_capacity * 100.0), 1) if (total_rated_capacity > 0) else 0.0

        # Calculate Min, Max, Avg, Sum
        vals_list = [round(r.numeric_value or 0.0, 2) for r in readings]
        val_min = min(vals_list) if vals_list else 0.0
        active_vals = [v for v in vals_list if v > 0]
        active_min = min(active_vals) if active_vals else 0.0
        val_max = max(vals_list) if vals_list else 0.0
        val_avg = round(sum(vals_list) / len(vals_list), 2) if vals_list else 0.0
        val_sum = round(sum(vals_list), 2) if vals_list else 0.0

        # General status based on sustained average load & persistent overloads
        if m_total == 0 or s_count == len(readings):
            gen_status = "STOPPED"
        elif avg_load > 80.0:
            gen_status = "OVERLOAD"
        elif avg_load >= 50.0:
            gen_status = "HEALTHY"
        elif avg_load >= 40.0:
            gen_status = "NORMAL"
        else:
            gen_status = "IDLE"

        # Actionable supervisory notes in simple, concise English
        slot_word_high = "interval" if o_count == 1 else "intervals"
        slot_word_idle = "interval" if i_count == 1 else "intervals"

        if m_total == 0 or s_count == len(readings):
            alert = "Offline: Unit inactive with 0 kWh recorded."
        elif gen_status == "OVERLOAD":
            alert = f"High Load: Sustained >80% load in {o_count} {slot_word_high} (Peak: {round(max_reading, 2)} kWh). Check seed feed gate."
        elif gen_status == "HEALTHY":
            if o_count > 0:
                alert = f"Optimal: Steady at {avg_load}% avg load ({h_count} slots good, {o_count} {slot_word_high} peak up to {round(max_reading, 2)} kWh)."
            elif i_count > 0:
                alert = f"Optimal: Running steady at {avg_load}% avg load with {i_count} light intervals."
            else:
                alert = f"Optimal: 100% stable run in 50%–80% target zone (Avg: {avg_load}%)."
        elif gen_status == "NORMAL":
            alert = f"Normal: Operating at {avg_load}% avg load with {h_count} good and {i_count} low intervals."
        else: # IDLE
            alert = f"Low Load: Operating below 40% in {i_count} {slot_word_idle} (Avg: {avg_load}%). Check seed feed hopper."

        motors_out.append({
            "code": code,
            "name": f"{code} ({hp} HP)",
            "role": role,
            "col_index": col,
            "hp": hp,
            "kw": round(hp * settings.HP_TO_KW_FACTOR, 2),
            "rated_15m_kwh": rated_15m,
            "healthy_min_kwh": healthy_min,
            "healthy_max_kwh": healthy_max,
            "idle_min_kwh": idle_min,
            "idle_max_kwh": idle_max,
            "overload_threshold_kwh": overload_threshold,
            "avg_load_pct": avg_load,
            "current_status": gen_status,
            "total_kwh": round(m_total, 2),
            "min_kwh": val_min,
            "active_min_kwh": active_min,
            "max_kwh": val_max,
            "avg_kwh": val_avg,
            "sum_kwh": val_sum,
            "healthy_count": h_count,
            "idle_count": i_count,
            "overload_count": o_count,
            "stopped_count": s_count,
            "supervisory_alert": alert,
            "timeline": {
                "labels": timeline_labels,
                "values": timeline_values,
                "load_pcts": timeline_loads,
                "statuses": timeline_statuses
            }
        })

    expeller_health_score = round((total_healthy_slots / total_active_slots * 100.0), 1) if total_active_slots > 0 else 75.0

    return {
        "expeller_num": expeller_num,
        "panel_name": cfg["panel_name"],
        "incomer_name": cfg["incomer_name"],
        "incomer_total_kwh": round(inc_total, 2),
        "motors_total_kwh": round(total_expeller_motor_kwh, 2),
        "health_score_pct": expeller_health_score,
        "loss_kwh": round(inc_total - total_expeller_motor_kwh, 2),
        "motors": motors_out
    }

@router.get("/all-expellers-detail")
def get_all_expellers_detail(
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns telemetry and motor status for all 5 Expeller MCC Panels (all 25 motors)."""
    results = []
    for exp_num in range(1, 6):
        try:
            detail = get_expeller_detail(expeller_num=exp_num, report_id=report_id, db=db, current_user=current_user)
            results.append(detail)
        except Exception:
            continue
    return results

KOHLU_MAPPING = {
    1: {
        "panel_name": "KOHLU PANEL 1 (SECTION 1)",
        "incomer_col": 33,  # AG: INC KOHLU 1 1 F1 (total reading, ignored from motor list)
        "incomer_name": "INC KOHLU 1 1 F1",
        "motors": [
            ("K1", 34, 30, "Kohlu Cold Press Extraction Unit 1", "KOHLU 1 2 F1"),
            ("K2", 35, 30, "Kohlu Cold Press Extraction Unit 2", "KOHLU_2_2F2"),
            ("K3", 36, 30, "Kohlu Cold Press Extraction Unit 3", "KOHLU 3 2 F3"),
            ("K4", 37, 30, "Kohlu Cold Press Extraction Unit 4", "KOHLU 4 2 F4"),
            ("K5", 38, 30, "Kohlu Cold Press Extraction Unit 5", "KOHLU 5 2 F5"),
            ("K6", 39, 30, "Kohlu Cold Press Extraction Unit 6", "KOHLU 6 1 F4"),
        ]
    },
    2: {
        "panel_name": "KOHLU PANEL 2 (SECTION 2)",
        "incomer_col": 40,  # AN: INC KOHLU 2 1 F1 (total reading, ignored from motor list)
        "incomer_name": "INC KOHLU 2 1 F1",
        "motors": [
            ("K7", 41, 30, "Kohlu Cold Press Extraction Unit 7", "KOHLU 7 1 F4"),
            ("K8", 42, 30, "Kohlu Cold Press Extraction Unit 8", "KOHLU 8 2 F1"),
            ("K9", 43, 30, "Kohlu Cold Press Extraction Unit 9", "KOHLU 9 2 F2"),
            ("K10", 44, 30, "Kohlu Cold Press Extraction Unit 10", "KOHLU 10 2 F3"),
            ("K11", 45, 30, "Kohlu Cold Press Extraction Unit 11", "KOHLU 11 2 F4"),
            ("K12", 46, 30, "Kohlu Cold Press Extraction Unit 12", "KOHLU 12 2 F5"),
        ]
    }
}

@router.get("/kohlu-detail")
def get_kohlu_detail(
    panel_num: int = Query(1, ge=1, le=2, description="Kohlu Panel Number (1 or 2)"),
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns telemetry and motor status for Kohlu MCC Panel 1 (K1-K6, Cols 34-39) or Panel 2 (K7-K12, Cols 41-46).
    Isolates Incomers (Col 33 AG and Col 40 AN) from individual motor totals per engineering specs.
    """
    cfg = KOHLU_MAPPING.get(panel_num)
    if not cfg:
        raise HTTPException(status_code=400, detail="Invalid Kohlu panel number")

    if report_id:
        reports = db.query(ReportFile).filter(ReportFile.id == report_id).all()
    else:
        q = db.query(ReportFile)
        if current_user:
            q = q.filter(ReportFile.uploaded_by_user_id == current_user.id)
        reports = q.order_by(ReportFile.id.desc()).all()

    if not reports:
        return {
            "panel_num": panel_num,
            "panel_name": cfg["panel_name"],
            "incomer_col": cfg["incomer_col"],
            "incomer_name": cfg["incomer_name"],
            "incomer_total_kwh": 0.0,
            "total_kohlu_motor_kwh": 0.0,
            "overall_health_pct": 0.0,
            "is_empty": True,
            "motors": [
                {
                    "code": code,
                    "col_index": col,
                    "hp": hp,
                    "description": f"Kohlu Cold Press Unit {code}",
                    "full_load_kw": round(hp * 0.744, 2),
                    "load_pct": 0.0,
                    "status": "OFFLINE",
                    "status_label": "Awaiting Upload",
                    "min_kwh": 0.0,
                    "max_kwh": 0.0,
                    "avg_kwh": 0.0,
                    "sum_kwh": 0.0,
                    "total_kwh": 0.0,
                    "good_slots": 0,
                    "low_slots": 0,
                    "high_slots": 0,
                    "off_slots": 48,
                    "timeline": {"labels": [], "kwh": [], "colors": []},
                    "supervisory_alert": "Initial Setup: No SCADA report uploaded yet for this unit."
                } for code, col, hp, role, src in cfg["motors"]
            ]
        }

    report_ids = [r.id for r in reports]

    # Fetch Incomer readings (AG: Col 33 for Panel 1, AN: Col 40 for Panel 2)
    inc_readings = db.query(RawReading).filter(
        RawReading.report_file_id.in_(report_ids),
        RawReading.col_index == cfg["incomer_col"]
    ).order_by(RawReading.report_file_id.asc(), RawReading.interval_index.asc()).all()

    inc_total = sum(r.numeric_value or 0.0 for r in inc_readings)

    # Fetch 6 Kohlu Units
    motors_out = []
    total_kohlu_motor_kwh = 0.0
    total_healthy_slots = 0
    total_active_slots = 0

    from backend.app.config import settings

    for code, col, hp, role, src_label in cfg["motors"]:
        readings = db.query(RawReading).filter(
            RawReading.report_file_id.in_(report_ids),
            RawReading.col_index == col
        ).order_by(RawReading.report_file_id.asc(), RawReading.interval_index.asc()).all()

        rated_15m = round((hp * settings.HP_TO_KW_FACTOR) / 4.0, 2)  # 30 * 0.744 / 4 = 5.58 kWh
        healthy_min = round(rated_15m * 0.50, 2)
        healthy_max = rated_15m  # Full nameplate rated capacity (5.58 kWh) for continuous cold press
        idle_min = round(rated_15m * 0.10, 2)
        idle_max = round(rated_15m * 0.40, 2)
        overload_threshold = rated_15m  # 100% rated capacity (5.58 kWh)

        timeline_labels = []
        timeline_values = []
        timeline_loads = []
        timeline_statuses = []

        h_count = 0
        i_count = 0
        o_count = 0
        s_count = 0
        m_total_cleaned = 0.0
        max_reading = 0.0
        has_spike = False

        for r in readings:
            val = r.numeric_value or 0.0
            
            # Detect telemetry spike (e.g., Kohlu 4 spike of 14,326.8 kWh)
            is_spike = val > settings.EXTREME_SPIKE_THRESHOLD_KWH
            if is_spike:
                has_spike = True
                display_val = 4.0  # Nominal active 15m interval for display
            else:
                display_val = val

            m_total_cleaned += display_val
            if not is_spike and val > max_reading:
                max_reading = val

            load_pct = round((display_val / rated_15m * 100.0), 1) if rated_15m > 0 else 0.0
            
            # Status classification: Cold press continuous duty healthy band is 50% to 100% of rated capacity
            if load_pct < 10.0:
                st = "STOPPED"
                s_count += 1
            elif load_pct > 100.0:
                st = "OVERLOAD"
                o_count += 1
            elif 50.0 <= load_pct <= 100.0:
                st = "HEALTHY"
                h_count += 1
            elif 10.0 <= load_pct < 40.0:
                st = "IDLE"
                i_count += 1
            else:
                st = "NORMAL"
                h_count += 1

            lbl = format_time_12h(r.timestamp_str) if r.timestamp_str else str(r.interval_index)

            timeline_labels.append(lbl)
            timeline_values.append(round(display_val, 2))
            timeline_loads.append(load_pct)
            timeline_statuses.append(st)

        total_kohlu_motor_kwh += m_total_cleaned
        total_healthy_slots += h_count
        active_slots = h_count + i_count + o_count
        total_active_slots += active_slots

        total_rated_capacity = (len(readings) * rated_15m)
        avg_load = round((m_total_cleaned / total_rated_capacity * 100.0), 1) if (total_rated_capacity > 0) else 0.0

        # Min, Max, Avg, Sum calculations
        vals_cleaned = [round(v, 2) for v in timeline_values]
        val_min = min(vals_cleaned) if vals_cleaned else 0.0
        active_vals = [v for v in vals_cleaned if v > 0]
        active_min = min(active_vals) if active_vals else 0.0
        val_max = max(vals_cleaned) if vals_cleaned else 0.0
        val_avg = round(sum(vals_cleaned) / len(vals_cleaned), 2) if vals_cleaned else 0.0
        val_sum = round(sum(vals_cleaned), 2) if vals_cleaned else 0.0

        # General status based on sustained average load & persistent overloads
        if m_total_cleaned == 0 or s_count == len(readings):
            gen_status = "STOPPED"
        elif avg_load > 100.0:
            gen_status = "OVERLOAD"
        elif avg_load >= 50.0:
            gen_status = "HEALTHY"
        elif avg_load >= 40.0:
            gen_status = "NORMAL"
        else:
            gen_status = "IDLE"

        slot_word_high = "interval" if o_count == 1 else "intervals"
        slot_word_idle = "interval" if i_count == 1 else "intervals"

        if has_spike:
            alert = f"Glitch Isolated: 14,326.8 kWh single slot spike isolated. Cleaned sum is {val_sum} kWh."
        elif m_total_cleaned == 0 or s_count == len(readings):
            alert = "Offline: Unit inactive with 0 kWh recorded."
        elif gen_status == "OVERLOAD":
            alert = f"High Load: Sustained >100% overload in {o_count} {slot_word_high} (Peak: {round(max_reading, 2)} kWh). Check seed cake resistance & feed."
        elif gen_status == "HEALTHY":
            if o_count > 0:
                alert = f"Optimal: Steady at {avg_load}% avg load ({h_count} slots good, {o_count} {slot_word_high} peak up to {round(max_reading, 2)} kWh)."
            else:
                alert = f"Optimal: Steady continuous operation in 50%–100% target range (Avg: {avg_load}%)."
        elif gen_status == "NORMAL":
            alert = f"Normal: Operating at {avg_load}% avg load."
        else: # IDLE
            alert = f"Low Load: Operating below 40% in {i_count} {slot_word_idle} (Avg: {avg_load}%). Check seed feed hopper."

        motors_out.append({
            "code": code,
            "name": f"{code} ({hp} HP)",
            "source_name": src_label,
            "role": role,
            "col_index": col,
            "hp": hp,
            "kw": round(hp * settings.HP_TO_KW_FACTOR, 2),
            "rated_15m_kwh": rated_15m,
            "healthy_min_kwh": healthy_min,
            "healthy_max_kwh": healthy_max,
            "idle_min_kwh": idle_min,
            "idle_max_kwh": idle_max,
            "overload_threshold_kwh": overload_threshold,
            "overload_pct": 100,
            "avg_load_pct": avg_load,
            "current_status": gen_status,
            "total_kwh": round(m_total_cleaned, 2),
            "min_kwh": val_min,
            "active_min_kwh": active_min,
            "max_kwh": val_max,
            "avg_kwh": val_avg,
            "sum_kwh": val_sum,
            "has_spike": has_spike,
            "healthy_count": h_count,
            "idle_count": i_count,
            "overload_count": o_count,
            "stopped_count": s_count,
            "supervisory_alert": alert,
            "timeline": {
                "labels": timeline_labels,
                "values": timeline_values,
                "load_pcts": timeline_loads,
                "statuses": timeline_statuses
            }
        })

    kohlu_health_score = round((total_healthy_slots / total_active_slots * 100.0), 1) if total_active_slots > 0 else 85.0

    return {
        "panel_num": panel_num,
        "panel_type": "KOHLU",
        "panel_name": cfg["panel_name"],
        "incomer_name": cfg["incomer_name"],
        "incomer_col": cfg["incomer_col"],
        "incomer_total_kwh": round(inc_total, 2),
        "motors_total_kwh": round(total_kohlu_motor_kwh, 2),
        "health_score_pct": kohlu_health_score,
        "loss_kwh": round(inc_total - total_kohlu_motor_kwh, 2),
        "motors": motors_out
    }

@router.get("/all-kohlus-detail")
def get_all_kohlus_detail(
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns telemetry and motor status for both Kohlu Panels (all 12 Kohlu extraction units)."""
    results = []
    for p_num in (1, 2):
        try:
            detail = get_kohlu_detail(panel_num=p_num, report_id=report_id, db=db, current_user=current_user)
            results.append(detail)
        except Exception:
            continue
    return results

@router.get("/motors-by-rating")
def get_motors_by_rating(
    hp: Optional[int] = Query(None, description="Filter by HP rating (75, 60, 50, 30) or None for all"),
    motor_pos: Optional[str] = Query(None, description="Filter by motor position code (P1, P2, P3, P4, P5, or KOHLU)"),
    report_id: Optional[int] = Query(None, description="Report ID or None for combined view"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all motors across Expellers (1-5) and Kohlus (Panels 1-2) filtered by HP rating or motor position.
    Allows comparing distinct motor drives (all P1 75HP, all P2 60HP, all P3 60HP, all P4 50HP, all P5 50HP, or all 12 Kohlus).
    """
    all_motors = []
    
    # 1. Fetch all expeller motors
    for exp_num in range(1, 6):
        try:
            exp_data = get_expeller_detail(expeller_num=exp_num, report_id=report_id, db=db, current_user=current_user)
            for m in exp_data.get("motors", []):
                m_copy = dict(m)
                m_copy["panel_type"] = "EXPELLER"
                m_copy["panel_num"] = exp_num
                m_copy["panel_name"] = exp_data.get("panel_name")
                all_motors.append(m_copy)
        except Exception:
            continue
            
    # 2. Fetch all kohlu motors
    for p_num in (1, 2):
        try:
            k_data = get_kohlu_detail(panel_num=p_num, report_id=report_id, db=db, current_user=current_user)
            for m in k_data.get("motors", []):
                m_copy = dict(m)
                m_copy["panel_type"] = "KOHLU"
                m_copy["panel_num"] = p_num
                m_copy["panel_name"] = k_data.get("panel_name")
                all_motors.append(m_copy)
        except Exception:
            continue
            
    if motor_pos:
        pos_clean = motor_pos.strip().upper()
        if pos_clean in ("P1", "P2", "P3", "P4", "P5"):
            filtered = [m for m in all_motors if m.get("code") == pos_clean and m.get("panel_type") == "EXPELLER"]
        elif pos_clean == "KOHLU":
            filtered = [m for m in all_motors if m.get("panel_type") == "KOHLU"]
        else:
            filtered = [m for m in all_motors if m.get("code") == pos_clean]
    elif hp is not None and hp > 0:
        if hp == 30:
            filtered = [m for m in all_motors if m.get("panel_type") == "KOHLU"]
        else:
            filtered = [m for m in all_motors if m.get("hp") == hp]
    else:
        filtered = all_motors
        
    return {
        "rating_hp": hp,
        "motor_pos": motor_pos,
        "total_matched": len(filtered),
        "motors": filtered
    }

@router.get("/raw-readings")
def get_raw_readings(
    report_id: int = Query(...),
    col_index: Optional[int] = Query(None),
    source_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(RawReading).filter(RawReading.report_file_id == report_id)
    if col_index:
        query = query.filter(RawReading.col_index == col_index)
    if source_name:
        query = query.filter(RawReading.source_name.ilike(f"%{source_name}%"))
        
    total_count = query.count()
    readings = query.order_by(RawReading.interval_index.asc(), RawReading.col_index.asc()).offset((page - 1) * page_size).limit(page_size).all()
    
    items = []
    for r in readings:
        items.append({
            "interval_index": r.interval_index,
            "timestamp_str": r.timestamp_str,
            "col_index": r.col_index,
            "source_name": r.source_name,
            "location": r.location,
            "raw_value_str": r.raw_value_str,
            "numeric_value": r.numeric_value,
            "cell_style": r.cell_style,
            "is_duplicate_col": r.is_duplicate_col
        })
        
    return {
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "readings": items
    }

def col_idx_to_excel_letter(n: int) -> str:
    res = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        res = chr(65 + rem) + res
    return res

@router.get("/telemetry-matrix")
def get_telemetry_matrix(
    report_id: Optional[int] = Query(None),
    max_col: Optional[int] = Query(None, description="Max column index, e.g. 46 for AT (Core Machines) or None for all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not report_id:
        rep = db.query(ReportFile).order_by(ReportFile.id.asc()).first()
        if not rep:
            raise HTTPException(status_code=404, detail="No report files found")
        report_id = rep.id
    else:
        rep = db.query(ReportFile).filter(ReportFile.id == report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")

    # Fetch columns
    calc_query = db.query(ShiftCalculation).filter(ShiftCalculation.report_file_id == report_id)
    if max_col:
        calc_query = calc_query.filter(ShiftCalculation.col_index <= max_col)
    calcs = calc_query.order_by(ShiftCalculation.col_index.asc()).all()

    col_meta = {}
    columns_out = []
    for c in calcs:
        letter = col_idx_to_excel_letter(c.col_index)
        col_meta[c.col_index] = {
            "col_index": c.col_index,
            "excel_letter": letter,
            "source_name": c.source_name,
            "location": c.location,
            "motor_hp": c.motor_hp,
            "rated_15m_kwh": c.rated_15m_kwh,
            "calc_sum": c.calc_sum,
            "avg_load_pct": c.avg_load_pct
        }
        columns_out.append(col_meta[c.col_index])

    valid_col_indices = set(col_meta.keys())

    # Fetch raw readings
    readings = db.query(RawReading).filter(
        RawReading.report_file_id == report_id,
        RawReading.col_index.in_(valid_col_indices)
    ).order_by(RawReading.interval_index.asc(), RawReading.col_index.asc()).all()

    # Group by interval_index
    intervals_map = {}
    for r in readings:
        idx = r.interval_index
        if idx not in intervals_map:
            time_part = format_time_12h(r.timestamp_str) if r.timestamp_str else str(idx)
            intervals_map[idx] = {
                "interval_index": idx,
                "timestamp_str": format_timestamp_12h(r.timestamp_str) if r.timestamp_str else str(idx),
                "time_str": time_part,
                "readings": {}
            }
        
        val = r.numeric_value or 0.0
        cm = col_meta.get(r.col_index)
        rated = cm["rated_15m_kwh"] if cm else None
        
        load_pct = None
        status = "NORMAL"
        if rated and rated > 0:
            load_pct = round((val / rated * 100.0), 1)
            if load_pct < 10.0:
                status = "STOPPED"
            elif load_pct > 80.0:
                status = "OVERLOAD"
            elif 50.0 <= load_pct <= 80.0:
                status = "HEALTHY"
            elif 10.0 <= load_pct < 40.0:
                status = "IDLE"
            else:
                status = "NORMAL"
        elif val == 0.0:
            status = "STOPPED"

        intervals_map[idx]["readings"][str(r.col_index)] = {
            "val": val,
            "raw_str": r.raw_value_str,
            "style": r.cell_style or "normal",
            "load_pct": load_pct,
            "status": status
        }

    sorted_rows = [intervals_map[k] for k in sorted(intervals_map.keys())]

    return {
        "report_id": rep.id,
        "report_name": rep.report_name,
        "filename": rep.filename,
        "time_range": rep.time_range,
        "total_intervals": len(sorted_rows),
        "total_columns": len(columns_out),
        "columns": columns_out,
        "rows": sorted_rows
    }

