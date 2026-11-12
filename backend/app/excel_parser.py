import re
import datetime
from typing import Dict, List, Any, Tuple, Optional
import openpyxl
from backend.app.config import settings

def parse_motor_hp(source_name: str) -> Optional[int]:
    """Extract motor HP rating from source string if present (e.g., 'P1 75 HP M1 2 F1' -> 75)."""
    match = re.search(r'(\d+)\s*HP', source_name, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None

def get_cell_style_tag(cell) -> str:
    """Classify visual styling / highlights from cell fill."""
    f = cell.fill
    if not f or not f.fill_type:
        return "normal"
    
    fg = f.fgColor
    if not fg:
        return "normal"
        
    if fg.type == "rgb" and fg.rgb:
        rgb_upper = str(fg.rgb).upper()
        if "00B050" in rgb_upper or "008000" in rgb_upper:
            return "green" # Operator low-load/idle highlight
        if rgb_upper in ("FFECEFF1", "00000000", "FFFFFFFF"):
            return "normal"
            
    if fg.type == "theme" and fg.theme == 5:
        # Theme 5 with tint is the coral/soft red highlight for downtime/breakdown
        return "soft_red"
        
    return "normal"

def validate_scada_column_sequence(sheet, source_row: int = 4) -> None:
    """
    Validates that the uploaded EMS Excel sheet follows the required factory SCADA layout:
    - Col B (#2): INC EXPELLER 1
    - Cols C-G (#3-#7): Expeller 1 Motors (P1 75HP, P2 60HP, P3 60HP, P4 50HP, P5 50HP)
    - Col H (#8): INC EXPELLER 2
    - Cols I-M (#9-#13): Expeller 2 Motors (P1 to P5)
    - Col N (#14): INC EXPELLER 3
    - Cols O-S (#15-#19): Expeller 3 Motors (P1 to P5)
    - Col T (#20): INC EXPELLER 4
    - Cols U-Y (#21-#25): Expeller 4 Motors (P1 to P5)
    - Col Z (#26): INC EXPELLER 5
    - Cols AA-AF (#27-#32): Expeller 5 Motors
    - Col AG (#33): INC KOHLU 1
    - Cols AH-AM (#34-#39): Kohlu 1-6
    - Col AN (#40): INC KOHLU 2
    - Cols AO-AT (#41-#46): Kohlu 7-12
    """
    from openpyxl.utils import get_column_letter

    checks = [
        (2, "INC EXPELLER 1 (Incomer Expeller 1)", ["inc", "expeller 1"]),
        (3, "P1 75 HP (Expeller 1 Main Crushing)", ["p1", "75"]),
        (4, "P2 60 HP (Expeller 1 Squeezer)", ["p2", "60"]),
        (5, "P3 60 HP (Expeller 1 Extraction)", ["p3", "60"]),
        (6, "P4 50 HP (Expeller 1 Feeder)", ["p4", "50"]),
        (7, "P5 50 HP (Expeller 1 Discharge)", ["p5", "50"]),
        (8, "INC EXPELLER 2 (Incomer Expeller 2)", ["inc", "expeller 2"]),
        (9, "P1 75 HP (Expeller 2)", ["p1", "75"]),
        (10, "P2 60 HP (Expeller 2)", ["p2", "60"]),
        (11, "P3 60 HP (Expeller 2)", ["p3", "60"]),
        (12, "P4 50 HP (Expeller 2)", ["p4", "50"]),
        (13, "P5 50 HP (Expeller 2)", ["p5", "50"]),
        (14, "INC EXPELLER 3 (Incomer Expeller 3)", ["inc", "expeller 3"]),
        (15, "P1 75 HP (Expeller 3)", ["p1", "75"]),
        (16, "P2 60 HP (Expeller 3)", ["p2", "60"]),
        (17, "P3 60 HP (Expeller 3)", ["p3", "60"]),
        (18, "P4 50 HP (Expeller 3)", ["p4", "50"]),
        (19, "P5 50 HP (Expeller 3)", ["p5", "50"]),
        (20, "INC EXPELLER 4 (Incomer Expeller 4)", ["inc", "expeller 4"]),
        (21, "P1 75 HP (Expeller 4)", ["p1", "75"]),
        (22, "P2 60 HP (Expeller 4)", ["p2", "60"]),
        (23, "P3 60 HP (Expeller 4)", ["p3", "60"]),
        (24, "P4 50 HP (Expeller 4)", ["p4", "50"]),
        (25, "P5 50 HP (Expeller 4)", ["p5", "50"]),
        (26, "INC EXPELLER 5 (Incomer Expeller 5)", ["inc", "expeller 5"]),
        (27, "P1 75 HP (Expeller 5)", ["p1", "75"]),
        (28, "P2 60 HP (Expeller 5)", ["p2", "60"]),
        (29, "P3 60 HP (Expeller 5)", ["p3", "60"]),
        (30, "P4 50 HP (Expeller 5)", ["p4", "50"]),
        (33, "INC KOHLU 1 (Incomer Kohlu Panel 1)", ["inc", "kohlu 1"]),
        (40, "INC KOHLU 2 (Incomer Kohlu Panel 2)", ["inc", "kohlu 2"]),
    ]

    for col_idx, expected_label, keywords in checks:
        val = sheet.cell(source_row, col_idx).value
        val_str = str(val or "").strip().lower()
        if not all(k in val_str for k in keywords):
            col_letter = get_column_letter(col_idx)
            found_desc = f"'{val}'" if val is not None else "Empty / Missing"
            raise ValueError(
                f"Column Sequence Mismatch at Column {col_letter} (Col #{col_idx}): "
                f"Expected '{expected_label}', but found {found_desc}. "
                f"All SCADA columns must follow the standard factory layout sequence (Incomers -> P1 to P5 motors). "
                f"Please download and refer to the standard EMS Column Sequence Template (CSV)."
            )

def parse_ems_excel_file(file_path_or_stream) -> Dict[str, Any]:
    """
    Parses original EMS Excel report with strict precision preservation and validation.
    Never silently modifies, rounds, skips, or fabricates data.
    """
    wb = openpyxl.load_workbook(file_path_or_stream, data_only=True)
    
    # 1. Parse Metadata Sheet ('Chart') if available
    metadata: Dict[str, Any] = {
        "report_name": None,
        "report_description": None,
        "report_type": None,
        "trigger_type": None,
        "created_by": None,
        "created_on": None,
        "time_range": None
    }
    
    if "Chart" in wb.sheetnames:
        chart_sheet = wb["Chart"]
        for r in range(1, min(15, chart_sheet.max_row + 1)):
            k = chart_sheet.cell(r, 1).value
            v = chart_sheet.cell(r, 2).value
            if k and v:
                key_norm = str(k).strip().lower().replace(" ", "_")
                if "report_name" in key_norm: metadata["report_name"] = str(v).strip()
                elif "report_description" in key_norm: metadata["report_description"] = str(v).strip()
                elif "report_type" in key_norm: metadata["report_type"] = str(v).strip()
                elif "trigger_type" in key_norm: metadata["trigger_type"] = str(v).strip()
                elif "created_by" in key_norm: metadata["created_by"] = str(v).strip()
                elif "created_on" in key_norm: metadata["created_on"] = str(v).strip()
                elif "time_range" in key_norm: metadata["time_range"] = str(v).strip()

    # 2. Parse 'Values' Sheet
    values_sheet_name = None
    for s in wb.sheetnames:
        if s.strip().lower() == "values":
            values_sheet_name = s
            break
    if not values_sheet_name:
        values_sheet_name = next((s for s in wb.sheetnames if "value" in s.strip().lower()), None)
    if not values_sheet_name:
        raise ValueError(f"Invalid EMS report: sheet 'Values' not found. Available sheets in workbook: {list(wb.sheetnames)}")
        
    sheet = wb[values_sheet_name]

    # Detect header row: look for row where cell(r, 1) is 'Source' or cell(r, 2) matches 'INC'
    source_row = 4
    for r in range(1, 10):
        val_col1 = str(sheet.cell(r, 1).value or "").strip().lower()
        val_col2 = str(sheet.cell(r, 2).value or "").strip().lower()
        if "source" in val_col1 or ("inc" in val_col2 and "expeller" in val_col2):
            source_row = r
            break

    # Validate SCADA Column Layout Sequence
    validate_scada_column_sequence(sheet, source_row=source_row)

    max_col = sheet.max_column
    
    loc_row = source_row + 1
    mp_row = source_row + 2
    unit_row = source_row + 3
    data_start_row = source_row + 4
    data_end_row = data_start_row + 48 # 48 intervals
    
    # Header rows: Source, Location, Measurement Point, Unit
    columns: List[Dict[str, Any]] = []
    seen_sources: Dict[str, List[int]] = {}
    
    for c in range(2, max_col + 1):
        source = sheet.cell(source_row, c).value
        loc = sheet.cell(loc_row, c).value
        mp = sheet.cell(mp_row, c).value
        unit = sheet.cell(unit_row, c).value
        
        source_str = str(source).strip() if source is not None else f"Column_{c}"
        loc_str = str(loc).strip() if loc is not None else ""
        mp_str = str(mp).strip() if mp is not None else ""
        unit_str = str(unit).strip() if unit is not None else "kWh"
        hp = parse_motor_hp(source_str)
        # Kohlu motor headers do not include the nameplate rating in the workbook.
        # Plant specification: all 12 Kohlu units are 40 HP; incomers are not motors.
        source_upper = source_str.upper()
        if "KOHLU" in source_upper and "INC" not in source_upper and "PANEL" not in source_upper:
            hp = 40
        rated_kwh = settings.RATED_15MIN_KWH.get(hp) if hp else None
        
        seen_sources.setdefault(source_str, []).append(c)
        is_dup = len(seen_sources[source_str]) > 1
        
        columns.append({
            "col_index": c,
            "source_name": source_str,
            "location": loc_str,
            "measurement_point": mp_str,
            "unit": unit_str,
            "motor_hp": hp,
            "rated_15m_kwh": rated_kwh,
            "is_duplicate": is_dup
        })

    # 3. Parse Original Summary Rows: Min, Max, Avg, Sum
    excel_summaries: Dict[int, Dict[str, Any]] = {}
    for col_info in columns:
        c = col_info["col_index"]
        excel_summaries[c] = {
            "excel_min": str(sheet.cell(data_end_row, c).value).strip() if sheet.cell(data_end_row, c).value is not None else "",
            "excel_max": str(sheet.cell(data_end_row + 1, c).value).strip() if sheet.cell(data_end_row + 1, c).value is not None else "",
            "excel_avg": str(sheet.cell(data_end_row + 2, c).value).strip() if sheet.cell(data_end_row + 2, c).value is not None else "",
            "excel_sum": str(sheet.cell(data_end_row + 3, c).value).strip() if sheet.cell(data_end_row + 3, c).value is not None else "",
        }

    # 4. Parse 15-Minute Data Rows: 48 intervals
    intervals: List[Dict[str, Any]] = []
    validation_findings: List[Dict[str, Any]] = []
    
    # Check duplicate columns finding
    for src, col_indices in seen_sources.items():
        if len(col_indices) > 1:
            validation_findings.append({
                "severity": "WARNING",
                "category": "DUPLICATE_COLUMN",
                "source_name": src,
                "location": columns[col_indices[0] - 2]["location"],
                "timestamp_str": "Entire Report",
                "row_num": source_row,
                "col_num": col_indices[1],
                "observed_value": f"Cols {col_indices}",
                "expected_range": "Unique feeder source per column",
                "explanation": f"Source '{src}' is duplicated in columns {col_indices}. Calculations must isolate duplicates to prevent double-counting."
            })

    for r_idx, r in enumerate(range(data_start_row, data_end_row)):
        ts_cell_val = sheet.cell(r, 1).value
        ts_str = str(ts_cell_val).strip() if ts_cell_val is not None else f"Interval_{r_idx}"
        
        # Parse timestamp datetime
        parsed_dt = None
        try:
            parsed_dt = datetime.datetime.strptime(ts_str, "%d/%m/%Y %H:%M:%S")
        except Exception:
            try:
                parsed_dt = datetime.datetime.strptime(ts_str, "%d/%m/%Y %H:%M")
            except Exception:
                pass

        row_readings: Dict[int, Dict[str, Any]] = {}
        for col_info in columns:
            c = col_info["col_index"]
            cell = sheet.cell(r, c)
            raw_val = cell.value
            style = get_cell_style_tag(cell)
            
            raw_val_str = ""
            numeric_val = None
            if raw_val is not None:
                raw_val_str = str(raw_val).strip()
                if raw_val_str != "":
                    try:
                        numeric_val = float(raw_val_str.replace(",", ""))
                    except ValueError:
                        validation_findings.append({
                            "severity": "CRITICAL",
                            "category": "CORRUPT_DATA",
                            "source_name": col_info["source_name"],
                            "location": col_info["location"],
                            "timestamp_str": ts_str,
                            "row_num": r,
                            "col_num": c,
                            "observed_value": raw_val_str,
                            "expected_range": "Numeric float value",
                            "explanation": f"Non-numeric string encountered in interval reading: '{raw_val_str}'"
                        })
            
            # Anomaly Checks on individual cell
            if numeric_val is not None:
                # 1. Extreme spike check
                if numeric_val > settings.EXTREME_SPIKE_THRESHOLD_KWH and col_info["rated_15m_kwh"] is not None:
                    validation_findings.append({
                        "severity": "CRITICAL",
                        "category": "TELEMETRY_SPIKE",
                        "source_name": col_info["source_name"],
                        "location": col_info["location"],
                        "timestamp_str": ts_str,
                        "row_num": r,
                        "col_num": c,
                        "observed_value": f"{numeric_val:.1f} kWh",
                        "expected_range": f"<= {settings.EXTREME_SPIKE_THRESHOLD_KWH:g} kWh / 15-min for a motor reading",
                        "explanation": f"Extreme abnormal surge detected: {numeric_val:.1f} kWh in a single 15-minute slot. Likely meter rollover or register corruption."
                    })
                
                # 2. Overload Check (if motor HP is known)
                overload_limit = col_info["rated_15m_kwh"] * (settings.OVERLOAD_THRESHOLD_PCT / 100.0) if col_info["rated_15m_kwh"] else None
                if overload_limit and numeric_val > overload_limit:
                    load_pct = (numeric_val / col_info["rated_15m_kwh"]) * 100.0
                    validation_findings.append({
                        "severity": "WARNING",
                        "category": "OVERLOAD",
                        "source_name": col_info["source_name"],
                        "location": col_info["location"],
                        "timestamp_str": ts_str,
                        "row_num": r,
                        "col_num": c,
                        "observed_value": f"{numeric_val:.2f} kWh ({load_pct:.1f}% load)",
                        "expected_range": f"<= {overload_limit:.2f} kWh (80% overload-risk limit)",
                        "explanation": f"{col_info['motor_hp']} HP motor exceeded the 80% overload-risk limit ({numeric_val:.2f} kWh vs rated {col_info['rated_15m_kwh']:.2f} kWh)."
                    })
                
                # 3. Idle Running Check (motor active but < 40% load)
                elif col_info["rated_15m_kwh"] and 0 < numeric_val < (col_info["rated_15m_kwh"] * 0.40):
                    load_pct = (numeric_val / col_info["rated_15m_kwh"]) * 100.0
                    # Only log notable idle if highlighted or consistently low
                    if style == "green" or load_pct < 25.0:
                        validation_findings.append({
                            "severity": "INFO",
                            "category": "IDLE_RUNNING",
                            "source_name": col_info["source_name"],
                            "location": col_info["location"],
                            "timestamp_str": ts_str,
                            "row_num": r,
                            "col_num": c,
                            "observed_value": f"{numeric_val:.2f} kWh ({load_pct:.1f}% load)",
                            "expected_range": f">= {col_info['rated_15m_kwh'] * 0.40:.2f} kWh (>= 40% optimal load)",
                            "explanation": f"{col_info['motor_hp']} HP motor running at under-loaded/idle state ({load_pct:.1f}% load). High energy inefficiency."
                        })
            elif style == "soft_red" or raw_val_str == "":
                # Telemetry lost / breakdown period
                if "EXPELLER" in col_info["source_name"].upper() or "KOHLU" in col_info["source_name"].upper():
                    validation_findings.append({
                        "severity": "WARNING",
                        "category": "BREAKDOWN_OR_OFFLINE",
                        "source_name": col_info["source_name"],
                        "location": col_info["location"],
                        "timestamp_str": ts_str,
                        "row_num": r,
                        "col_num": c,
                        "observed_value": "BLANK / UNMETERED",
                        "expected_range": "Continuous interval logging",
                        "explanation": f"Telemetry missing or equipment shutdown during active production hours."
                    })

            row_readings[c] = {
                "raw_str": raw_val_str,
                "numeric_val": numeric_val,
                "style": style
            }
            
        intervals.append({
            "interval_index": r_idx,
            "timestamp_str": ts_str,
            "timestamp": parsed_dt,
            "readings": row_readings
        })

    # 5. Independent Calculation Verification against Original Excel Summaries
    verified_calculations: List[Dict[str, Any]] = []
    
    for col_info in columns:
        c = col_info["col_index"]
        c_readings = [
            intervals[i]["readings"][c]["numeric_val"]
            for i in range(len(intervals))
            if intervals[i]["readings"][c]["numeric_val"] is not None
        ]
        
        valid_count = len(c_readings)
        zero_count = sum(1 for v in c_readings if v == 0)
        blank_count = 48 - valid_count
        
        calc_min = min(c_readings) if c_readings else 0.0
        calc_max = max(c_readings) if c_readings else 0.0
        calc_sum = sum(c_readings) if c_readings else 0.0
        # In PM Software: Average = sum / count of non-empty readings
        calc_avg = (calc_sum / valid_count) if valid_count > 0 else 0.0
        
        ex = excel_summaries[c]
        ex_sum_str = ex["excel_sum"].replace(",", "").strip()
        ex_avg_str = ex["excel_avg"].replace(",", "").strip()
        
        diff_sum = 0.0
        sum_verified = True
        if ex_sum_str != "":
            try:
                ex_sum_num = float(ex_sum_str)
                diff_sum = round(abs(calc_sum - ex_sum_num), 3)
                if diff_sum > 0.1:
                    sum_verified = False
                    validation_findings.append({
                        "severity": "WARNING",
                        "category": "SUM_DISCREPANCY",
                        "source_name": col_info["source_name"],
                        "location": col_info["location"],
                        "timestamp_str": "Shift Summary",
                        "row_num": 59,
                        "col_num": c,
                        "observed_value": f"Calc: {calc_sum:.2f} kWh",
                        "expected_range": f"Excel: {ex_sum_num:.2f} kWh",
                        "explanation": f"Discrepancy of {diff_sum:.2f} kWh between independent calculation and Excel reported sum."
                    })
            except ValueError:
                sum_verified = False

        # Load factor calculation for motors
        avg_load_pct = None
        overload_count = 0
        idle_count = 0
        if col_info["rated_15m_kwh"] and col_info["rated_15m_kwh"] > 0:
            rated = col_info["rated_15m_kwh"]
            overload_count = sum(1 for v in c_readings if v > rated)
            idle_count = sum(1 for v in c_readings if 0 < v < (rated * 0.40))
            if valid_count > 0:
                avg_load_pct = round((calc_avg / rated) * 100.0, 2)

        verified_calculations.append({
            "col_index": c,
            "source_name": col_info["source_name"],
            "location": col_info["location"],
            "motor_hp": col_info["motor_hp"],
            "rated_15m_kwh": col_info["rated_15m_kwh"],
            "is_duplicate": col_info["is_duplicate"],
            "excel_min": ex["excel_min"],
            "excel_max": ex["excel_max"],
            "excel_avg": ex["excel_avg"],
            "excel_sum": ex["excel_sum"],
            "calc_min": round(calc_min, 3),
            "calc_max": round(calc_max, 3),
            "calc_avg": round(calc_avg, 3),
            "calc_sum": round(calc_sum, 3),
            "count_valid": valid_count,
            "count_zero": zero_count,
            "count_blank": blank_count,
            "count_overload": overload_count,
            "count_idle": idle_count,
            "avg_load_pct": avg_load_pct,
            "sum_verified": sum_verified,
            "verification_diff": diff_sum
        })

    return {
        "metadata": metadata,
        "columns": columns,
        "intervals": intervals,
        "calculations": verified_calculations,
        "validation_findings": validation_findings
    }
