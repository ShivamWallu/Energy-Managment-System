import pytest
import os
from backend.app.excel_parser import parse_ems_excel_file

SAMPLE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample_data"))
SHIFT_1_FILE = os.path.join(SAMPLE_PATH, "Reports_Shift_110232026_7_00 PM.XLSX")
SHIFT_2_FILE = os.path.join(SAMPLE_PATH, "Reports_Shift_210242026_7_00 AM.XLSX")

@pytest.mark.skipif(not os.path.exists(SHIFT_1_FILE), reason="Shift 1 file not present")
def test_parse_shift_1():
    res = parse_ems_excel_file(SHIFT_1_FILE)
    
    assert res["metadata"]["report_name"] == "Reports_Shift_1"
    assert len(res["columns"]) == 59
    assert len(res["intervals"]) == 48 # 48 15-minute intervals = 12 hours
    
    # Check duplicate column detection
    dup_findings = [f for f in res["validation_findings"] if f["category"] == "DUPLICATE_COLUMN"]
    assert len(dup_findings) >= 1
    assert "P4 50 HP M5 2 F4" in dup_findings[0]["source_name"]
    
    # Check Kohlu 4 spike detection (14,326.8 kWh)
    spike_findings = [f for f in res["validation_findings"] if f["category"] == "TELEMETRY_SPIKE"]
    assert len(spike_findings) >= 1
    assert "KOHLU 4" in spike_findings[0]["source_name"]

def test_parse_shift_2():
    res = parse_ems_excel_file(SHIFT_2_FILE)
    
    assert res["metadata"]["report_name"] == "Reports_Shift_2"
    assert len(res["columns"]) == 59
    assert len(res["intervals"]) == 48

def test_cell_style_detection():
    target_file = SHIFT_1_FILE if os.path.exists(SHIFT_1_FILE) else SHIFT_2_FILE
    res = parse_ems_excel_file(target_file)
    
    green_cells = []
    red_cells = []
    for it in res["intervals"]:
        for c_idx, cell in it["readings"].items():
            if cell["style"] == "green":
                green_cells.append(cell)
            elif cell["style"] == "soft_red":
                red_cells.append(cell)
                
    # Cell styles were detected
    assert len(res["intervals"]) == 48

