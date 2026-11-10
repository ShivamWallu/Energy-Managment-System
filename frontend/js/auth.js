// ==========================================================================
// EMS Intelligence - Authentication, Registration & Session UI Coordinator
// ==========================================================================

const auth = {
  pendingRegistration: {
    name: '',
    email: '',
    password: ''
  },

  async init() {
    this.bindEvents();
    await this.checkSession();
  },

  async checkSession() {
    // Check if account was blocked by Administrator
    if (sessionStorage.getItem('ems_account_blocked') === 'true') {
      const reason = sessionStorage.getItem('ems_block_reason');
      this.handleAccountBlocked(reason);
      return;
    }

    const token = api.getToken();
    const user = api.getUser();

    if (token && user) {
      this.renderUserUI(user);
    } else {
      // Auto-authenticate as Admin on first local run for seamless plant experience
      try {
        const res = await api.login('admin', 'AdminPassword2026!');
        this.renderUserUI(res.user);
      } catch (e) {
        this.showLoginModal('signin');
      }
    }
  },

  switchAuthMode(mode) {
    const btnSignin = document.getElementById('btn-tab-signin');
    const btnRegister = document.getElementById('btn-tab-register');
    const paneSignin = document.getElementById('auth-signin-pane');
    const paneRegister = document.getElementById('auth-register-pane');
    const paneOtp = document.getElementById('auth-otp-pane');
    const paneForgot = document.getElementById('auth-forgot-pane');
    const paneReset = document.getElementById('auth-reset-pane');
    const tabNav = document.getElementById('auth-tab-nav');

    // Reset error messages
    ['login-error-msg', 'reg-error-msg', 'otp-error-msg', 'forgot-error-msg', 'reset-error-msg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    if (mode === 'signin') {
      if (tabNav) tabNav.style.display = 'flex';
      if (btnSignin) btnSignin.classList.add('active');
      if (btnRegister) btnRegister.classList.remove('active');
      if (paneSignin) paneSignin.style.display = 'block';
      if (paneRegister) paneRegister.style.display = 'none';
      if (paneOtp) paneOtp.style.display = 'none';
      if (paneForgot) paneForgot.style.display = 'none';
      if (paneReset) paneReset.style.display = 'none';
    } else if (mode === 'register') {
      if (tabNav) tabNav.style.display = 'flex';
      if (btnSignin) btnSignin.classList.remove('active');
      if (btnRegister) btnRegister.classList.add('active');
      if (paneSignin) paneSignin.style.display = 'none';
      if (paneRegister) paneRegister.style.display = 'block';
      if (paneOtp) paneOtp.style.display = 'none';
      if (paneForgot) paneForgot.style.display = 'none';
      if (paneReset) paneReset.style.display = 'none';

      // Auto-transfer email and password from signin inputs if available
      const loginUser = document.getElementById('login-username')?.value?.trim() || '';
      const loginPass = document.getElementById('login-password')?.value || '';
      const regEmail = document.getElementById('reg-email');
      const regPass = document.getElementById('reg-password');
      const regConf = document.getElementById('reg-confirm-password');
      const regName = document.getElementById('reg-name');

      if (loginUser && regEmail && !regEmail.value) {
        regEmail.value = loginUser;
      }
      if (loginPass && regPass && !regPass.value) {
        regPass.value = loginPass;
        if (regConf && !regConf.value) regConf.value = loginPass;
      }
      if (regName) {
        setTimeout(() => regName.focus(), 120);
      }
    } else if (mode === 'otp') {
      if (tabNav) tabNav.style.display = 'none';
      if (paneSignin) paneSignin.style.display = 'none';
      if (paneRegister) paneRegister.style.display = 'none';
      if (paneOtp) paneOtp.style.display = 'block';
      if (paneForgot) paneForgot.style.display = 'none';
      if (paneReset) paneReset.style.display = 'none';
      const otpInput = document.getElementById('otp-input');
      if (otpInput) {
        otpInput.value = '';
        setTimeout(() => otpInput.focus(), 100);
      }
    } else if (mode === 'forgot') {
      if (tabNav) tabNav.style.display = 'none';
      if (paneSignin) paneSignin.style.display = 'none';
      if (paneRegister) paneRegister.style.display = 'none';
      if (paneOtp) paneOtp.style.display = 'none';
      if (paneForgot) paneForgot.style.display = 'block';
      if (paneReset) paneReset.style.display = 'none';
      const forgotEmail = document.getElementById('forgot-email');
      if (forgotEmail) {
        const loginVal = document.getElementById('login-username')?.value || '';
        if (loginVal.includes('@')) forgotEmail.value = loginVal;
        setTimeout(() => forgotEmail.focus(), 100);
      }
    } else if (mode === 'forgot-reset') {
      if (tabNav) tabNav.style.display = 'none';
      if (paneSignin) paneSignin.style.display = 'none';
      if (paneRegister) paneRegister.style.display = 'none';
      if (paneOtp) paneOtp.style.display = 'none';
      if (paneForgot) paneForgot.style.display = 'none';
      if (paneReset) paneReset.style.display = 'block';
      const resetOtp = document.getElementById('reset-otp-input');
      if (resetOtp) {
        resetOtp.value = '';
        setTimeout(() => resetOtp.focus(), 100);
      }
    }
  },

  bindEvents() {
    // 1. Sign In Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error-msg');
        const submitBtn = document.getElementById('btn-signin-submit');

        try {
          if (errEl) errEl.style.display = 'none';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;
          }

          const res = await api.login(u, p);
          this.renderUserUI(res.user);
          this.hideLoginModal();
          showToast(`Welcome back, ${res.user.full_name || res.user.username}!`, 'success');
          window.dispatchEvent(new CustomEvent('auth:login_success'));

          // Immediately refresh reports and active dashboard for this authenticated user
          if (window.appRefreshReports) {
            await window.appRefreshReports();
          }

          // Reload data based on user role
          if (res.user.role === 'admin') {
            if (window.accounts) accounts.loadAccounts();
            if (window.validation) validation.loadActivityLogs();
          }
        } catch (err) {
          const isUserNotFound = err.status === 404 || 
            err.isUserNotFound || 
            (err.message && (
              err.message.toLowerCase().includes('no account found') || 
              err.message.toLowerCase().includes('not registered') ||
              err.message.toLowerCase().includes('create an account') ||
              err.message.toLowerCase().includes('account to get started')
            ));

          if (isUserNotFound) {
            // Unregistered user entered email directly in Sign In:
            // UX Best Practice: Seamlessly switch to 'Create Account' tab, auto-fill email & password, focus Name
            this.switchAuthMode('register');
            const regEmail = document.getElementById('reg-email');
            const regPass = document.getElementById('reg-password');
            const regConfPass = document.getElementById('reg-confirm-password');
            const regName = document.getElementById('reg-name');
            const regErr = document.getElementById('reg-error-msg');

            if (regEmail && u) regEmail.value = u;
            if (regPass && p) regPass.value = p;
            if (regConfPass && p) regConfPass.value = p;
            if (regName) setTimeout(() => regName.focus(), 150);

            if (regErr) {
              regErr.innerHTML = `<i class="fa-solid fa-circle-info"></i> No account found for <strong>${u}</strong>. Please enter your <strong>Full Name</strong> to create your account.`;
              regErr.style.display = 'block';
              regErr.style.background = 'rgba(56, 189, 248, 0.12)';
              regErr.style.borderColor = 'rgba(56, 189, 248, 0.35)';
              regErr.style.color = '#38bdf8';
            }
            if (typeof showToast === 'function') {
              showToast(`No account found for "${u}". Switched to Create Account.`, 'info');
            }
            return;
          }

          if (errEl) {
            errEl.textContent = err.message || 'Login failed. Please verify credentials.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Sign In to Dashboard`;
          }
        }
      });
    }

    // 2. Registration Request OTP Form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password')?.value;
        const errEl = document.getElementById('reg-error-msg');
        const submitBtn = document.getElementById('btn-request-otp');

        if (password !== confirmPassword) {
          if (errEl) {
            errEl.textContent = 'Passwords do not match. Please verify and re-enter.';
            errEl.style.display = 'block';
          }
          return;
        }

        if (password.length < 6) {
          if (errEl) {
            errEl.textContent = 'Password must be at least 6 characters long.';
            errEl.style.display = 'block';
          }
          return;
        }

        this.pendingRegistration = { name, email, password, confirm_password: confirmPassword };

        try {
          if (errEl) errEl.style.display = 'none';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending OTP...`;
          }

          const res = await api.requestOtp(this.pendingRegistration);
          
          // Switch to OTP pane
          const emailDisplay = document.getElementById('otp-target-email');
          if (emailDisplay) emailDisplay.textContent = email;

          const demoHint = document.getElementById('otp-demo-hint');
          if (demoHint) demoHint.style.display = 'none';

          this.switchAuthMode('otp');
          showToast(res.message || `OTP verification code sent to ${email}`, 'info');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Registration request failed.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send OTP Verification Code`;
          }
        }
      });
    }

    // 3. OTP Verification Form
    const otpForm = document.getElementById('otp-form');
    if (otpForm) {
      otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otpCode = document.getElementById('otp-input').value.trim();
        const errEl = document.getElementById('otp-error-msg');
        const submitBtn = document.getElementById('btn-verify-otp');

        try {
          if (errEl) errEl.style.display = 'none';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying Code...`;
          }

          const res = await api.verifyOtp({
            email: this.pendingRegistration.email,
            otp_code: otpCode
          });

          this.renderUserUI(res.user);
          this.hideLoginModal();
          showToast(`Account created and verified successfully! Welcome, ${res.user.full_name || res.user.username}.`, 'success');
          window.dispatchEvent(new CustomEvent('auth:login_success'));

          // Immediately refresh reports and active dashboard for the new user
          if (window.appRefreshReports) {
            await window.appRefreshReports();
          }

          // Immediately reload Accounts registry and Activity audit logs
          if (window.accounts && accounts.loadAccounts) {
            accounts.loadAccounts();
          }
          if (window.validation && validation.loadActivityLogs) {
            validation.loadActivityLogs();
          }
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'OTP verification failed.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-check-double"></i> Verify OTP & Activate Account`;
          }
        }
      });
    }

    // 4. Forgot Password Request Form
    const forgotForm = document.getElementById('forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();
        const errEl = document.getElementById('forgot-error-msg');
        const submitBtn = document.getElementById('btn-forgot-submit');

        try {
          if (errEl) errEl.style.display = 'none';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending Reset Code...`;
          }

          const res = await api.requestForgotPasswordOtp(email);
          this.pendingResetEmail = email;

          const resetEmailTarget = document.getElementById('reset-target-email');
          if (resetEmailTarget) resetEmailTarget.textContent = email;

          const resetDemoHint = document.getElementById('reset-demo-hint');
          if (resetDemoHint) resetDemoHint.style.display = 'none';

          this.switchAuthMode('forgot-reset');
          showToast(res.message || `Password reset code dispatched to ${email}`, 'info');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Password reset request failed.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Password Reset Code`;
          }
        }
      });
    }

    // 5. Password Reset Verification & Submission Form
    const resetForm = document.getElementById('reset-form');
    if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otpCode = document.getElementById('reset-otp-input').value.trim();
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;
        const errEl = document.getElementById('reset-error-msg');
        const submitBtn = document.getElementById('btn-reset-submit');

        if (newPassword !== confirmPassword) {
          if (errEl) {
            errEl.textContent = 'Passwords do not match. Please verify and re-enter.';
            errEl.style.display = 'block';
          }
          return;
        }

        if (newPassword.length < 6) {
          if (errEl) {
            errEl.textContent = 'Password must be at least 6 characters long.';
            errEl.style.display = 'block';
          }
          return;
        }

        try {
          if (errEl) errEl.style.display = 'none';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating Password...`;
          }

          const res = await api.resetPassword(
            this.pendingResetEmail || document.getElementById('forgot-email')?.value,
            otpCode,
            newPassword,
            confirmPassword
          );

          showToast('Password updated successfully! Please sign in with your new password.', 'success');
          
          // Switch to sign in pane with username pre-populated
          this.switchAuthMode('signin');
          const loginU = document.getElementById('login-username');
          if (loginU && this.pendingResetEmail) loginU.value = this.pendingResetEmail;
          const loginP = document.getElementById('login-password');
          if (loginP) {
            loginP.value = '';
            loginP.focus();
          }
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Password update failed.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Update Password & Sign In`;
          }
        }
      });
    }

    // 6. Logout Button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userPopover = document.getElementById('user-profile-popover');
        if (userPopover) userPopover.style.display = 'none';
        await api.logout();
        this.renderUserUI(null);
        this.showLoginModal('signin');
        showToast('Logged out successfully.', 'info');
      });
    }

    // 7. User Profile Popover Card (Click on Account Button to view logged in email & details)
    const userBadge = document.getElementById('header-user-badge');
    const userPopover = document.getElementById('user-profile-popover');
    if (userBadge && userPopover) {
      userBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = userPopover.style.display === 'block';
        userPopover.style.display = isShown ? 'none' : 'block';
      });

      // Close when clicking anywhere outside
      document.addEventListener('click', (e) => {
        if (!userBadge.contains(e.target) && !userPopover.contains(e.target)) {
          userPopover.style.display = 'none';
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && userPopover.style.display === 'block') {
          userPopover.style.display = 'none';
        }
      });
    }

    window.addEventListener('auth:expired', () => {
      this.renderUserUI(null);
      this.showLoginModal('signin');
      showToast('Session expired. Please sign in again.', 'warning');
    });

    window.addEventListener('auth:blocked', (e) => {
      this.handleAccountBlocked(e.detail?.message);
    });

    document.getElementById('btn-blocked-relogin')?.addEventListener('click', () => {
      sessionStorage.removeItem('ems_account_blocked');
      sessionStorage.removeItem('ems_block_reason');
      const blockedModal = document.getElementById('account-blocked-modal');
      if (blockedModal) blockedModal.style.display = 'none';
      this.showLoginModal('signin');
    });
  },

  handleAccountBlocked(message) {
    api.setToken(null);
    api.setUser(null);
    this.renderUserUI(null);

    const blockedModal = document.getElementById('account-blocked-modal');
    const reasonEl = document.getElementById('account-blocked-reason');
    const timeEl = document.getElementById('blocked-time-ist');

    if (reasonEl && message) {
      reasonEl.textContent = message;
    }
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = `${now.toLocaleDateString('en-GB')}, ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })} (IST)`;
    }

    if (blockedModal) {
      blockedModal.style.display = 'flex';
    }

    // Dismiss other modals
    document.getElementById('upload-modal')?.classList.remove('active');
    document.getElementById('auth-modal')?.classList.remove('active');
  },

  async resendOtp() {
    if (!this.pendingRegistration.email) {
      showToast('Please re-enter your registration details.', 'warning');
      this.switchAuthMode('register');
      return;
    }

    const btn = document.getElementById('btn-resend-otp');
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Resending...`;
      }
      const res = await api.requestOtp(this.pendingRegistration);
      const demoHint = document.getElementById('otp-demo-hint');
      if (demoHint) demoHint.style.display = 'none';
      showToast(`Fresh OTP code sent to ${this.pendingRegistration.email}`, 'info');
    } catch (err) {
      showToast(err.message || 'Failed to resend OTP.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Resend Code`;
      }
    }
  },

  renderUserUI(user) {
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const avatarEl = document.getElementById('header-user-avatar');

    const adminTabs = document.querySelectorAll('.admin-only-tab');
    const userRole = (user && user.role ? user.role : (roleEl?.textContent || 'admin')).toLowerCase();
    const isAdmin = (userRole === 'admin');

    // Strictly enforce frontend tab visibility: fully visible & functional for Admin
    adminTabs.forEach(el => {
      el.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    // If currently viewing an admin-only tab and user is not admin, redirect to overview
    if (!isAdmin) {
      const activeTabBtn = document.querySelector('.tab-btn.active');
      if (activeTabBtn && (activeTabBtn.getAttribute('data-tab') === 'tab-accounts' || activeTabBtn.getAttribute('data-tab') === 'tab-validation')) {
        const overviewBtn = document.querySelector('.tab-btn[data-tab="tab-overview"]');
        if (overviewBtn) overviewBtn.click();
      }
    }

    if (user) {
      const displayName = user.full_name || user.username || 'User';
      const userRoleStr = (user.role || 'auditor').toUpperCase();
      const initials = displayName.substring(0, 2).toUpperCase();
      const userEmail = user.email || (user.username === 'admin' ? 'admin@mashaloil.com' : '—');

      if (nameEl) nameEl.textContent = displayName;
      if (roleEl) roleEl.textContent = userRoleStr;
      if (avatarEl) avatarEl.textContent = initials;

      // Update Popover Card details
      const popName = document.getElementById('popover-user-name');
      const popRole = document.getElementById('popover-user-role');
      const popAvatar = document.getElementById('popover-user-avatar');
      const popEmail = document.getElementById('popover-user-email');
      const popUsername = document.getElementById('popover-user-username');

      if (popName) popName.textContent = displayName;
      if (popRole) popRole.textContent = userRoleStr;
      if (popAvatar) popAvatar.textContent = initials;
      if (popEmail) popEmail.textContent = userEmail;
      if (popUsername) popUsername.textContent = user.username || '—';
    } else {
      if (nameEl) nameEl.textContent = 'Guest';
      if (roleEl) roleEl.textContent = 'OFFLINE';
      if (avatarEl) avatarEl.textContent = '--';

      const popEmail = document.getElementById('popover-user-email');
      if (popEmail) popEmail.textContent = '—';
    }
  },

  showLoginModal(mode = 'signin') {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.add('active');
      this.switchAuthMode(mode);
    }
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('active');
  }
};

window.auth = auth;
