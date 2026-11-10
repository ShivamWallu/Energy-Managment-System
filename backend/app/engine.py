import datetime
from typing import Dict, List, Any, Optional
from backend.app.config import settings

def compute_plant_energy_balance(parsed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes rigorous energy balance across electrical hierarchy:
    Main Incomer -> PCC Panel Outgoing Feeders -> MCC Panel Incomers -> Sub-Motors.
    Clearly separates raw telemetry from anomaly-isolated metrics.
    """
    columns = parsed_data["columns"]
    intervals = parsed_data["intervals"]
    calcs = {c["col_index"]: c for c in parsed_data["calculations"]}
    
    # Identify key feeders and incomers by col_index
    col_map = {c["source_name"].strip().upper(): c["col_index"] for c in columns}
    
    # 1. Main Incomer
    main_inc_col = col_map.get("MAIN INC 4 F1")
    main_inc_sum = calcs[main_inc_col]["calc_sum"] if main_inc_col else 0.0
    
    # 2. DG Incomer
    dg_inc_col = col_map.get("DG INC 5 F1")
    dg_inc_sum = calcs[dg_inc_col]["calc_sum"] if dg_inc_col else 0.0
    
    # 3. PCC Feeders
    pcc_feeders = [
        "EXPELLER PANEL 1 9 F3", "EXPELLER PANEL 2 10 F1", "EXPELLER PANEL 3 10 F2",
        "EXPELLER PANEL 4 10 F3", "EXPELLER PANEL 5 11 F1", "KOHLU PANEL 1 9 F1",
        "KOHLU PANEL 2 9 F2", "LIGHTING SUPPLY 11 F4", "OFFICE AND LAB SUPPLY 10 F4",
        "SEED UNLOADING 11 F2", "CAP BANK INC 3 F1", "CAP BANK INC 6 F1"
    ]
    pcc_breakdown = []
    pcc_total = 0.0
    for feeder in pcc_feeders:
        c_idx = col_map.get(feeder)
        if c_idx:
            val = calcs[c_idx]["calc_sum"]
            pcc_total += val
            pcc_breakdown.append({
                "feeder": feeder,
                "col_index": c_idx,
                "consumption_kwh": val
            })

    # 4. Expeller Section Breakdown (Expellers 1 to 5)
    expellers_summary = []
    total_expeller_incomers = 0.0
    total_expeller_motors = 0.0
    
    for exp_num in range(1, 6):
        inc_name = f"INC EXPELLER {exp_num} 1 F1"
        inc_col = col_map.get(inc_name)
        inc_sum = calcs[inc_col]["calc_sum"] if inc_col else 0.0
        total_expeller_incomers += inc_sum
        
        # Sub-motors for this expeller
        motors = []
        motors_sum = 0.0
        seen_motor_sources = set()
        for col_info in columns:
            src = col_info["source_name"]
            if f"M{exp_num}" in src and "INC" not in src:
                # If duplicate column (like P4 in M5), count only primary instance for physical sum
                is_dup = src in seen_motor_sources
                seen_motor_sources.add(src)
                
                c_idx = col_info["col_index"]
                m_calc = calcs[c_idx]
                val = m_calc["calc_sum"]
                
                if not is_dup:
                    motors_sum += val
                    
                motors.append({
                    "col_index": c_idx,
                    "source_name": src,
                    "motor_hp": col_info["motor_hp"],
                    "rated_15m_kwh": col_info["rated_15m_kwh"],
                    "consumption_kwh": val,
                    "avg_load_pct": m_calc["avg_load_pct"],
                    "overload_count": m_calc["count_overload"],
                    "idle_count": m_calc["count_idle"],
                    "blank_count": m_calc["count_blank"],
                    "is_duplicate_col": is_dup
                })
        
        total_expeller_motors += motors_sum
        loss_kwh = inc_sum - motors_sum
        loss_pct = round((loss_kwh / inc_sum * 100.0), 2) if inc_sum > 0 else 0.0
        
        expellers_summary.append({
            "section": f"Expeller {exp_num}",
            "incomer_kwh": inc_sum,
            "motors_sum_kwh": round(motors_sum, 2),
            "distribution_diff_kwh": round(loss_kwh, 2),
            "distribution_diff_pct": loss_pct,
            "motors": motors
        })

    # 5. Kohlu Section Breakdown
    kohlus_summary = []
    total_kohlu_incomers = 0.0
    total_kohlu_motors_raw = 0.0
    total_kohlu_motors_cleaned = 0.0
    
    for k_sec in [1, 2]:
        inc_name = f"INC KOHLU {k_sec} 1 F1"
        inc_col = col_map.get(inc_name)
        inc_sum = calcs[inc_col]["calc_sum"] if inc_col else 0.0
        total_kohlu_incomers += inc_sum
        
        motors = []
        motors_sum_raw = 0.0
        motors_sum_cleaned = 0.0
        
        # Kohlu motors 1-6 for Sec 1, 7-12 for Sec 2
        for col_info in columns:
            src = col_info["source_name"]
            loc = col_info["location"]
            if f"KOHLU {k_sec}" in loc and "INC" not in src:
                c_idx = col_info["col_index"]
                m_calc = calcs[c_idx]
                val = m_calc["calc_sum"]
                motors_sum_raw += val
                
                # If Kohlu 4 spike (14,326.8 kWh), compute cleaned sum
                cleaned_val = val
                if c_idx == col_map.get("KOHLU 4 2 F4") and val > 1000:
                    cleaned_val = round(val - 14326.8 + 4.0, 2) # substitute typical 4 kWh interval
                motors_sum_cleaned += cleaned_val
                
                motors.append({
                    "col_index": c_idx,
                    "source_name": src,
                    "consumption_raw_kwh": val,
                    "consumption_cleaned_kwh": cleaned_val,
                    "avg_load_pct": m_calc["avg_load_pct"],
                    "overload_count": m_calc["count_overload"],
                    "idle_count": m_calc["count_idle"],
                    "blank_count": m_calc["count_blank"],
                })
                
        total_kohlu_motors_raw += motors_sum_raw
        total_kohlu_motors_cleaned += motors_sum_cleaned
        
        kohlus_summary.append({
            "section": f"Kohlu Section {k_sec}",
            "incomer_kwh": inc_sum,
            "motors_sum_raw_kwh": round(motors_sum_raw, 2),
            "motors_sum_cleaned_kwh": round(motors_sum_cleaned, 2),
            "motors": motors
        })

    # 6. Motor Category Rollup (75 HP vs 60 HP vs 50 HP vs Kohlus)
    category_metrics = {
        "75_HP": {"count": 0, "total_kwh": 0.0, "rated_15m": 13.95, "overload_events": 0, "idle_events": 0, "valid_readings": 0, "sum_load_pct": 0.0},
        "60_HP": {"count": 0, "total_kwh": 0.0, "rated_15m": 11.16, "overload_events": 0, "idle_events": 0, "valid_readings": 0, "sum_load_pct": 0.0},
        "50_HP": {"count": 0, "total_kwh": 0.0, "rated_15m": 9.30,  "overload_events": 0, "idle_events": 0, "valid_readings": 0, "sum_load_pct": 0.0},
        "Kohlu_Motors": {"count": 0, "total_kwh": 0.0, "rated_15m": 6.00, "overload_events": 0, "idle_events": 0, "valid_readings": 0, "sum_load_pct": 0.0}
    }
    
    seen_sources_cat = set()
    for col_info in columns:
        src = col_info["source_name"]
        if "INC" in src or "PANEL" in src or "SUPPLY" in src or "BANK" in src or "DG" in src:
            continue
        # Avoid double-counting duplicate columns
        if src in seen_sources_cat:
            continue
        seen_sources_cat.add(src)
        
        hp = col_info["motor_hp"]
        c_idx = col_info["col_index"]
        c_calc = calcs[c_idx]
        
        key = None
        if hp == 75: key = "75_HP"
        elif hp == 60: key = "60_HP"
        elif hp == 50: key = "50_HP"
        elif "KOHLU" in src: key = "Kohlu_Motors"
        
        if key:
            cat = category_metrics[key]
            cat["count"] += 1
            cat["total_kwh"] += c_calc["calc_sum"]
            cat["overload_events"] += c_calc["count_overload"]
            cat["idle_events"] += c_calc["count_idle"]
            cat["valid_readings"] += c_calc["count_valid"]
            if c_calc["avg_load_pct"]:
                cat["sum_load_pct"] += c_calc["avg_load_pct"]
                
    for k, v in category_metrics.items():
        v["total_kwh"] = round(v["total_kwh"], 2)
        v["avg_load_pct"] = round(v["sum_load_pct"] / v["count"], 2) if v["count"] > 0 else 0.0
        del v["sum_load_pct"]

    # 7. Time-Series Profiles (15-min interval totals for charts)
    timeline_labels = [it["timestamp_str"] for it in intervals]
    timeline_main_incomer = []
    timeline_expellers_total = []
    timeline_kohlus_total = []
    timeline_utilities_total = []
    
    # 15-Minute Motor Health Tracking based on WhatsApp Operating Ranges:
    # 10% - 40%: Low-load / Idle
    # 50% - 80%: Healthy Operating Load
    # > 80%: Overload Risk
    timeline_health_healthy = []
    timeline_health_idle = []
    timeline_health_overload = []
    timeline_health_stopped = []

    total_healthy_readings = 0
    total_idle_readings = 0
    total_overload_readings = 0
    total_stopped_readings = 0
    
    motor_cols = [c for c in columns if c["rated_15m_kwh"] and c["rated_15m_kwh"] > 0 and not c["is_duplicate"]]

    for it in intervals:
        r = it["readings"]
        # Main Incomer
        main_val = r[main_inc_col]["numeric_val"] if main_inc_col and r[main_inc_col]["numeric_val"] is not None else 0.0
        timeline_main_incomer.append(round(main_val, 2))
        
        # Expeller Incomers sum
        exp_int_sum = sum(
            r[c_idx]["numeric_val"] for exp_name in ["INC EXPELLER 1 1 F1", "INC EXPELLER 2 1 F1", "INC EXPELLER 3 1 F1", "INC EXPELLER 4 1 F1", "INC EXPELLER 5 1 F1"]
            if (c_idx := col_map.get(exp_name)) and r[c_idx]["numeric_val"] is not None
        )
        timeline_expellers_total.append(round(exp_int_sum, 2))
        
        # Kohlu Incomers sum
        k_int_sum = sum(
            r[c_idx]["numeric_val"] for k_name in ["INC KOHLU 1 1 F1", "INC KOHLU 2 1 F1"]
            if (c_idx := col_map.get(k_name)) and r[c_idx]["numeric_val"] is not None
        )
        timeline_kohlus_total.append(round(k_int_sum, 2))
        
        # Utilities (Lighting + Office + Seed Unloading)
        util_sum = sum(
            r[c_idx]["numeric_val"] for u_name in ["LIGHTING SUPPLY 11 F4", "OFFICE AND LAB SUPPLY 10 F4", "SEED UNLOADING 11 F2"]
            if (c_idx := col_map.get(u_name)) and r[c_idx]["numeric_val"] is not None
        )
        timeline_utilities_total.append(round(util_sum, 2))

        # Motor Health Count in this 15-min slot
        int_healthy = 0
        int_idle = 0
        int_overload = 0
        int_stopped = 0

        for mc in motor_cols:
            c_idx = mc["col_index"]
            val = r[c_idx]["numeric_val"]
            rated = mc["rated_15m_kwh"]
            if val is None or val < (rated * 0.10):
                int_stopped += 1
                total_stopped_readings += 1
            else:
                pct = (val / rated) * 100.0
                if pct > 80.0:
                    int_overload += 1
                    total_overload_readings += 1
                elif 50.0 <= pct <= 80.0:
                    int_healthy += 1
                    total_healthy_readings += 1
                elif 10.0 <= pct < 40.0:
                    int_idle += 1
                    total_idle_readings += 1
                else: # 40% - 50%
                    int_healthy += 1
                    total_healthy_readings += 1

        timeline_health_healthy.append(int_healthy)
        timeline_health_idle.append(int_idle)
        timeline_health_overload.append(int_overload)
        timeline_health_stopped.append(int_stopped)

    total_active_readings = total_healthy_readings + total_idle_readings + total_overload_readings
    health_score_pct = round((total_healthy_readings / total_active_readings * 100.0), 1) if total_active_readings > 0 else 0.0

    return {
        "main_incomer_kwh": round(main_inc_sum, 2),
        "dg_incomer_kwh": round(dg_inc_sum, 2),
        "pcc_total_feeders_kwh": round(pcc_total, 2),
        "total_expeller_incomers_kwh": round(total_expeller_incomers, 2),
        "total_expeller_motors_kwh": round(total_expeller_motors, 2),
        "total_kohlu_incomers_kwh": round(total_kohlu_incomers, 2),
        "total_kohlu_motors_raw_kwh": round(total_kohlu_motors_raw, 2),
        "total_kohlu_motors_cleaned_kwh": round(total_kohlu_motors_cleaned, 2),
        "expellers": expellers_summary,
        "kohlus": kohlus_summary,
        "motor_categories": category_metrics,
        "pcc_feeders": pcc_breakdown,
        "health_summary": {
            "health_score_pct": health_score_pct,
            "healthy_count": total_healthy_readings,
            "idle_count": total_idle_readings,
            "overload_count": total_overload_readings,
            "stopped_count": total_stopped_readings,
            "total_evaluated": total_active_readings + total_stopped_readings
        },
        "timeline": {
            "labels": timeline_labels,
            "main_incomer": timeline_main_incomer,
            "expellers": timeline_expellers_total,
            "kohlus": timeline_kohlus_total,
            "utilities": timeline_utilities_total
        },
        "health_timeline": {
            "labels": timeline_labels,
            "healthy": timeline_health_healthy,
            "idle": timeline_health_idle,
            "overload": timeline_health_overload,
            "stopped": timeline_health_stopped
        }
    }
