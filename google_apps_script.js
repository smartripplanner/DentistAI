/**
 * DentalAI Google Sheets Database Sync Script - Multi-Clinic SaaS Upgrade
 * 
 * INSTRUCTIONS:
 * 1. Open your Google Sheet.
 * 2. Click on "Extensions" -> "Apps Script".
 * 3. Replace all existing code with this upgraded script and click Save.
 * 4. Click "Deploy" -> "Manage deployments".
 * 5. Click the Edit (pencil) icon, select Version: "New version", and click Deploy.
 * 6. Make sure to run 'triggerAuthorization' once inside the editor to authorize Calendar/Email scopes if needed.
 */

function doGet(e) {
  try {
    setupDatabase(); // Ensure SaaS sheets and columns exist
    
    var params = e && e.parameter ? e.parameter : {};
    var clinicId = params.clinicId || "default_clinic";
    
    // Check if it is a Twilio voice line call request
    if (params.type === "twilioVoice") {
      return handleTwilioVoiceCall(e, clinicId);
    }
    
    var config = getClinicConfigRecord(clinicId);
    if (!config) {
      config = createDefaultConfigForClinic(clinicId);
    }
    
    var treatments = getTreatmentsRecord(clinicId);
    
    var output = {
      config: config,
      treatments: treatments,
      appointments: getSheetDataFiltered("Appointments", clinicId),
      leads: getSheetDataFiltered("Leads", clinicId),
      handoffs: getSheetDataFiltered("Handoffs", clinicId)
    };
    
    var result = { status: "success", data: output };
    var callback = params.callback;
    
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(result) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var resultErr = { status: "error", message: err.toString() };
    var callback = e && e.parameter && e.parameter.callback;
    
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(resultErr) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(JSON.stringify(resultErr))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var executionLogs = [];
  try {
    setupDatabase();
    
    var params = e && e.parameter ? e.parameter : {};
    if (params.type === "twilioVoice") {
      return handleTwilioVoiceCall(e, params.clinicId || "default_clinic");
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var clinicId = payload.clinicId || "default_clinic";
    var data = payload.data;
    var notificationEmail = payload.notificationEmail;
    var calendarId = payload.calendarId;
    
    if (action === "test") {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected successfully!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var result;
    
    // --- SAAS CLINIC CONFIG ACTIONS ---
    if (action === "updateClinicConfig") {
      result = updateClinicConfigRecord(clinicId, data);
      executionLogs.push("Clinic settings updated successfully.");
      
    // --- SAAS TREATMENTS CRUD ACTIONS ---
    } else if (action === "addTreatment") {
      result = addTreatmentRecord(clinicId, data);
      executionLogs.push("New treatment record added.");
    } else if (action === "updateTreatment") {
      result = updateTreatmentRecord(clinicId, data);
      executionLogs.push("Treatment record updated.");
    } else if (action === "deleteTreatment") {
      result = deleteTreatmentRecord(clinicId, data.id);
      executionLogs.push("Treatment record deleted.");
      
    // --- STANDARD OPERATIONS (FILTERED BY CLINIC ID) ---
    } else if (action === "addAppointment") {
      result = addRowToSheet("Appointments", [
        data.id,
        clinicId,
        data.name,
        data.phone,
        data.email,
        data.date,
        data.time,
        data.treatment,
        data.status,
        data.dateCreated
      ]);
      
      // Google Calendar Integration
      if (calendarId) {
        try {
          var cal = null;
          if (calendarId.indexOf('@') !== -1) {
            cal = CalendarApp.getCalendarById(calendarId);
          }
          if (!cal) {
            cal = CalendarApp.getDefaultCalendar();
          }
          
          if (cal) {
            var timeStr = data.time.replace(/[^0-9:]/g, '');
            var parts = timeStr.split(':');
            var hour = parseInt(parts[0], 10);
            var min = parseInt(parts[1], 10);
            
            if (data.time.toLowerCase().indexOf('pm') !== -1 && hour < 12) {
              hour += 12;
            } else if (data.time.toLowerCase().indexOf('am') !== -1 && hour === 12) {
              hour = 0;
            }
            
            var dateParts = data.date.split('-');
            var start = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10), hour, min);
            var end = new Date(start.getTime() + 30 * 60 * 1000);
            
            cal.createEvent("Appt: " + data.name + " (" + data.treatment + ")", start, end, {
              description: "Clinic ID: " + clinicId + "\nPatient Phone: " + data.phone + "\nStatus: " + data.status,
              guests: data.email,
              sendInvites: true
            });
            executionLogs.push("Google Calendar event created successfully in: " + cal.getName());
          } else {
            executionLogs.push("Google Calendar not found or inaccessible.");
          }
        } catch(calErr) {
          console.error("Google Calendar Sync failed: " + calErr.toString());
          executionLogs.push("Google Calendar Sync failed: " + calErr.toString());
        }
      }
      
    } else if (action === "addLead") {
      result = addRowToSheet("Leads", [
        data.id,
        clinicId,
        data.name,
        data.phone,
        data.email,
        data.treatment,
        data.timeframe,
        data.urgency,
        data.visited,
        data.score,
        data.leadTag,
        data.dateCreated,
        data.source
      ]);
      
      // Real-time Email Notification for Emergency Leads
      if (data.leadTag === "Emergency" && notificationEmail) {
        try {
          var subject = "🚨 Emergency DentalAI Alert: New Emergency Patient!";
          var body = "Hi Receptionist,\n\n" +
                     "A new EMERGENCY lead has been qualified by the DentalAI bot:\n\n" +
                     "Clinic: " + clinicId.toUpperCase() + "\n" +
                     "Name: " + data.name + "\n" +
                     "Phone: " + data.phone + "\n" +
                     "Urgency Details: " + data.urgency + "\n" +
                     "Date Fired: " + data.dateCreated + "\n\n" +
                     "Please contact the patient immediately.";
          sendEmailAlert(notificationEmail, subject, body);
          executionLogs.push("Emergency email alert dispatched to: " + notificationEmail);
        } catch(mailErr) {
          console.error("Mail Notification failed: " + mailErr.toString());
          executionLogs.push("Mail Notification failed: " + mailErr.toString());
        }
      }
      
    } else if (action === "addHandoff") {
      result = addRowToSheet("Handoffs", [
        data.id,
        clinicId,
        data.sessionId,
        data.name,
        data.phone,
        data.reason,
        JSON.stringify(data.transcript),
        data.status,
        data.dateCreated
      ]);
      
      // Real-time Email Notification for Human Handoffs
      if (notificationEmail) {
        try {
          var subject = "🚨 DentalAI Alert: Human Handoff Requested!";
          var body = "Hi Receptionist,\n\n" +
                     "A patient has requested a human takeover or staff escalation:\n\n" +
                     "Clinic: " + clinicId.toUpperCase() + "\n" +
                     "Name: " + data.name + "\n" +
                     "Phone: " + data.phone + "\n" +
                     "Reason: " + data.reason + "\n" +
                     "Session ID: " + data.sessionId + "\n\n" +
                     "Please log into the Clinic CRM Dashboard to review and take over the live chat.";
          sendEmailAlert(notificationEmail, subject, body);
          executionLogs.push("Handoff email alert dispatched to: " + notificationEmail);
        } catch(mailErr) {
          console.error("Mail Handoff Notification failed: " + mailErr.toString());
          executionLogs.push("Mail Handoff Notification failed: " + mailErr.toString());
        }
      }
      
    } else if (action === "updateAppointment") {
      result = updateRowInSheet("Appointments", data.id, {
        "Patient Name": data.name,
        "Phone": data.phone,
        "Email": data.email,
        "Preferred Date": data.date,
        "Preferred Time": data.time,
        "Treatment": data.treatment
      });
    } else if (action === "cancelAppointment") {
      result = deleteRowInSheet("Appointments", data.id);
    } else if (action === "deleteLead") {
      result = deleteRowInSheet("Leads", data.id);
    } else if (action === "attendHandoff") {
      result = updateRowInSheet("Handoffs", data.id, {
        "Status": data.status
      });
    } else if (action === "clearHandoff") {
      result = deleteRowInSheet("Handoffs", data.id);
    } else {
      throw new Error("Unknown action: " + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      result: result, 
      executionLogs: executionLogs.length > 0 ? executionLogs : undefined 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString(), 
      executionLogs: executionLogs.length > 0 ? executionLogs : undefined 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- AUTOMATIC DATABASE UPGRADES ---
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup ClinicConfig Sheet
  var configSheet = ss.getSheetByName("ClinicConfig");
  if (!configSheet) {
    configSheet = ss.insertSheet("ClinicConfig");
    configSheet.appendRow([
      "clinicId", "clinicName", "tagline", "logoURL", "phone", "email", 
      "whatsappNumber", "address", "googleMapsLink", "websiteURL", 
      "workingHours", "emergencyPhone", "bookingInstructions", "clinicDescription", 
      "themeColor", "primaryButtonColor", "secondaryButtonColor", 
      "facebookURL", "instagramURL", "youtubeURL", "reviewLink", "currency", "timezone", "updatedAt"
    ]);
    formatHeaderRow(configSheet);
  }
  
  // 2. Setup Treatments Sheet
  var treatSheet = ss.getSheetByName("Treatments");
  if (!treatSheet) {
    treatSheet = ss.insertSheet("Treatments");
    treatSheet.appendRow([
      "id", "clinicId", "name", "description", "price", "duration", "category", "featured", "active", "displayOrder", "updatedAt"
    ]);
    formatHeaderRow(treatSheet);
  }
  
  // 3. Migrate Appointments (Binds "Clinic ID" column B)
  migrateTableSchema("Appointments", [
    "Appointment ID", "Clinic ID", "Patient Name", "Phone", "Email", 
    "Preferred Date", "Preferred Time", "Treatment", "Patient Status", "Date Created"
  ]);
  
  // 4. Migrate Leads
  migrateTableSchema("Leads", [
    "Lead ID", "Clinic ID", "Patient Name", "Phone", "Email", "Treatment Interest", 
    "Timeframe Preference", "Urgency level", "Visited Before", "Lead Score", "Lead Tag", "Date Created", "Source"
  ]);
  
  // 5. Migrate Handoffs
  migrateTableSchema("Handoffs", [
    "Handoff ID", "Clinic ID", "Session ID", "Patient Name", "Phone", "Escalation Reason", "Transcript JSON", "Status", "Date Created"
  ]);
  
  // Clean default sheet
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
}

function migrateTableSchema(sheetName, expectedHeaders) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(expectedHeaders);
    formatHeaderRow(sheet);
    return;
  }
  
  var headers = sheet.getDataRange().getValues()[0];
  var index = headers.indexOf("Clinic ID");
  
  if (index === -1) {
    // Insert "Clinic ID" column at column 2 (Column B)
    sheet.insertColumnBefore(2);
    
    // Google Sheets index is 1-based, so row 1, col 2 is Column B
    sheet.getRange(1, 2).setValue("Clinic ID");
    
    // Fill existing data rows with "default_clinic" to prevent corruption
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var range = sheet.getRange(2, 2, lastRow - 1, 1);
      var fillValues = [];
      for (var r = 0; r < lastRow - 1; r++) {
        fillValues.push(["default_clinic"]);
      }
      range.setValues(fillValues);
    }
    formatHeaderRow(sheet);
  }
}

function formatHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground("#0d9488")
       .setFontColor("#ffffff")
       .setFontWeight("bold")
       .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  for (var i = 1; i <= sheet.getLastColumn(); i++) {
    sheet.autoResizeColumn(i);
  }
}

// --- DYNAMIC DATA FILTERING & CRUD SERVICES ---

function getSheetDataFiltered(sheetName, clinicId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  var headers = rows[0];
  var data = [];
  var keyMap = getFrontendKeyMap(sheetName);
  
  var clinicIdIndex = headers.indexOf("Clinic ID");
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowCid = clinicIdIndex !== -1 ? row[clinicIdIndex].toString() : "default_clinic";
    if (!rowCid || rowCid === "") rowCid = "default_clinic";
    
    if (rowCid.toString() !== clinicId.toString()) {
      continue;
    }
    
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var headerVal = headers[j];
      var key = keyMap[headerVal] || headerVal;
      
      if (key === "transcript" && typeof row[j] === "string" && row[j].length > 0) {
        try {
          obj[key] = JSON.parse(row[j]);
        } catch(e) {
          obj[key] = [];
        }
      } else {
        obj[key] = row[j];
      }
    }
    data.push(obj);
  }
  return data;
}

function getClinicConfigRecord(clinicId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ClinicConfig");
  if (!sheet) return null;
  
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return null;
  
  var headers = rows[0];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === clinicId.toString()) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = rows[i][j];
      }
      return obj;
    }
  }
  return null;
}

function createDefaultConfigForClinic(clinicId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ClinicConfig");
  var headers = sheet.getDataRange().getValues()[0];
  
  var newRecord = {
    clinicId: clinicId,
    clinicName: clinicId === "default_clinic" ? "Apex Dental Care" : clinicId.charAt(0).toUpperCase() + clinicId.slice(1) + " Dental Care",
    tagline: "Experience Gentle, State-of-the-Art Dental Care",
    logoURL: "🦷",
    phone: "+91 98765 43210",
    email: "hello@" + clinicId + ".in",
    whatsappNumber: "+91 98765 43210",
    address: "Ground Floor, Zenith Plaza, Bandra West, Mumbai",
    googleMapsLink: "https://maps.google.com",
    websiteURL: "http://localhost:3000",
    workingHours: "Mon - Sat: 9 AM - 8 PM",
    emergencyPhone: "+91 98765 43210",
    bookingInstructions: "Cash, Cards, UPI, 0% Interest EMI",
    clinicDescription: "Providing cutting-edge dental treatments with a gentle touch.",
    themeColor: "#0d9488",
    primaryButtonColor: "#0d9488",
    secondaryButtonColor: "#0f766e",
    facebookURL: "https://facebook.com",
    instagramURL: "https://instagram.com",
    youtubeURL: "https://youtube.com",
    reviewLink: "https://google.com/reviews",
    currency: "₹",
    timezone: "Asia/Kolkata",
    updatedAt: new Date().toISOString()
  };
  
  var rowArray = [];
  for (var i = 0; i < headers.length; i++) {
    rowArray.push(newRecord[headers[i]] || "");
  }
  
  sheet.appendRow(rowArray);
  return newRecord;
}

function getTreatmentsRecord(clinicId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Treatments");
  if (!sheet) return [];
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var data = [];
  
  if (rows.length > 1) {
    var cidColIndex = headers.indexOf("clinicId");
    if (cidColIndex === -1) cidColIndex = 1; // Fallback to index 1 if not found
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][cidColIndex].toString() === clinicId.toString()) {
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          var val = rows[i][j];
          if (headers[j] === "active" || headers[j] === "featured") {
            val = (val === true || val === "true" || val === 1);
          } else if (headers[j] === "price" || headers[j] === "displayOrder") {
            val = parseFloat(val) || 0;
          }
          obj[headers[j]] = val;
        }
        data.push(obj);
      }
    }
  }
  
  if (data.length === 0) {
    data = seedDefaultTreatmentsForClinic(clinicId);
  }
  return data;
}

function seedDefaultTreatmentsForClinic(clinicId) {
  var fallbackTreatments = [
    { id: "clean_" + clinicId, name: "Dental Cleaning", description: "Professional prophylaxis removing plaque, tartar, and gum scaling.", price: 1500, category: "General", featured: false, active: true, displayOrder: 1 },
    { id: "white_" + clinicId, name: "Teeth Whitening", description: "Safe, professional laser bleaching that brightens your smile.", price: 6000, category: "Cosmetic", featured: false, active: true, displayOrder: 2 },
    { id: "align_" + clinicId, name: "Invisalign® Clear Aligners", description: "Virtually invisible clear aligners to straighten your teeth.", price: 120000, category: "Orthodontics", featured: true, active: true, displayOrder: 3 },
    { id: "implant_" + clinicId, name: "Dental Implants", description: "Permanent titanium implant replacement restoring full support.", price: 35000, category: "Implants", featured: true, active: true, displayOrder: 4 },
    { id: "braces_" + clinicId, name: "Orthodontic Braces", description: "Traditional braces correcting crowding and alignment issues.", price: 40000, category: "Orthodontics", featured: false, active: true, displayOrder: 5 },
    { id: "rct_" + clinicId, name: "Root Canal Treatment", description: "Pain-free therapy saving infected teeth from extraction.", price: 4500, category: "Endodontics", featured: false, active: true, displayOrder: 6 },
    { id: "veneer_" + clinicId, name: "Porcelain Veneers", description: "Custom shells bonded to teeth for a Hollywood smile design.", price: 12000, category: "Cosmetic", featured: true, active: true, displayOrder: 7 },
    { id: "wisdom_" + clinicId, name: "Wisdom Tooth Extraction", description: "Safe wisdom teeth removal under gentle anesthesia.", price: 5000, category: "Surgery", featured: false, active: true, displayOrder: 8 }
  ];
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Treatments");
  var headers = sheet.getDataRange().getValues()[0];
  
  for (var k = 0; k < fallbackTreatments.length; k++) {
    var t = fallbackTreatments[k];
    t.clinicId = clinicId;
    t.updatedAt = new Date().toISOString();
    
    var rowArray = [];
    for (var i = 0; i < headers.length; i++) {
      rowArray.push(t[headers[i]] !== undefined ? t[headers[i]] : "");
    }
    sheet.appendRow(rowArray);
  }
  return fallbackTreatments;
}

function updateClinicConfigRecord(clinicId, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ClinicConfig");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === clinicId.toString()) {
      for (var key in data) {
        var colIndex = headers.indexOf(key);
        if (colIndex !== -1 && key !== "clinicId") {
          sheet.getRange(i + 1, colIndex + 1).setValue(data[key]);
        }
      }
      return "Config updated";
    }
  }
  
  // If not found, append it
  var rowArray = [];
  for (var k = 0; k < headers.length; k++) {
    rowArray.push(data[headers[k]] !== undefined ? data[headers[k]] : "");
  }
  sheet.appendRow(rowArray);
  return "Config created and saved";
}

function addTreatmentRecord(clinicId, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Treatments");
  var headers = sheet.getDataRange().getValues()[0];
  
  data.clinicId = clinicId;
  data.updatedAt = new Date().toISOString();
  
  var rowArray = [];
  for (var i = 0; i < headers.length; i++) {
    rowArray.push(data[headers[i]] !== undefined ? data[headers[i]] : "");
  }
  sheet.appendRow(rowArray);
  return "Treatment added";
}

function updateTreatmentRecord(clinicId, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Treatments");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  var idCol = headers.indexOf("id");
  var cidCol = headers.indexOf("clinicId");
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][idCol].toString() === data.id.toString() && rows[i][cidCol].toString() === clinicId.toString()) {
      for (var key in data) {
        var colIndex = headers.indexOf(key);
        if (colIndex !== -1 && key !== "id" && key !== "clinicId") {
          sheet.getRange(i + 1, colIndex + 1).setValue(data[key]);
        }
      }
      sheet.getRange(i + 1, headers.indexOf("updatedAt") + 1).setValue(new Date().toISOString());
      return "Treatment updated";
    }
  }
  throw new Error("Treatment not found");
}

function deleteTreatmentRecord(clinicId, id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Treatments");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  var idCol = headers.indexOf("id");
  var cidCol = headers.indexOf("clinicId");
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][idCol].toString() === id.toString() && rows[i][cidCol].toString() === clinicId.toString()) {
      sheet.deleteRow(i + 1);
      return "Treatment deleted";
    }
  }
  throw new Error("Treatment not found");
}

// --- SCHEMAS HELPERS ---

function getFrontendKeyMap(sheetName) {
  if (sheetName === "Appointments") {
    return {
      "Appointment ID": "id",
      "Clinic ID": "clinicId",
      "Patient Name": "name",
      "Phone": "phone",
      "Email": "email",
      "Preferred Date": "date",
      "Preferred Time": "time",
      "Treatment": "treatment",
      "Patient Status": "status",
      "Date Created": "dateCreated"
    };
  } else if (sheetName === "Leads") {
    return {
      "Lead ID": "id",
      "Clinic ID": "clinicId",
      "Patient Name": "name",
      "Phone": "phone",
      "Email": "email",
      "Treatment Interest": "treatment",
      "Timeframe Preference": "timeframe",
      "Urgency level": "urgency",
      "Visited Before": "visited",
      "Lead Score": "score",
      "Lead Tag": "leadTag",
      "Date Created": "dateCreated",
      "Source": "source"
    };
  } else if (sheetName === "Handoffs") {
    return {
      "Handoff ID": "id",
      "Clinic ID": "clinicId",
      "Session ID": "sessionId",
      "Patient Name": "name",
      "Phone": "phone",
      "Escalation Reason": "reason",
      "Transcript JSON": "transcript",
      "Status": "status",
      "Date Created": "dateCreated"
    };
  }
  return {};
}

function addRowToSheet(sheetName, rowArray) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  sheet.appendRow(rowArray);
  sheet.autoResizeColumn(sheet.getLastColumn());
  return "Row appended successfully";
}

function updateRowInSheet(sheetName, id, updates) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  var idColIndex = 0;
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][idColIndex].toString() === id.toString()) {
      for (var key in updates) {
        var colIndex = headers.indexOf(key);
        if (colIndex !== -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(updates[key]);
        }
      }
      return "Row updated";
    }
  }
  throw new Error("Row not found with ID: " + id);
}

function deleteRowInSheet(sheetName, id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows = sheet.getDataRange().getValues();
  
  var idColIndex = 0;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][idColIndex].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
      return "Row deleted";
    }
  }
  throw new Error("Row not found with ID: " + id);
}

function sendEmailAlert(toEmail, subject, body) {
  try {
    MailApp.sendEmail(toEmail, subject, body);
  } catch(e) {
    try {
      GmailApp.sendEmail(toEmail, subject, body);
    } catch(err) {
      console.error("All email dispatch methods failed: " + err.toString());
    }
  }
}

// ⚠️ RUN THIS FUNCTION ONCE IN THE APPS SCRIPT EDITOR (Extensions -> Apps Script)
// Select 'triggerAuthorization' from the top dropdown list and click 'Run'.
// This will force Google to show the authorization dialog to grant Calendar and Email permissions!
function triggerAuthorization() {
  var email = Session.getActiveUser().getEmail() || "your email";
  Logger.log("Active User Email: " + email);
  
  // Force Google Calendar authorization prompt
  var cal = CalendarApp.getDefaultCalendar();
  if (cal) {
    Logger.log("Access to Default Calendar verified: " + cal.getName());
  }
  
  // Force Gmail/MailApp authorization prompt
  MailApp.sendEmail(email, "Apex Dental Script Authorization Test", "Authorization successful! Your script has permission to access Gmail and Calendar APIs.");
  Logger.log("Authorization test email sent to: " + email);
}

function handleTwilioVoiceCall(e, clinicId) {
  var params = e && e.parameter ? e.parameter : {};
  var speechResult = params.SpeechResult || "";
  var digits = params.Digits || "";
  var callerNumber = params.From || "Unknown Caller";
  var callSid = params.CallSid || "UnknownCallSid";
  
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  
  var config = getClinicConfigRecord(clinicId);
  var clinicName = config && config.clinicName ? config.clinicName : "Apex Dental Care";
  var workingHours = config && config.workingHours ? config.workingHours : "Mon - Sat: 9 AM - 8 PM";
  var emergencyPhone = config && config.emergencyPhone ? config.emergencyPhone : "";
  var address = config && config.address ? config.address : "";

  // Webhook endpoint URL self-reference (to tell Twilio where to POST next)
  var scriptUrl = ScriptApp.getService().getUrl();
  var nextAction = scriptUrl + "?clinicId=" + clinicId + "&type=twilioVoice";

  if (!speechResult && !digits) {
    // 1. Initial Greeting
    twiml += '<Say voice="alice" language="en-US">Thank you for calling ' + clinicName + '. I am your virtual AI receptionist. How can I help you today? You can ask about our hours, location, book an appointment, or request to speak to our staff.</Say>';
    twiml += '<Gather input="speech" timeout="5" action="' + nextAction + '">';
    twiml += '<Say voice="alice" language="en-US">Please state your inquiry or say: transfer call, to reach our team.</Say>';
    twiml += '</Gather>';
  } else {
    // 2. Process caller speech input
    var input = (speechResult || digits).toLowerCase();
    
    if (input.indexOf("receptionist") >= 0 || input.indexOf("human") >= 0 || input.indexOf("staff") >= 0 || input.indexOf("transfer") >= 0 || input.indexOf("operator") >= 0) {
      // 2a. Call Transfer to receptionist
      twiml += '<Say voice="alice" language="en-US">Sure, please hold while I transfer your call to our human staff receptionist.</Say>';
      if (emergencyPhone) {
        twiml += '<Dial>' + emergencyPhone + '</Dial>';
      } else {
        twiml += '<Say voice="alice" language="en-US">We apologize, but no forwarding number is configured. Goodbye.</Say>';
        twiml += '<Hangup/>';
      }
      
      // Log active call handoff transfer
      try {
        addRowToSheet("Handoffs", [
          "call_" + callSid.slice(-6),
          clinicId,
          "Call Caller: " + callerNumber,
          callerNumber,
          "Voice Call Escalation: Requested staff transfer.",
          "[]",
          "Active Escalation",
          new Date().toISOString()
        ]);
      } catch (err) {}
    } else if (input.indexOf("book") >= 0 || input.indexOf("appointment") >= 0 || input.indexOf("schedule") >= 0) {
      // 2b. Simple Appointment Booking
      twiml += '<Say voice="alice" language="en-US">I can help you reserve a dental consultation appointment for tomorrow at eleven AM. We have successfully booked it under your caller number. We look forward to seeing you. Thank you for calling.</Say>';
      twiml += '<Hangup/>';
      
      // Add appointment row
      try {
        addRowToSheet("Appointments", [
          "app_call_" + callSid.slice(-6),
          clinicId,
          "Call Caller (" + callerNumber + ")",
          callerNumber,
          "caller@voice.ai",
          new Date(new Date().getTime() + 24*60*60*1000).toISOString().split('T')[0],
          "11:00",
          "Dental Consultation",
          "New Patient",
          new Date().toISOString().split('T')[0]
        ]);
      } catch (err) {}
    } else if (input.indexOf("hours") >= 0 || input.indexOf("open") >= 0 || input.indexOf("time") >= 0) {
      // 2c. Hours Info
      twiml += '<Say voice="alice" language="en-US">Our working hours are ' + workingHours + '. Would you like to book an appointment or check anything else?</Say>';
      twiml += '<Gather input="speech" timeout="5" action="' + nextAction + '">';
      twiml += '<Say voice="alice" language="en-US">Please speak now or hang up to finish.</Say>';
      twiml += '</Gather>';
    } else if (input.indexOf("address") >= 0 || input.indexOf("where") >= 0 || input.indexOf("location") >= 0) {
      // 2d. Location Info
      twiml += '<Say voice="alice" language="en-US">Our clinic is located at: ' + address + '. We offer complimentary valet parking. Can I help you with anything else?</Say>';
      twiml += '<Gather input="speech" timeout="5" action="' + nextAction + '">';
      twiml += '<Say voice="alice" language="en-US">Please say what you need or hang up.</Say>';
      twiml += '</Gather>';
    } else {
      // 2e. Default fallback
      twiml += '<Say voice="alice" language="en-US">I heard you say: ' + speechResult + '. You can say book appointment, check hours, or ask to speak to our staff receptionist.</Say>';
      twiml += '<Gather input="speech" timeout="5" action="' + nextAction + '">';
      twiml += '<Say voice="alice" language="en-US">Please tell me what you need.</Say>';
      twiml += '</Gather>';
    }
  }
  
  twiml += '</Response>';
  
  return ContentService.createTextOutput(twiml)
    .setMimeType(ContentService.MimeType.XML);
}
