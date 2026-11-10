import pytest
import os
from backend.app.excel_parser import parse_ems_excel_file
from backend.app.engine import compute_plant_energy_balance

SAMPLE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample_data"))
SHIFT_1_FILE = os.path.join(SAMPLE_PATH, "Reports_Shift_110232026_7_00 PM.XLSX")
SHIFT_2_FILE = os.path.join(SAMPLE_PATH, "Reports_Shift_210242026_7_00 AM.XLSX")

@pytest.mark.skipif(not os.path.exists(SHIFT_1_FILE), reason="Shift 1 file not present")
def test_energy_balance_shift_1():
    parsed = parse_ems_excel_file(SHIFT_1_FILE)
    balance = compute_plant_energy_balance(parsed)
    
    # Main Incomer grid total
    assert balance["main_incomer_kwh"] == 7867.0
    assert balance["total_expeller_incomers_kwh"] == 5122.8
    assert balance["total_kohlu_incomers_kwh"] == 2428.02
    
    # Verify electrical distribution balance
    sum_sections = balance["total_expeller_incomers_kwh"] + balance["total_kohlu_incomers_kwh"]
    assert sum_sections < balance["main_incomer_kwh"]
    assert balance["main_incomer_kwh"] - sum_sections < 400.0

def test_calculation_verification():
    target_file = SHIFT_2_FILE if os.path.exists(SHIFT_2_FILE) else SHIFT_1_FILE
    parsed = parse_ems_excel_file(target_file)
    
    # Across all columns with non-empty sums, calculated sum must match reported excel sum within 0.1
    verified_count = 0
    for c in parsed["calculations"]:
        if c["excel_sum"] and c["excel_sum"] != "":
            try:
                ex_num = float(c["excel_sum"].replace(",", ""))
                diff = abs(c["calc_sum"] - ex_num)
                assert diff < 0.1, f"Mismatch in {c['source_name']}: calc={c['calc_sum']} vs excel={ex_num}"
                verified_count += 1
            except ValueError:
                pass
                
    assert verified_count > 40

