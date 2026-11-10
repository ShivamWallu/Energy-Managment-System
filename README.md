# EMS Intelligence — Enterprise Energy Management System

EMS Intelligence is an industrial-grade Energy Management System (EMS), SCADA analytics platform, and telemetry verification engine. It is built strictly with **HTML5, Vanilla CSS, and Vanilla JavaScript** on the frontend, powered by a **Python FastAPI** backend with **Pandas** and **OpenPyXL** processing, backed by **PostgreSQL**, and engineered for production deployment on **AWS EC2 with Nginx, Uvicorn, and HTTPS**.

---

## 1. Plant Electrical Hierarchy & Engineering Specifications

From the plant single-line diagram and engineer's operational sizing sheet:
- **Conversion Factor**: $1\text{ HP} = 0.744\text{ kW}$
- **15-Minute Interval Rated Energy**:
  $$E_{\text{rated, 15min}} (\text{kWh}) = \frac{\text{HP} \times 0.744}{4} = \text{HP} \times 0.186$$

### Standard Motor Ratings (15-Minute Slots):
| Motor Rating | Power Rating (kW) | 100% Full Load Energy (15-min) | Overload Threshold (>100%) | Idle Threshold (<40%) |
| :--- | :--- | :--- | :--- | :--- |
| **75 HP** (P1 in Expellers 1-5) | 55.80 kW | **13.95 kWh** | > 13.95 kWh | < 5.58 kWh |
| **60 HP** (P2, P3 in Expellers 1-5) | 44.64 kW | **11.16 kWh** | > 11.16 kWh | < 4.46 kWh |
| **50 HP** (P4, P5 in Expellers 1-5) | 37.20 kW | **9.30 kWh** | > 9.30 kWh | < 3.72 kWh |
| **40 HP** | 29.76 kW | **7.44 kWh** | > 7.44 kWh | < 2.98 kWh |

### Electrical Distribution Hierarchy:
1. **Tier 1 (Main Intake)**: `MAIN INC 4 F1` (PCC Panel 415V Bus, ~7,867.0 kWh in Shift 1, ~8,098.0 kWh in Shift 2).
2. **Tier 2 (Distribution Feeders)**: PCC Panel Outgoing Feeders supplying MCC panels, Capacitor Banks, Lighting, and Auxiliary loads.
3. **Tier 3 (Production MCC Incomers)**:
   - Expellers 1 to 5 Incomers (`INC EXPELLER 1..5 1 F1` = 5,122.8 kWh)
   - Kohlus 1 & 2 Incomers (`INC KOHLU 1..2 1 F1` = 2,428.02 kWh)
   - Reconciles to within **0.02 kWh** of the Main Incomer when including utility feeders!
4. **Tier 4 (Machine Sub-Motors)**: Individual motors P1 (75 HP), P2-P3 (60 HP), P4-P5 (50 HP), and Kohlu motors 1-12.

---

## 2. Rigorous Validation & Anomaly Detection

EMS Intelligence preserves original readings, decimal precision, timestamps, and operator cell highlighting without silent modification or rounding:
1. **Critical Telemetry Spike Detection (Kohlu 4)**:
   - At `23/10/2026 14:30:00`, Kohlu 4 recorded **14,326.8 kWh** in a single 15-minute slot (equivalent to 57 MW).
   - Flagged as a cumulative register rollover/telemetry glitch. The engine isolates this reading from physical consumption totals while preserving the raw audit trail.
2. **Duplicate Column Isolation (Expeller 5)**:
   - Column 30 and Column 31 both export `P4 50 HP M5 2 F4` with identical values (263 kWh).
   - Flagged as duplicate. The engine isolates the duplicate instance to prevent double-counting in motor totals.
3. **Physical Motor Overloads**:
   - Detects readings exceeding 100% capacity (e.g. Expeller 2 P1 75 HP at 37.8 kWh / 271% load, and P2 60 HP at 32.7 kWh / 293% load at 18:00:00).
4. **Idle Running Inefficiencies**:
   - Identifies active motors operating at $< 40\%$ optimal load factor (including all operator `#00B050` green highlighted cells).
5. **Downtime / Telemetry Breakdown Tagging**:
   - Preserves theme-tinted soft-red cells and unmetered blank slots during production shifts.

---

## 3. Technology Stack

- **Frontend**: HTML5, Vanilla CSS (Custom Design System with Dark/Light glassmorphism), Vanilla JavaScript, Chart.js 4.4.
- **Backend**: Python 3.14 / 3.11+, FastAPI, Uvicorn, Pandas, OpenPyXL.
- **Security**: JWT (HS256) Bearer tokens, Bcrypt password hashing, Role-Based Access Control (RBAC: Admin, Manager, Auditor).
- **Database**: PostgreSQL (Production) with SQLite local fallback, SQLAlchemy 2.0 ORM.
- **Deployment**: AWS EC2, Nginx reverse proxy, Systemd, HTTPS / Let's Encrypt SSL.

---

## 4. Running Locally

### Prerequisites
- Python 3.10+ (Python 3.14 installed)

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/your-org/ems-intelligence.git
cd "Energy Management System"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Seed database and index sample reports
python -m backend.app.seed

# 4. Start the application server
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
Open **`http://127.0.0.1:8000`** in your browser.

### Default Login Accounts
| Role | Username | Password |
| :--- | :--- | :--- |
| **System Administrator** | `admin` | `AdminPassword2026!` |
| **Plant Operations Manager** | `manager` | `ManagerPassword2026!` |
| **Energy Auditor & Inspector** | `auditor` | `AuditorPassword2026!` |

---

## 5. Running Automated Tests

Run the full pytest suite (11 unit and integration tests):
```bash
python -m pytest -v
```

---

## 6. AWS EC2 Production Deployment

See [deploy/aws_architecture_and_cost.md](deploy/aws_architecture_and_cost.md) for full architecture and estimated monthly cost breakdown (~$29 - $39 / month).

### One-Click EC2 Provisioning
```bash
chmod +x deploy/deploy_aws.sh
sudo ./deploy/deploy_aws.sh
```
The script automatically configures PostgreSQL, installs dependencies, sets up systemd (`/etc/systemd/system/ems.service`), and deploys Nginx reverse proxy with SSL.
