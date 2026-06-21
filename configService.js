function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_config_' + Math.floor(Math.random() * 1000000);
    const script = document.createElement('script');
    
    const timeout = setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("Configuration fetch timed out."));
    }, 10000);

    window[callbackName] = function(data) {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      resolve(data);
    };

    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      reject(new Error("Failed to load configuration script."));
    };
    document.body.appendChild(script);
  });
}

export class ConfigService {
  constructor() {
    this.clinicId = this.detectClinicId();
    this.config = null;
  }

  detectClinicId() {
    const urlParams = new URLSearchParams(window.location.search);
    let cid = urlParams.get('clinicId');
    if (cid) {
      localStorage.setItem('active_clinic_id', cid);
      return cid;
    }
    const cachedCid = localStorage.getItem('active_clinic_id');
    if (cachedCid) {
      return cachedCid;
    }
    return 'default_clinic';
  }

  async loadConfig(sheetsUrl) {
    // 1. Fallback local config
    const localFallback = {
      clinicId: this.clinicId,
      clinicName: "Apex Dental Care",
      tagline: "Experience Gentle, State-of-the-Art Dental Care",
      logoURL: "🦷",
      phone: "+91 98765 43210",
      email: "hello@apexdental.in",
      whatsappNumber: "+91 98765 43210",
      address: "Ground Floor, Zenith Plaza, Bandra West, Mumbai, MH - 400050",
      googleMapsLink: "https://maps.google.com",
      websiteURL: "http://localhost:3000",
      workingHours: "Mon - Sat: 9 AM - 8 PM",
      emergencyPhone: "+91 98765 43210",
      bookingInstructions: "Cash, Cards, UPI, 0% Interest EMI up to 12 months, Star Health insurance",
      clinicDescription: "Apex Dental Care combines clinical excellence with advanced comfort technologies. MDS specialists speak English, Hindi, and Marathi.",
      themeColor: "#0d9488",
      primaryButtonColor: "#0d9488",
      secondaryButtonColor: "#0f766e",
      facebookURL: "https://facebook.com",
      instagramURL: "https://instagram.com",
      youtubeURL: "https://youtube.com",
      reviewLink: "https://google.com/reviews",
      currency: "₹",
      timezone: "Asia/Kolkata",
      galleryImages: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80,https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=80,https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=600&q=80"
    };

    // 2. If no Sheets URL is specified, use local cache/fallback
    if (!sheetsUrl) {
      const cached = localStorage.getItem(`config_cache_${this.clinicId}`);
      this.config = cached ? JSON.parse(cached) : localFallback;
      this.applyTheme(this.config);
      return this.config;
    }

    try {
      // Fetch clinic configuration from Sheets Web App using JSONP to avoid CORS redirect blocks
      const separator = sheetsUrl.indexOf('?') >= 0 ? '&' : '?';
      const fetchUrl = `${sheetsUrl}${separator}clinicId=${this.clinicId}`;
      
      const res = await fetchJSONP(fetchUrl);
      if (res.status === 'success' && res.data && res.data.config) {
        this.config = { ...localFallback, ...res.data.config };
      } else {
        this.config = localFallback;
      }
    } catch (e) {
      console.warn("Could not load dynamic config from Sheets, using cache/fallback:", e.message);
      const cached = localStorage.getItem(`config_cache_${this.clinicId}`);
      this.config = cached ? JSON.parse(cached) : localFallback;
    }

    // Save to local cache
    localStorage.setItem(`config_cache_${this.clinicId}`, JSON.stringify(this.config));
    this.applyTheme(this.config);
    return this.config;
  }

  applyTheme(config) {
    const root = document.documentElement;
    if (config.primaryButtonColor) {
      root.style.setProperty('--primary', config.primaryButtonColor);
    }
    if (config.secondaryButtonColor) {
      root.style.setProperty('--primary-hover', config.secondaryButtonColor);
    }
  }

  getCurrentConfig() {
    return this.config;
  }
}

export const configService = new ConfigService();
