// ==========================================================================
// EMS Intelligence - API Client & Session Manager
// ==========================================================================

const API_BASE = '/api';

const api = {
  getToken() {
    return localStorage.getItem('ems_jwt_token');
  },
  setToken(token) {
    if (token) {
      localStorage.setItem('ems_jwt_token', token);
    } else {
      localStorage.removeItem('ems_jwt_token');
    }
  },
  isTokenValid() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!payload.exp) return true;
      return (payload.exp * 1000) > (Date.now() + 10000);
    } catch (e) {
      return false;
    }
  },
  getUser() {
    const u = localStorage.getItem('ems_user');
    return u ? JSON.parse(u) : null;
  },
  setUser(user) {
    if (user) {
      localStorage.setItem('ems_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('ems_user');
    }
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      if (res.status === 401 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        const detail = (errData && errData.detail) || '';
        const isBlocked = (res.status === 403 && (
          res.headers?.get('x-account-blocked') === 'true' || 
          (typeof detail === 'string' && (detail.toLowerCase().includes('block') || detail.toLowerCase().includes('deactivat') || detail.toLowerCase().includes('revok')))
        ));

        if (isBlocked) {
          this.setToken(null);
          this.setUser(null);
          sessionStorage.setItem('ems_account_blocked', 'true');
          sessionStorage.setItem('ems_block_reason', typeof detail === 'string' ? detail : 'Your account has been deactivated/blocked by Administrator.');
          window.dispatchEvent(new CustomEvent('auth:blocked', { 
            detail: { message: detail || 'Your account has been deactivated/blocked by Administrator.' } 
          }));
          throw new Error(detail || 'Your account has been blocked by Administrator.');
        }

        if (res.status === 401) {
          if (!endpoint.includes('/auth/login')) {
            this.setToken(null);
            this.setUser(null);
            window.dispatchEvent(new CustomEvent('auth:expired'));
            throw new Error('Please sign in to continue.');
          }
          // Login form 401 is incorrect password - not an expired session
          const loginErr = new Error(detail || 'Incorrect password. Please verify credentials or use Forgot Password.');
          loginErr.status = 401;
          loginErr.data = errData;
          throw loginErr;
        }
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errorMsg = `Request failed with status ${res.status}`;
        
        if (errData && errData.detail) {
          if (typeof errData.detail === 'string') {
            errorMsg = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            // Format FastAPI Pydantic validation error objects into readable text
            errorMsg = errData.detail.map(item => {
              if (typeof item === 'string') return item;
              const field = item.loc ? item.loc[item.loc.length - 1] : '';
              return field ? `${field}: ${item.msg}` : (item.msg || JSON.stringify(item));
            }).join(' | ');
          } else if (typeof errData.detail === 'object') {
            errorMsg = errData.detail.message || JSON.stringify(errData.detail);
          }
        }
        const customErr = new Error(errorMsg);
        customErr.status = res.status;
        customErr.data = errData;
        if (res.status === 404 || res.headers?.get('x-user-exists') === 'false') {
          customErr.isUserNotFound = true;
        }
        throw customErr;
      }

      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(data.access_token);
    this.setUser(data.user);
    return data;
  },

  async requestOtp(arg1, email, password, confirm_password = null) {
    let payload;
    if (typeof arg1 === 'object' && arg1 !== null) {
      payload = {
        name: arg1.name,
        email: arg1.email,
        password: arg1.password,
        confirm_password: arg1.confirm_password || arg1.confirmPassword || null
      };
    } else {
      payload = {
        name: arg1,
        email: email,
        password: password,
        confirm_password: confirm_password
      };
    }
    return await this.request('/auth/register/request-otp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async verifyOtp(arg1, otp_code) {
    let payload;
    if (typeof arg1 === 'object' && arg1 !== null) {
      payload = {
        email: arg1.email,
        otp_code: arg1.otp_code || arg1.otpCode || otp_code
      };
    } else {
      payload = {
        email: arg1,
        otp_code: otp_code
      };
    }
    const data = await this.request('/auth/register/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.access_token) {
      this.setToken(data.access_token);
      this.setUser(data.user);
    }
    return data;
  },

  async requestForgotPasswordOtp(email) {
    return await this.request('/auth/forgot-password/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email: typeof email === 'object' ? email.email : email })
    });
  },

  async resetPassword(arg1, otp_code, new_password, confirm_password) {
    let payload;
    if (typeof arg1 === 'object' && arg1 !== null) {
      payload = {
        email: arg1.email,
        otp_code: arg1.otp_code || arg1.otpCode,
        new_password: arg1.new_password || arg1.newPassword,
        confirm_password: arg1.confirm_password || arg1.confirmPassword
      };
    } else {
      payload = { email: arg1, otp_code, new_password, confirm_password };
    }
    return await this.request('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout API notification failed:', e);
    } finally {
      this.setToken(null);
      this.setUser(null);
    }
  },

  async getMe() {
    return await this.request('/auth/me');
  },

  // Accounts Management (Admin Only)
  async getAccounts(params = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', params.page);
    if (params.limit) sp.set('limit', params.limit);
    if (params.search) sp.set('search', params.search);
    if (params.status_filter) sp.set('status_filter', params.status_filter);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return await this.request(`/accounts${qs}`);
  },

  async toggleAccountStatus(userId) {
    return await this.request(`/accounts/${userId}/toggle-status`, {
      method: 'POST'
    });
  },

  async deleteAccount(userId) {
    return await this.request(`/accounts/${userId}`, {
      method: 'DELETE'
    });
  },

  // Activity Logs (Admin Audit Trail)
  async getActivityLogs(params = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', params.page);
    if (params.limit) sp.set('limit', params.limit);
    if (params.search) sp.set('search', params.search);
    if (params.activity_type) sp.set('activity_type', params.activity_type);
    if (params.status) sp.set('status', params.status);
    if (params.sort_by) sp.set('sort_by', params.sort_by);
    if (params.sort_order) sp.set('sort_order', params.sort_order);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return await this.request(`/activity-logs${qs}`);
  },

  async getActivitySummary() {
    return await this.request('/activity-logs/summary');
  },

  // Reports & Backups
  async getReportsVersion() {
    return await this.request('/reports/version');
  },

  async getReportsList(onlyMyUploads = false) {
    const q = onlyMyUploads ? '?only_my_uploads=true' : '';
    return await this.request(`/reports/list${q}`);
  },

  async deleteReport(reportId) {
    return await this.request(`/reports/${reportId}`, { method: 'DELETE' });
  },

  async deleteReportBatch(batchId) {
    return await this.request(`/reports/batch/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
  },

  async getBackupsList() {
    return await this.request('/reports/backups/list');
  },

  async uploadReport(file) {
    const formData = new FormData();
    formData.append('file', file);
    return await this.request('/reports/upload', {
      method: 'POST',
      body: formData
    });
  },

  async uploadMultiReports(files = []) {
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    return await this.request('/reports/upload-multi', {
      method: 'POST',
      body: formData
    });
  },

  // Analytics & Dashboard
  async getDashboardData(reportId = null) {
    const q = reportId ? `?report_id=${reportId}` : '';
    return await this.request(`/analytics/dashboard${q}`);
  },

  async getTelemetryMatrix(reportId = null, maxCol = 46) {
    const params = new URLSearchParams();
    if (reportId) params.append('report_id', reportId);
    if (maxCol) params.append('max_col', maxCol);
    const q = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/analytics/telemetry-matrix${q}`);
  },

  async getMachines(reportId, section = null) {
    let q = `?report_id=${reportId}`;
    if (section) q += `&section=${encodeURIComponent(section)}`;
    return await this.request(`/analytics/machines${q}`);
  },

  async getRawReadings(reportId, colIndex = null, sourceName = null, page = 1, pageSize = 48) {
    const params = new URLSearchParams({ report_id: reportId, page, page_size: pageSize });
    if (colIndex) params.append('col_index', colIndex);
    if (sourceName) params.append('source_name', sourceName);
    return await this.request(`/analytics/raw-readings?${params.toString()}`);
  },

  async getExpellerDetail(expellerNum = 1, reportId = null) {
    const params = new URLSearchParams({ expeller_num: expellerNum });
    if (reportId) params.append('report_id', reportId);
    return await this.request(`/analytics/expeller-detail?${params.toString()}`);
  },

  async getAllExpellersDetail(reportId = null) {
    const params = new URLSearchParams();
    if (reportId) params.append('report_id', reportId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/analytics/all-expellers-detail${q}`);
  },

  async getKohluDetail(panelNum = 1, reportId = null) {
    const params = new URLSearchParams({ panel_num: panelNum });
    if (reportId) params.append('report_id', reportId);
    return await this.request(`/analytics/kohlu-detail?${params.toString()}`);
  },

  async getAllKohlusDetail(reportId = null) {
    const params = new URLSearchParams();
    if (reportId) params.append('report_id', reportId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/analytics/all-kohlus-detail${q}`);
  },

  async getMotorsByRating(filterKey = null, reportId = null) {
    const params = new URLSearchParams();
    if (filterKey && filterKey !== 'all') {
      const strKey = String(filterKey).trim().toUpperCase();
      if (['P1', 'P2', 'P3', 'P4', 'P5', 'KOHLU'].includes(strKey)) {
        params.append('motor_pos', strKey);
      } else {
        const num = parseInt(strKey, 10);
        if (!isNaN(num)) params.append('hp', num);
      }
    }
    if (reportId) params.append('report_id', reportId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/analytics/motors-by-rating${q}`);
  }
};

// Global Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'fa-circle-check text-emerald' : 
               type === 'error' ? 'fa-triangle-exclamation text-red' : 
               type === 'warning' ? 'fa-circle-exclamation text-amber' : 'fa-circle-info text-cyan';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div style="flex: 1; font-size: 0.85rem;">${message}</div>
    <button style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}
