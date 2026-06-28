/**
 * settingsManager.js - DentistAI SaaS settings editor and previewer
 */
import { configService } from './configService.js';

export class SettingsManager {
  constructor() {
    this.formFields = [
      'clinicName', 'tagline', 'logoURL', 'phone', 'email', 
      'whatsappNumber', 'address', 'googleMapsLink', 'websiteURL', 
      'workingHours', 'emergencyPhone', 'bookingInstructions', 
      'clinicDescription', 'primaryButtonColor', 'secondaryButtonColor',
      'facebookURL', 'instagramURL', 'youtubeURL', 'reviewLink', 
      'currency', 'timezone', 'galleryImages'
    ];
  }

  bindClinicSettingsForm(config) {
    if (!config) return;

    this.formFields.forEach(field => {
      const input = document.getElementById(`settings-clinic-${field}`);
      if (input) {
        input.value = config[field] || '';
      }
    });

    // Populate unique patient portal URL
    const uniqueUrlInput = document.getElementById('settings-clinic-uniqueURL');
    if (uniqueUrlInput) {
      const cid = config.clinicId || configService.detectClinicId();
      const sheetsUrl = window.app && typeof window.app.getSheetsUrl === 'function' 
        ? window.app.getSheetsUrl() 
        : (localStorage.getItem('google_sheets_url') || 'https://script.google.com/macros/s/AKfycbVHD0613YEjCT0fPFmSS4gYrXI2ddjHKBf2mghV8edSi8G6yrjVT3azA8jM7LXxpJG/exec');
      const sheetsParam = sheetsUrl ? `&sheetsUrl=${encodeURIComponent(sheetsUrl)}` : '';
      uniqueUrlInput.value = window.location.origin + window.location.pathname + "?clinicId=" + cid + sheetsParam;
    }

    // Setup color preview listeners
    const primaryColorInput = document.getElementById('settings-clinic-primaryButtonColor');
    const secondaryColorInput = document.getElementById('settings-clinic-secondaryButtonColor');

    if (primaryColorInput) {
      primaryColorInput.addEventListener('input', (e) => {
        this.previewColor('--primary', e.target.value);
      });
    }
    if (secondaryColorInput) {
      secondaryColorInput.addEventListener('input', (e) => {
        this.previewColor('--primary-hover', e.target.value);
      });
    }
  }

  previewColor(variableName, hexColor) {
    if (/^#[0-9A-F]{6}$/i.test(hexColor)) {
      document.documentElement.style.setProperty(variableName, hexColor);
    }
  }

  collectFormValues() {
    const values = {
      clinicId: configService.detectClinicId(),
      updatedAt: new Date().toISOString()
    };

    this.formFields.forEach(field => {
      const input = document.getElementById(`settings-clinic-${field}`);
      if (input) {
        values[field] = input.value.trim();
      }
    });

    return values;
  }

  async saveClinicSettings(sheetsUrl) {
    const payload = this.collectFormValues();
    if (!sheetsUrl) {
      localStorage.setItem(`config_cache_${payload.clinicId}`, JSON.stringify(payload));
      await configService.loadConfig(null);
      return { status: 'success', result: 'Saved locally' };
    }
    
    const response = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'updateClinicConfig',
        clinicId: payload.clinicId,
        data: payload
      })
    });

    if (!response.ok) {
      throw new Error("HTTP error " + response.status);
    }

    const res = await response.json();
    if (res.status !== 'success') {
      throw new Error(res.message || "Failed to save configuration.");
    }

    // Refresh active service cache
    await configService.loadConfig(sheetsUrl);
    return res;
  }
}

export const settingsManager = new SettingsManager();
