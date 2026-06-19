function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_treatments_' + Math.floor(Math.random() * 1000000);
    const script = document.createElement('script');
    
    const timeout = setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("Treatments fetch timed out."));
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
      reject(new Error("Failed to load treatments script."));
    };
    document.body.appendChild(script);
  });
}

export class TreatmentService {
  constructor() {
    this.treatments = [];
  }

  async loadTreatments(sheetsUrl, clinicId) {
    const fallbackTreatments = [
      { id: "clean", name: "Dental Cleaning", description: "Professional prophylaxis removing plaque, tartar, and surface stains to prevent cavities and gum disease.", price: 1500, category: "General", featured: false, active: true, displayOrder: 1 },
      { id: "white", name: "Teeth Whitening", description: "Safe, professional laser bleaching that brightens your smile by up to 8 shades in a single session.", price: 600, category: "Cosmetic", featured: false, active: true, displayOrder: 2 },
      { id: "align", name: "Invisalign® Clear Aligners", description: "Virtually invisible, removable clear aligners to straighten your teeth comfortably without metal wires.", price: 120000, category: "Orthodontics", featured: true, active: true, displayOrder: 3 },
      { id: "implant", name: "Dental Implants", description: "Permanent, natural-looking tooth replacement that restores full function, speech, and jaw support.", price: 35000, category: "Implants", featured: true, active: true, displayOrder: 4 },
      { id: "braces", name: "Orthodontic Braces", description: "Traditional ceramic or metal brackets to correct crowding, spacing, and bite alignment issues.", price: 40000, category: "Orthodontics", featured: false, active: true, displayOrder: 5 },
      { id: "rct", name: "Root Canal Treatment", description: "Pain-free therapy saving infected teeth, preserving natural tooth structure and stopping toothaches.", price: 4500, category: "Endodontics", featured: false, active: true, displayOrder: 6 },
      { id: "veneer", name: "Porcelain Veneers", description: "Ultra-thin, custom shells bonded to teeth for an instant Hollywood smile, fixing chips, gaps, and stains.", price: 12000, category: "Cosmetic", featured: true, active: true, displayOrder: 7 },
      { id: "wisdom", name: "Wisdom Tooth Extraction", description: "Safe extraction of impacted or painful wisdom teeth under gentle local anesthesia or sedation.", price: 5000, category: "Surgery", featured: false, active: true, displayOrder: 8 }
    ];

    if (!sheetsUrl) {
      const cached = localStorage.getItem(`treatments_cache_${clinicId}`);
      if (cached) {
        this.treatments = JSON.parse(cached);
      } else {
        this.treatments = fallbackTreatments;
        localStorage.setItem(`treatments_cache_${clinicId}`, JSON.stringify(fallbackTreatments));
      }
      return this.treatments;
    }

    try {
      const separator = sheetsUrl.indexOf('?') >= 0 ? '&' : '?';
      const fetchUrl = `${sheetsUrl}${separator}clinicId=${clinicId}`;
      const res = await fetchJSONP(fetchUrl);
      
      if (res.status === 'success' && res.data && res.data.treatments && res.data.treatments.length > 0) {
        // Filter active treatments and sort by displayOrder
        this.treatments = res.data.treatments.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
      } else {
        this.treatments = fallbackTreatments;
      }
    } catch (e) {
      console.warn("Could not load treatments from Sheets, using cache/fallback:", e.message);
      const cached = localStorage.getItem(`treatments_cache_${clinicId}`);
      this.treatments = cached ? JSON.parse(cached) : fallbackTreatments;
    }

    localStorage.setItem(`treatments_cache_${clinicId}`, JSON.stringify(this.treatments));
    return this.treatments;
  }

  async addTreatment(sheetsUrl, clinicId, treatmentData) {
    if (!treatmentData.id) {
      treatmentData.id = 't_' + Date.now();
    }

    if (!sheetsUrl) {
      this.treatments.push(treatmentData);
      localStorage.setItem(`treatments_cache_${clinicId}`, JSON.stringify(this.treatments));
      return { status: 'success', result: 'Added locally' };
    }
    
    return this.sendPostRequest(sheetsUrl, 'addTreatment', clinicId, treatmentData);
  }

  async updateTreatment(sheetsUrl, clinicId, treatmentData) {
    if (!sheetsUrl) {
      const index = this.treatments.findIndex(t => String(t.id) === String(treatmentData.id));
      if (index !== -1) {
        this.treatments[index] = treatmentData;
        localStorage.setItem(`treatments_cache_${clinicId}`, JSON.stringify(this.treatments));
      }
      return { status: 'success', result: 'Updated locally' };
    }
    
    return this.sendPostRequest(sheetsUrl, 'updateTreatment', clinicId, treatmentData);
  }

  async deleteTreatment(sheetsUrl, clinicId, treatmentId) {
    if (!sheetsUrl) {
      this.treatments = this.treatments.filter(t => String(t.id) !== String(treatmentId));
      localStorage.setItem(`treatments_cache_${clinicId}`, JSON.stringify(this.treatments));
      return { status: 'success', result: 'Deleted locally' };
    }
    
    return this.sendPostRequest(sheetsUrl, 'deleteTreatment', clinicId, { id: treatmentId });
  }

  async sendPostRequest(url, action, clinicId, data) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, clinicId, data })
    });
    
    if (!response.ok) throw new Error("POST request failed: " + response.statusText);
    return response.json();
  }

  getTreatmentsList() {
    return this.treatments;
  }
}

export const treatmentService = new TreatmentService();
