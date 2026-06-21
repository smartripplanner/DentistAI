import { chatbot, BOT_STATES } from './chatbot.js';
import { configService } from './configService.js';
import { treatmentService } from './treatmentService.js';
import { settingsManager } from './settingsManager.js';
import { ROLES, PERMISSIONS, hasPermission, getPermittedTabs } from './rbac.js';

class AppController {
  #userRole = 'patient';
  #isAdminLoggedIn = false;

  get userRole() { return this.#userRole; }
  get isAdminLoggedIn() { return this.#isAdminLoggedIn; }

  constructor() {
    this.logsArray = [];
    try {
      this.logsArray = JSON.parse(sessionStorage.getItem('system_diagnostics_logs_json') || '[]');
    } catch (e) {
      this.logsArray = [];
    }

    this.setupConsoleInterceptor();
    this.setupNetworkInterceptor();

    this.takeoverPollTimer = null;
    this.treatmentChart = null;
    this.leadsChart = null;
    this.greetingSpoken = false;
    this.knownLeadIds = new Set();
    this.knownHandoffIds = new Set();
    this.isDashboardFirstRender = true;
    this.statusInterval = null;
    
    this.activeCall = null;
    this.speechRecognizer = null;
    this.callTimerInterval = null;
    this.ringOscInterval = null;
    this.staffRingInterval = null;
    this.audioCtx = null;
    this.isBookingInProgress = false;

    // One-time gesture listener to unlock Web Audio API & Speech Synthesis
    const unlockAudio = () => {
      this.getOrCreateAudioContext();
      this.unlockSpeechSynthesis();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    this.initDiagnosticsConsole(); // Initialize diagnostics console first
    this.initDatabase(); // Initialize events and database seeds
  }

  getOrCreateAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  unlockSpeechSynthesis() {
    if (window.speechSynthesis) {
      try {
        const utterance = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(utterance);
      } catch (e) {}
    }
  }

  initDatabase() {
    this.seedDatabase();
    this.initAuthSystem(); // Initialize authentication system
    this.bindEvents();
    this.initSettingsPanel();
    this.initWhatsAppGateway(); // Initialize Phase 4 Gateway Hub
    this.initChatWidget();
    this.initTelephonyHub();
    
    // Asynchronously load SaaS configs and render landing page
    this.initSaaS();

    // Start polling for takeover messages on patient side
    setInterval(() => {
      this.pollForTakeoverMessages();
    }, 2000);

    // Background polling for Google Sheets CRM sync (Admin/Staff side only)
    setInterval(() => {
      const sheetsUrl = localStorage.getItem('google_sheets_url');
      const cid = configService.clinicId || 'default_clinic';
      const userRole = localStorage.getItem(`crm_user_role_${cid}`) || 'patient';
      if (sheetsUrl && userRole !== 'patient') {
        this.pullDataFromSheets();
      }
    }, 8000); // Check every 8 seconds
  }

  // Seed initial mock data in localStorage if empty
  seedDatabase() {
    const isSeeded = localStorage.getItem('clinic_seeded_v2');
    if (!isSeeded) {
      this.logSystemEvent('Database Seed', 'Initializing Local Storage with mock appointments, leads, and handoffs...');
      const mockAppointments = [
        {
          id: 'app_1',
          name: 'Rahul Sharma',
          phone: '9876501234',
          email: 'rahul.sharma@gmail.com',
          date: '2026-06-12',
          time: '10:30',
          treatment: 'Root Canal Treatment',
          status: 'Existing Patient',
          dateCreated: '2026-06-09'
        },
        {
          id: 'app_2',
          name: 'Priya Patel',
          phone: '9812345678',
          email: 'priya.patel@outlook.com',
          date: '2026-06-15',
          time: '14:30',
          treatment: 'Invisalign® Clear Aligners',
          status: 'New Patient',
          dateCreated: '2026-06-10'
        }
      ];

      const mockLeads = [
        {
          id: 'lead_1',
          name: 'Amit Deshmukh',
          phone: '9967854321',
          email: 'amit.d@gmail.com',
          treatment: 'Dental Implants',
          timeframe: 'Immediately',
          urgency: 'Severe pain & swelling in lower gum',
          visited: 'No',
          leadTag: 'Emergency',
          score: 100,
          dateCreated: '2026-06-10',
          source: 'Emergency Triage'
        },
        {
          id: 'lead_2',
          name: 'Sneha Joshi',
          phone: '9820011223',
          email: 'sneha.j@yahoo.com',
          treatment: 'Teeth Whitening',
          timeframe: 'Within 1 Month',
          urgency: 'Normal concern',
          visited: 'Yes',
          leadTag: 'Existing Patient',
          score: 75,
          dateCreated: '2026-06-09',
          source: 'Web Chatbot'
        },
        {
          id: 'lead_3',
          name: 'Rohan Mehta',
          phone: '9890123456',
          email: 'rohan.mehta@gmail.com',
          treatment: 'Porcelain Veneers',
          timeframe: 'Immediately',
          urgency: 'Moderate chips in front tooth',
          visited: 'No',
          leadTag: 'Hot Lead',
          score: 90,
          dateCreated: '2026-06-10',
          source: 'WhatsApp'
        }
      ];

      const mockHandoffs = [
        {
          id: 'hand_1',
          sessionId: 'sess_mock123',
          name: 'Amit Deshmukh',
          phone: '9967854321',
          reason: 'Emergency Triage: Severe pain & swelling in lower gum',
          transcript: [
            { sender: 'bot', text: 'Hello! I am DentalAI, your virtual receptionist. How can I help you today?', timestamp: '10:14 AM' },
            { sender: 'user', text: 'I have severe pain and swelling in my lower gum', timestamp: '10:15 AM' },
            { sender: 'bot', text: '⚠️ IMPORTANT: This sounds like a dental emergency. Please seek immediate evaluation. Let\'s collect your contact info so our team can call you right away.', timestamp: '10:15 AM' },
            { sender: 'user', text: 'My number is 9967854321', timestamp: '10:16 AM' },
            { sender: 'bot', text: '🚨 EMERGENCY ALERT: We have escalated your details to our on-call dentist. A staff member will call you in the next 15 minutes.', timestamp: '10:16 AM' }
          ],
          status: 'Active Escalation',
          dateCreated: '2026-06-10'
        }
      ];

      const mockCalls = [
        {
          id: 'call_1',
          caller: 'Rahul Sharma',
          phone: '9876501234',
          timestamp: '2026-06-12 11:24 AM',
          duration: '01:45',
          status: 'Completed',
          transcript: [
            { sender: 'receptionist', text: 'Thank you for calling Apex Dental Care. I am your virtual receptionist. How can I help you?' },
            { sender: 'caller', text: 'Hi, I want to check if you are open tomorrow' },
            { sender: 'receptionist', text: 'Yes, we are open tomorrow (Sunday) from 9:00 AM to 8:00 PM. Would you like to book an appointment?' },
            { sender: 'caller', text: 'No, that is all. Thank you.' },
            { sender: 'receptionist', text: 'You are welcome! Have a great day. Goodbye.' }
          ]
        },
        {
          id: 'call_2',
          caller: 'Amit Deshmukh',
          phone: '9967854321',
          timestamp: '2026-06-13 02:10 PM',
          duration: '02:15',
          status: 'Transferred to Staff',
          transcript: [
            { sender: 'receptionist', text: 'Thank you for calling Apex Dental Care. I am your virtual receptionist. How can I help you?' },
            { sender: 'caller', text: 'I have severe pain in my lower tooth' },
            { sender: 'receptionist', text: 'That sounds like a potential emergency. Let me connect you directly to our clinic staff receptionist so they can triage you immediately.' },
            { sender: 'caller', text: 'Yes please, transfer me.' },
            { sender: 'receptionist', text: 'Connecting you now. Please hold...' }
          ]
        }
      ];

      localStorage.setItem('appointments_default_clinic', JSON.stringify(mockAppointments));
      localStorage.setItem('leads_default_clinic', JSON.stringify(mockLeads));
      localStorage.setItem('handoffs_default_clinic', JSON.stringify(mockHandoffs));
      localStorage.setItem('calls_default_clinic', JSON.stringify(mockCalls));
      localStorage.setItem('clinic_seeded_v2', 'true');
    }
  }

  bindEvents() {
    // Real-time table search inputs
    const appSearch = document.getElementById('appointment-search');
    if (appSearch) {
      appSearch.addEventListener('input', () => this.renderDashboard());
    }
    const leadSearch = document.getElementById('leads-search');
    if (leadSearch) {
      leadSearch.addEventListener('input', () => this.renderDashboard());
    }

    // Nav view toggling (Patient vs Admin Dashboard)
    const viewToggles = document.getElementById('view-toggles');
    viewToggles.addEventListener('click', (e) => {
      const tabButton = e.target.closest('.nav-tab');
      if (!tabButton) return;
      
      const targetView = tabButton.dataset.target;
      if (targetView === 'patient-site') {
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        tabButton.classList.add('active');
        document.getElementById('patient-site').style.display = 'block';
        document.getElementById('admin-dashboard').style.display = 'none';

      } else {
        // Guarded Staff Portal Access
        if (this.userRole === 'patient') {
          document.getElementById('login-error-msg').style.display = 'none';
          document.getElementById('login-username').value = '';
          document.getElementById('login-password').value = '';
          this.openModal('admin-login-modal');
        } else {
          document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
          tabButton.classList.add('active');
          document.getElementById('patient-site').style.display = 'none';
          document.getElementById('admin-dashboard').style.display = 'block';
          this.pullDataFromSheets(); // Auto-sync pull on opening admin tab
          this.renderDashboard();
        }
      }
    });

    // Dark Theme Toggler
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      themeBtn.innerHTML = isDark ? 
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light Mode` :
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark Mode`;
    });

    // Dashboard Sub-Tab filtering
    const dbFilterTabs = document.getElementById('dashboard-filter-tabs');
    dbFilterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.dashboard-tab');
      if (!tab) return;
      
      const activeTabId = tab.dataset.tab;
      const permitted = getPermittedTabs(this.userRole);
      
      if (!permitted.includes(activeTabId)) {
        this.showSystemAlert('Access Denied: You do not have permissions to access this tab.', 'error');
        return;
      }
      
      document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.tab-content-view').forEach(content => content.style.display = 'none');
      document.getElementById(`tab-${activeTabId}`).style.display = 'block';

      if (activeTabId === 'clinic-settings') {
        settingsManager.bindClinicSettingsForm(configService.getCurrentConfig());
      } else if (activeTabId === 'analytics') {
        this.renderAnalytics();
      } else if (activeTabId === 'specialists') {
        this.renderSpecialists();
      } else if (activeTabId === 'telephony') {
        this.renderCallsHistory();
        this.renderActiveCallMonitor();
      } else if (activeTabId === 'logs') {
        this.renderLogs();
      }
    });

    // Save Rescheduled/Edited Appointment
    const saveAppBtn = document.getElementById('save-app-btn');
    saveAppBtn.addEventListener('click', () => {
      this.saveEditedAppointment();
    });

    // Take over escalated human handoff call
    const takeoverBtn = document.getElementById('handoff-takeover-btn');
    takeoverBtn.addEventListener('click', () => {
      this.takeoverChat();
    });

    // Send Live Chat Takeover Message
    const takeoverSendBtn = document.getElementById('handoff-takeover-send-btn');
    if (takeoverSendBtn) {
      takeoverSendBtn.addEventListener('click', () => {
        this.sendTakeoverMessage();
      });
    }

    const takeoverInput = document.getElementById('handoff-takeover-input');
    if (takeoverInput) {
      takeoverInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendTakeoverMessage();
        }
      });
    }

    // Release Takeover
    const releaseBtn = document.getElementById('handoff-release-btn');
    if (releaseBtn) {
      releaseBtn.addEventListener('click', () => {
        this.releaseTakeoverChat();
      });
    }

    // Specialists Manager Actions
    const addSpecialistBtn = document.getElementById('specialist-add-btn');
    if (addSpecialistBtn) {
      addSpecialistBtn.addEventListener('click', () => {
        document.getElementById('specialist-modal-title').innerText = '➕ Add New Specialist';
        document.getElementById('edit-specialist-id').value = '';
        document.getElementById('edit-specialist-name').value = '';
        document.getElementById('edit-specialist-specialty').value = '';
        document.getElementById('edit-specialist-experience').value = '';
        document.getElementById('edit-specialist-photo').value = '👨‍⚕️';
        this.openModal('edit-specialist-modal');
      });
    }

    const saveSpecialistBtn = document.getElementById('save-specialist-btn');
    if (saveSpecialistBtn) {
      saveSpecialistBtn.addEventListener('click', () => {
        this.saveSpecialist();
      });
    }

    // Sync on data changes inside Chatbot
    chatbot.addEventListener('dataChanged', () => {
      this.renderDashboard();
    });

    // Landing Page Book Appointment actions -> scroll to and open chatbot
    document.getElementById('hero-book-btn').addEventListener('click', () => {
      this.openChatWidget(true); // Open and start booking
    });

    // Services card click -> scroll/open chatbot with that treatment selected
    document.getElementById('services-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.service-card');
      if (!card) return;
      const treatment = card.dataset.treatment;
      this.openChatWidget(false, treatment);
    });


  }

  // --- SECURE AUTH CRM SYSTEM ---
  initAuthSystem() {
    const cid = configService.clinicId || 'default_clinic';
    this.#userRole = localStorage.getItem(`crm_user_role_${cid}`) || 'patient';
    this.#isAdminLoggedIn = localStorage.getItem(`crm_admin_logged_in_${cid}`) === 'true';
    
    // Fallback sync (if role and admin flag are out of sync)
    if (this.userRole !== 'patient' && !this.isAdminLoggedIn) {
      this.#userRole = 'patient';
      localStorage.setItem(`crm_user_role_${cid}`, 'patient');
    }
    if (this.userRole === 'patient' && this.isAdminLoggedIn) {
      this.#isAdminLoggedIn = false;
      localStorage.setItem(`crm_admin_logged_in_${cid}`, 'false');
    }

    const loginBtn = document.getElementById('dashboard-login-btn');
    
    this.updateLoginUI();
    
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        if (this.userRole !== 'patient') {
          // Log out immediately and return to Patient Portal
          this.#userRole = 'patient';
          this.#isAdminLoggedIn = false;
          localStorage.setItem(`crm_user_role_${cid}`, 'patient');
          localStorage.setItem(`crm_admin_logged_in_${cid}`, 'false');
          this.updateLoginUI();
          
          document.getElementById('patient-site').style.display = 'block';
          document.getElementById('admin-dashboard').style.display = 'none';
          
          const patientTabBtn = document.querySelector('.nav-tab[data-target="patient-site"]');
          if (patientTabBtn) {
            document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
            patientTabBtn.classList.add('active');
          }
          
          this.showSystemAlert('Logged out of Clinic Portal.', 'info');
        } else {
          document.getElementById('login-error-msg').style.display = 'none';
          document.getElementById('login-username').value = '';
          document.getElementById('login-password').value = '';
          this.openModal('admin-login-modal');
        }
      });
    }

    const submitBtn = document.getElementById('submit-login-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.handleLogin();
      });
    }

    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleLogin();
        }
      });
    }

    // Developer backdoor keyboard shortcut: Ctrl + Shift + D toggles Diagnostics logs directly!
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const modal = document.getElementById('system-diagnostics-modal');
        if (modal) {
          if (modal.classList.contains('open')) {
            this.closeModal('system-diagnostics-modal');
          } else {
            this.openModal('system-diagnostics-modal');
            this.updateDiagnosticsConfigStatus();
          }
        }
      }
    });

    const clearLogsBtn = document.getElementById('clear-system-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        this.clearSystemLogs();
      });
    }
  }

  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async handleLogin() {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error-msg');
    const cid = configService.clinicId || 'default_clinic';

    const hashedPass = await this.sha256(pass);
    const devHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
    const staffHash = '87e5f8313b7639d0e4c0eb019c4dc8f4ba4102b87f20ed7b535d8b02d1cb1dc3';

    if (user.toLowerCase() === 'admin' && hashedPass === devHash) {
      this.#userRole = 'developer';
      this.#isAdminLoggedIn = true;
      localStorage.setItem(`crm_user_role_${cid}`, 'developer');
      localStorage.setItem(`crm_admin_logged_in_${cid}`, 'true');
      this.closeModal('admin-login-modal');
      
      const adminTabBtn = document.querySelector('.nav-tab[data-target="admin-dashboard"]');
      if (adminTabBtn) {
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        adminTabBtn.classList.add('active');
      }
      document.getElementById('patient-site').style.display = 'none';
      document.getElementById('admin-dashboard').style.display = 'block';
      
      this.updateLoginUI();
      this.renderDashboard();
      this.showSystemAlert('Developer authenticated successfully!', 'success');
      this.pullDataFromSheets();
    } else if (user.toLowerCase() === 'staff' && hashedPass === staffHash) {
      this.#userRole = 'staff';
      this.#isAdminLoggedIn = true;
      localStorage.setItem(`crm_user_role_${cid}`, 'staff');
      localStorage.setItem(`crm_admin_logged_in_${cid}`, 'true');
      this.closeModal('admin-login-modal');
      
      const adminTabBtn = document.querySelector('.nav-tab[data-target="admin-dashboard"]');
      if (adminTabBtn) {
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        adminTabBtn.classList.add('active');
      }
      document.getElementById('patient-site').style.display = 'none';
      document.getElementById('admin-dashboard').style.display = 'block';
      
      this.updateLoginUI();
      this.renderDashboard();
      this.showSystemAlert('Clinic Staff authenticated successfully!', 'success');
      this.pullDataFromSheets();
    } else {
      errorMsg.style.display = 'block';
      errorMsg.innerText = 'Invalid username or password.';
    }
  }

  updateLoginUI() {
    const loginBtn = document.getElementById('dashboard-login-btn');
    if (!loginBtn) return;
    
    if (this.userRole !== 'patient') {
      loginBtn.innerHTML = '🔓 Logout';
      loginBtn.style.background = 'var(--primary)';
      loginBtn.style.color = 'white';
    } else {
      loginBtn.innerHTML = '🔐 CRM Login';
      loginBtn.style.background = 'transparent';
      loginBtn.style.color = 'var(--primary)';
    }

    this.updateDashboardTabsVisibility();
    this.updateDeveloperConsoleVisibility();
  }

  updateDashboardTabsVisibility() {
    const role = this.userRole;
    const permitted = getPermittedTabs(role);
    document.querySelectorAll('.dashboard-tab').forEach(btn => {
      const tabName = btn.dataset.tab;
      if (permitted.includes(tabName)) {
        btn.style.display = 'block';
      } else {
        btn.style.display = 'none';
      }
    });

    // Force default active tab to appointments if the current tab gets hidden
    const activeTabBtn = document.querySelector('.dashboard-tab.active');
    if (activeTabBtn && activeTabBtn.style.display === 'none') {
      document.querySelectorAll('.dashboard-tab').forEach(btn => btn.classList.remove('active'));
      const appTabBtn = document.querySelector('.dashboard-tab[data-tab="appointments"]');
      if (appTabBtn) {
        appTabBtn.classList.add('active');
      }
      document.querySelectorAll('.tab-content-view').forEach(content => content.style.display = 'none');
      const tabAppEl = document.getElementById('tab-appointments');
      if (tabAppEl) tabAppEl.style.display = 'block';
    }
  }

  updateDeveloperConsoleVisibility() {
    const devBtn = document.getElementById('diagnostics-toggle-btn');
    if (devBtn) {
      if (this.userRole === 'developer') {
        devBtn.style.display = 'flex';
      } else {
        devBtn.style.display = 'none';
      }
    }
  }

  maskPhone(phone) {
    if (phone === null || phone === undefined) return 'Not Provided';
    const phoneStr = String(phone);
    if (!phoneStr.trim()) return 'Not Provided';
    const clean = phoneStr.replace(/[^0-9]/g, '');
    if (clean.length < 5) return '***';
    return clean.slice(0, 3) + '***' + clean.slice(-4);
  }

  maskEmail(email) {
    if (email === null || email === undefined) return 'Not Provided';
    const emailStr = String(email);
    if (!emailStr.trim() || emailStr.indexOf('@') === -1) return 'Not Provided';
    const parts = emailStr.split('@');
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return name.slice(0, 1) + '***@' + domain;
    return name.slice(0, 1) + '***' + name.slice(-1) + '@' + domain;
  }

  playNotificationChime(type = 'lead') {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (!ctx || ctx.state === 'suspended') return;
      
      if (type === 'emergency' || type === 'handoff') {
        // Emergency double-alert beep
        const playBeep = (time, freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, time);
          
          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(time);
          osc.stop(time + 0.16);
        };
        
        const now = ctx.currentTime;
        playBeep(now, 880); // High A5
        playBeep(now + 0.2, 880); // High A5 200ms later
      } else {
        // Pleasant "ding-dong" chime
        const now = ctx.currentTime;
        
        // "Ding"
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.5);
        
        // "Dong" (300ms later)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440.00, now + 0.3); // A4
        
        gain2.gain.setValueAtTime(0, now + 0.3);
        gain2.gain.linearRampToValueAtTime(0.25, now + 0.35);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.3);
        osc2.stop(now + 0.9);
      }
    } catch (err) {
      console.warn("Failed to play synthesized chime:", err);
    }
  }

  getCurrentTimeInTimezone(timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        weekday: 'long',
        hour12: false
      });
      const parts = formatter.formatToParts(new Date());
      const dateObj = {};
      parts.forEach(p => {
        dateObj[p.type] = p.value;
      });
      return {
        weekday: dateObj.weekday,
        hour: parseInt(dateObj.hour, 10),
        minute: parseInt(dateObj.minute, 10),
        year: parseInt(dateObj.year, 10),
        month: parseInt(dateObj.month, 10),
        day: parseInt(dateObj.day, 10)
      };
    } catch (err) {
      console.error("Timezone formatting error, falling back to local system time:", err);
      const now = new Date();
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return {
        weekday: weekdays[now.getDay()],
        hour: now.getHours(),
        minute: now.getMinutes(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate()
      };
    }
  }

  parseTime(timeStr) {
    timeStr = timeStr.trim().toUpperCase();
    const isPM = timeStr.includes('PM');
    const isAM = timeStr.includes('AM');
    let cleanStr = timeStr.replace(/[AP]M/g, '').trim();
    let hours = 0;
    let minutes = 0;
    if (cleanStr.includes(':')) {
      const parts = cleanStr.split(':');
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    } else {
      hours = parseInt(cleanStr, 10);
      minutes = 0;
    }
    if (isPM && hours !== 12) {
      hours += 12;
    }
    if (isAM && hours === 12) {
      hours = 0;
    }
    return hours * 60 + minutes;
  }

  checkClinicOpenStatus(config) {
    if (!config || !config.workingHours) {
      return { isOpen: false, text: "🔴 Closed" };
    }
    const timezone = config.timezone || 'Asia/Kolkata';
    const nowInTz = this.getCurrentTimeInTimezone(timezone);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayIdx = dayNames.indexOf(nowInTz.weekday);
    const currentMinutes = nowInTz.hour * 60 + nowInTz.minute;

    const parts = config.workingHours.split(':');
    if (parts.length < 2) {
      return { isOpen: false, text: "🔴 Closed" };
    }

    const daysPart = parts[0].trim().toLowerCase();
    const timePart = parts.slice(1).join(':').trim();

    const dayMap = {
      'sun': 0, 'sunday': 0,
      'mon': 1, 'monday': 1,
      'tue': 2, 'tuesday': 2,
      'wed': 3, 'wednesday': 3,
      'thu': 4, 'thursday': 4,
      'fri': 5, 'friday': 5,
      'sat': 6, 'saturday': 6
    };

    let isWorkingDay = false;
    let startDay = 1;
    let endDay = 6;

    if (daysPart.includes('-')) {
      const dParts = daysPart.split('-');
      const startStr = dParts[0].trim();
      const endStr = dParts[1].trim();
      startDay = dayMap[startStr] !== undefined ? dayMap[startStr] : 1;
      endDay = dayMap[endStr] !== undefined ? dayMap[endStr] : 6;
      if (startDay <= endDay) {
        isWorkingDay = (currentDayIdx >= startDay && currentDayIdx <= endDay);
      } else {
        isWorkingDay = (currentDayIdx >= startDay || currentDayIdx <= endDay);
      }
    } else if (daysPart.includes('to')) {
      const dParts = daysPart.split('to');
      const startStr = dParts[0].trim();
      const endStr = dParts[1].trim();
      startDay = dayMap[startStr] !== undefined ? dayMap[startStr] : 1;
      endDay = dayMap[endStr] !== undefined ? dayMap[endStr] : 6;
      if (startDay <= endDay) {
        isWorkingDay = (currentDayIdx >= startDay && currentDayIdx <= endDay);
      } else {
        isWorkingDay = (currentDayIdx >= startDay || currentDayIdx <= endDay);
      }
    } else {
      if (daysPart === 'daily' || daysPart === 'everyday' || daysPart === 'mon - sun' || daysPart === 'mon-sun') {
        isWorkingDay = true;
      } else {
        isWorkingDay = daysPart.includes(nowInTz.weekday.toLowerCase().slice(0, 3));
      }
    }

    if (!isWorkingDay) {
      const timeSplit = timePart.split('-');
      const startTimeStr = timeSplit[0] ? timeSplit[0].trim() : '9 AM';
      let nextDayIdx = (currentDayIdx + 1) % 7;
      for (let i = 0; i < 7; i++) {
        let checkDay = (currentDayIdx + i) % 7;
        let checkWorking = false;
        if (startDay <= endDay) {
          checkWorking = (checkDay >= startDay && checkDay <= endDay);
        } else {
          checkWorking = (checkDay >= startDay || checkDay <= endDay);
        }
        if (checkWorking) {
          nextDayIdx = checkDay;
          break;
        }
      }
      const nextDayName = dayNames[nextDayIdx];
      return {
        isOpen: false,
        text: `🔴 Closed - Opens ${nextDayName} at ${startTimeStr}`
      };
    }

    const timeSplit = timePart.split('-');
    if (timeSplit.length < 2) {
      return { isOpen: false, text: "🔴 Closed" };
    }

    const startTimeStr = timeSplit[0].trim();
    const endTimeStr = timeSplit[1].trim();
    const startMinutes = this.parseTime(startTimeStr);
    const endMinutes = this.parseTime(endTimeStr);

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return {
        isOpen: true,
        text: `🟢 Open Now - Closes at ${endTimeStr}`
      };
    } else {
      let nextDayName = "tomorrow";
      if (currentMinutes >= endMinutes) {
        let tomorrowIdx = (currentDayIdx + 1) % 7;
        let checkWorking = false;
        if (startDay <= endDay) {
          checkWorking = (tomorrowIdx >= startDay && tomorrowIdx <= endDay);
        } else {
          checkWorking = (tomorrowIdx >= startDay || tomorrowIdx <= endDay);
        }
        if (!checkWorking) {
          for (let i = 1; i < 7; i++) {
            let checkDay = (currentDayIdx + i) % 7;
            let checkW = false;
            if (startDay <= endDay) {
              checkW = (checkDay >= startDay && checkDay <= endDay);
            } else {
              checkW = (checkDay >= startDay || checkDay <= endDay);
            }
            if (checkW) {
              tomorrowIdx = checkDay;
              break;
            }
          }
          nextDayName = dayNames[tomorrowIdx];
        }
      } else {
        nextDayName = "today";
      }
      return {
        isOpen: false,
        text: `🔴 Closed - Opens ${nextDayName === 'today' ? 'today' : (nextDayName === 'tomorrow' ? 'tomorrow' : nextDayName)} at ${startTimeStr}`
      };
    }
  }

  // --- WHATSAPP GATEWAY DEV SUITE ---
  initWhatsAppGateway() {
    const waSendBtn = document.getElementById('wa-simulator-send');
    const waInput = document.getElementById('wa-simulator-input');
    const waMessages = document.getElementById('wa-chat-messages');
    const waConsole = document.getElementById('wa-payload-console');
    const clearConsoleBtn = document.getElementById('clear-webhook-logs');
    const runCronBtn = document.getElementById('run-cron-btn');

    if (!waSendBtn || !waInput) return;

    const appendConsoleLog = (title, text) => {
      const timestamp = new Date().toLocaleTimeString();
      waConsole.textContent += `\n\n[${timestamp}] --- ${title} ---\n${text}`;
      waConsole.scrollTop = waConsole.scrollHeight;
    };

    const handleWaSend = async () => {
      const msgText = waInput.value.trim();
      if (!msgText) return;
      waInput.value = '';

      // 1. Append User Bubble
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      waMessages.innerHTML += `
        <div class="wa-bubble incoming">
          ${escapeHTML(msgText)}
          <div class="wa-bubble-time">${timeStr}</div>
        </div>
      `;
      waMessages.scrollTop = waMessages.scrollHeight;

      // 2. Append Webhook Payload JSON
      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
          id: "waba_account_id_889",
          changes: [{
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+1 555 000 0000", phone_number_id: "phone_id_992" },
              contacts: [{ profile: { name: "Patient (WhatsApp Webhook)" }, wa_id: "919876543210" }],
              messages: [{
                from: "919876543210",
                id: "wamid.wamid_" + Math.random().toString(36).substr(2, 9),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: { body: msgText },
                type: "text"
              }]
            },
            field: "messages"
          }]
        }]
      };
      appendConsoleLog("RECEIVED WEBHOOK EVENT (INBOUND)", JSON.stringify(webhookPayload, null, 2));

      // 3. Process chatbot logic
      const botResponse = await chatbot.processUserMessage(msgText);

      // 4. Append Bot Bubble
      setTimeout(() => {
        waMessages.innerHTML += `
          <div class="wa-bubble outgoing">
            ${botResponse.reply}
            <div class="wa-bubble-time">${timeStr}</div>
          </div>
        `;
        waMessages.scrollTop = waMessages.scrollHeight;

        // 5. Append WhatsApp Cloud API Outbound JSON payload
        const outboundPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: "919876543210",
          type: "text",
          text: {
            preview_url: false,
            body: botResponse.reply
          }
        };
        appendConsoleLog("SENT API REQUEST (OUTBOUND POST /messages)", JSON.stringify(outboundPayload, null, 2));
      }, 600);
    };

    waSendBtn.addEventListener('click', handleWaSend);
    waInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleWaSend();
    });

    if (clearConsoleBtn) {
      clearConsoleBtn.addEventListener('click', () => {
        waConsole.innerHTML = '[SYSTEM] Webhook logs cleared. Live Developer hook active.';
      });
    }

    if (runCronBtn) {
      runCronBtn.addEventListener('click', () => {
        const apps = JSON.parse(localStorage.getItem('appointments') || '[]');
        appendConsoleLog("CRON EXECUTION TRIGGERED", "Starting automated follow-ups cron checks...\nScanning for 24h Reminders & 6m Recall candidates...");
        
        let remSentCount = 0;
        let recallSentCount = 0;
        
        apps.forEach(appItem => {
          remSentCount++;
          const reminderPayload = {
            messaging_product: "whatsapp",
            to: appItem.phone,
            type: "template",
            template: {
              name: "appointment_reminder_24h",
              language: { code: "en" },
              components: [
                { type: "header", parameters: [{ type: "text", text: appItem.treatment }] },
                { type: "body", parameters: [{ type: "text", text: appItem.name }, { type: "text", text: appItem.time }] }
              ]
            }
          };
          
          setTimeout(() => {
            appendConsoleLog(`CRON ALERT SENT: 24h REMINDER TO ${appItem.name.toUpperCase()}`, JSON.stringify(reminderPayload, null, 2));
            this.showSystemAlert(`Auto-Reminder sent to ${appItem.name}!`, 'success');
          }, remSentCount * 300);
        });

        const pastPatients = ["Priya Patel", "Sneha Joshi"];
        pastPatients.forEach(patient => {
          recallSentCount++;
          const recallPayload = {
            messaging_product: "whatsapp",
            to: "919876543210",
            type: "template",
            template: {
              name: "cleaning_recall_6m",
              language: { code: "en" },
              components: [
                { type: "body", parameters: [{ type: "text", text: patient }] }
              ]
            }
          };

          setTimeout(() => {
            appendConsoleLog(`CRON ALERT SENT: 6-MONTH RECALL TO ${patient.toUpperCase()}`, JSON.stringify(recallPayload, null, 2));
            this.showSystemAlert(`6-Month recall cleaning invite sent to ${patient}!`, 'info');
          }, (remSentCount + recallSentCount) * 350);
        });
      });
    }
  }

  // --- GOOGLE SHEETS & GEMINI AI SYNC SYSTEM ---
  initSettingsPanel() {
    const urlInput = document.getElementById('settings-sheet-url');
    const saveBtn = document.getElementById('save-settings-btn');
    const testBtn = document.getElementById('test-settings-btn');
    const emailInput = document.getElementById('settings-receptionist-email');
    const calendarInput = document.getElementById('settings-calendar-id');
    
    // Load existing config
    const savedUrl = localStorage.getItem('google_sheets_url');
    if (savedUrl) {
      urlInput.value = savedUrl;
      this.updateSyncBadge('synced');
    } else {
      this.updateSyncBadge('disconnected');
    }

    if (emailInput) emailInput.value = localStorage.getItem('receptionist_email') || '';
    if (calendarInput) calendarInput.value = localStorage.getItem('google_calendar_id') || '';

    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const email = emailInput ? emailInput.value.trim() : '';
      const calId = calendarInput ? calendarInput.value.trim() : '';
      
      localStorage.setItem('receptionist_email', email);
      localStorage.setItem('google_calendar_id', calId);

      if (url === '') {
        localStorage.removeItem('google_sheets_url');
        this.updateSyncBadge('disconnected');
        this.showSystemAlert('Google Sheets disconnected. Using Local Storage.', 'info');
      } else {
        localStorage.setItem('google_sheets_url', url);
        this.updateSyncBadge('synced');
        this.showSystemAlert('Integration Settings Saved!', 'success');
        this.pullDataFromSheets();
      }
      this.updateDiagnosticsConfigStatus();
    });

    testBtn.addEventListener('click', () => {
      this.testSheetsConnection(urlInput.value.trim());
    });

    // --- GEMINI AI CONFIGURATION ---
    const aiToggle = document.getElementById('settings-ai-enabled');
    const aiToggleLabel = document.getElementById('ai-toggle-label');
    const apiKeyInput = document.getElementById('settings-gemini-key');
    const saveAiBtn = document.getElementById('save-ai-btn');
    const testAiBtn = document.getElementById('test-ai-btn');
    
    // Load AI states
    const isAiEnabled = localStorage.getItem('gemini_ai_enabled') === 'true';
    aiToggle.checked = isAiEnabled;
    aiToggleLabel.innerText = isAiEnabled ? 'AI Brain Enabled' : 'AI Brain Disabled';
    
    const savedKey = decryptObfuscate(localStorage.getItem('gemini_api_key'));
    if (savedKey) {
      apiKeyInput.value = savedKey;
      this.updateAiBadge('active');
    } else {
      this.updateAiBadge('inactive');
    }

    aiToggle.addEventListener('change', () => {
      const checked = aiToggle.checked;
      localStorage.setItem('gemini_ai_enabled', checked ? 'true' : 'false');
      aiToggleLabel.innerText = checked ? 'AI Brain Enabled' : 'AI Brain Disabled';
      this.showSystemAlert(checked ? 'AI Brain Enabled!' : 'AI Brain Disabled (Keyword matching active).', 'info');
      this.updateDiagnosticsConfigStatus();
    });

    saveAiBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key === '') {
        localStorage.removeItem('gemini_api_key');
        localStorage.setItem('gemini_ai_enabled', 'false');
        aiToggle.checked = false;
        aiToggleLabel.innerText = 'AI Brain Disabled';
        this.updateAiBadge('inactive');
        this.showSystemAlert('Gemini Key removed. AI Brain disabled.', 'info');
      } else {
        localStorage.setItem('gemini_api_key', encryptObfuscate(key));
        this.updateAiBadge('active');
        this.showSystemAlert('Gemini API Key Saved!', 'success');
      }
      this.updateDiagnosticsConfigStatus();
    });

    testAiBtn.addEventListener('click', () => {
      this.testGeminiConnection(apiKeyInput.value.trim());
    });

    // --- RECEPTIONIST SOUND ALERTS ---
    const soundToggle = document.getElementById('settings-sound-enabled');
    const soundToggleLabel = document.getElementById('sound-toggle-label');
    const testSoundBtn = document.getElementById('test-sound-btn');

    if (soundToggle) {
      const isSoundEnabled = localStorage.getItem('receptionist_sound_enabled') !== 'false';
      soundToggle.checked = isSoundEnabled;
      if (soundToggleLabel) {
        soundToggleLabel.innerText = isSoundEnabled ? 'Notification Sounds Enabled' : 'Notification Sounds Disabled';
      }

      soundToggle.addEventListener('change', () => {
        const checked = soundToggle.checked;
        localStorage.setItem('receptionist_sound_enabled', checked ? 'true' : 'false');
        if (soundToggleLabel) {
          soundToggleLabel.innerText = checked ? 'Notification Sounds Enabled' : 'Notification Sounds Disabled';
        }
        this.showSystemAlert(checked ? 'Notification sounds enabled.' : 'Notification sounds muted.', 'info');
      });
    }

    if (testSoundBtn) {
      testSoundBtn.addEventListener('click', () => {
        this.playNotificationChime('lead');
        setTimeout(() => this.playNotificationChime('emergency'), 1200);
      });
    }
  }

  async testGeminiConnection(key) {
    if (!key) {
      this.showSystemAlert('Please enter a Gemini API Key first.', 'error');
      return;
    }

    const badge = document.getElementById('ai-status-badge');
    if (badge) {
      badge.className = 'badge badge-connecting';
      badge.innerText = 'Testing...';
    }

    this.logSystemEvent('Gemini Connection Test', 'Testing Gemini API connectivity with key...', { keyPrefix: key.slice(0, 8) + '...' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello, respond with the word 'OK' only" }] }]
        })
      });
      const res = await response.json();
      if (response.ok && res.candidates && res.candidates[0].content.parts[0].text) {
        this.updateAiBadge('active');
        this.showSystemAlert('Gemini AI Connection Successful!', 'success');
        this.logSystemEvent('Gemini Connection Test Success', 'Successfully verified Gemini API connectivity');
      } else {
        throw new Error(res.error?.message || "Invalid API response");
      }
    } catch(e) {
      console.error(e);
      this.updateAiBadge('inactive');
      this.showSystemAlert('AI Test Failed: ' + e.message, 'error');
      this.logSystemEvent('Gemini Connection Test Failure', 'Gemini API test failed', e.message);
    }
  }

  updateAiBadge(status) {
    const badge = document.getElementById('ai-status-badge');
    if (!badge) return;
    badge.className = 'badge';
    if (status === 'active') {
      badge.classList.add('badge-synced');
      badge.innerText = 'Active (Connected)';
    } else {
      badge.classList.add('badge-disconnected');
      badge.innerText = 'Inactive';
    }
  }

  fetchJSONP(url) {
    return new Promise((resolve, reject) => {
      const callbackName = 'jsonp_callback_' + Math.floor(Math.random() * 1000000);
      const scriptId = 'jsonp_script_' + Date.now();
      
      // Timeout fallback
      const timeout = setTimeout(() => {
        delete window[callbackName];
        const script = document.getElementById(scriptId);
        if (script) script.remove();
        reject(new Error("Connection timed out. Check your URL."));
      }, 10000);

      window[callbackName] = function(data) {
        clearTimeout(timeout);
        const script = document.getElementById(scriptId);
        if (script) script.remove();
        delete window[callbackName];
        resolve(data);
      };

      const script = document.createElement('script');
      script.id = scriptId;
      const separator = url.indexOf('?') >= 0 ? '&' : '?';
      script.src = `${url}${separator}callback=${callbackName}`;
      
      script.onerror = function() {
        clearTimeout(timeout);
        delete window[callbackName];
        const scr = document.getElementById(scriptId);
        if (scr) scr.remove();
        reject(new Error("Failed to load script. Check URL."));
      };

      document.body.appendChild(script);
    });
  }

  async testSheetsConnection(url) {
    if (!url) {
      this.showSystemAlert('Please enter a Google Apps Script Web App URL first.', 'error');
      return;
    }

    this.updateSyncBadge('connecting');
    this.logSystemEvent('Sheets Test Connect', 'Dispatched test connection request to Sheets Web App URL', { url });
    try {
      // JSONP completely bypasses CORS restrictions on GET requests for Google Apps Script Web Apps
      const res = await this.fetchJSONP(url);
      
      if (res.status === 'success') {
        this.updateSyncBadge('synced');
        this.showSystemAlert('Connection Successful! Google Sheets connected.', 'success');
        this.logSystemEvent('Sheets Test Connect Success', 'Google Sheets Web App responded with success', res);
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      console.error(e);
      this.updateSyncBadge('disconnected');
      this.showSystemAlert('Connection Failed: ' + e.message, 'error');
      this.logSystemEvent('Sheets Test Connect Failure', 'Google Sheets Web App connection test failed', e.message);
    }
  }

  async testSheetsPostConnection(url) {
    if (!url) return;
    this.logSystemEvent('Sheets POST Test', 'Dispatched test POST request to Sheets Web App URL (CORS mode)', { url });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify({
          action: 'test',
          data: {}
        })
      });
      
      if (response.ok) {
        const text = await response.text();
        let data = {};
        try {
          data = JSON.parse(text);
        } catch(e) {
          data = { raw: text };
        }
        this.logSystemEvent('Sheets POST Test Success', 'Google Sheets Web App POST responded successfully', data);
      } else {
        this.logSystemEvent('Sheets POST Test Error', `HTTP status error: ${response.status}`, response.statusText);
      }
    } catch(e) {
      this.logSystemEvent('Sheets POST Test Failure', 'POST request failed. This typically indicates a CORS issue (if the script is not configured for "Anyone" access) or network error.', e.message);
    }
  }

  async pullDataFromSheets() {
    const url = localStorage.getItem('google_sheets_url');
    if (!url) return;

    this.updateSyncBadge('connecting');
    this.logSystemEvent('Sheets Pull Request', 'Pulling database tabs data from Sheets Web App...', { url });
    try {
      const separator = url.indexOf('?') >= 0 ? '&' : '?';
      const fetchUrl = `${url}${separator}clinicId=${configService.clinicId}`;
      const res = await this.fetchJSONP(fetchUrl);
      
      if (res.status === 'success') {
        const sheetsData = res.data;
        
        // Merge with local storage cache based on record id to prevent offline data loss
        if (sheetsData.appointments) {
          const localApps = this.getAppointments();
          const incomingApps = sheetsData.appointments;
          const mergedApps = [...incomingApps];
          const incomingIds = new Set(incomingApps.map(a => a.id));
          
          localApps.forEach(localApp => {
            if (!incomingIds.has(localApp.id)) {
              mergedApps.push(localApp);
            }
          });
          this.saveAppointments(mergedApps);
        }
        if (sheetsData.leads) {
          const localLeads = this.getLeads();
          const incomingLeads = sheetsData.leads;
          const mergedLeads = [...incomingLeads];
          const incomingIds = new Set(incomingLeads.map(l => l.id));
          
          localLeads.forEach(localLead => {
            if (!incomingIds.has(localLead.id)) {
              mergedLeads.push(localLead);
            }
          });
          this.saveLeads(mergedLeads);
        }
        if (sheetsData.handoffs) {
          const localHandoffs = this.getHandoffs();
          const incomingHandoffs = sheetsData.handoffs;
          const mergedHandoffs = [...incomingHandoffs];
          const incomingIds = new Set(incomingHandoffs.map(h => h.id));
          
          localHandoffs.forEach(localHandoff => {
            if (!incomingIds.has(localHandoff.id)) {
              mergedHandoffs.push(localHandoff);
            }
          });
          this.saveHandoffs(mergedHandoffs);
        }
        
        this.updateSyncBadge('synced');
        this.renderDashboard();
        this.logSystemEvent('Sheets Pull Success', 'Successfully synchronized data from Google Sheets', res);
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      console.error("Failed to pull data from Sheets:", e);
      this.updateSyncBadge('disconnected');
      this.logSystemEvent('Sheets Pull Failure', 'Synchronization fetch failed', e.message);
    }
  }

  async syncToSheets(action, data) {
    const url = localStorage.getItem('google_sheets_url');
    if (!url) return;

    try {
      // mode: 'no-cors' prevents browser CORS blockages during background POST redirections on Google Apps Script
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify({ action: action, clinicId: configService.clinicId, data: data })
      });
    } catch (e) {
      console.error("Sheets write sync failed:", e);
    }
  }

  updateSyncBadge(status) {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    badge.className = 'badge';
    if (status === 'synced') {
      badge.classList.add('badge-synced');
      badge.innerText = 'Connected (Google Sheets Live)';
    } else if (status === 'connecting') {
      badge.classList.add('badge-connecting');
      badge.innerText = 'Synchronizing...';
    } else {
      badge.classList.add('badge-disconnected');
      badge.innerText = 'Disconnected (Local Storage Active)';
    }
  }

  async copyAppsScriptTemplate(btn) {
    try {
      const response = await fetch('google_apps_script.js');
      const scriptCode = await response.text();
      
      navigator.clipboard.writeText(scriptCode).then(() => {
        const oldText = btn.innerText;
        btn.innerText = '✔️ Apps Script Template Copied!';
        btn.style.borderColor = 'var(--primary)';
        btn.style.color = 'var(--primary)';
        setTimeout(() => {
          btn.innerText = oldText;
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 2000);
      });
    } catch(e) {
      this.showSystemAlert('Could not read google_apps_script.js template.', 'error');
    }
  }

  // Render CRM Tables and Stats
  renderDashboard() {
    const apps = this.getAppointments();
    const leads = this.getLeads();
    const handoffs = this.getHandoffs();

    const appSearch = document.getElementById('appointment-search');
    const appQuery = appSearch ? appSearch.value.toLowerCase().trim() : '';
    const filteredApps = apps.filter(appItem => {
      if (!appQuery) return true;
      return (appItem.name && appItem.name.toLowerCase().includes(appQuery)) ||
             (appItem.phone && appItem.phone.toLowerCase().includes(appQuery)) ||
             (appItem.email && appItem.email.toLowerCase().includes(appQuery)) ||
             (appItem.treatment && appItem.treatment.toLowerCase().includes(appQuery));
    });

    const leadSearch = document.getElementById('leads-search');
    const leadQuery = leadSearch ? leadSearch.value.toLowerCase().trim() : '';
    const filteredLeads = leads.filter(lead => {
      if (!leadQuery) return true;
      return (lead.name && lead.name.toLowerCase().includes(leadQuery)) ||
             (lead.phone && lead.phone.toLowerCase().includes(leadQuery)) ||
             (lead.email && lead.email.toLowerCase().includes(leadQuery)) ||
             (lead.treatment && lead.treatment.toLowerCase().includes(leadQuery)) ||
             (lead.leadTag && lead.leadTag.toLowerCase().includes(leadQuery)) ||
             (lead.source && lead.source.toLowerCase().includes(leadQuery));
    });

    // Sound & Badge notification check
    let playSound = null;
    const isSoundEnabled = localStorage.getItem('receptionist_sound_enabled') !== 'false';
    const cid = configService.clinicId || 'default_clinic';
    const userRole = localStorage.getItem(`crm_user_role_${cid}`) || 'patient';
    const isStaffPortal = userRole !== 'patient';

    if (this.isDashboardFirstRender) {
      leads.forEach(l => this.knownLeadIds.add(l.id));
      handoffs.forEach(h => this.knownHandoffIds.add(h.id));
      this.isDashboardFirstRender = false;
    } else {
      // Check for new leads
      leads.forEach(l => {
        if (!this.knownLeadIds.has(l.id)) {
          this.knownLeadIds.add(l.id);
          if (isStaffPortal && isSoundEnabled) {
            if (l.leadTag === 'Emergency') {
              playSound = 'emergency';
            } else if (!playSound) {
              playSound = 'lead';
            }
          }
        }
      });

      // Check for new handoffs
      handoffs.forEach(h => {
        if (!this.knownHandoffIds.has(h.id)) {
          this.knownHandoffIds.add(h.id);
          if (isStaffPortal && isSoundEnabled) {
            playSound = 'handoff'; // Handoff takes precedence
          }
        }
      });
    }

    if (playSound) {
      this.playNotificationChime(playSound);
    }

    // Update Tab Badges
    const badgeLeads = document.getElementById('badge-leads-count');
    if (badgeLeads) {
      if (leads.length > 0) {
        badgeLeads.innerText = leads.length;
        badgeLeads.style.display = 'inline-block';
      } else {
        badgeLeads.style.display = 'none';
      }
    }

    const badgeHandoffs = document.getElementById('badge-handoffs-count');
    if (badgeHandoffs) {
      if (handoffs.length > 0) {
        badgeHandoffs.innerText = handoffs.length;
        badgeHandoffs.style.display = 'inline-block';
      } else {
        badgeHandoffs.style.display = 'none';
      }
    }

    // Render Stats
    document.getElementById('stats-appointments').innerText = apps.length;
    const hotLeads = leads.filter(l => l.leadTag === 'Hot Lead' || l.leadTag === 'Emergency');
    document.getElementById('stats-hot').innerText = hotLeads.length;
    const activeEmerg = leads.filter(l => l.leadTag === 'Emergency');
    document.getElementById('stats-emergencies').innerText = activeEmerg.length;
    
    // Booking Conversion calculation: Bookings / (Bookings + Inbound non-booking leads)
    const conversion = (apps.length + leads.length) > 0 ? 
      Math.round((apps.length / (apps.length + leads.length)) * 100) : 0;
    document.getElementById('stats-conv-rate').innerText = conversion + '%';

    // RENDER APPOINTMENTS TABLE
    const appBody = document.getElementById('appointments-tbody');
    appBody.innerHTML = '';
    if (filteredApps.length === 0) {
      document.getElementById('appointments-empty').style.display = 'flex';
      document.getElementById('appointments-table').style.display = 'none';
    } else {
      document.getElementById('appointments-empty').style.display = 'none';
      document.getElementById('appointments-table').style.display = 'table';
      
      filteredApps.forEach(appItem => {
        const tr = document.createElement('tr');
        const badgeClass = appItem.status === 'New Patient' ? 'badge-new' : 'badge-existing';
        
        const phoneDisplay = this.isAdminLoggedIn ? appItem.phone : `<span class="masked-sensitive">${this.maskPhone(appItem.phone)}</span>`;
        const emailDisplay = this.isAdminLoggedIn ? appItem.email : `<span class="masked-sensitive">${this.maskEmail(appItem.email)}</span>`;
        
        tr.innerHTML = `
          <td><strong>${appItem.name}</strong></td>
          <td>${phoneDisplay}<br><span style="font-size:0.75rem; color:var(--text-muted);">${emailDisplay}</span></td>
          <td>${appItem.date}<br><span style="font-weight:600; color:var(--primary);">${appItem.time}</span></td>
          <td><span style="font-weight:500;">${appItem.treatment}</span></td>
          <td><span class="badge ${badgeClass}">${appItem.status}</span></td>
          <td>
            <div class="action-btns">
              <button class="action-btn" title="Reschedule / Edit" onclick="app.openEditModal('${appItem.id}')">✏️</button>
              <button class="action-btn delete" title="Cancel Appointment" onclick="app.cancelAppointment('${appItem.id}')">❌</button>
            </div>
          </td>
        `;
        appBody.appendChild(tr);
      });
    }

    // RENDER CRM LEADS TABLE
    const leadBody = document.getElementById('leads-tbody');
    leadBody.innerHTML = '';
    if (filteredLeads.length === 0) {
      document.getElementById('leads-empty').style.display = 'flex';
      document.getElementById('leads-table').style.display = 'none';
    } else {
      document.getElementById('leads-empty').style.display = 'none';
      document.getElementById('leads-table').style.display = 'table';
      
      filteredLeads.forEach(lead => {
        const tr = document.createElement('tr');
        let badgeClass = 'badge-warm';
        if (lead.leadTag === 'Emergency') badgeClass = 'badge-emergency';
        else if (lead.leadTag === 'Hot Lead') badgeClass = 'badge-hot';
        else if (lead.leadTag === 'Existing Patient') badgeClass = 'badge-existing';

        const phoneDisplay = this.isAdminLoggedIn ? lead.phone : `<span class="masked-sensitive">${this.maskPhone(lead.phone)}</span>`;
        const emailDisplay = this.isAdminLoggedIn ? lead.email : `<span class="masked-sensitive">${this.maskEmail(lead.email)}</span>`;

        tr.innerHTML = `
          <td><strong>${lead.name}</strong></td>
          <td>${phoneDisplay}<br><span style="font-size:0.75rem; color:var(--text-muted);">${emailDisplay}</span></td>
          <td><span style="font-weight:500;">${lead.treatment}</span></td>
          <td><span style="font-size:0.8rem; font-weight:600;">Timeframe:</span> ${lead.timeframe}<br><span style="font-size:0.75rem; color:var(--text-muted);">${lead.urgency}</span></td>
          <td><span class="badge ${badgeClass}">${lead.leadTag} (${lead.score})</span></td>
          <td>${lead.dateCreated}<br><span style="font-size:0.75rem; color:var(--primary); font-weight:600;">${lead.source}</span></td>
          <td>
            <div class="action-btns">
              <button class="action-btn delete" title="Remove Lead" onclick="app.deleteLead('${lead.id}')">🗑️</button>
            </div>
          </td>
        `;
        leadBody.appendChild(tr);
      });
    }

    // RENDER WHATSAPP CARDS
    const waGrid = document.getElementById('whatsapp-cards-grid');
    waGrid.innerHTML = '';
    const waLeads = leads.filter(l => l.source === 'WhatsApp');
    if (waLeads.length === 0) {
      document.getElementById('whatsapp-empty').style.display = 'flex';
    } else {
      document.getElementById('whatsapp-empty').style.display = 'none';
      waLeads.forEach(lead => {
        const card = document.createElement('div');
        card.className = 'glass';
        card.style.padding = '1.5rem';
        card.style.borderRadius = 'var(--radius-md)';
        card.style.border = '1px solid var(--border-color)';
        
        const crmPhone = this.isAdminLoggedIn ? lead.phone : this.maskPhone(lead.phone);
        const formattedCRM = `Name: ${lead.name}\nPhone: ${crmPhone}\nTreatment: ${lead.treatment}\nAppointment Preference: ${lead.timeframe}\nLead Score: ${lead.score}\nSource: WhatsApp`;
        
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h4>${lead.name}</h4>
            <span class="badge badge-warm" style="background:#d1fae5; color:#065f46;">WhatsApp Lead</span>
          </div>
          <pre style="background:var(--bg-input); padding:0.75rem; border-radius:var(--radius-sm); font-size:0.75rem; font-family:monospace; white-space:pre-wrap; margin-bottom:1rem; border:1px solid var(--border-color); color:var(--text-main);">${formattedCRM}</pre>
          <button class="btn btn-outline" style="width:100%; font-size:0.8rem; padding:0.5rem;" onclick="app.copyToClipboard(this, \`${formattedCRM.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)">
            📋 Copy CRM Text
          </button>
        `;
        waGrid.appendChild(card);
      });
    }

    // RENDER HANDOFFS TABLE
    const handoffBody = document.getElementById('handoffs-tbody');
    handoffBody.innerHTML = '';
    if (handoffs.length === 0) {
      document.getElementById('handoffs-empty').style.display = 'flex';
      document.getElementById('handoffs-table').style.display = 'none';
    } else {
      document.getElementById('handoffs-empty').style.display = 'none';
      document.getElementById('handoffs-table').style.display = 'table';
      
      handoffs.forEach(hand => {
        const tr = document.createElement('tr');
        const badgeClass = hand.status === 'Active Escalation' ? 'badge-emergency' : 'badge-new';
        
        const phoneDisplay = this.isAdminLoggedIn ? hand.phone : `<span class="masked-sensitive">${this.maskPhone(hand.phone)}</span>`;
        
        tr.innerHTML = `
          <td><code>${hand.sessionId}</code></td>
          <td><strong>${hand.name}</strong></td>
          <td>${phoneDisplay}</td>
          <td><span style="color:var(--color-emergency); font-weight:600; font-size:0.85rem;">${hand.reason}</span></td>
          <td>
            <button class="btn btn-outline" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="app.openHandoffModal('${hand.id}')">
              👁️ View Log (${hand.transcript.length} msgs)
            </button>
          </td>
          <td><span class="badge ${badgeClass}">${hand.status}</span></td>
          <td>
            <div class="action-btns">
              <button class="action-btn" title="Attend Escalation" onclick="app.attendEscalation('${hand.id}')">✔️</button>
              <button class="action-btn delete" title="Clear Handoff" onclick="app.clearHandoff('${hand.id}')">🗑️</button>
            </div>
          </td>
        `;
        handoffBody.appendChild(tr);
      });
    }

    // RENDER TREATMENTS TABLE
    const treatmentBody = document.getElementById('treatments-tbody');
    if (treatmentBody) {
      treatmentBody.innerHTML = '';
      const treatments = treatmentService.getTreatmentsList();
      
      if (treatments.length === 0) {
        const treatmentsEmpty = document.getElementById('treatments-empty');
        const treatmentsTable = document.getElementById('treatments-table');
        if (treatmentsEmpty) treatmentsEmpty.style.display = 'flex';
        if (treatmentsTable) treatmentsTable.style.display = 'none';
      } else {
        const treatmentsEmpty = document.getElementById('treatments-empty');
        const treatmentsTable = document.getElementById('treatments-table');
        if (treatmentsEmpty) treatmentsEmpty.style.display = 'none';
        if (treatmentsTable) treatmentsTable.style.display = 'table';
        
        treatments.forEach(t => {
          const tr = document.createElement('tr');
          const isFeatured = t.featured === true || t.featured === 'true';
          const isActive = t.active === true || t.active === 'true';
          
          tr.innerHTML = `
            <td><code>${t.displayOrder || 99}</code></td>
            <td><strong>${t.name}</strong></td>
            <td><span class="badge badge-existing" style="background: var(--primary-light); color: var(--primary); border: none;">${t.category}</span></td>
            <td><span style="font-weight:600; color:var(--primary);">${formatCurrency(t.price, configService.getCurrentConfig()?.currency || '₹')}</span></td>
            <td style="max-width: 250px; font-size: 0.8rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.description}">${t.description}</td>
            <td>
              <span class="badge ${isFeatured ? 'badge-hot' : 'badge-existing'}" style="margin-right: 0.25rem;">${isFeatured ? '★ Featured' : 'Standard'}</span>
              <span class="badge ${isActive ? 'badge-new' : 'badge-disconnected'}">${isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td>
              <div class="action-btns">
                <button class="action-btn" title="Edit Treatment" onclick="app.openEditTreatmentModal('${t.id}')">✏️</button>
                <button class="action-btn delete" title="Delete Treatment" onclick="app.deleteTreatment('${t.id}')">🗑️</button>
              </div>
            </td>
          `;
          treatmentBody.appendChild(tr);
        });
      }
    }
    this.renderSpecialists();
    this.renderCallsHistory();
  }

  initTelephonyHub() {
    const sidInput = document.getElementById('settings-twilio-sid');
    const tokenInput = document.getElementById('settings-twilio-token');
    const phoneInput = document.getElementById('settings-twilio-phone');
    const saveBtn = document.getElementById('save-telephony-btn');
    const clearBtn = document.getElementById('clear-call-logs');
    const webhookUrlInput = document.getElementById('telephony-webhook-url');
    
    const cid = configService.clinicId || 'default_clinic';

    // Populate existing values
    if (sidInput) sidInput.value = decryptObfuscate(localStorage.getItem(`twilio_sid_${cid}`)) || '';
    if (tokenInput) tokenInput.value = decryptObfuscate(localStorage.getItem(`twilio_token_${cid}`)) || '';
    if (phoneInput) phoneInput.value = decryptObfuscate(localStorage.getItem(`twilio_phone_${cid}`)) || '';
    
    // Webhook URL display
    if (webhookUrlInput) {
      const sheetsUrl = localStorage.getItem('google_sheets_url');
      if (sheetsUrl) {
        webhookUrlInput.value = `${sheetsUrl}${sheetsUrl.includes('?') ? '&' : '?'}type=twilioVoice`;
      } else {
        webhookUrlInput.value = "Connect Google Sheets under Settings & Sync first!";
      }
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const sid = sidInput.value.trim();
        const token = tokenInput.value.trim();
        const phone = phoneInput.value.trim();
        
        localStorage.setItem(`twilio_sid_${cid}`, encryptObfuscate(sid));
        localStorage.setItem(`twilio_token_${cid}`, encryptObfuscate(token));
        localStorage.setItem(`twilio_phone_${cid}`, encryptObfuscate(phone));
        
        this.showSystemAlert('Telephony Credentials Saved!', 'success');
        this.logSystemEvent('Telephony Config', 'Twilio integration credentials saved.', { sid, phone });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all Call Logs?')) {
          this.saveCalls([]);
          this.renderDashboard();
          this.showSystemAlert('Call logs cleared.', 'info');
        }
      });
    }

    // Patient Simulator call button binding
    const phoneToggleBtn = document.getElementById('phone-toggle-btn');
    if (phoneToggleBtn) {
      phoneToggleBtn.addEventListener('click', () => {
        this.togglePhoneSimulator();
      });
    }

    const hangupBtn = document.getElementById('phone-hangup-btn');
    if (hangupBtn) {
      hangupBtn.addEventListener('click', () => {
        this.endPhoneCall();
      });
    }

    // Staff transfer alert bindings
    const acceptCallBtn = document.getElementById('staff-accept-call-btn');
    const declineCallBtn = document.getElementById('staff-decline-call-btn');

    if (acceptCallBtn) {
      acceptCallBtn.addEventListener('click', () => {
        this.acceptIncomingCallTransfer();
      });
    }
    if (declineCallBtn) {
      declineCallBtn.addEventListener('click', () => {
        this.declineIncomingCallTransfer();
      });
    }
  }

  getCalls() {
    const cid = configService.clinicId || 'default_clinic';
    return JSON.parse(localStorage.getItem(`calls_${cid}`) || '[]');
  }

  saveCalls(calls) {
    const cid = configService.clinicId || 'default_clinic';
    localStorage.setItem(`calls_${cid}`, JSON.stringify(calls));
  }

  togglePhoneSimulator() {
    const modal = document.getElementById('phone-simulator-modal');
    if (!modal) return;
    
    if (modal.style.display === 'none') {
      modal.style.display = 'flex';
      this.startPhoneCall();
    } else {
      this.endPhoneCall();
    }
  }

  startPhoneCall() {
    this.activeCall = {
      id: 'call_' + Math.floor(Math.random() * 1000000),
      caller: 'Anonymous Patient',
      phone: 'Web Call',
      timestamp: new Date().toLocaleString(),
      duration: '00:00',
      status: 'Active',
      transcript: []
    };
    this.renderActiveCallMonitor();

    const statusTitle = document.getElementById('phone-status-title');
    const timerEl = document.getElementById('phone-call-timer');
    const transcriptEl = document.getElementById('phone-call-transcript');
    const waveform = document.getElementById('phone-waveform');

    if (statusTitle) statusTitle.innerText = "Ringing...";
    if (timerEl) timerEl.innerText = "00:00";
    if (transcriptEl) transcriptEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 1rem;">Connecting call to clinic...</div>';
    if (waveform) waveform.style.display = 'none';

    // Play synthesized phone ring tone on start (3 seconds ringing simulation)
    this.playCallRingtoneLoop(true);

    this.callTimerCount = 0;
    this.callTimerInterval = null;

    this.callConnectTimeout = setTimeout(() => {
      this.playCallRingtoneLoop(false); // Stop ringing tone
      if (statusTitle) statusTitle.innerText = "Connected - AI Receptionist";
      if (waveform) waveform.style.display = 'flex';
      if (transcriptEl) transcriptEl.innerHTML = '';

      // Initialize speech recognition and synthesis
      this.initSpeechAPIForCall();

      // Start call timer
      this.callTimerInterval = setInterval(() => {
        this.callTimerCount++;
        const mins = String(Math.floor(this.callTimerCount / 60)).padStart(2, '0');
        const secs = String(this.callTimerCount % 60).padStart(2, '0');
        if (timerEl) timerEl.innerText = `${mins}:${secs}`;
        if (this.activeCall) this.activeCall.duration = `${mins}:${secs}`;
        this.renderActiveCallMonitor();
      }, 1000);

      // Speak Greeting
      const greeting = "Thank you for calling Apex Dental Care. I am your virtual AI receptionist. How can I help you today?";
      this.speakCallReceptionist(greeting);
    }, 3000);
  }

  playCallRingtoneLoop(start) {
    if (!start) {
      if (this.ringOscInterval) {
        clearInterval(this.ringOscInterval);
        this.ringOscInterval = null;
      }
      return;
    }

    try {
      const ringCtx = this.getOrCreateAudioContext();
      if (!ringCtx) return;
      
      const playRingTone = () => {
        const now = ringCtx.currentTime;
        const osc1 = ringCtx.createOscillator();
        const osc2 = ringCtx.createOscillator();
        const gain = ringCtx.createGain();

        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        osc1.type = 'sine';
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.setValueAtTime(0.15, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ringCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      };

      playRingTone();
      this.ringOscInterval = setInterval(playRingTone, 4000);
    } catch (e) {
      console.warn("Could not play synthesized calling ringtone:", e);
    }
  }

  endPhoneCall() {
    this.playCallRingtoneLoop(false);
    if (this.callConnectTimeout) clearTimeout(this.callConnectTimeout);
    if (this.callTimerInterval) clearInterval(this.callTimerInterval);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch (e) {}
    }

    const modal = document.getElementById('phone-simulator-modal');
    if (modal) modal.style.display = 'none';

    if (this.activeCall) {
      if (this.activeCall.status === 'Active') {
        this.activeCall.status = 'Completed';
      }
      
      // Save call log
      if (this.activeCall.transcript.length > 0) {
        const calls = this.getCalls();
        calls.unshift(this.activeCall);
        this.saveCalls(calls);
        this.renderDashboard();
      }
      this.activeCall = null;
    }
    this.renderActiveCallMonitor();
  }

  appendPhoneTranscript(sender, text) {
    if (!this.activeCall) return;
    this.activeCall.transcript.push({ sender, text });

    const transcriptEl = document.getElementById('phone-call-transcript');
    if (transcriptEl) {
      const bubble = document.createElement('div');
      bubble.className = `phone-msg-bubble ${sender}`;
      bubble.innerText = text;
      transcriptEl.appendChild(bubble);
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
    this.renderActiveCallMonitor();
  }

  speakCallReceptionist(text) {
    this.appendPhoneTranscript('receptionist', text);

    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      
      utterance.onend = () => {
        this.listenToCallerSpeech();
      };
      
      utterance.onerror = () => {
        this.listenToCallerSpeech();
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => this.listenToCallerSpeech(), 2000);
    }
  }

  initSpeechAPIForCall() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      this.speechRecognizer = new SpeechRecognitionClass();
      this.speechRecognizer.continuous = false;
      this.speechRecognizer.interimResults = false;
      this.speechRecognizer.lang = 'en-US';

      this.speechRecognizer.onresult = (event) => {
        const speechText = event.results[0][0].transcript.trim();
        if (speechText) {
          this.appendPhoneTranscript('caller', speechText);
          
          if (this.activeCall && this.activeCall.status === 'Connected - Live Staff Receptionist') {
            // Live takeover mode: log patient speech, don't auto-respond, and restart listening
            setTimeout(() => this.listenToCallerSpeech(), 500);
          } else {
            this.processTelephonyAIResponse(speechText);
          }
        }
      };

      this.speechRecognizer.onerror = (e) => {
        console.warn("Telephony Speech recognition error:", e.error);
        if (e.error === 'no-speech') {
          this.listenToCallerSpeech();
        }
      };
    }
  }

  listenToCallerSpeech() {
    if (!this.activeCall) return;
    const status = this.activeCall.status;
    if (status !== 'Active' && status !== 'Connected - Live Staff Receptionist' && status !== 'Voicemail Recording') return;
    
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.start();
      } catch (e) {
        // already started
      }
    }
  }

  extractTimeFromSpeech(speechText) {
    speechText = speechText.toUpperCase().replace(/\./g, '');
    
    // Map English words to numbers
    const wordToNumber = {
      'ONE': '1', 'TWO': '2', 'THREE': '3', 'FOUR': '4', 'FIVE': '5',
      'SIX': '6', 'SEVEN': '7', 'EIGHT': '8', 'NINE': '9', 'TEN': '10',
      'ELEVEN': '11', 'TWELVE': '12', 'NOON': '12 PM', 'MIDNIGHT': '12 AM'
    };
    
    // Replace word representations with digits
    for (const [word, num] of Object.entries(wordToNumber)) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      speechText = speechText.replace(regex, num);
    }

    const match = speechText.match(/\b(12|11|10|9|8|7|6|5|4|3|2|1)\b/);
    if (match) {
      let hour = parseInt(match[1], 10);
      let minute = "00";
      
      const timeColonMatch = speechText.match(/\b(12|11|10|9|8|7|6|5|4|3|2|1):([0-5][0-9])\b/);
      const timeSpaceMatch = speechText.match(/\b(12|11|10|9|8|7|6|5|4|3|2|1)\s+([0-5][0-9])\b/);
      
      if (timeColonMatch) {
        hour = parseInt(timeColonMatch[1], 10);
        minute = timeColonMatch[2];
      } else if (timeSpaceMatch) {
        hour = parseInt(timeSpaceMatch[1], 10);
        minute = timeSpaceMatch[2];
      }
      
      let isPM = speechText.includes("PM") || speechText.includes("P M") || speechText.includes("EVENING") || speechText.includes("AFTERNOON");
      if (!speechText.includes("AM") && !speechText.includes("A M") && hour >= 1 && hour <= 8) {
        isPM = true;
      }
      
      let displayHour = hour;
      if (isPM && hour !== 12) {
        hour += 12;
      }
      if (!isPM && hour === 12) {
        hour = 0;
      }
      
      const padHour = String(hour).padStart(2, '0');
      const padDisplayHour = String(displayHour);
      const ampmStr = isPM ? "PM" : "AM";
      
      return {
        time24: `${padHour}:${minute}`,
        time12: `${padDisplayHour}:${minute} ${ampmStr}`
      };
    }
    return {
      time24: "11:00",
      time12: "11:00 AM"
    };
  }

  async processTelephonyAIResponse(input) {
    if (this.activeCall && (this.activeCall.status === 'Connected - Live Staff Receptionist' || this.activeCall.status === 'Voicemail Recording')) {
      return;
    }
    const cleanInput = input.toLowerCase();

    // 1. Check for transfer request
    if (cleanInput.includes('receptionist') || cleanInput.includes('human') || cleanInput.includes('staff') || cleanInput.includes('person') || cleanInput.includes('operator') || cleanInput.includes('transfer')) {
      this.speakCallTransferSequence();
      return;
    }

    // 2. Check for booking requests
    if (cleanInput.includes('book') || cleanInput.includes('appointment') || cleanInput.includes('schedule') || cleanInput.includes('reserve')) {
      if (this.isBookingInProgress) {
        this.speakCallReceptionist("Please wait, I am already reserving a slot for you.");
        return;
      }

      // Extract time from caller speech
      const extractedTime = this.extractTimeFromSpeech(input);
      const timeStr = extractedTime.time12;
      const time24 = extractedTime.time24;

      // Validate working hours: 9 AM to 8 PM (9:00 to 20:00)
      const hour24 = parseInt(time24.split(':')[0], 10);
      if (hour24 < 9 || hour24 >= 20) {
        const outOfHoursReply = `I'm sorry, but ${timeStr} is outside our working hours. We are open from 9:00 AM to 8:00 PM. Could you please select a time during our open hours?`;
        this.speakCallReceptionist(outOfHoursReply);
        return;
      }

      this.isBookingInProgress = true;

      const treatments = treatmentService.getTreatmentsList();
      const treatmentName = treatments[0] ? treatments[0].name : "Consultation";
      
      const appDate = new Date();
      appDate.setDate(appDate.getDate() + 1); // tomorrow by default
      
      let dateClarification = "tomorrow";
      if (appDate.getDay() === 0) { // Sunday
        appDate.setDate(appDate.getDate() + 1); // Move to Monday!
        dateClarification = "Monday";
      }
      const dateStr = appDate.toISOString().split('T')[0];

      const reply = `I can help you reserve a ${treatmentName} appointment for ${dateClarification} at ${timeStr}. Let me add that booking for you under your caller profile.`;
      
      const newApp = {
        id: 'app_voice_' + Math.floor(Math.random() * 10000),
        name: 'Caller Patient',
        phone: '9988776655',
        email: 'voice-caller@dentist.ai',
        date: dateStr,
        time: time24,
        treatment: treatmentName,
        status: 'New Patient',
        dateCreated: new Date().toISOString().split('T')[0]
      };
      
      const apps = this.getAppointments();
      apps.unshift(newApp);
      this.saveAppointments(apps);
      this.renderDashboard();

      this.syncToSheets('addAppointment', newApp)
        .catch(err => console.warn("Google Sheets Sync failed:", err))
        .finally(() => {
          this.isBookingInProgress = false;
        });

      this.speakCallReceptionist(reply + " Appointment booked successfully. We will text you the details.");
      return;
    }

    // 3. Check for clinic hours
    if (cleanInput.includes('hours') || cleanInput.includes('open') || cleanInput.includes('close') || cleanInput.includes('time')) {
      const config = configService.getCurrentConfig();
      const status = this.checkClinicOpenStatus(config);
      const hoursReply = `Our working hours are ${config.workingHours || "9 AM to 8 PM"}. Currently we are: ${status.isOpen ? 'Open' : 'Closed'}.`;
      this.speakCallReceptionist(hoursReply + " Is there anything else I can help you with?");
      return;
    }

    // 4. Default AI Chatbot matching or keyword fallbacks
    let answer = "I heard you say: " + input + ". Could you please repeat or clarify if you want to book an appointment, check our hours, or speak to a receptionist?";
    const config = configService.getCurrentConfig();
    if (cleanInput.includes('price') || cleanInput.includes('cost') || cleanInput.includes('charge')) {
      answer = `Our treatment pricing starts at standard clinic rates. For details, you can visit our treatments page or book a specialist consult.`;
    } else if (cleanInput.includes('address') || cleanInput.includes('where') || cleanInput.includes('location')) {
      answer = `We are located at: ${config.address || 'Ground Floor, Zenith Plaza, Bandra West, Mumbai'}. We offer complimentary valet parking.`;
    }

    this.speakCallReceptionist(answer);
  }

  speakCallTransferSequence() {
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch (e) {}
    }

    const transferMessage = "Sure, please hold while I transfer your call to our human receptionist.";
    this.appendPhoneTranscript('receptionist', transferMessage);

    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(transferMessage);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onend = () => {
        this.initiateStaffCallTransfer();
      };
      utterance.onerror = () => {
        this.initiateStaffCallTransfer();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => this.initiateStaffCallTransfer(), 2000);
    }
  }

  initiateStaffCallTransfer() {
    const statusTitle = document.getElementById('phone-status-title');
    const waveform = document.getElementById('phone-waveform');
    
    if (statusTitle) statusTitle.innerText = "Transferring call...";
    if (waveform) waveform.style.display = 'none';

    if (this.activeCall) {
      this.activeCall.status = 'Transferred to Staff';
    }

    this.triggerStaffCallTransferAlert();
    this.renderActiveCallMonitor();
  }

  triggerStaffCallTransferAlert() {
    this.playStaffTransferRingTone(true);

    const transcriptEl = document.getElementById('staff-call-transcript-preview');
    if (transcriptEl && this.activeCall) {
      const fullText = this.activeCall.transcript.map(t => `[${t.sender === 'receptionist' ? 'AI' : t.sender === 'staff' ? 'Staff' : 'Patient'}]: ${t.text}`).join('\n');
      transcriptEl.innerText = fullText;
    }

    this.openModal('call-transfer-modal');
    this.renderActiveCallMonitor();
  }

  playStaffTransferRingTone(start) {
    if (!start) {
      if (this.staffRingInterval) {
        clearInterval(this.staffRingInterval);
        this.staffRingInterval = null;
      }
      return;
    }

    try {
      const staffRingCtx = this.getOrCreateAudioContext();
      if (!staffRingCtx) return;
      
      const playPhoneBell = () => {
        const now = staffRingCtx.currentTime;
        const playPulse = (t) => {
          const osc1 = staffRingCtx.createOscillator();
          const osc2 = staffRingCtx.createOscillator();
          const gain = staffRingCtx.createGain();

          osc1.frequency.value = 700;
          osc2.frequency.value = 800;
          osc1.type = 'sine';
          osc2.type = 'sine';

          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(staffRingCtx.destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.45);
          osc2.stop(t + 0.45);
        };

        playPulse(now);
        playPulse(now + 0.5);
      };

      playPhoneBell();
      this.staffRingInterval = setInterval(playPhoneBell, 3000);
    } catch(e) {
      console.warn("Could not play synthesized staff call ringtone:", e);
    }
  }

  acceptIncomingCallTransfer() {
    this.playStaffTransferRingTone(false);
    
    this.closeModal('call-transfer-modal');

    const statusTitle = document.getElementById('phone-status-title');
    if (statusTitle) statusTitle.innerText = "Connected - Live Staff Receptionist";

    if (this.activeCall) {
      this.activeCall.status = 'Connected - Live Staff Receptionist';
    }

    this.appendPhoneTranscript('system', "Call connected to human staff receptionist.");
    this.showSystemAlert('Call transfer accepted. You are now speaking live with the patient.', 'success');
    this.renderActiveCallMonitor();

    setTimeout(() => {
      this.speakCallReceptionist("Hello! This is clinic staff receptionist. How can I help you directly?");
    }, 1000);
  }

  declineIncomingCallTransfer() {
    this.playStaffTransferRingTone(false);
    
    this.closeModal('call-transfer-modal');

    if (this.activeCall) {
      this.activeCall.status = 'Voicemail Recording';
    }
    this.renderActiveCallMonitor();

    const declineMsg = "Our staff is currently unavailable. Please leave your message after the beep.";
    this.appendPhoneTranscript('receptionist', declineMsg);

    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(declineMsg);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onend = () => {
        this.startVoicemailRecordingSequence();
      };
      utterance.onerror = () => {
        this.startVoicemailRecordingSequence();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        this.startVoicemailRecordingSequence();
      }, 2000);
    }
  }

  playVoicemailBeep() {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.value = 800; // 800 Hz beep
      osc.type = 'sine';
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn("Could not play voicemail beep:", e);
    }
  }

  startVoicemailRecordingSequence() {
    if (!this.activeCall) return;
    
    this.playVoicemailBeep();
    this.appendPhoneTranscript('system', "* BEEP * Recording voicemail...");
    this.renderActiveCallMonitor();
    
    const statusTitle = document.getElementById('phone-status-title');
    if (statusTitle) statusTitle.innerText = "Voicemail Recording...";

    setTimeout(() => {
      if (this.speechRecognizer) {
        const originalOnResult = this.speechRecognizer.onresult;
        const originalOnError = this.speechRecognizer.onerror;
        
        this.speechRecognizer.onresult = (event) => {
          const speechText = event.results[0][0].transcript.trim();
          if (speechText) {
            this.appendPhoneTranscript('caller', `[Voicemail]: ${speechText}`);
            
            this.speechRecognizer.onresult = originalOnResult;
            this.speechRecognizer.onerror = originalOnError;
            
            const thankMsg = "Thank you. Your message has been saved. Goodbye.";
            this.appendPhoneTranscript('receptionist', thankMsg);
            this.renderActiveCallMonitor();
            
            if (window.speechSynthesis) {
              const utterance = new SpeechSynthesisUtterance(thankMsg);
              utterance.lang = 'en-US';
              utterance.rate = 0.95;
              utterance.onend = () => this.endPhoneCall();
              utterance.onerror = () => this.endPhoneCall();
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            } else {
              setTimeout(() => this.endPhoneCall(), 2000);
            }
          }
        };

        this.speechRecognizer.onerror = (e) => {
          console.warn("Voicemail recording error:", e.error);
          this.speechRecognizer.onresult = originalOnResult;
          this.speechRecognizer.onerror = originalOnError;
          this.endPhoneCall();
        };

        this.listenToCallerSpeech();
      } else {
        setTimeout(() => this.endPhoneCall(), 1000);
      }
    }, 600);
  }

  renderActiveCallMonitor() {
    const container = document.getElementById('active-call-monitor-container');
    if (!container) return;

    if (!this.activeCall) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    
    const c = this.activeCall;
    
    let statusBadge = `<span class="badge badge-existing">${c.status}</span>`;
    if (c.status === 'Transferred to Staff') {
      statusBadge = `<span class="badge badge-emergency" style="animation: pulse 1s infinite;">Transfer Request</span>`;
    } else if (c.status === 'Active') {
      statusBadge = `<span class="badge badge-new">Connected (AI)</span>`;
    } else if (c.status === 'Voicemail Recording') {
      statusBadge = `<span class="badge badge-emergency">Voicemail Recording</span>`;
    } else if (c.status === 'Connected - Live Staff Receptionist') {
      statusBadge = `<span class="badge badge-new" style="background: #3b82f6;">Live Handoff</span>`;
    }

    const transcriptHtml = c.transcript.map(t => {
      let senderName = 'Patient';
      let color = '#ef4444';
      if (t.sender === 'receptionist') {
        senderName = 'AI Receptionist';
        color = '#10b981';
      } else if (t.sender === 'staff') {
        senderName = 'Staff Receptionist (Live)';
        color = '#3b82f6';
      } else if (t.sender === 'system') {
        senderName = 'System';
        color = '#64748b';
      }
      return `<div style="margin-bottom: 0.5rem; line-height: 1.4; font-size: 0.85rem;">
        <strong style="color: ${color};">${senderName}:</strong> ${t.text}
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); border: 2px solid var(--primary); background: var(--bg-card); box-shadow: var(--shadow-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.5rem; animation: pulse 1.5s infinite;">📞</span>
            <div>
              <h4 style="margin: 0; color: var(--text-main);">Active Call Simulator Monitoring</h4>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Caller: <strong>${c.caller}</strong> | Phone: ${c.phone} | Duration: ${c.duration}</span>
            </div>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>

        <div style="background: var(--bg-input); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); max-height: 200px; overflow-y: auto; margin-bottom: 1rem;" id="active-call-monitor-transcript">
          ${transcriptHtml || '<div style="color: var(--text-muted); text-align: center;">Waiting for call conversation to begin...</div>'}
        </div>

        <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
          ${c.status === 'Transferred to Staff' ? `
            <button class="btn btn-primary" style="background: var(--color-emergency); border-color: var(--color-emergency); color: white;" onclick="app.acceptIncomingCallTransfer()">
              Accept Call & Speak
            </button>
            <button class="btn btn-outline" style="border-color: var(--color-emergency); color: var(--color-emergency);" onclick="app.declineIncomingCallTransfer()">
              Decline & Mute
            </button>
          ` : ''}

          ${c.status === 'Connected - Live Staff Receptionist' ? `
            <div style="display: flex; gap: 0.5rem; width: 100%;">
              <input type="text" id="staff-live-input" placeholder="Type here to speak to patient via Text-to-Speech..." style="flex: 1;" onkeypress="if(event.key === 'Enter') app.sendStaffLiveSpeech()">
              <button class="btn btn-primary" onclick="app.sendStaffLiveSpeech()">Send & Speak</button>
              <button class="btn btn-outline" style="border-color: var(--color-emergency); color: var(--color-emergency);" onclick="app.endPhoneCall()">Hang Up</button>
            </div>
          ` : ''}
          
          ${c.status === 'Active' ? `
            <button class="btn btn-outline" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="app.speakCallTransferSequence()">Force Live Takeover</button>
            <button class="btn btn-outline" style="border-color: var(--color-emergency); color: var(--color-emergency); font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="app.endPhoneCall()">Hang Up</button>
          ` : ''}
        </div>
      </div>
    `;
    
    const transcriptDiv = document.getElementById('active-call-monitor-transcript');
    if (transcriptDiv) transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  }

  sendStaffLiveSpeech() {
    const inputEl = document.getElementById('staff-live-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    this.appendPhoneTranscript('staff', text);
    this.renderActiveCallMonitor();
    
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onend = () => {
        this.listenToCallerSpeech();
      };
      utterance.onerror = () => {
        this.listenToCallerSpeech();
      };
      window.speechSynthesis.speak(utterance);
    }
  }

  renderCallsHistory() {
    const callBody = document.getElementById('calls-tbody');
    const calls = this.getCalls();
    
    const badgeCalls = document.getElementById('badge-calls-count');
    if (badgeCalls) {
      const activeCalls = calls.filter(c => c.status === 'Transferred to Staff' || c.status === 'Active');
      if (activeCalls.length > 0) {
        badgeCalls.innerText = activeCalls.length;
        badgeCalls.style.display = 'inline-block';
      } else {
        badgeCalls.style.display = 'none';
      }
    }

    if (callBody) {
      callBody.innerHTML = '';
      if (calls.length === 0) {
        const callsEmpty = document.getElementById('calls-empty');
        const callsTable = document.getElementById('calls-table');
        if (callsEmpty) callsEmpty.style.display = 'flex';
        if (callsTable) callsTable.style.display = 'none';
      } else {
        const callsEmpty = document.getElementById('calls-empty');
        const callsTable = document.getElementById('calls-table');
        if (callsEmpty) callsEmpty.style.display = 'none';
        if (callsTable) callsTable.style.display = 'table';
        
        calls.forEach(c => {
          const tr = document.createElement('tr');
          const badgeClass = c.status === 'Transferred to Staff' ? 'badge-emergency' : 
                             c.status === 'Completed' ? 'badge-new' : 'badge-existing';
          
          const callerDisplay = this.isAdminLoggedIn ? c.caller : `Caller Patient`;
          const phoneDisplay = this.isAdminLoggedIn ? c.phone : `***`;
          
          tr.innerHTML = `
            <td><strong>${callerDisplay}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${phoneDisplay}</span></td>
            <td>${c.timestamp}</td>
            <td><code>${c.duration}</code></td>
            <td><span class="badge ${badgeClass}">${c.status}</span></td>
            <td>
              <button class="btn btn-outline" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="app.openCallTranscriptModal('${c.id}')">
                👁️ View Transcript (${c.transcript.length} lines)
              </button>
            </td>
            <td>
              <div class="action-btns">
                <button class="action-btn delete" title="Delete Call Log" onclick="app.deleteCallLog('${c.id}')">🗑️</button>
              </div>
            </td>
          `;
          callBody.appendChild(tr);
        });
      }
    }
  }

  openCallTranscriptModal(id) {
    const calls = this.getCalls();
    const call = calls.find(c => c.id === id);
    if (!call) return;
    
    let modal = document.getElementById('call-transcript-modal');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="call-transcript-modal" style="z-index:10000;">
          <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
              <h3 id="transcript-modal-title">📞 Call Transcript</h3>
              <button class="chat-close-btn" style="color:var(--text-main); font-size:1.5rem;" onclick="app.closeModal('call-transcript-modal')">×</button>
            </div>
            <div class="modal-body" id="transcript-modal-body" style="max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; padding-right: 0.5rem; text-align: left;">
            </div>
            <div class="modal-footer" style="margin-top: 1.5rem;">
              <button class="btn btn-outline" style="width: 100%;" onclick="app.closeModal('call-transcript-modal')">Close Transcript</button>
            </div>
          </div>
        </div>
      `);
      modal = document.getElementById('call-transcript-modal');
    }

    const titleEl = document.getElementById('transcript-modal-title');
    const bodyEl = document.getElementById('transcript-modal-body');
    
    const callerName = this.isAdminLoggedIn ? call.caller : "Caller Patient";
    titleEl.innerText = `📞 Call Transcript: ${callerName} (${call.duration})`;
    
    bodyEl.innerHTML = '';
    call.transcript.forEach(line => {
      const bubble = document.createElement('div');
      bubble.style.padding = '0.5rem 0.75rem';
      bubble.style.borderRadius = 'var(--radius-sm)';
      bubble.style.fontSize = '0.8rem';
      bubble.style.lineHeight = '1.4';
      bubble.style.maxWidth = '85%';
      
      if (line.sender === 'receptionist') {
        bubble.style.background = 'rgba(16, 185, 129, 0.1)';
        bubble.style.border = '1px solid rgba(16, 185, 129, 0.2)';
        bubble.style.color = 'var(--text-main)';
        bubble.style.alignSelf = 'flex-start';
      } else if (line.sender === 'caller') {
        bubble.style.background = 'var(--primary-light)';
        bubble.style.border = '1px solid rgba(13, 148, 136, 0.1)';
        bubble.style.color = 'var(--primary)';
        bubble.style.alignSelf = 'flex-end';
      } else {
        bubble.style.background = 'transparent';
        bubble.style.color = 'var(--text-muted)';
        bubble.style.alignSelf = 'center';
        bubble.style.textAlign = 'center';
        bubble.style.fontStyle = 'italic';
      }
      
      const authorText = line.sender === 'receptionist' ? 'AI Virtual Receptionist' : (line.sender === 'caller' ? 'Patient' : 'System');
      bubble.innerHTML = `<strong>${authorText}:</strong> ${line.text}`;
      bodyEl.appendChild(bubble);
    });

    this.openModal('call-transcript-modal');
  }

  deleteCallLog(id) {
    if (confirm('Are you sure you want to delete this Call Log?')) {
      let calls = this.getCalls();
      calls = calls.filter(c => c.id !== id);
      this.saveCalls(calls);
      this.renderDashboard();
      this.showSystemAlert('Call log deleted.', 'info');
    }
  }

  // Modal Open/Close Utilities
  openModal(id) {
    document.getElementById(id).classList.add('open');
  }

  closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (id === 'handoff-transcript-modal') {
      if (this.takeoverPollTimer) {
        clearInterval(this.takeoverPollTimer);
        this.takeoverPollTimer = null;
      }
    }
  }

  // Reschedule Appointment actions
  openEditModal(id) {
    const apps = this.getAppointments();
    const appItem = apps.find(a => a.id === id);
    if (!appItem) return;

    document.getElementById('edit-app-id').value = appItem.id;
    document.getElementById('edit-app-name').value = appItem.name;
    document.getElementById('edit-app-phone').value = appItem.phone;
    document.getElementById('edit-app-email').value = appItem.email;
    document.getElementById('edit-app-date').value = appItem.date;
    document.getElementById('edit-app-time').value = appItem.time;
    document.getElementById('edit-app-treatment').value = appItem.treatment;

    this.openModal('edit-appointment-modal');
  }

  saveEditedAppointment() {
    const id = document.getElementById('edit-app-id').value;
    const apps = this.getAppointments();
    const index = apps.findIndex(a => a.id === id);
    if (index === -1) return;

    apps[index].name = document.getElementById('edit-app-name').value;
    apps[index].phone = document.getElementById('edit-app-phone').value;
    apps[index].email = document.getElementById('edit-app-email').value;
    apps[index].date = document.getElementById('edit-app-date').value;
    apps[index].time = document.getElementById('edit-app-time').value;
    apps[index].treatment = document.getElementById('edit-app-treatment').value;

    this.saveAppointments(apps);
    this.closeModal('edit-appointment-modal');
    this.renderDashboard();
    this.syncToSheets('updateAppointment', apps[index]);
    
    // Add success toast
    this.showSystemAlert('Appointment Rescheduled successfully.', 'success');
  }

  cancelAppointment(id) {
    if (confirm("Are you sure you want to cancel this appointment?")) {
      let apps = this.getAppointments();
      apps = apps.filter(a => a.id !== id);
      this.saveAppointments(apps);
      this.renderDashboard();
      this.syncToSheets('cancelAppointment', { id: id });
      this.showSystemAlert('Appointment cancelled.', 'info');
    }
  }

  // Lead Actions
  deleteLead(id) {
    if (confirm("Remove this lead from CRM database?")) {
      let leads = this.getLeads();
      leads = leads.filter(l => l.id !== id);
      this.saveLeads(leads);
      this.renderDashboard();
      this.syncToSheets('deleteLead', { id: id });
    }
  }

  // Handoff Actions
  openHandoffModal(id) {
    const handoffs = this.getHandoffs();
    const hand = handoffs.find(h => h.id === id);
    if (!hand) return;

    if (this.takeoverPollTimer) {
      clearInterval(this.takeoverPollTimer);
      this.takeoverPollTimer = null;
    }

    document.getElementById('handoff-takeover-btn').dataset.id = hand.id;

    if (!this.isAdminLoggedIn) {
      document.getElementById('handoff-meta-name').innerHTML = `<strong>Patient:</strong> ${hand.name}`;
      document.getElementById('handoff-meta-phone').innerHTML = `<strong>Phone:</strong> <span class="masked-sensitive">${this.maskPhone(hand.phone)}</span>`;
      document.getElementById('handoff-meta-reason').innerHTML = `<strong>Reason:</strong> ${hand.reason}`;
      
      const transcriptContainer = document.getElementById('handoff-transcript-chat');
      transcriptContainer.innerHTML = `
        <div class="locked-transcript-overlay">
          <span style="font-size: 1.5rem;">🔒</span>
          <strong>CRM Transcript Locked</strong>
          <p style="font-size: 0.8rem; margin: 0; max-width: 320px;">Please authenticate as a clinic administrator to view the historical message log.</p>
          <button class="btn btn-primary" style="font-size:0.75rem; margin-top:0.5rem; padding:0.35rem 0.85rem;" onclick="app.closeModal('handoff-transcript-modal'); document.getElementById('dashboard-login-btn').click();">
            🔐 Log In Now
          </button>
        </div>
      `;
      document.getElementById('handoff-takeover-btn').disabled = true;
      document.getElementById('handoff-takeover-btn').style.opacity = '0.5';
      document.getElementById('handoff-takeover-btn').style.display = 'inline-flex';
      document.getElementById('handoff-release-btn').style.display = 'none';
      document.getElementById('handoff-takeover-input-container').style.display = 'none';
    } else {
      document.getElementById('handoff-meta-name').innerHTML = `<strong>Patient:</strong> ${hand.name}`;
      document.getElementById('handoff-meta-phone').innerHTML = `<strong>Phone:</strong> ${hand.phone}`;
      document.getElementById('handoff-meta-reason').innerHTML = `<strong>Reason:</strong> ${hand.reason}`;

      const isTakeover = hand.status === 'Staff Takeover';
      if (isTakeover) {
        document.getElementById('handoff-takeover-btn').style.display = 'none';
        document.getElementById('handoff-release-btn').style.display = 'inline-flex';
        document.getElementById('handoff-takeover-input-container').style.display = 'flex';
        this.startTakeoverPolling(hand.id);
      } else {
        document.getElementById('handoff-takeover-btn').disabled = false;
        document.getElementById('handoff-takeover-btn').style.opacity = '1';
        document.getElementById('handoff-takeover-btn').style.display = 'inline-flex';
        document.getElementById('handoff-release-btn').style.display = 'none';
        document.getElementById('handoff-takeover-input-container').style.display = 'none';

        const transcriptContainer = document.getElementById('handoff-transcript-chat');
        transcriptContainer.innerHTML = '';
        hand.transcript.forEach(msg => {
          const wrap = document.createElement('div');
          const displaySender = msg.sender === 'bot' ? 'bot' : (msg.sender === 'staff' ? 'staff' : 'user');
          wrap.className = `transcript-msg ${displaySender}`;
          wrap.innerHTML = `
            <div class="transcript-author">${msg.sender === 'bot' ? 'DentalAI' : (msg.sender === 'staff' ? 'Staff' : 'Patient')} • ${msg.timestamp}</div>
            <div class="transcript-bubble">${msg.text}</div>
          `;
          transcriptContainer.appendChild(wrap);
        });
      }
    }

    this.openModal('handoff-transcript-modal');
  }

  attendEscalation(id) {
    const handoffs = this.getHandoffs();
    const index = handoffs.findIndex(h => h.id === id);
    if (index === -1) return;

    handoffs[index].status = 'Staff Attended';
    this.saveHandoffs(handoffs);
    this.renderDashboard();
    this.syncToSheets('attendHandoff', { id: id, status: 'Staff Attended' });
    this.showSystemAlert('Marked as attended.', 'success');
  }

  takeoverChat() {
    const id = document.getElementById('handoff-takeover-btn').dataset.id;
    const handoffs = this.getHandoffs();
    const index = handoffs.findIndex(h => h.id === id);
    if (index === -1) return;

    handoffs[index].status = 'Staff Takeover';
    handoffs[index].lastActivity = Date.now();
    this.saveHandoffs(handoffs);
    this.renderDashboard();
    this.syncToSheets('attendHandoff', { id: id, status: 'Staff Takeover' });
    
    // Set active takeover flag
    localStorage.setItem('chat_takeover_active_' + handoffs[index].sessionId, 'true');
    
    // Hide takeover button, show release button and input container
    document.getElementById('handoff-takeover-btn').style.display = 'none';
    document.getElementById('handoff-release-btn').style.display = 'inline-flex';
    document.getElementById('handoff-takeover-input-container').style.display = 'flex';
    
    this.showSystemAlert('Takeover initiated. You are now chatting live with the patient.', 'success');
    this.logSystemEvent('Live Chat Takeover', `Staff took over chat session ${handoffs[index].sessionId}`);
    
    this.startTakeoverPolling(id);
  }

  startTakeoverPolling(id) {
    if (this.takeoverPollTimer) {
      clearInterval(this.takeoverPollTimer);
    }
    
    const pollFunc = () => {
      const handoffs = this.getHandoffs();
      const hand = handoffs.find(h => h.id === id);
      if (!hand) return;

      // Inactivity auto-release check (5 minutes)
      const lastAct = hand.lastActivity || Date.now();
      if (Date.now() - lastAct > 5 * 60 * 1000) {
        this.releaseTakeoverChat();
        this.showSystemAlert('Live chat session timed out due to 5 minutes of inactivity.', 'info');
        return;
      }
      
      const transcriptContainer = document.getElementById('handoff-transcript-chat');
      if (!transcriptContainer) return;
      
      const currentCount = transcriptContainer.querySelectorAll('.transcript-msg').length;
      if (hand.transcript.length !== currentCount) {
        transcriptContainer.innerHTML = '';
        hand.transcript.forEach(msg => {
          const wrap = document.createElement('div');
          const displaySender = msg.sender === 'bot' ? 'bot' : (msg.sender === 'staff' ? 'staff' : 'user');
          wrap.className = `transcript-msg ${displaySender}`;
          wrap.innerHTML = `
            <div class="transcript-author">${msg.sender === 'bot' ? 'DentalAI' : (msg.sender === 'staff' ? 'Staff' : 'Patient')} • ${msg.timestamp}</div>
            <div class="transcript-bubble">${msg.text}</div>
          `;
          transcriptContainer.appendChild(wrap);
        });
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
      }
    };
    
    pollFunc();
    this.takeoverPollTimer = setInterval(pollFunc, 2000);
  }

  releaseTakeoverChat() {
    const id = document.getElementById('handoff-takeover-btn').dataset.id;
    const handoffs = this.getHandoffs();
    const index = handoffs.findIndex(h => h.id === id);
    if (index === -1) return;

    handoffs[index].status = 'Staff Attended';
    this.saveHandoffs(handoffs);
    this.renderDashboard();
    this.syncToSheets('attendHandoff', { id: id, status: 'Staff Attended' });
    
    // Clear takeover flag
    localStorage.removeItem('chat_takeover_active_' + handoffs[index].sessionId);
    
    // Hide input container and release button, show takeover button
    document.getElementById('handoff-takeover-input-container').style.display = 'none';
    document.getElementById('handoff-release-btn').style.display = 'none';
    document.getElementById('handoff-takeover-btn').style.display = 'inline-flex';
    
    if (this.takeoverPollTimer) {
      clearInterval(this.takeoverPollTimer);
      this.takeoverPollTimer = null;
    }
    
    this.showSystemAlert('Takeover released. Chat returned to automated assistant.', 'info');
    this.logSystemEvent('Live Chat Released', `Staff released takeover of chat session ${handoffs[index].sessionId}`);
  }

  sendTakeoverMessage() {
    const id = document.getElementById('handoff-takeover-btn').dataset.id;
    const inputField = document.getElementById('handoff-takeover-input');
    const msgText = inputField.value.trim();
    if (!msgText) return;
    
    const handoffs = this.getHandoffs();
    const index = handoffs.findIndex(h => h.id === id);
    if (index === -1) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg = { sender: 'staff', text: msgText, timestamp: timeStr };
    
    handoffs[index].transcript.push(newMsg);
    handoffs[index].lastActivity = Date.now();
    this.saveHandoffs(handoffs);
    
    inputField.value = '';
    
    this.syncToSheets('addHandoff', handoffs[index]);
    this.logSystemEvent('Handoff Takeover Outbound', `Staff message sent: "${msgText}"`);
    
    this.startTakeoverPolling(id);
  }

  pollForTakeoverMessages() {
    const win = document.getElementById('chat-window');
    if (!win || !win.classList.contains('open')) return;
    
    const sessId = chatbot.activeSessionId;
    const takeoverActive = localStorage.getItem('chat_takeover_active_' + sessId) === 'true';
    
    const subtitle = document.querySelector('.chat-subtitle');
    if (subtitle) {
      if (takeoverActive) {
        if (!subtitle.innerHTML.includes('Live Chat')) {
          subtitle.innerHTML = '<span class="status-dot" style="background:#25d366; animation: pulse-ring 1.5s infinite;"></span> Live Chat with Staff';
        }
      } else {
        if (subtitle.innerHTML.includes('Live Chat')) {
          subtitle.innerHTML = '<span class="status-dot"></span> Clinic Virtual Receptionist';
        }
      }
    }
    
    const cid = configService.clinicId || 'default_clinic';
    const handoffs = JSON.parse(localStorage.getItem(`handoffs_${cid}`) || '[]');
    const hand = handoffs.find(h => h.sessionId === sessId);
    if (!hand) return;
    
    // Inactivity auto-release check on patient side
    if (takeoverActive && hand.lastActivity) {
      const elapsed = Date.now() - hand.lastActivity;
      if (elapsed > 5 * 60 * 1000) {
        localStorage.removeItem('chat_takeover_active_' + sessId);
        hand.status = 'Staff Attended';
        localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
        
        // Push a bot alert in the message transcript
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const systemMsg = "Chat takeover session timed out due to inactivity. Virtual assistant is active again.";
        chatbot.chatHistory.push({ sender: 'bot', text: systemMsg, timestamp: timeStr });
        
        const messages = document.getElementById('chat-messages');
        if (messages) {
          const wrapper = document.createElement('div');
          wrapper.className = 'msg-wrapper bot';
          wrapper.innerHTML = `
            <div class="msg-bubble">🤖 Chat takeover session timed out due to inactivity. Virtual assistant is active again.</div>
            <div class="msg-time">${timeStr}</div>
          `;
          messages.appendChild(wrapper);
          this.scrollChatBottom();
        }
        
        this.syncToSheets('attendHandoff', { id: hand.id, status: 'Staff Attended' });
        this.renderDashboard();
        return;
      }
    }
    
    if (hand.transcript.length > chatbot.chatHistory.length) {
      const newMsgs = hand.transcript.slice(chatbot.chatHistory.length);
      newMsgs.forEach(msg => {
        chatbot.chatHistory.push(msg);
        
        if (msg.sender === 'staff') {
          const messages = document.getElementById('chat-messages');
          const wrapper = document.createElement('div');
          wrapper.className = 'msg-wrapper staff';
          wrapper.innerHTML = `
            <div class="msg-bubble">👨‍⚕️ <strong>[Staff]</strong>: ${msg.text}</div>
            <div class="msg-time">${msg.timestamp}</div>
          `;
          messages.appendChild(wrapper);
          this.scrollChatBottom();
          
          const ttsEnabled = localStorage.getItem('chat_tts_enabled') === 'true';
          if (ttsEnabled && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(msg.text);
            const langMap = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN' };
            utterance.lang = langMap[chatbot.lang] || 'en-US';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
          }
        } else if (msg.sender === 'bot') {
          this.addBotMessage(msg.text);
        }
      });
    }
  }

  // --- CRM ANALYTICS GRAPH GENERATION ---
  renderAnalytics() {
    const treatments = treatmentService.getTreatmentsList();
    const leads = this.getLeads();
    
    const treatmentCanvas = document.getElementById('chart-treatments');
    const leadsCanvas = document.getElementById('chart-leads');
    
    if (!treatmentCanvas || !leadsCanvas) return;
    
    // Bulletproof destruction of existing Chart.js instances on target canvases
    try {
      const existingTreatChart = Chart.getChart(treatmentCanvas);
      if (existingTreatChart) existingTreatChart.destroy();
    } catch(e) {}
    try {
      const existingLChart = Chart.getChart(leadsCanvas);
      if (existingLChart) existingLChart.destroy();
    } catch(e) {}
    
    this.treatmentChart = null;
    this.leadsChart = null;
    
    const activeTreatments = treatments.filter(t => t.active === true || t.active === 'true');
    const treatLabels = activeTreatments.map(t => t.name);
    const treatPrices = activeTreatments.map(t => Number(t.price));
    
    const categories = {
      'Emergency': 0,
      'Hot Lead': 0,
      'Warm Lead': 0,
      'Existing Patient': 0
    };
    leads.forEach(l => {
      const tag = l.leadTag || 'Warm Lead';
      if (categories[tag] !== undefined) {
        categories[tag]++;
      } else {
        categories['Warm Lead']++;
      }
    });
    
    const leadLabels = Object.keys(categories);
    const leadDataValues = Object.values(categories);
    
    try {
      this.treatmentChart = new Chart(treatmentCanvas, {
        type: 'bar',
        data: {
          labels: treatLabels,
          datasets: [{
            label: 'Starting Price',
            data: treatPrices,
            backgroundColor: 'rgba(13, 148, 136, 0.75)',
            borderColor: 'rgba(13, 148, 136, 1)',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
            y: { grid: { display: false } }
          }
        }
      });
      
      this.leadsChart = new Chart(leadsCanvas, {
        type: 'doughnut',
        data: {
          labels: leadLabels,
          datasets: [{
            data: leadDataValues,
            backgroundColor: [
              'rgba(239, 68, 68, 0.8)',
              'rgba(249, 115, 22, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(59, 130, 246, 0.8)'
            ],
            borderColor: 'var(--bg-card)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 15,
                color: 'var(--text-main)'
              }
            }
          }
        }
      });
    } catch(err) {
      console.error("Chart rendering failed:", err);
    }
  }

  // --- SPECIALISTS MANAGEMENT SYSTEM ---
  getSpecialists() {
    const cid = configService.clinicId || 'default_clinic';
    const saved = localStorage.getItem(`specialists_${cid}`);
    if (saved) {
      return JSON.parse(saved);
    }
    const defaults = [
      { id: 'spec_1', name: 'Dr. Rohan Kulkarni', specialty: 'MDS Implantologist', experience: '12 Years Experience', photo: '👨‍⚕️' },
      { id: 'spec_2', name: 'Dr. Shalini Mehta', specialty: 'MDS Orthodontist', experience: '10 Years Experience', photo: '👩‍⚕️' }
    ];
    localStorage.setItem(`specialists_${cid}`, JSON.stringify(defaults));
    return defaults;
  }

  saveSpecialists(specialists) {
    const cid = configService.clinicId || 'default_clinic';
    localStorage.setItem(`specialists_${cid}`, JSON.stringify(specialists));
  }

  renderSpecialists() {
    const tbody = document.getElementById('specialists-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const specialists = this.getSpecialists();
    
    if (specialists.length === 0) {
      const specEmpty = document.getElementById('specialists-empty');
      const specTable = document.getElementById('specialists-table');
      if (specEmpty) specEmpty.style.display = 'flex';
      if (specTable) specTable.style.display = 'none';
    } else {
      const specEmpty = document.getElementById('specialists-empty');
      const specTable = document.getElementById('specialists-table');
      if (specEmpty) specEmpty.style.display = 'none';
      if (specTable) specTable.style.display = 'table';
      
      specialists.forEach(s => {
        const tr = document.createElement('tr');
        const isUrl = s.photo && (s.photo.startsWith('http') || s.photo.startsWith('data:') || s.photo.startsWith('.'));
        const photoHtml = isUrl ? 
          `<img src="${s.photo}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` : 
          `<span style="font-size: 1.5rem;">${s.photo || '👨‍⚕️'}</span>`;
          
        tr.innerHTML = `
          <td>${photoHtml}</td>
          <td><strong>${s.name}</strong></td>
          <td><span class="badge badge-existing" style="background: var(--primary-light); color: var(--primary); border: none;">${s.specialty}</span></td>
          <td>${s.experience}</td>
          <td>
            <div class="action-btns">
              <button class="action-btn" title="Edit Specialist" onclick="app.openEditSpecialistModal('${s.id}')">✏️</button>
              <button class="action-btn delete" title="Delete Specialist" onclick="app.deleteSpecialist('${s.id}')">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  openEditSpecialistModal(id) {
    const specialists = this.getSpecialists();
    const s = specialists.find(item => String(item.id) === String(id));
    
    if (s) {
      document.getElementById('specialist-modal-title').innerText = '✏️ Edit Specialist';
      document.getElementById('edit-specialist-id').value = s.id;
      document.getElementById('edit-specialist-name').value = s.name;
      document.getElementById('edit-specialist-specialty').value = s.specialty;
      document.getElementById('edit-specialist-experience').value = s.experience;
      document.getElementById('edit-specialist-photo').value = s.photo || '👨‍⚕️';
    } else {
      document.getElementById('specialist-modal-title').innerText = '➕ Add New Specialist';
      document.getElementById('edit-specialist-id').value = '';
      document.getElementById('edit-specialist-name').value = '';
      document.getElementById('edit-specialist-specialty').value = '';
      document.getElementById('edit-specialist-experience').value = '';
      document.getElementById('edit-specialist-photo').value = '👨‍⚕️';
    }
    
    this.openModal('edit-specialist-modal');
  }

  saveSpecialist() {
    const id = document.getElementById('edit-specialist-id').value.trim();
    const name = document.getElementById('edit-specialist-name').value.trim();
    const specialty = document.getElementById('edit-specialist-specialty').value.trim();
    const experience = document.getElementById('edit-specialist-experience').value.trim();
    const photo = document.getElementById('edit-specialist-photo').value.trim();
    
    if (!name || !specialty || !experience) {
      this.showSystemAlert('Please fill out all required fields.', 'error');
      return;
    }
    
    const specialists = this.getSpecialists();
    const specialistData = { name, specialty, experience, photo };
    
    if (id) {
      const idx = specialists.findIndex(item => String(item.id) === String(id));
      if (idx !== -1) {
        specialistData.id = id;
        specialists[idx] = specialistData;
        this.showSystemAlert('Specialist updated successfully.', 'success');
      }
    } else {
      specialistData.id = 'spec_' + Date.now();
      specialists.push(specialistData);
      this.showSystemAlert('Specialist added successfully.', 'success');
    }
    
    this.saveSpecialists(specialists);
    this.closeModal('edit-specialist-modal');
    this.renderSpecialists();
    
    const activeConfig = configService.getCurrentConfig();
    const activeTreatments = treatmentService.getTreatmentsList();
    this.renderDynamicLandingPage(activeConfig, activeTreatments);
  }

  deleteSpecialist(id) {
    if (confirm("Are you sure you want to delete this specialist?")) {
      let specialists = this.getSpecialists();
      specialists = specialists.filter(item => String(item.id) !== String(id));
      this.saveSpecialists(specialists);
      this.showSystemAlert('Specialist deleted successfully.', 'info');
      this.renderSpecialists();
      
      const activeConfig = configService.getCurrentConfig();
      const activeTreatments = treatmentService.getTreatmentsList();
      this.renderDynamicLandingPage(activeConfig, activeTreatments);
    }
  }

  clearHandoff(id) {
    if (confirm("Delete this handoff record?")) {
      let handoffs = this.getHandoffs();
      handoffs = handoffs.filter(h => h.id !== id);
      this.saveHandoffs(handoffs);
      this.renderDashboard();
      this.syncToSheets('clearHandoff', { id: id });
    }
  }

  // Clipboard Copier
  copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      const oldText = btn.innerText;
      btn.innerText = '✔️ Copied!';
      btn.style.borderColor = 'var(--primary)';
      btn.style.color = 'var(--primary)';
      setTimeout(() => {
        btn.innerText = oldText;
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 1500);
    });
  }

  // --- FLOATING CHAT WIDGET UI MANAGEMENT ---
  initChatWidget() {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-input');
    const langSelect = document.getElementById('chat-language-select');

    // Toggle Chat visibility
    toggleBtn.addEventListener('click', () => {
      this.toggleChatWindow();
    });

    closeBtn.addEventListener('click', () => {
      this.toggleChatWindow(false);
    });

    // Send on click or enter
    sendBtn.addEventListener('click', () => {
      this.handleUserSend();
    });

    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleUserSend();
      }
    });

    // Language selector change
    langSelect.addEventListener('change', (e) => {
      chatbot.setLanguage(e.target.value);
      this.addSystemAlert(`Language set to ${e.target.options[e.target.selectedIndex].text}`);
      
      // Re-render greetings or default chips for active state
      if (chatbot.state === BOT_STATES.IDLE) {
        this.renderSuggestionChips(chatbot.defaultChips[chatbot.lang]);
      }
    });

    // --- SPEECH RECOGNITION (VOICE INPUT) ---
    const micBtn = document.getElementById('chat-mic-btn');
    let recognition = null;
    let isListening = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isListening = true;
        micBtn.style.background = '#ef4444'; // Red
        micBtn.style.color = '#ffffff';
        micBtn.innerHTML = '🛑';
        inputField.placeholder = 'Listening...';
        this.logSystemEvent('Speech Recognition', 'Voice recording session started.');
      };

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        inputField.value = transcript;
        this.logSystemEvent('Speech Recognition Success', `Captured text: "${transcript}"`);
      };

      recognition.onerror = (e) => {
        console.error('Speech recognition error:', e.error);
        this.logSystemEvent('Speech Recognition Error', e.error);
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      const stopListening = () => {
        isListening = false;
        micBtn.style.background = 'var(--bg-input)';
        micBtn.style.color = 'var(--text-main)';
        micBtn.innerHTML = '🎙️';
        inputField.placeholder = 'Type a message...';
      };

      micBtn.addEventListener('click', () => {
        if (isListening) {
          recognition.stop();
        } else {
          const langMap = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN' };
          recognition.lang = langMap[chatbot.lang] || 'en-US';
          recognition.start();
        }
      });
    } else {
      if (micBtn) micBtn.style.display = 'none';
    }

    // --- TEXT TO SPEECH (VOICE OUTPUT) ---
    const ttsToggle = document.getElementById('chat-tts-toggle');
    let ttsEnabled = localStorage.getItem('chat_tts_enabled') === 'true';
    
    const updateTtsUI = () => {
      if (ttsToggle) {
        if (ttsEnabled) {
          ttsToggle.innerHTML = '🔊';
          ttsToggle.title = 'Mute Voice Output';
        } else {
          ttsToggle.innerHTML = '🔇';
          ttsToggle.title = 'Unmute Voice Output';
        }
      }
    };
    updateTtsUI();

    if (ttsToggle) {
      ttsToggle.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        localStorage.setItem('chat_tts_enabled', ttsEnabled ? 'true' : 'false');
        updateTtsUI();
        if (!ttsEnabled) {
          window.speechSynthesis.cancel();
        }
        this.logSystemEvent('TTS Settings Toggle', `Voice Output set to: ${ttsEnabled ? 'ENABLED' : 'DISABLED'}`);
      });
    }

    // Initial greeting load
    this.addBotMessage(chatbot.initGreeting());
    this.renderSuggestionChips(chatbot.defaultChips[chatbot.lang]);
  }

  toggleChatWindow(forceState = null) {
    const win = document.getElementById('chat-window');
    const dot = document.getElementById('chat-alert-dot');
    
    const isOpen = win.classList.contains('open');
    const shouldOpen = forceState !== null ? forceState : !isOpen;

    if (shouldOpen) {
      win.classList.add('open');
      dot.style.display = 'none'; // hide alert once chat is read
      // auto focus
      setTimeout(() => document.getElementById('chat-input').focus(), 150);

      // Trigger greeting voice readout if enabled and it hasn't been spoken yet
      if (!this.greetingSpoken) {
        this.greetingSpoken = true;
        const ttsEnabled = localStorage.getItem('chat_tts_enabled') === 'true';
        if (ttsEnabled && window.speechSynthesis) {
          const greetingText = chatbot.initGreeting();
          const cleanText = greetingText
            .replace(/\[\s*TRIGGER_.*?\]/gi, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/🚨|📅|🦷|✨|💎|🩸|🪥|📍/g, '');
            
          const utterance = new SpeechSynthesisUtterance(cleanText);
          const langMap = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN' };
          utterance.lang = langMap[chatbot.lang] || 'en-US';
          
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
      }
    } else {
      win.classList.remove('open');
    }
  }

  // Open chatbot directly from external links (like "Book appointment" button)
  openChatWidget(startBooking = false, forceTreatment = null) {
    this.toggleChatWindow(true);
    
    if (forceTreatment) {
      this.addBotMessage(`You clicked on **${forceTreatment}**! Starting details view...`);
      setTimeout(() => {
        this.handleChatbotLogic(forceTreatment);
      }, 500);
    } else if (startBooking) {
      // Start booking flow immediately
      chatbot.state = BOT_STATES.BOOK_NAME;
      this.addBotMessage(chatbot.t('askName'));
      this.renderSuggestionChips([]);
    }
  }

  renderSuggestionChips(chipsList) {
    const container = document.getElementById('suggestion-chips');
    container.innerHTML = '';
    
    if (!chipsList || chipsList.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'flex';
    chipsList.forEach(chipText => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.innerText = chipText;
      btn.addEventListener('click', () => {
        // Strip emoji icons from suggestion text if needed, but usually sending full text is cleaner
        this.handleChatbotLogic(chipText);
      });
      container.appendChild(btn);
    });
  }

  addBotMessage(text, hasCRM = null) {
    const messages = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapMessageContent(wrapper, 'bot', text, chatbot.formatTime());

    // Trigger TTS if enabled and chat window is open
    const win = document.getElementById('chat-window');
    const isChatOpen = win && win.classList.contains('open');
    const ttsEnabled = localStorage.getItem('chat_tts_enabled') === 'true';
    if (isChatOpen && ttsEnabled && window.speechSynthesis) {
      // Strip markdown tags and router command tags before reading
      const cleanText = text
        .replace(/\[\s*TRIGGER_.*?\]/gi, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/🚨|📅|🦷|✨|💎|🩸|🪥|📍/g, '');
        
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const langMap = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN' };
      utterance.lang = langMap[chatbot.lang] || 'en-US';
      
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    // Inject CRM box if present
    if (hasCRM) {
      const crmBox = document.createElement('div');
      crmBox.className = 'crm-card';
      crmBox.innerText = hasCRM;
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-outline';
      copyBtn.style.padding = '0.3rem 0.5rem';
      copyBtn.style.fontSize = '0.75rem';
      copyBtn.style.marginTop = '0.5rem';
      copyBtn.innerText = '📋 Copy WhatsApp Card';
      copyBtn.addEventListener('click', () => this.copyToClipboard(copyBtn, hasCRM));
      
      crmBox.appendChild(copyBtn);
      wrapper.appendChild(crmBox);
    }

    messages.appendChild(wrapper);
    this.scrollChatBottom();
  }

  addUserMessage(text) {
    const messages = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapMessageContent(wrapper, 'user', text, chatbot.formatTime());
    messages.appendChild(wrapper);
    this.scrollChatBottom();
  }

  // System alert banner in chat
  addSystemAlert(text, type = 'info') {
    const messages = document.getElementById('chat-messages');
    const banner = document.createElement('div');
    banner.className = `chat-system-alert ${type === 'success' ? 'success' : ''}`;
    banner.innerText = text;
    messages.appendChild(banner);
    this.scrollChatBottom();
  }

  scrollChatBottom() {
    const messages = document.getElementById('chat-messages');
    messages.scrollTop = messages.scrollHeight;
  }

  // Simulate typing indicator
  showTypingIndicator() {
    const messages = document.getElementById('chat-messages');
    const indicator = document.createElement('div');
    indicator.className = 'msg-wrapper bot typing-indicator-item';
    indicator.innerHTML = `
      <div class="msg-bubble" style="padding:0.5rem 1rem; color:var(--text-muted); display:flex; gap:3px; align-items:center;">
        <span style="animation:pulse-ring 1s infinite;">•</span>
        <span style="animation:pulse-ring 1s infinite 0.2s;">•</span>
        <span style="animation:pulse-ring 1s infinite 0.4s;">•</span>
      </div>
    `;
    messages.appendChild(indicator);
    this.scrollChatBottom();
  }

  removeTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator-item');
    if (indicator) indicator.remove();
  }

  handleUserSend() {
    const inputField = document.getElementById('chat-input');
    const text = inputField.value.trim();
    if (!text) return;
    
    inputField.value = '';
    this.handleChatbotLogic(text);
  }

  async handleChatbotLogic(textInput) {
    // Strip decorative emojis from suggestion chips to get clean command text
    const cleanText = textInput.replace(/^[📅🚨🦷💬❓❌✔️]\s*/, '');
    
    this.addUserMessage(cleanText);
    
    const cid = configService.clinicId || 'default_clinic';
    const takeoverActive = localStorage.getItem('chat_takeover_active_' + chatbot.activeSessionId) === 'true';
    
    if (takeoverActive) {
      this.logSystemEvent('Handoff Takeover Inbound', `Live user message routed directly to staff panel: "${cleanText}"`);
      chatbot.chatHistory.push({ sender: 'user', text: cleanText, timestamp: chatbot.formatTime() });
      
      const handoffs = JSON.parse(localStorage.getItem(`handoffs_${cid}`) || '[]');
      const handIndex = handoffs.findIndex(h => h.sessionId === chatbot.activeSessionId);
      if (handIndex !== -1) {
        handoffs[handIndex].transcript = chatbot.chatHistory;
        handoffs[handIndex].status = 'Staff Takeover';
        localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
        chatbot.dispatchEvent('dataChanged');
        chatbot.syncToGoogleSheets('addHandoff', handoffs[handIndex]);
      }
      return;
    }

    this.showTypingIndicator();
    this.logSystemEvent('Chatbot Inbound', `User query: "${cleanText}"`);
    
    // Simulate bot network delay
    setTimeout(async () => {
      this.removeTypingIndicator();
      
      const res = await chatbot.processUserMessage(cleanText);
      const isGemini = localStorage.getItem('gemini_ai_enabled') === 'true' && decryptObfuscate(localStorage.getItem('gemini_api_key'));
      const engine = isGemini ? 'Gemini AI Brain (NLP)' : 'Keyword Rule Router';
      this.logSystemEvent('Chatbot Outbound', `Reply generated using ${engine}`, { reply: res.reply });
      
      if (res.alert) {
        this.addSystemAlert('System escalated to Medical Staff.', 'error');
        // trigger orange blinking alert dot on chat button
        document.getElementById('chat-alert-dot').style.display = 'block';
        this.logSystemEvent('Handoff Escalation', `Staff notification triggered for session: ${res.reason || 'Medical triage limit reached'}`);
      }

      if (res.reply) {
        this.addBotMessage(res.reply, res.crmCard);
      }
      this.renderSuggestionChips(res.chips);
    }, 450);
  }

  // System toast notification banner
  showSystemAlert(msg, type = 'success') {
    // Create floating HTML toast
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.left = '24px';
    toast.style.padding = '0.75rem 1.5rem';
    toast.style.background = type === 'success' ? 'var(--color-new)' : 'var(--color-emergency)';
    toast.style.color = 'white';
    toast.style.borderRadius = 'var(--radius-md)';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.zIndex = '2000';
    toast.style.fontWeight = '600';
    toast.style.fontSize = '0.9rem';
    toast.style.animation = 'slideIn 0.3s ease';
    toast.innerText = msg;
    
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s ease';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  initDiagnosticsConsole() {
    // Register global runtime error and promise rejection listeners to auto-capture JS failures with recursion guard
    let isLoggingError = false;

    window.addEventListener('error', (event) => {
      if (isLoggingError) return;
      isLoggingError = true;
      try {
        const errorMsg = event.error ? event.error.message || event.message : event.message;
        const stack = event.error ? event.error.stack : '';
        this.logSystemEvent('Uncaught Exception', errorMsg, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: stack || 'No stack trace available'
        });
      } catch (err) {
        console.error('Error in global error logger:', err);
      } finally {
        isLoggingError = false;
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      if (isLoggingError) return;
      isLoggingError = true;
      try {
        const reason = event.reason;
        let errorMsg = 'Unhandled Promise Rejection';
        let stack = '';
        if (reason instanceof Error) {
          errorMsg = reason.message;
          stack = reason.stack;
        } else if (reason) {
          try {
            errorMsg = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
          } catch (e) {
            errorMsg = String(reason);
          }
        }
        this.logSystemEvent('Unhandled Rejection', errorMsg, {
          stack: stack || 'No stack trace available'
        });
      } catch (err) {
        console.error('Error in global rejection logger:', err);
      } finally {
        isLoggingError = false;
      }
    });

    // 1. Register Diagnostics Toggle Button Click
    const diagToggleBtn = document.getElementById('diagnostics-toggle-btn');
    if (diagToggleBtn) {
      diagToggleBtn.addEventListener('click', () => {
        this.openModal('system-diagnostics-modal');
        this.updateDiagnosticsConfigStatus();
      });
    }

    // 2. Register Clipboard Copy Button Click
    const diagCopyBtn = document.getElementById('diag-btn-copy');
    if (diagCopyBtn) {
      diagCopyBtn.addEventListener('click', () => {
        const rawLogs = sessionStorage.getItem('system_diagnostics_logs_raw') || '';
        if (rawLogs.trim() === '') {
          this.showSystemAlert('No logs to copy yet.', 'info');
          return;
        }
        navigator.clipboard.writeText(rawLogs).then(() => {
          this.showSystemAlert('Diagnostics logs copied to clipboard!', 'success');
        }).catch(err => {
          console.error('Failed to copy logs:', err);
          this.showSystemAlert('Failed to copy logs to clipboard.', 'error');
        });
      });
    }

    // 3. Register Connection Test Button Click
    const diagTestBtn = document.getElementById('diag-btn-test');
    if (diagTestBtn) {
      diagTestBtn.addEventListener('click', () => {
        const url = localStorage.getItem('google_sheets_url');
        this.testSheetsConnection(url);
        this.testSheetsPostConnection(url);
      });
    }

    // 4. Register Clear Logs Button Click
    const diagClearBtn = document.getElementById('diag-btn-clear');
    if (diagClearBtn) {
      diagClearBtn.addEventListener('click', () => {
        this.clearSystemLogs();
      });
    }

    // 5. Render existing logs on startup
    this.renderLogs();

    // 6. Bind log filter buttons click events
    const filterContainer = document.getElementById('log-filters-container');
    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        filterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active-filter'));
        btn.classList.add('active-filter');
        
        this.renderLogs();
      });
    }

    // 7. Bind search query input listener
    const logSearchInput = document.getElementById('log-search-input');
    if (logSearchInput) {
      logSearchInput.addEventListener('input', () => {
        this.renderLogs();
      });
    }

    // 8. Bind export JSON button click listener
    const logExportBtn = document.getElementById('btn-export-logs');
    if (logExportBtn) {
      logExportBtn.addEventListener('click', () => {
        this.exportLogsJson();
      });
    }

    this.updateDiagnosticsConfigStatus();
  }

  updateDiagnosticsConfigStatus() {
    const sheetsStatus = document.getElementById('diag-status-sheets');
    const emailStatus = document.getElementById('diag-status-email');
    const calendarStatus = document.getElementById('diag-status-calendar');
    const aiStatus = document.getElementById('diag-status-ai');

    // Google Sheets URL
    const sheetsUrl = localStorage.getItem('google_sheets_url');
    if (sheetsStatus) {
      if (sheetsUrl) {
        sheetsStatus.innerText = 'Connected (Web App Active)';
        sheetsStatus.style.color = 'var(--primary)';
      } else {
        sheetsStatus.innerText = '⚠️ Disconnected (Local Storage)';
        sheetsStatus.style.color = 'var(--color-emergency)';
      }
    }

    // Receptionist Email
    const email = localStorage.getItem('receptionist_email');
    if (emailStatus) {
      if (email) {
        emailStatus.innerText = email;
        emailStatus.style.color = 'var(--primary)';
      } else {
        emailStatus.innerText = '⚠️ Not Configured (No Alerts)';
        emailStatus.style.color = 'var(--color-emergency)';
      }
    }

    // Calendar ID
    const calId = localStorage.getItem('google_calendar_id');
    if (calendarStatus) {
      if (calId) {
        calendarStatus.innerText = calId;
        calendarStatus.style.color = 'var(--primary)';
      } else {
        calendarStatus.innerText = '⚠️ Not Configured (Default Cal)';
        calendarStatus.style.color = 'var(--color-emergency)';
      }
    }

    // Gemini AI Brain
    const aiEnabled = localStorage.getItem('gemini_ai_enabled') === 'true';
    const apiKey = decryptObfuscate(localStorage.getItem('gemini_api_key'));
    if (aiStatus) {
      if (aiEnabled && apiKey) {
        aiStatus.innerText = 'Active (Gemini 2.5 Flash)';
        aiStatus.style.color = 'var(--primary)';
      } else {
        aiStatus.innerText = '⚠️ Inactive (Keyword Matching)';
        aiStatus.style.color = 'var(--accent-gold)';
      }
    }
  }

  clearSystemLogs() {
    this.logsArray = [];
    sessionStorage.removeItem('system_diagnostics_logs_raw');
    sessionStorage.removeItem('system_diagnostics_logs_html');
    sessionStorage.removeItem('system_diagnostics_logs_json');
    
    this.renderLogs();
    this.showSystemAlert('System logs cleared.', 'info');
  }

  logSystemEvent(type, message, details = null) {
    if (this._isLoggingEvent) {
      console.warn(`[RECURSION BLOCKED] [${type}] ${message}`, details);
      return;
    }
    this._isLoggingEvent = true;

    try {
      const timestamp = new Date().toLocaleTimeString();
      const typeStr = String(type || 'SYSTEM');
      const typeUpper = typeStr.toUpperCase();

      // Determine severity and color codes
      let severity = 'info'; // 'info', 'success', 'warning', 'error', 'system'
      if (typeUpper.includes('FAIL') || typeUpper.includes('ERROR') || typeUpper.includes('CRASH') || typeUpper.includes('UNCAUGHT') || typeUpper.includes('EXCEPTION') || typeUpper.includes('REJECTION')) {
        severity = 'error';
      } else if (typeUpper.includes('SUCCESS')) {
        severity = 'success';
      } else if (typeUpper.includes('WARN')) {
        severity = 'warning';
      } else if (typeUpper.includes('SYSTEM')) {
        severity = 'system';
      }

      // Create log entry object
      const logEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        timestamp: timestamp,
        dateTime: new Date().toISOString(),
        type: typeUpper,
        message: message,
        details: details,
        severity: severity
      };

      // Add to logsArray memory cache
      this.logsArray.push(logEntry);

      // Enforce 500 records cap
      if (this.logsArray.length > 500) {
        this.logsArray.shift();
      }

      // Sync to sessionStorage
      try {
        sessionStorage.setItem('system_diagnostics_logs_json', JSON.stringify(this.logsArray));
      } catch (err) {
        console.warn('Storage logs quota exceeded, trimming database...', err);
        this.logsArray = this.logsArray.slice(-250);
        sessionStorage.setItem('system_diagnostics_logs_json', JSON.stringify(this.logsArray));
      }

      // Append raw text log to system_diagnostics_logs_raw (for clipboard copy)
      let rawMsg = `\n\n[${timestamp}] [${typeUpper}] ${message}`;
      if (details) {
        if (typeof details === 'object') {
          try {
            rawMsg += `\nPayload: ${JSON.stringify(details, null, 2)}`;
          } catch (e) {
            rawMsg += `\nPayload: ${String(details)}`;
          }
        } else {
          rawMsg += `\nDetails: ${details}`;
        }
      }
      try {
        let currentRaw = sessionStorage.getItem('system_diagnostics_logs_raw') || '';
        currentRaw += rawMsg;
        if (currentRaw.length > 200000) currentRaw = currentRaw.substring(currentRaw.length - 120000);
        sessionStorage.setItem('system_diagnostics_logs_raw', currentRaw);
      } catch (err) {
        console.warn('Storage raw logs quota exceeded:', err);
      }

      // Render the log entry to the UI in real-time
      this.appendLogEntryToUI(logEntry);
      this.updateLogStats();

      // Output to standard developer console
      if (severity === 'error') {
        console.warn(`[LOGGED ERROR] [${typeUpper}] ${message}`, details || '');
      } else {
        console.info(`[LOGGED INFO] [${typeUpper}] ${message}`, details || '');
      }
    } catch (e) {
      console.error('Crash in logSystemEvent body:', e);
    } finally {
      this._isLoggingEvent = false;
    }
  }

  appendLogEntryToUI(log) {
    const consoleEl = document.getElementById('system-logs-console');
    const diagConsoleEl = document.getElementById('diag-logs-console');
    
    // Check if it passes active filter and search text
    const activeFilter = this.getActiveLogFilter();
    const searchQuery = this.getLogSearchQuery();
    
    if (!this.matchesLogFilters(log, activeFilter, searchQuery)) {
      return;
    }

    const appendToEl = (el) => {
      if (!el) return;
      
      const rawContent = el.innerHTML;
      if (rawContent.includes('Diagnostics logs console initialized') || rawContent.includes('Diagnostics log active. Perform chat bookings')) {
        el.innerHTML = '';
      }

      const dom = this.createLogItemDom(log);
      el.appendChild(dom);

      const autoscrollChk = document.getElementById('log-autoscroll-chk');
      if (!autoscrollChk || autoscrollChk.checked) {
        el.scrollTop = el.scrollHeight;
      }
    };

    appendToEl(consoleEl);
    appendToEl(diagConsoleEl);
  }

  createLogItemDom(log) {
    const div = document.createElement('div');
    div.className = 'log-item';
    div.id = log.id;

    // Severity specific tag colors
    let color = '#38bdf8'; // Default cyan
    let bg = 'rgba(56, 189, 248, 0.15)';
    let border = 'rgba(56, 189, 248, 0.3)';

    if (log.severity === 'error') {
      color = '#ef4444'; // Red
      bg = 'rgba(239, 68, 68, 0.15)';
      border = 'rgba(239, 68, 68, 0.3)';
    } else if (log.severity === 'success') {
      color = '#10b981'; // Green
      bg = 'rgba(16, 185, 129, 0.15)';
      border = 'rgba(16, 185, 129, 0.3)';
    } else if (log.severity === 'warning') {
      color = '#f59e0b'; // Amber
      bg = 'rgba(245, 158, 11, 0.15)';
      border = 'rgba(245, 158, 11, 0.3)';
    } else if (log.severity === 'system') {
      color = '#e2e8f0'; // Grayish white
      bg = 'rgba(226, 232, 240, 0.1)';
      border = 'rgba(226, 232, 240, 0.2)';
    }

    const hasDetails = log.details !== null && log.details !== undefined && String(log.details).trim() !== '' && (typeof log.details !== 'object' || Object.keys(log.details).length > 0);
    
    let arrowHtml = '';
    let detailsHtml = '';
    let cursorStyle = 'style="cursor: default;"';

    if (hasDetails) {
      cursorStyle = 'style="cursor: pointer;"';
      arrowHtml = `<span class="log-arrow" style="transition: transform 0.2s ease; color: #64748b; flex-shrink: 0; margin-left: 0.5rem;">▶</span>`;
      
      let detailsText = '';
      if (typeof log.details === 'object') {
        try {
          detailsText = JSON.stringify(log.details, null, 2);
        } catch (e) {
          detailsText = String(log.details);
        }
      } else {
        detailsText = String(log.details);
      }
      
      detailsText = String(detailsText || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
      detailsHtml = `<div class="log-details" style="display: none; padding: 1rem; background: #020617; border-top: 1px solid rgba(255, 255, 255, 0.05); white-space: pre-wrap; color: #38bdf8; font-size: 0.75rem; max-height: 400px; overflow-y: auto; font-family: monospace;">${detailsText}</div>`;
    }

    const safeMessage = String(log.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    div.innerHTML = `
      <div class="log-header" ${cursorStyle} style="padding: 0.6rem 1rem; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; background: rgba(30, 41, 59, 0.8);">
        <div class="log-title-area" style="display: flex; align-items: center; gap: 0.75rem; flex: 1; overflow: hidden;">
          <span class="log-tag" style="background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; text-transform: uppercase; font-weight: bold; flex-shrink: 0;">${log.type}</span>
          <span class="log-msg" style="flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${safeMessage}</span>
        </div>
        <span class="log-time" style="color: #64748b; font-size: 0.75rem; flex-shrink: 0; margin-left: 0.75rem;">${log.timestamp}</span>
        ${arrowHtml}
      </div>
      ${detailsHtml}
    `;

    if (hasDetails) {
      const header = div.querySelector('.log-header');
      const detailsDiv = div.querySelector('.log-details');
      const arrow = div.querySelector('.log-arrow');
      header.addEventListener('click', () => {
        const isOpen = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isOpen ? 'none' : 'block';
        if (arrow) {
          arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
        }
        div.classList.toggle('open', !isOpen);
      });
    }

    return div;
  }

  getActiveLogFilter() {
    const activeBtn = document.querySelector('#log-filters-container button.active-filter');
    return activeBtn ? activeBtn.dataset.filter : 'all';
  }

  getLogSearchQuery() {
    const input = document.getElementById('log-search-input');
    return input ? input.value.toLowerCase().trim() : '';
  }

  matchesLogFilters(log, filter, query) {
    if (filter !== 'all') {
      const typeUpper = log.type.toUpperCase();
      if (filter === 'error' && log.severity !== 'error') return false;
      if (filter === 'gemini' && !typeUpper.includes('GEMINI') && !typeUpper.includes('AI') && !typeUpper.includes('NLP')) return false;
      if (filter === 'sheets' && !typeUpper.includes('SHEETS')) return false;
      if (filter === 'telephony' && !typeUpper.includes('TELEPHONY') && !typeUpper.includes('CALL') && !typeUpper.includes('VOICE') && !typeUpper.includes('VOICEMAIL')) return false;
      if (filter === 'network' && !typeUpper.includes('POST') && !typeUpper.includes('PULL') && !typeUpper.includes('REQUEST') && !typeUpper.includes('FETCH') && !typeUpper.includes('NETWORK')) return false;
      if (filter === 'console' && !typeUpper.includes('CONSOLE')) return false;
    }

    if (query) {
      const msg = String(log.message || '').toLowerCase();
      const type = String(log.type || '').toLowerCase();
      let detailsStr = '';
      if (log.details) {
        detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details).toLowerCase() : String(log.details).toLowerCase();
      }
      return msg.includes(query) || type.includes(query) || detailsStr.includes(query);
    }

    return true;
  }

  renderLogs() {
    const consoleEl = document.getElementById('system-logs-console');
    const diagConsoleEl = document.getElementById('diag-logs-console');
    if (!consoleEl && !diagConsoleEl) return;
    
    const filter = this.getActiveLogFilter();
    const query = this.getLogSearchQuery();

    const renderToEl = (el) => {
      if (!el) return;
      el.innerHTML = '';
      
      const filtered = this.logsArray.filter(log => this.matchesLogFilters(log, filter, query));
      
      if (filtered.length === 0) {
        el.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 2rem; font-family: monospace;">No matching system logs found.</div>`;
        return;
      }

      filtered.forEach(log => {
        try {
          const dom = this.createLogItemDom(log);
          el.appendChild(dom);
        } catch (err) {
          console.error('[DIAGNOSTIC] Failed to render log item:', log, err);
          const errDom = document.createElement('div');
          errDom.className = 'log-item';
          errDom.style.color = '#ef4444';
          errDom.style.padding = '0.5rem 1rem';
          errDom.style.border = '1px dashed #ef4444';
          errDom.style.margin = '0.25rem 0';
          errDom.style.borderRadius = '4px';
          errDom.style.fontFamily = 'monospace';
          errDom.style.fontSize = '0.75rem';
          errDom.innerText = `[Render Error] ${err.message} (Type: ${log.type || 'UNKNOWN'}, Message: ${log.message || 'none'})`;
          el.appendChild(errDom);
        }
      });

      el.scrollTop = el.scrollHeight;
    };

    renderToEl(consoleEl);
    renderToEl(diagConsoleEl);
    this.updateLogStats();
  }

  updateLogStats() {
    const totalEl = document.getElementById('log-stat-total');
    const errorsEl = document.getElementById('log-stat-errors');
    const warningsEl = document.getElementById('log-stat-warnings');
    const aiEl = document.getElementById('log-stat-ai');
    const syncsEl = document.getElementById('log-stat-syncs');

    if (!totalEl) return;

    totalEl.innerText = this.logsArray.length;
    errorsEl.innerText = this.logsArray.filter(l => l.severity === 'error').length;
    warningsEl.innerText = this.logsArray.filter(l => l.severity === 'warning').length;
    
    aiEl.innerText = this.logsArray.filter(l => {
      const t = l.type.toUpperCase();
      return t.includes('GEMINI') || t.includes('AI') || t.includes('NLP');
    }).length;

    syncsEl.innerText = this.logsArray.filter(l => {
      const t = l.type.toUpperCase();
      return t.includes('SHEETS');
    }).length;
  }

  exportLogsJson() {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.logsArray, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `dentist_ai_diagnostics_logs_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showSystemAlert('Logs exported successfully!', 'success');
    } catch (e) {
      console.error('Failed to export logs:', e);
      this.showSystemAlert('Export failed.', 'error');
    }
  }

  setupConsoleInterceptor() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      if (this._isLoggingEvent) return;
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      if (msg.includes('[LOGGED')) return;
      this.logSystemEvent('CONSOLE LOG', msg);
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      if (this._isLoggingEvent) return;
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      if (msg.includes('[LOGGED')) return;
      this.logSystemEvent('CONSOLE WARN', msg);
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      if (this._isLoggingEvent) return;
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      if (msg.includes('[LOGGED')) return;
      this.logSystemEvent('CONSOLE ERROR', msg);
    };
  }

  setupNetworkInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      if (this._isLoggingEvent) {
        return originalFetch(...args);
      }

      const url = args[0];
      const options = args[1] || {};
      const method = options.method || 'GET';
      const start = Date.now();

      let reqPayload = null;
      if (options.body) {
        try {
          reqPayload = JSON.parse(options.body);
        } catch (e) {
          reqPayload = options.body;
        }
      }

      this.logSystemEvent(`NETWORK ${method} REQUEST`, `Fetch dispatched to ${url}`, {
        url: url,
        method: method,
        headers: options.headers || null,
        payload: reqPayload
      });

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - start;
        const clonedResponse = response.clone();
        
        let resPayload = 'Binary / Non-text Content';
        const contentType = clonedResponse.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/') || contentType.includes('javascript')) {
          try {
            resPayload = await clonedResponse.json();
          } catch (e) {
            try {
              resPayload = await clonedResponse.text();
            } catch (e2) {
              resPayload = 'Error reading response body';
            }
          }
        }

        this.logSystemEvent(`NETWORK RESPONSE [${response.status}]`, `Received response from ${url} in ${duration}ms`, {
          url: url,
          status: response.status,
          statusText: response.statusText,
          durationMs: duration,
          payload: resPayload
        });

        return response;
      } catch (error) {
        const duration = Date.now() - start;
        this.logSystemEvent(`NETWORK RESPONSE FAILURE`, `Request to ${url} failed after ${duration}ms`, {
          url: url,
          durationMs: duration,
          error: error.message || String(error)
        });
        throw error;
      }
    };
  }

  // --- SaaS PARTITIONED CACHE GETTERS & SETTERS ---
  getAppointments() {
    const cid = configService.clinicId || 'default_clinic';
    return JSON.parse(localStorage.getItem(`appointments_${cid}`) || localStorage.getItem('appointments') || '[]');
  }
  
  saveAppointments(apps) {
    const cid = configService.clinicId || 'default_clinic';
    localStorage.setItem(`appointments_${cid}`, JSON.stringify(apps));
  }

  getLeads() {
    const cid = configService.clinicId || 'default_clinic';
    return JSON.parse(localStorage.getItem(`leads_${cid}`) || localStorage.getItem('leads') || '[]');
  }
  
  saveLeads(leads) {
    const cid = configService.clinicId || 'default_clinic';
    localStorage.setItem(`leads_${cid}`, JSON.stringify(leads));
  }

  getHandoffs() {
    const cid = configService.clinicId || 'default_clinic';
    return JSON.parse(localStorage.getItem(`handoffs_${cid}`) || localStorage.getItem('handoffs') || '[]');
  }
  
  saveHandoffs(handoffs) {
    const cid = configService.clinicId || 'default_clinic';
    localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
  }

  // --- SaaS DYNAMIC INITIALIZATION ---
  async initSaaS() {
    this.updateSyncBadge('connecting');
    const sheetsUrl = localStorage.getItem('google_sheets_url');
    
    try {
      const config = await configService.loadConfig(sheetsUrl);
      this.logSystemEvent('SaaS Config Loaded', `Loaded settings for clinic "${config.clinicName}" (${config.clinicId})`, config);
      
      const treatments = await treatmentService.loadTreatments(sheetsUrl, config.clinicId);
      this.logSystemEvent('SaaS Treatments Loaded', `Loaded ${treatments.length} treatments for ${config.clinicName}`);
      
      this.renderDynamicLandingPage(config, treatments);
      


      settingsManager.bindClinicSettingsForm(config);
      this.bindSaaSEvents();
      
      if (sheetsUrl) {
        await this.pullDataFromSheets();
      } else {
        this.updateSyncBadge('disconnected');
        this.renderDashboard();
      }
    } catch(err) {
      this.logSystemEvent('SaaS Init Error', err.toString());
      this.updateSyncBadge('disconnected');
      this.renderDashboard();
    } finally {
      // Hide full-screen loader after configs have been loaded and UI updated
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 400);
      }
    }
  }

  renderDynamicLandingPage(config, treatments) {
    if (!config) return;
    
    this.logSystemEvent('UI Render', `Injected brand styling and content for clinic "${config.clinicName}"`);
    document.title = `${config.clinicName} & DentalAI Assistant`;
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = `${config.clinicName} offers premium, state-of-the-art dental treatments. Book appointments, ask questions, or triage dental emergencies instantly with DentalAI.`;
    }

    document.querySelectorAll('.config-clinicName').forEach(el => el.textContent = config.clinicName);
    document.querySelectorAll('.config-tagline').forEach(el => el.textContent = config.tagline);
    document.querySelectorAll('.config-clinicDescription').forEach(el => el.textContent = config.clinicDescription);
    document.querySelectorAll('.config-workingHours').forEach(el => el.textContent = config.workingHours);
    document.querySelectorAll('.config-emergencyPhone').forEach(el => {
      el.textContent = config.emergencyPhone;
      el.href = `tel:${config.emergencyPhone}`;
    });
    document.querySelectorAll('.config-phone').forEach(el => {
      el.textContent = config.phone;
      if (el.tagName === 'A') el.href = `tel:${config.phone}`;
    });
    document.querySelectorAll('.config-email').forEach(el => {
      el.textContent = config.email;
      if (el.tagName === 'A') el.href = `mailto:${config.email}`;
    });
    document.querySelectorAll('.config-address').forEach(el => {
      el.innerHTML = `📍 ${config.address}`;
    });
    document.querySelectorAll('.config-bookingInstructions').forEach(el => {
      el.textContent = config.bookingInstructions;
    });
    document.querySelectorAll('.config-logoURL').forEach(el => {
      el.textContent = config.logoURL || '🦷';
    });

    const grid = document.getElementById('services-grid');
    if (grid && treatments) {
      const activeTreatments = treatments.filter(t => t.active === true || t.active === 'true');
      if (activeTreatments.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No services available at this time.</div>';
      } else {
        grid.innerHTML = activeTreatments.map(t => {
          const isFeatured = t.featured === true || t.featured === 'true';
          const symbol = t.category === 'Cosmetic' ? '✨' : 
                         t.category === 'Orthodontics' ? '💎' : 
                         t.category === 'Surgery' ? '🩸' : 
                         t.category === 'Implants' ? '🦷' : '🪥';
          
          return `
            <div class="service-card ${isFeatured ? 'premium' : ''}" data-treatment="${t.name}">
              <div class="service-icon">${symbol}</div>
              <h3 class="service-name">${t.name}</h3>
              <p class="service-desc">${t.description}</p>
              <div class="service-price">${formatCurrency(t.price, config.currency || '₹')} <span class="price-tag">onwards</span></div>
            </div>
          `;
        }).join('');
      }
    }

    // Render Gallery
    const galleryGrid = document.getElementById('gallery-grid');
    if (galleryGrid) {
      const galleryStr = config.galleryImages || '';
      const galleryUrls = galleryStr.split(',').map(url => url.trim()).filter(url => url.length > 0);
      if (galleryUrls.length === 0) {
        galleryGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No showcase photos available at this time.</div>';
      } else {
        galleryGrid.innerHTML = galleryUrls.map(url => `
          <div class="gallery-item">
            <img src="${url}" class="gallery-img" alt="Clinic Showcase Image">
          </div>
        `).join('');
      }
    }

    // Render Specialists
    const specGrid = document.getElementById('specialists-grid');
    if (specGrid) {
      const specialists = this.getSpecialists();
      if (specialists.length === 0) {
        specGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No specialists listed at this time.</div>';
      } else {
        specGrid.innerHTML = specialists.map(s => {
          const isUrl = s.photo && (s.photo.startsWith('http') || s.photo.startsWith('data:') || s.photo.startsWith('.'));
          const photoHtml = isUrl ? 
            `<img src="${s.photo}" class="specialist-photo" alt="${s.name}">` : 
            `<div class="specialist-photo">${s.photo || '👨‍⚕️'}</div>`;
            
          return `
            <div class="specialist-card">
              ${photoHtml}
              <h3 class="specialist-name">${s.name}</h3>
              <span class="specialist-specialty">${s.specialty}</span>
              <p class="specialist-experience">${s.experience}</p>
              <button class="btn btn-outline" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; margin-top: 0.5rem;" onclick="app.openChatWidget(true)">Book Consult</button>
            </div>
          `;
        }).join('');
      }
    }

    // Render Open/Closed Live Status Badge
    const liveStatusBadge = document.getElementById('live-status-badge');
    if (liveStatusBadge) {
      const status = this.checkClinicOpenStatus(config);
      liveStatusBadge.innerHTML = `<span class="badge" style="background: ${status.isOpen ? 'var(--primary-light)' : 'var(--color-emergency-bg)'}; color: ${status.isOpen ? 'var(--primary)' : 'var(--color-emergency)'}; border: 1px solid ${status.isOpen ? 'var(--primary)' : 'var(--color-emergency)'}; font-size: 0.8rem; font-weight: 700; padding: 0.25rem 0.6rem;">${status.text}</span>`;
    }

    // Set interval to update status badge every minute if not already active
    if (!this.statusInterval) {
      this.statusInterval = setInterval(() => {
        const currentConfig = configService.getCurrentConfig();
        const badge = document.getElementById('live-status-badge');
        if (badge && currentConfig) {
          const status = this.checkClinicOpenStatus(currentConfig);
          badge.innerHTML = `<span class="badge" style="background: ${status.isOpen ? 'var(--primary-light)' : 'var(--color-emergency-bg)'}; color: ${status.isOpen ? 'var(--primary)' : 'var(--color-emergency)'}; border: 1px solid ${status.isOpen ? 'var(--primary)' : 'var(--color-emergency)'}; font-size: 0.8rem; font-weight: 700; padding: 0.25rem 0.6rem;">${status.text}</span>`;
        }
      }, 60000);
    }

    // Render Google Maps Embed
    const mapContainer = document.getElementById('clinic-map-container');
    const directionsBtn = document.getElementById('clinic-map-directions');
    if (mapContainer && config.googleMapsLink) {
      let embedUrl = '';
      const mapLink = config.googleMapsLink.trim();
      if (mapLink.includes('<iframe')) {
        const match = mapLink.match(/src="([^"]+)"/);
        if (match) embedUrl = match[1];
      } else if (mapLink.includes('maps/embed') || mapLink.includes('output=embed')) {
        embedUrl = mapLink;
      } else {
        embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(config.address || config.clinicName || 'Apex Dental Care')}&output=embed`;
      }

      if (embedUrl) {
        mapContainer.style.display = 'block';
        mapContainer.innerHTML = `<iframe 
          src="${embedUrl}" 
          width="100%" 
          height="180" 
          style="border:0;" 
          allowfullscreen="" 
          loading="lazy" 
          referrerpolicy="no-referrer-when-downgrade">
        </iframe>`;
      } else {
        mapContainer.style.display = 'none';
      }

      if (directionsBtn) {
        let rawLink = mapLink;
        if (rawLink.includes('<iframe')) {
          const match = rawLink.match(/src="([^"]+)"/);
          rawLink = match ? match[1] : 'https://maps.google.com';
        }
        directionsBtn.href = rawLink;
        directionsBtn.style.display = 'inline-flex';
      }
    } else {
      if (mapContainer) mapContainer.style.display = 'none';
      if (directionsBtn) directionsBtn.style.display = 'none';
    }
  }

  bindSaaSEvents() {
    const saveClinicBtn = document.getElementById('settings-clinic-save-btn');
    if (saveClinicBtn) {
      saveClinicBtn.addEventListener('click', async () => {
        const url = localStorage.getItem('google_sheets_url');
        
        saveClinicBtn.innerText = '⏳ Saving...';
        saveClinicBtn.disabled = true;
        try {
          await settingsManager.saveClinicSettings(url);
          if (url) {
            this.showSystemAlert('Clinic branding configurations saved successfully!', 'success');
          } else {
            this.showSystemAlert('Clinic branding configurations saved locally (Offline Mode)!', 'success');
          }
          const activeConfig = configService.getCurrentConfig();
          const activeTreatments = treatmentService.getTreatmentsList();
          this.renderDynamicLandingPage(activeConfig, activeTreatments);
        } catch(err) {
          let errorMsg = err.message;
          if (errorMsg.includes('Unknown action')) {
            errorMsg += '. Please copy the upgraded Google Apps Script template (from Diagnostics console) and deploy it as a "New version" in your Apps Script editor!';
          }
          this.showSystemAlert('Failed to save settings: ' + errorMsg, 'error');
        } finally {
          saveClinicBtn.innerText = '💾 Save Clinic Settings';
          saveClinicBtn.disabled = false;
        }
      });
    }

    const addTreatmentBtn = document.getElementById('treatment-add-btn');
    if (addTreatmentBtn) {
      addTreatmentBtn.addEventListener('click', () => {
        document.getElementById('treatment-modal-title').innerText = '➕ Add New Treatment';
        document.getElementById('edit-treatment-id').value = '';
        document.getElementById('edit-treatment-name').value = '';
        document.getElementById('edit-treatment-category').value = '';
        document.getElementById('edit-treatment-price').value = '';
        document.getElementById('edit-treatment-displayOrder').value = '1';
        document.getElementById('edit-treatment-description').value = '';
        document.getElementById('edit-treatment-featured').checked = false;
        document.getElementById('edit-treatment-active').checked = true;
        
        this.openModal('edit-treatment-modal');
      });
    }

    const saveTreatmentBtn = document.getElementById('save-treatment-btn');
    if (saveTreatmentBtn) {
      saveTreatmentBtn.addEventListener('click', async () => {
        const id = document.getElementById('edit-treatment-id').value.trim();
        const name = document.getElementById('edit-treatment-name').value.trim();
        const category = document.getElementById('edit-treatment-category').value.trim();
        const price = parseFloat(document.getElementById('edit-treatment-price').value.trim());
        const displayOrder = parseInt(document.getElementById('edit-treatment-displayOrder').value.trim()) || 99;
        const description = document.getElementById('edit-treatment-description').value.trim();
        const featured = document.getElementById('edit-treatment-featured').checked;
        const active = document.getElementById('edit-treatment-active').checked;

        if (!name || !category || isNaN(price) || !description) {
          this.showSystemAlert('Please fill out all required fields.', 'error');
          return;
        }

        const treatmentData = {
          name, category, price, displayOrder, description, featured, active
        };

        const url = localStorage.getItem('google_sheets_url');
        saveTreatmentBtn.innerText = '⏳ Saving...';
        saveTreatmentBtn.disabled = true;

        try {
          if (id) {
            treatmentData.id = id;
            await treatmentService.updateTreatment(url, configService.clinicId, treatmentData);
            this.showSystemAlert('Treatment updated successfully.', 'success');
          } else {
            await treatmentService.addTreatment(url, configService.clinicId, treatmentData);
            this.showSystemAlert('Treatment added successfully.', 'success');
          }

          const updatedTreatments = await treatmentService.loadTreatments(url, configService.clinicId);
          this.renderDynamicLandingPage(configService.getCurrentConfig(), updatedTreatments);
          this.renderDashboard();
          this.closeModal('edit-treatment-modal');
        } catch(err) {
          this.showSystemAlert('Failed to save treatment: ' + err.message, 'error');
        } finally {
          saveTreatmentBtn.innerText = 'Save Treatment';
          saveTreatmentBtn.disabled = false;
        }
      });
    }
  }

  openEditTreatmentModal(id) {
    const treatments = treatmentService.getTreatmentsList();
    const t = treatments.find(item => String(item.id) === String(id));
    if (!t) return;

    document.getElementById('treatment-modal-title').innerText = '✏️ Edit Treatment';
    document.getElementById('edit-treatment-id').value = t.id;
    document.getElementById('edit-treatment-name').value = t.name;
    document.getElementById('edit-treatment-category').value = t.category;
    document.getElementById('edit-treatment-price').value = t.price;
    document.getElementById('edit-treatment-displayOrder').value = t.displayOrder || 99;
    document.getElementById('edit-treatment-description').value = t.description;
    document.getElementById('edit-treatment-featured').checked = (t.featured === true || t.featured === 'true');
    document.getElementById('edit-treatment-active').checked = (t.active === true || t.active === 'true');

    this.openModal('edit-treatment-modal');
  }

  async deleteTreatment(id) {
    if (confirm("Are you sure you want to delete this treatment from inventory?")) {
      const url = localStorage.getItem('google_sheets_url');
      try {
        await treatmentService.deleteTreatment(url, configService.clinicId, id);
        this.showSystemAlert('Treatment deleted successfully.', 'info');
        
        const updated = await treatmentService.loadTreatments(url, configService.clinicId);
        this.renderDynamicLandingPage(configService.getCurrentConfig(), updated);
        this.renderDashboard();
      } catch(err) {
        this.showSystemAlert('Failed to delete treatment: ' + err.message, 'error');
      }
    }
  }

}

// Helpers
function encryptObfuscate(text) {
  if (!text) return '';
  try {
    const chars = encodeURIComponent(text).split('');
    const xorChars = chars.map(c => String.fromCharCode(c.charCodeAt(0) ^ 42));
    return btoa(xorChars.join(''));
  } catch (e) {
    return text;
  }
}

function decryptObfuscate(encoded) {
  if (!encoded) return '';
  try {
    const raw = atob(encoded);
    const chars = raw.split('');
    const xorChars = chars.map(c => String.fromCharCode(c.charCodeAt(0) ^ 42));
    return decodeURIComponent(xorChars.join(''));
  } catch (e) {
    return encoded;
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function wrapMessageContent(wrapper, sender, text, time) {
  wrapper.className = `msg-wrapper ${sender}`;
  const isBot = sender === 'bot';
  
  let formattedText = text;
  
  // 1. If it's a bot message and contains list items of treatments
  if (isBot && (text.includes('₹') || text.includes('$') || text.includes('Rs.'))) {
    const lines = text.split('\n');
    let hasTreatments = false;
    let newHtml = "";
    let listItems = [];
    
    for (let line of lines) {
      const match = line.trim().match(/^[-*]\s+([^:]+):\s*([^(\n]+)(?:\(([^)]+)\))?/);
      if (match) {
        hasTreatments = true;
        const name = match[1].trim();
        const price = match[2].trim();
        const desc = match[3] ? match[3].trim() : '';
        listItems.push({ name, price, desc });
      } else {
        if (listItems.length > 0) {
          newHtml += renderRichCards(listItems);
          listItems = [];
        }
        newHtml += line + '\n';
      }
    }
    if (listItems.length > 0) {
      newHtml += renderRichCards(listItems);
    }
    
    if (hasTreatments) {
      formattedText = newHtml;
    }
  }
  
  // 2. If it's a bot message and contains list items of specialists
  if (isBot && formattedText.includes('- Specialist:')) {
    const lines = formattedText.split('\n');
    let hasSpecialists = false;
    let newHtml = "";
    let specItems = [];
    
    for (let line of lines) {
      const match = line.trim().match(/^[-*]\s+Specialist:\s*([^(]+)\(([^|]+)\|\s*([^|]+)\|\s*([^)]+)\)/);
      if (match) {
        hasSpecialists = true;
        const name = match[1].trim();
        const specialty = match[2].trim();
        const experience = match[3].trim();
        const photo = match[4].trim();
        specItems.push({ name, specialty, experience, photo });
      } else {
        if (specItems.length > 0) {
          newHtml += renderSpecialistRichCards(specItems);
          specItems = [];
        }
        newHtml += line + '\n';
      }
    }
    if (specItems.length > 0) {
      newHtml += renderSpecialistRichCards(specItems);
    }
    
    if (hasSpecialists) {
      formattedText = newHtml;
    }
  }
  
  formattedText = formattedText
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  wrapper.innerHTML = `
    <div class="msg-bubble">${formattedText}</div>
    <div class="msg-time">${time}</div>
  `;
}

function renderRichCards(items) {
  const cardsHtml = items.map(item => {
    const nameClean = item.name.replace(/\*\*/g, '').trim();
    return `
      <div class="chat-rich-card" onclick="app.openChatWidget(false, '${nameClean.replace(/'/g, "\\'")}')" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; margin-top: 0.5rem; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; gap: 0.25rem; box-shadow: var(--shadow-sm); width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.85rem; color: var(--primary);">
          <span>🦷 ${nameClean}</span>
          <span style="background: var(--primary-light); color: var(--primary); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem;">${item.price}</span>
        </div>
        ${item.desc ? `<div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.3;">${item.desc}</div>` : ''}
        <div style="font-size: 0.7rem; color: var(--primary); font-weight: 600; text-align: right; margin-top: 0.25rem;">👉 Click to enquire</div>
      </div>
    `;
  }).join('');
  
  return `<div class="chat-rich-cards-container" style="display: flex; flex-direction: column; gap: 0.5rem; margin: 0.5rem 0; width: 100%; max-width: 280px;">${cardsHtml}</div>`;
}

function renderSpecialistRichCards(items) {
  const cardsHtml = items.map(item => {
    const isEmoji = !item.photo.startsWith('http') && item.photo.length <= 5;
    const photoHtml = isEmoji 
      ? `<div style="font-size: 1.5rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--primary-light); border-radius: 50%;">${item.photo}</div>`
      : `<img src="${item.photo}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 50%; border: 1px solid var(--border-color);" alt="${item.name}">`;

    return `
      <div class="chat-rich-card" onclick="app.openChatWidget(true, null)" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; margin-top: 0.5rem; cursor: pointer; transition: var(--transition); display: flex; gap: 0.75rem; align-items: center; box-shadow: var(--shadow-sm); width: 100%;">
        ${photoHtml}
        <div style="display: flex; flex-direction: column; gap: 0.15rem; flex: 1;">
          <span style="font-weight: 600; font-size: 0.82rem; color: var(--primary);">${item.name}</span>
          <span style="font-size: 0.75rem; color: var(--text-main); font-weight: 500;">${item.specialty}</span>
          <span style="font-size: 0.68rem; color: var(--text-muted);">${item.experience}</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--primary); font-weight: 600; text-align: right; align-self: center;">📅 Book</div>
      </div>
    `;
  }).join('');
  
  return `<div class="chat-rich-cards-container" style="display: flex; flex-direction: column; gap: 0.5rem; margin: 0.5rem 0; width: 100%; max-width: 280px;">${cardsHtml}</div>`;
}

// Export and assign globally
const app = new AppController();
window.app = app;
window.encryptObfuscate = encryptObfuscate;
window.decryptObfuscate = decryptObfuscate;
window.formatCurrency = formatCurrency;
window.logSystemEvent = (type, msg, details) => {
  app.logSystemEvent(type, msg, details);
};

function formatCurrency(priceStr, currencySymbol = '₹') {
  if (priceStr === undefined || priceStr === null) return '';
  let cleanStr = String(priceStr).replace(/[₹$]/g, '').trim();
  const match = cleanStr.match(/^([\d.,]+)(.*)$/);
  if (match) {
    const numPart = match[1].replace(/,/g, '');
    const num = parseFloat(numPart);
    if (!isNaN(num)) {
      const formattedNum = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num);
      return `${currencySymbol}${formattedNum}${match[2]}`;
    }
  }
  return `${currencySymbol}${cleanStr}`;
}

export { formatCurrency };
export default app;
