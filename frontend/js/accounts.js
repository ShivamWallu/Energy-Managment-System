// ==========================================================================
// EMS Intelligence - User Accounts & Access Control Manager (Admin Only)
// ==========================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

const accounts = {
  state: {
    items: [],
    search: '',
    statusFilter: 'ALL',
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    isLoading: false,
    pendingDelete: null
  },

  searchDebounceTimer: null,

  async init() {
    this.bindEvents();
  },

  bindEvents() {
    // Custom events or triggers can be wired here
  },

  onSearch(val) {
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.state.search = (val || '').trim();
      this.state.page = 1;
      this.loadAccounts();
    }, 250);
  },

  onStatusFilter(val) {
    this.state.statusFilter = val || 'ALL';
    this.state.page = 1;
    this.loadAccounts();
  },

  onLimitChange(limitVal) {
    this.state.limit = parseInt(limitVal, 10) || 10;
    this.state.page = 1;
    this.loadAccounts();
  },

  setPage(pageNum) {
    if (pageNum < 1 || pageNum > this.state.totalPages) return;
    this.state.page = pageNum;
    this.loadAccounts();
  },

  async loadAccounts(targetPage = null) {
    if (targetPage !== null) this.state.page = targetPage;

    const tbody = document.getElementById('accounts-table-body');
    const badgeEl = document.getElementById('accounts-count-badge');
    const tableWrap = document.querySelector('#tab-accounts .table-responsive');
    const toolbar = document.querySelector('#tab-accounts .table-toolbar');
    const footer = document.getElementById('accounts-pagination-footer');
    const noticeEl = document.getElementById('accounts-restricted-notice');

    const currentUser = api.getUser();
    const role = (currentUser && currentUser.role ? currentUser.role : (document.getElementById('header-user-role')?.textContent || 'admin')).toLowerCase();
    const isAdmin = (role === 'admin');

    if (!isAdmin) {
      if (noticeEl) noticeEl.style.display = 'block';
      if (tableWrap) tableWrap.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      if (footer) footer.style.display = 'none';
      return;
    }

    if (noticeEl) noticeEl.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';
    if (toolbar) toolbar.style.display = 'flex';

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Fetching registered accounts...</td></tr>`;
    }

    try {
      this.state.isLoading = true;
      const res = await api.getAccounts({
        page: this.state.page,
        limit: this.state.limit,
        search: this.state.search,
        status_filter: this.state.statusFilter
      });

      this.state.items = res.items || [];
      this.state.total = res.total || 0;
      this.state.totalPages = res.total_pages || 1;
      this.state.page = res.page || 1;

      if (badgeEl) {
        badgeEl.textContent = `${this.state.total} Account${this.state.total === 1 ? '' : 's'}`;
      }

      this.renderTable(this.state.items);
      this.renderPagination(res);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--accent-red);"><i class="fa-solid fa-circle-exclamation"></i> ${err.message || 'Error loading accounts.'}</td></tr>`;
      }
    } finally {
      this.state.isLoading = false;
    }
  },

  renderTable(items) {
    const tbody = document.getElementById('accounts-table-body');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.88rem;"><i class="fa-solid fa-user-slash" style="font-size:1.5rem; margin-bottom:0.5rem; display:block; opacity:0.6;"></i>No user accounts match current filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(u => {
      const isActive = u.is_active;
      const statusBadge = isActive
        ? `<span class="badge badge-success" style="font-weight:700;"><i class="fa-solid fa-circle-check"></i> ACTIVE</span>`
        : `<span class="badge badge-danger" style="font-weight:700; background:rgba(239,68,68,0.2); color:#ef4444;"><i class="fa-solid fa-ban"></i> BLOCKED</span>`;

      // Action buttons: Admin can Block/Unblock and Permanently Delete
      const actionHtml = u.is_current_admin
        ? `<button class="btn btn-secondary btn-sm" disabled title="Currently signed-in administrator account" style="opacity:0.6; cursor:not-allowed; font-size:0.74rem; padding:0.25rem 0.6rem;"><i class="fa-solid fa-user-shield"></i> You (Admin)</button>`
        : `
          <div style="display:flex; align-items:center; justify-content:center; gap:0.4rem; flex-wrap:wrap;">
            ${isActive
              ? `<button class="btn-block-user" onclick="accounts.toggleStatus(${u.id}, '${escapeHtml(u.name)}')"><i class="fa-solid fa-user-lock"></i> Block</button>`
              : `<button class="btn-unblock-user" onclick="accounts.toggleStatus(${u.id}, '${escapeHtml(u.name)}')"><i class="fa-solid fa-unlock"></i> Unblock</button>`
            }
            <button class="btn-delete-user" title="Permanently delete this user from database" onclick="accounts.confirmDelete(${u.id}, '${escapeHtml(u.name)}', '${escapeHtml(u.email)}')">
              <i class="fa-solid fa-trash-can"></i> Delete
            </button>
          </div>
        `;

      const roleBadge = u.role === 'admin'
        ? `<span class="badge badge-info" style="font-size:0.7rem; padding:0.15rem 0.4rem; margin-left:0.4rem;"><i class="fa-solid fa-crown text-amber"></i> ADMIN</span>`
        : `<span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-secondary); font-size:0.7rem; padding:0.15rem 0.4rem; margin-left:0.4rem;">USER</span>`;

      return `
        <tr style="${!isActive ? 'opacity:0.75; background:rgba(239,68,68,0.03);' : ''}">
          <td>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg, rgba(0,210,255,0.2), rgba(168,85,247,0.2)); border:1px solid rgba(0,210,255,0.3); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.78rem; color:var(--text-primary); flex-shrink:0;">
                ${escapeHtml((u.name || 'U').substring(0, 2).toUpperCase())}
              </div>
              <div>
                <div style="font-weight:700; color:var(--text-primary); font-size:0.86rem; display:flex; align-items:center;">
                  ${escapeHtml(u.name)}
                  ${roleBadge}
                </div>
                <div style="font-size:0.72rem; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-size:0.84rem; color:var(--text-primary); font-family:monospace;">${escapeHtml(u.email || '—')}</div>
          </td>
          <td>
            <div style="font-size:0.82rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem; white-space:nowrap;">
              <i class="fa-regular fa-clock text-cyan" style="font-size:0.75rem;"></i>
              ${escapeHtml(u.registration_date || '—')}
            </div>
          </td>
          <td style="text-align:center;">
            ${statusBadge}
          </td>
          <td style="text-align:center;">
            ${actionHtml}
          </td>
        </tr>
      `;
    }).join('');
  },

  renderPagination(data) {
    const footer = document.getElementById('accounts-pagination-footer');
    if (!footer) return;

    const total = data.total || 0;
    const page = data.page || 1;
    const limit = data.limit || 10;
    const totalPages = data.total_pages || 1;

    if (total <= 0) {
      footer.style.display = 'none';
      return;
    }

    footer.style.display = 'flex';

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const startEl = document.getElementById('accounts-showing-start');
    const endEl = document.getElementById('accounts-showing-end');
    const totalEl = document.getElementById('accounts-total-records');
    if (startEl) startEl.textContent = start;
    if (endEl) endEl.textContent = end;
    if (totalEl) totalEl.textContent = total;

    const controls = document.getElementById('accounts-pagination-controls');
    if (!controls) return;

    let pagesHtml = `
      <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="accounts.setPage(${page - 1})">
        <i class="fa-solid fa-chevron-left"></i> Prev
      </button>
    `;

    // Calculate smart page window (up to 5 pages)
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
      pagesHtml += `<button class="btn btn-secondary btn-sm" onclick="accounts.setPage(1)">1</button>`;
      if (startPage > 2) pagesHtml += `<span style="color:var(--text-muted); padding:0 0.2rem;">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      if (p === page) {
        pagesHtml += `<button class="btn btn-primary btn-sm" style="font-weight:700; min-width:32px;">${p}</button>`;
      } else {
        pagesHtml += `<button class="btn btn-secondary btn-sm" style="min-width:32px;" onclick="accounts.setPage(${p})">${p}</button>`;
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pagesHtml += `<span style="color:var(--text-muted); padding:0 0.2rem;">...</span>`;
      pagesHtml += `<button class="btn btn-secondary btn-sm" onclick="accounts.setPage(${totalPages})">${totalPages}</button>`;
    }

    pagesHtml += `
      <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="accounts.setPage(${page + 1})">
        Next <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;

    controls.innerHTML = pagesHtml;
  },

  async toggleStatus(userId, userName) {
    const target = this.state.items.find(u => u.id === userId);
    const actionWord = target && target.is_active ? 'block' : 'unblock';

    const confirmMsg = `Are you sure you want to ${actionWord.toUpperCase()} user "${userName}"? \n\n${target && target.is_active ? 'Blocked users are immediately denied login access to the platform.' : 'Unblocking will allow the user to log in again.'}`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const res = await api.toggleAccountStatus(userId);
      showToast(res.message || `Account status updated.`, 'success');
      await this.loadAccounts();
      if (window.validation && typeof validation.loadActivityLogs === 'function') {
        validation.loadActivityLogs();
      }
    } catch (err) {
      showToast(err.message || `Failed to update account status.`, 'error');
    }
  },

  // Permanent Delete Flow with Professional Confirmation Modal
  confirmDelete(userId, userName, userEmail) {
    this.state.pendingDelete = { id: userId, name: userName, email: userEmail };
    const modal = document.getElementById('delete-account-modal');
    const targetNameEl = document.getElementById('delete-account-target-name');
    const targetEmailEl = document.getElementById('delete-account-target-email');
    if (targetNameEl) targetNameEl.textContent = userName;
    if (targetEmailEl) targetEmailEl.textContent = userEmail;
    if (modal) modal.classList.add('active');
  },

  closeDeleteModal() {
    this.state.pendingDelete = null;
    const modal = document.getElementById('delete-account-modal');
    if (modal) modal.classList.remove('active');
  },

  async executeDelete() {
    if (!this.state.pendingDelete) return;
    const { id, name } = this.state.pendingDelete;
    const btn = document.getElementById('btn-confirm-delete-account');

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Deleting Account...`;
      }
      const res = await api.deleteAccount(id);
      this.closeDeleteModal();
      showToast(res.message || `Account "${name}" permanently deleted.`, 'success');
      
      // Step back 1 page if we deleted the last item on current page
      if (this.state.items.length <= 1 && this.state.page > 1) {
        this.state.page--;
      }
      await this.loadAccounts();

      if (window.validation && typeof validation.loadActivityLogs === 'function') {
        validation.loadActivityLogs();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete account.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Permanently Delete Account`;
      }
    }
  }
};

window.accounts = accounts;
