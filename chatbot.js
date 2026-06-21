// Chatbot State Machine and Flow Engine for DentalAI
import { configService } from './configService.js';
import { treatmentService } from './treatmentService.js';

export function compileSystemInstruction() {
  const config = configService.getCurrentConfig() || {
    clinicName: "Apex Dental Care",
    clinicDescription: "Apex Dental Care combines clinical excellence with advanced comfort technologies.",
    tagline: "Experience Gentle, State-of-the-Art Dental Care",
    address: "Ground Floor, Zenith Plaza, Bandra West, Mumbai, MH - 400050",
    phone: "+91 98765 43210",
    emergencyPhone: "+91 98765 43210",
    workingHours: "Mon - Sat: 9 AM - 8 PM",
    bookingInstructions: "Cash, major Credit/Debit Cards, UPI, Net Banking, and interest-free EMI options.",
    currency: "₹"
  };

  const treatmentsList = treatmentService.getTreatmentsList() || [];
  const activeTreatments = treatmentsList.filter(t => t.active === true || t.active === 'true');
  
  let treatmentsText = "";
  if (activeTreatments.length > 0) {
    treatmentsText = activeTreatments.map(t => `- ${t.name}: ${config.currency || '₹'}${t.price} (${t.description})`).join('\n');
  } else {
    treatmentsText = `- Dental Cleaning: ₹1,500 (plaque removal, prophylaxis)\n- Teeth Whitening: ₹6,000 (laser whitening, up to 8 shades)\n- Invisalign Clear Aligners: ₹1,20,000 (removable aligners, ideal for professionals)\n- Dental Implants: ₹35,000 (titanium screw, crown replacement)\n- Orthodontic Braces: ₹40,000 (traditional braces)\n- Root Canal Treatment (RCT): ₹4,500 (infection removal, local anesthesia)\n- Wisdom Tooth Extraction: ₹5,000 (surgical/non-surgical extraction)\n- Porcelain Veneers: ₹12,000 per tooth (Hollywood Smile makeovers)\n- Dentures: ₹15,000 (removable full/partial)\n- Gum Treatment: ₹3,000 (scaling/root planing)\n- Pediatric Dentistry: ₹1,200 (child checkups, sealants)\n- Dental Crowns: ₹4,500 (protective cap)`;
  }

  return `You are DentalAI, the intelligent virtual receptionist and empathetic patient care assistant for ${config.clinicName}.

PRIMARY OBJECTIVE:
Qualify leads, encourage appointment bookings, address pricing questions, triage emergencies, and answer general FAQs.

PERSONALITY:
- Warm, polite, empathetic (especially to patients expressing fear/pain).
- Clear, concise, professional.
- Never diagnose medical conditions, prescribe drugs, or guarantee treatment outcomes. Always emphasize that exact clinical evaluations are required in person by a licensed dentist.

CLINIC INFORMATION:
- Clinic: ${config.clinicName}
- Description: ${config.clinicDescription || config.tagline}
- Location: ${config.address}
- Phone: ${config.phone} (Emergency Line: ${config.emergencyPhone || config.phone})
- Hours: ${config.workingHours}
- Booking Info & Payments: ${config.bookingInstructions}
- Dentists: Certified MDS specialist surgeons with 10+ years experience.
- Languages spoken: English, Hindi, Marathi. Respond in the language used by the patient.

TREATMENTS & ESTIMATED STARTING PRICES:
${treatmentsText}
* NOTE: Always state that a consultation is required for exact pricing.

SPECIAL SALES INSTRUCTIONS:
- If discussing Implants, Invisalign, Veneers, or Smile Makeovers, highlight their durability/aesthetics and encourage scheduling a consult.

OBJECTION HANDLING:
- Too expensive: Highlight flexible payment plans/consult options.
- Need to think: Offer to temporarily reserve a tentative slot.
- Fear of dentist: Explain gentle, pain-free dentistry and sedation options.

EMERGENCY PROTOCOL:
- If the patient mentions bleeding, swelling, trauma, knocked-out tooth, or severe pain, recommend urgent evaluation, provide emergency phone,CRITICAL INSTRUCTION: LIST FORMATTING FOR RICH CARDS
- When recommending multiple dental treatments or listing prices, you MUST format the list exactly as:
  - [Treatment Name]: [Price] ([short 1-sentence description])
  Example:
  - Teeth Whitening: ₹6,000 (laser whitening, up to 8 shades)
  - Dental Implants: ₹35,000 (permanent tooth replacement)
- When listing dentists, doctors, or specialists, you MUST format the list exactly as:
  - Specialist: [Doctor Name] ([Specialty] | [Experience] | [Emoji or image url])
  Example:
  - Specialist: Dr. Aditi Sen (Pediatric Dentist (MDS) | 8 Years Exp | 👩‍⚕️)
  - Specialist: Dr. Rohan Kulkarni (Implantologist (ICOI USA) | 12 Years Exp | 👨‍⚕️)
These exact list patterns are parsed by the UI into interactive click-to-book cards, so you must follow them!

CRITICAL INSTRUCTION: LANGUAGE DETECTION TAGS
At the very beginning of your response, you MUST prepend a language identification tag in brackets depending on the user's language:
- If the user writes in English: Prepend "[LANG_EN] "
- If the user writes in Hindi: Prepend "[LANG_HI] "
- If the user writes in Marathi: Prepend "[LANG_MR] "
Example response: "[LANG_HI] नमस्ते! मैं आपकी क्या सहायता कर सकता हूँ?"
 
CRITICAL INSTRUCTION: ROUTER COMMAND TAGS
At the end of your response, you MUST append a specific command tag in brackets if the patient demonstrates specific intents:
- If the patient wants to book or schedule an appointment, or responds 'Yes' to a booking proposal: Append "[TRIGGER_BOOKING]" at the very end of your response.
- If the patient describes an emergency (trauma, severe pain, swelling, bleeding): Append "[TRIGGER_EMERGENCY]" at the very end.
- If the patient requests a WhatsApp check-in or WhatsApp lead options: Append "[TRIGGER_WHATSAPP]" at the very end.
- If the patient demands a human receptionist, doctor, staff, or is making a complaint: Append "[TRIGGER_HANDOFF]" at the very end.
- Otherwise, do NOT append any tag. Just reply normally.`;
}

// State Types
export const BOT_STATES = {
  IDLE: 'IDLE',
  // Booking Flow
  BOOK_NAME: 'BOOK_NAME',
  BOOK_PHONE: 'BOOK_PHONE',
  BOOK_EMAIL: 'BOOK_EMAIL',
  BOOK_DATE: 'BOOK_DATE',
  BOOK_TIME: 'BOOK_TIME',
  BOOK_TREATMENT: 'BOOK_TREATMENT',
  BOOK_STATUS: 'BOOK_STATUS', // New or Existing
  // Lead Flow
  LEAD_TREATMENT: 'LEAD_TREATMENT',
  LEAD_WHEN: 'LEAD_WHEN',
  LEAD_VISITED: 'LEAD_VISITED',
  LEAD_URGENCY: 'LEAD_URGENCY',
  // Emergency Triage Flow
  EMERGENCY_DETAILS: 'EMERGENCY_DETAILS',
  EMERGENCY_CONTACT: 'EMERGENCY_CONTACT',
  // WhatsApp Collection Flow
  WA_NAME: 'WA_NAME',
  WA_PHONE: 'WA_PHONE',
  WA_TREATMENT: 'WA_TREATMENT',
  WA_TIME: 'WA_TIME'
};

// Multilingual Dictionary
export const DICTIONARY = {
  en: {
    greeting: "Hello! I am DentalAI, your virtual receptionist at Apex Dental Care. How can I help you today?",
    ending: "Is there anything else I can help you with today, or would you like to schedule an appointment with one of our dentists?",
    invalidPhone: "Please enter a valid 10-digit phone number.",
    invalidEmail: "Please enter a valid email address.",
    invalidDate: "Please enter a valid future date (YYYY-MM-DD).",
    invalidTime: "Please enter a valid time (HH:MM).",
    confirmBooking: "Thank you! I have recorded your appointment request. Let me summarize it for you:\n\nName: {name}\nPhone: {phone}\nEmail: {email}\nDate: {date}\nTime: {time}\nTreatment: {treatment}\nStatus: {status}\n\nOur receptionist will contact you shortly to confirm the slot. 🦷",
    handoffMsg: "I'll connect you with a member of our team who can assist further.",
    emergencyWarn: "⚠️ IMPORTANT: This sounds like a dental emergency. Please seek immediate evaluation. Let's collect your contact info so our team can call you right away.",
    emergencyEscalation: "🚨 EMERGENCY ALERT: We have escalated your details to our on-call dentist. A staff member will call you in the next 15 minutes. If this is life-threatening, please visit the nearest hospital emergency room.",
    whatsappHeading: "Thank you for choosing WhatsApp lead check-in. Here is your CRM-ready card:",
    
    // Booking steps
    askName: "Could you please tell me your full name?",
    askPhone: "Great, what is your phone number?",
    askEmail: "What is your email address?",
    askDate: "What date would you like to visit? (e.g. 2026-06-15)",
    askTime: "What is your preferred time? (e.g. 11:30 AM)",
    askTreatment: "What treatment are you interested in?",
    askStatus: "Have you visited us before? Are you a New or Existing patient?",
    
    // Lead Steps
    leadTreat: "What treatment are you interested in?",
    leadWhen: "When would you like to start treatment? (e.g. Immediately, Within 1 Month, Just inquiring)",
    leadVisited: "Have you visited us before?",
    leadUrgency: "How urgent is your concern? (e.g. Low, Medium, Severe Pain)",
    
    // Emergency Steps
    emergDetails: "Please briefly describe your symptoms (e.g., severe pain, swelling, bleeding, broken tooth):",
    emergContact: "Please provide your phone number so our medical team can contact you immediately:",

    // WhatsApp Steps
    waName: "For WhatsApp registration, what is your full name?",
    waPhone: "What is your phone number?",
    waTreat: "Which treatment are you interested in?",
    waTime: "What is your preferred appointment time? (e.g. Tomorrow Afternoon)"
  },
  hi: {
    greeting: "नमस्ते! मैं DentalAI हूँ, Apex Dental Care में आपकी वर्चुअल रिसेप्शनिस्ट। आज मैं आपकी क्या सहायता कर सकता हूँ?",
    ending: "क्या मैं आज आपकी किसी और चीज़ में मदद कर सकता हूँ, या क्या आप हमारे दंत चिकित्सकों में से किसी के साथ अपॉइंटमेंट शेड्यूल करना चाहेंगे?",
    invalidPhone: "कृपया 10 अंकों का एक मान्य फ़ोन नंबर दर्ज करें।",
    invalidEmail: "कृपया एक मान्य ईमेल पता दर्ज करें।",
    invalidDate: "कृपया एक मान्य भविष्य की तारीख (YYYY-MM-DD) दर्ज करें।",
    invalidTime: "कृपया एक मान्य समय (HH:MM) दर्ज करें।",
    confirmBooking: "धन्यवाद! मैंने आपका अपॉइंटमेंट अनुरोध दर्ज कर लिया है। आपके लिए इसका सारांश:\n\nनाम: {name}\nफ़ोन: {phone}\nईमेल: {email}\nतारीख: {date}\nसमय: {time}\nइलाज: {treatment}\nस्थिति: {status}\n\nहमारी रिसेप्शनिस्ट जल्द ही स्लॉट की पुष्टि के लिए आपसे संपर्क करेगी। 🦷",
    handoffMsg: "मैं आपको हमारी टीम के एक सदस्य से जोड़ता हूँ जो आगे आपकी सहायता कर सकता है।",
    emergencyWarn: "⚠️ महत्वपूर्ण: यह एक डेंटल इमरजेंसी (आपातकाल) लग रहा है। कृपया तुरंत डॉक्टर से जांच कराएं। हम आपका संपर्क विवरण एकत्र कर लेते हैं ताकि हमारी टीम आपको तुरंत कॉल कर सके।",
    emergencyEscalation: "🚨 इमरजेंसी अलर्ट: हमने आपका विवरण हमारे ऑन-कॉल डेंटिस्ट को भेज दिया है। हमारी टीम का एक सदस्य अगले 15 मिनट में आपको कॉल करेगा। यदि समस्या गंभीर है, तो कृपया नजदीकी अस्पताल के आपातकालीन कक्ष में जाएं।",
    whatsappHeading: "WhatsApp लीड चेक-इन चुनने के लिए धन्यवाद। यहाँ आपका CRM कार्ड है:",
    
    askName: "कृपया मुझे अपना पूरा नाम बताएं?",
    askPhone: "बहुत बढ़िया, आपका फ़ोन नंबर क्या है?",
    askEmail: "आपका ईमेल पता क्या है?",
    askDate: "आप किस तारीख को आना चाहेंगे? (जैसे: 2026-06-15)",
    askTime: "आपका पसंदीदा समय क्या है? (जैसे: सुबह 11:30)",
    askTreatment: "आप किस इलाज में रुचि रखते हैं?",
    askStatus: "क्या आप पहले हमारे पास आ चुके हैं? क्या आप एक नए (New) या पुराने (Existing) मरीज हैं?",
    
    leadTreat: "आप किस इलाज में रुचि रखते हैं?",
    leadWhen: "आप इलाज कब शुरू करना चाहेंगे? (जैसे: तुरंत, 1 महीने के भीतर, केवल जानकारी चाहिए)",
    leadVisited: "क्या आप पहले हमारे पास आ चुके हैं?",
    leadUrgency: "आपकी चिंता कितनी गंभीर है? (जैसे: कम, मध्यम, गंभीर दर्द)",
    
    emergDetails: "कृपया संक्षेप में अपने लक्षणों का वर्णन करें (जैसे, गंभीर दर्द, सूजन, रक्तस्राव, टूटा हुआ दांत):",
    emergContact: "कृपया अपना फ़ोन नंबर प्रदान करें ताकि हमारी मेडिकल टीम आपसे तुरंत संपर्क कर सके:",

    waName: "WhatsApp पंजीकरण के लिए, आपका पूरा नाम क्या है?",
    waPhone: "आपका फ़ोन नंबर क्या है?",
    waTreat: "आप किस इलाज में रुचि रखते हैं?",
    waTime: "आपका पसंदीदा अपॉइंटमेंट समय क्या है? (जैसे: कल दोपहर)"
  },
  mr: {
    greeting: "नमस्कार! मी DentalAI आहे, Apex Dental Care मधील आपली व्हर्च्युअल रिसेप्शनिस्ट. आज मी आपली काय मदत करू शकते?",
    ending: "आज मी तुम्हाला आणखी काही मदत करू शकते का, किंवा तुम्हाला आमच्या डॉक्टरांसोबत अपॉइंटमेंट शेड्यूल करायची आहे का?",
    invalidPhone: "कृपया वैध १० अंकी फोन नंबर प्रविष्ट करा.",
    invalidEmail: "कृपया वैध ईमेल पत्ता प्रविष्ट करा.",
    invalidDate: "कृपया भविष्यातील वैध तारीख (YYYY-MM-DD) प्रविष्ट करा.",
    invalidTime: "कृपया वैध वेळ (HH:MM) प्रविष्ट करा.",
    confirmBooking: "धन्यवाद! मी तुमची अपॉइंटमेंट नोंदवून घेतली आहे. त्याचा सारांश खालीलप्रमाणे आहे:\n\nनाव: {name}\nफोन: {phone}\nईमेल: {email}\nतारीख: {date}\nवेळ: {time}\nउपचार: {treatment}\nस्थिती: {status}\n\nआमचे रिसेप्शनिस्ट लवकरच स्लॉट निश्चित करण्यासाठी तुमच्याशी संपर्क साधतील. 🦷",
    handoffMsg: "मी तुम्हाला आमच्या टीममधील सदस्याशी कनेक्ट करतो जो तुम्हाला पुढील मदत करू शकेल.",
    emergencyWarn: "⚠️ महत्त्वाचे: ही दातांची आपत्कालीन (इमर्जन्सी) परिस्थिती दिसते. कृपया त्वरित तपासणी करा. आम्ही तुमची संपर्क माहिती गोळा करतो जेणेकरून आमची टीम तुम्हाला लगेच कॉल करू शकेल.",
    emergencyEscalation: "🚨 इमर्जन्सी अलर्ट: आम्ही तुमचे तपशील आमच्या ऑन-कॉल डेंटिस्टकडे पाठवले आहेत. आमचे प्रतिनिधी पुढील १५ मिनिटांत तुम्हाला कॉल करतील. समस्या जास्त गंभीर असल्यास कृपया जवळच्या हॉस्पिटलच्या इमर्जन्सी रूमला भेट द्या.",
    whatsappHeading: "WhatsApp लीड चेक-इन निवडल्याबद्दल धन्यवाद. येथे तुमचे CRM कार्ड आहे:",
    
    askName: "कृपया तुमचे पूर्ण नाव सांगा?",
    askPhone: "छान, तुमचा फोन नंबर काय आहे?",
    askEmail: "तुमचा ईमेल आयडी काय आहे?",
    askDate: "तुम्हाला कोणत्या तारखेला भेट द्यायला आवडेल? (उदा. 2026-06-15)",
    askTime: "तुमची पसंतीची वेळ कोणती आहे? (उदा. सकाळी ११:३०)",
    askTreatment: "तुम्हाला कोणत्या उपचारांमध्ये रस आहे?",
    askStatus: "तुम्ही आधी आमच्या क्लिनिकला भेट दिली आहे का? तुम्ही नवीन (New) आहात की जुने (Existing) रुग्ण आहात?",
    
    leadTreat: "तुम्हाला कोणत्या उपचारांमध्ये रस आहे?",
    leadWhen: "तुम्हाला उपचार केव्हा हवे आहेत? (उदा. त्वरित, १ महिन्याच्या आत, फक्त चौकशी)",
    leadVisited: "तुम्ही आधी आमच्या क्लिनिकला भेट दिली आहे का?",
    leadUrgency: "तुमची समस्या किती गंभीर आहे? (उदा. कमी, मध्यम, तीव्र वेदना)",
    
    emergDetails: "कृपया तुमच्या लक्षणांचे थोडक्यात वर्णन करा (उदा., तीव्र वेदना, सूज, रक्तस्त्राव, तुटलेला दात):",
    emergContact: "कृपया तुमचा फोन नंबर द्या जेणेकरून आमची वैद्यकीय टीम तुमच्याशी त्वरित संपर्क साधू शकेल:",

    waName: "WhatsApp नोंदणीसाठी, तुमचे पूर्ण नाव काय आहे?",
    waPhone: "तुमचा फोन नंबर काय आहे?",
    waTreat: "तुम्हाला कोणत्या उपचारांमध्ये रस आहे?",
    waTime: "तुमची पसंतीची अपॉइंटमेंट वेळ कोणती आहे? (उदा. उद्या दुपार)"
  }
};

// FAQ Knowledge base with multilingual responses
const FAQ_KNOWLEDGE = {
  hours: {
    en: "Apex Dental Care is open Monday to Saturday, from 9:00 AM to 8:00 PM. We are closed on Sundays except for pre-scheduled emergencies.",
    hi: "Apex Dental Care सोमवार से शनिवार, सुबह 9:00 बजे से रात 8:00 बजे तक खुला रहता है। रविवार को क्लिनिक बंद रहता है, केवल पहले से तय आपातकालीन मामलों को छोड़कर।",
    mr: "Apex Dental Care सोमवार ते शनिवार, सकाळी ९:०० ते रात्री ८:०० या वेळेत उघडे असते. रविवार क्लिनिक बंद असते, फक्त आधी ठरवलेल्या आणीबाणीच्या प्रकरणांशिवाय."
  },
  location: {
    en: "We are located at Ground Floor, Zenith Plaza, Bandra West, Mumbai, MH - 400050. Valet parking is available for patients.",
    hi: "हम ग्राउंड फ्लोर, जेनिथ प्लाजा, बांद्रा वेस्ट, मुंबई, MH - 400050 पर स्थित हैं। मरीजों के लिए वैलेट पार्किंग की सुविधा उपलब्ध है।",
    mr: "आम्ही ग्राउंड फ्लोअर, जेनिथ प्लाझा, वांद्रे पश्चिम, मुंबई, MH - 400050 येथे आहोत. रुग्णांसाठी व्हॅले पार्किंगची सोय उपलब्ध आहे."
  },
  parking: {
    en: "Yes, we provide complimentary valet parking for all our dental patients directly in front of Zenith Plaza.",
    hi: "हाँ, हम जेनिथ प्लाजा के ठीक सामने हमारे सभी डेंटल मरीजों के लिए मानार्थ वैलेट पार्किंग प्रदान करते हैं।",
    mr: "होय, आम्ही जेनिथ प्लाझाच्या समोर आमच्या सर्व रुग्णांसाठी मोफत व्हॅले पार्किंगची सोय देतो."
  },
  insurance: {
    en: "We accept all major corporate health insurances, including Star Health, Niva Bupa, HDFC Ergo, and ICICI Lombard. Cashless facility is available for pre-approved treatments.",
    hi: "हम स्टार हेल्थ, निवा बूपा, एचडीएफसी एर्गो और आईसीआईसीआई लोम्बार्ड सहित सभी प्रमुख स्वास्थ्य बीमा स्वीकार करते हैं। पूर्व-स्वीकृत उपचारों के लिए कैशलेस सुविधा उपलब्ध है।",
    mr: "आम्ही स्टार हेल्थ, निव्हा बुपा, एचडीएफसी एर्गो आणि आयसीआयसीआय लोम्बार्ड यांसह सर्व प्रमुख आरोग्य विमा स्वीकारतो. मंजूर उपचारांसाठी कॅशलेस सुविधा उपलब्ध आहे."
  },
  payments: {
    en: "We accept Cash, major Credit/Debit Cards, UPI (Google Pay, PhonePe, Paytm), and Net Banking. We also offer interest-free EMI options.",
    hi: "हम नकद, प्रमुख क्रेडिट/डेबिट कार्ड, यूपीआई (गूगल पे, फोनपे, पेटीएम) और नेट बैंकिंग स्वीकार करते हैं। हम ब्याज मुक्त ईएमआई विकल्प भी प्रदान करते हैं।",
    mr: "आम्ही रोख, प्रमुख क्रेडिट/डेबिट कार्ड, यूपीआय (गुगल पे, फोनपे, पेटीएम) आणि नेट बँकिंग स्वीकारतो. आम्ही व्याजमुक्त ईएमआई पर्याय देखील ऑफर करतो."
  },
  financing: {
    en: "We offer 0% Interest EMI options for up to 12 months on billing amounts above ₹15,000 via Bajaj Finserv and partner credit cards.",
    hi: "हम बजाज फिनसर्व और पार्टनर क्रेडिट कार्ड के माध्यम से ₹15,000 से अधिक के बिलिंग राशि पर 12 महीने तक के लिए 0% ब्याज ईएमआई विकल्प प्रदान करते हैं।",
    mr: "आम्ही बजाज फिनसर्व्ह आणि भागीदार क्रेडिट कार्डद्वारे ₹१५,००० पेक्षा जास्त बिलावर १२ महिन्यांपर्यंत ०% व्याज ईएमआय पर्याय देतो."
  },
  languages: {
    en: "For your comfort, our dentists and clinic staff speak fluent English, Hindi, and Marathi.",
    hi: "आपकी सुविधा के लिए, हमारे दंत चिकित्सक और क्लिनिक कर्मचारी धाराप्रवाह अंग्रेजी, हिंदी और मराठी बोलते हैं।",
    mr: "तुमच्या सोयीसाठी, आमचे डॉक्टर आणि क्लिनिक कर्मचारी इंग्रजी, हिंदी आणि मराठी अस्खलितपणे बोलतात."
  },
  qualifications: {
    en: "Our clinic houses MDS specialist surgeons, including certified Implantologists (ICOI USA), Orthodontists, and Aesthetic Smiles designers with over 12 years of clinical experience.",
    hi: "हमारे क्लिनिक में एमडीएस विशेषज्ञ सर्जन हैं, जिनमें प्रमाणित इम्प्लांटोलॉजिस्ट (ICOI USA), ऑर्थोडॉन्टिस्ट और एस्थेटिक स्माइल डिजाइनर शामिल हैं, जिन्हें 12 से अधिक वर्षों का क्लिनिकल अनुभव है।",
    mr: "आमच्या क्लिनिकमध्ये MDS तज्ज्ञ शल्यचिकित्सक आहेत, ज्यात प्रमाणित इम्प्लांटोलॉजिस्ट (ICOI USA), ऑर्थोडॉन्टिस्ट आणि एस्थेटिक स्माइल डिझायनर आहेत ज्यांना १२ वर्षांपेक्षा जास्त क्लिनिकल अनुभव आहे."
  },
  availability: {
    en: "We operate on scheduled appointments. However, we keep dedicated slots open daily for urgent walk-ins and emergencies.",
    hi: "हम निर्धारित नियुक्तियों पर काम करते हैं। हालाँकि, हम तत्काल आने वाले मरीजों और आपातकालीन स्थितियों के लिए दैनिक समर्पित स्लॉट खुले रखते हैं।",
    mr: "आम्ही नियोजित भेटींवर काम करतो. तथापि, आम्ही तातडीच्या आणि आपत्कालीन रुग्णांसाठी दररोज राखीव वेळ खुली ठेवतो."
  }
};

const TREATMENT_INFO = {
  "Dental Cleaning": {
    price: "₹1,500",
    en: "Purpose: Remove plaque, stains, and tartar buildup.\nBenefits: Prevents gum disease, cavity formation, and eliminates bad breath.\nProcedure: Gentle scaling, polishing, and fluoride application. Takes 30-45 minutes. A consultation is required for exact pricing.",
    hi: "उद्देश्य: प्लाक, दाग और टार्टर को हटाना।\nलाभ: मसूड़ों की बीमारी, कैविटी से बचाव और मुंह की दुर्गंध दूर करना।\nप्रक्रिया: जेंटल स्केलिंग, पॉलिशिंग और फ्लोराइड। समय: 30-45 मिनट। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: प्लाक, डाग आणि टार्टर काढणे.\nफायदे: हिरड्यांचे आजार, किडण्यापासून बचाव आणि तोंडाचा वास दूर करणे.\nप्रक्रिया: जेंटल स्केलिंग, पॉलिशिंग आणि फ्लोराईड. वेळ: ३०-४५ मिनिटे. अचूक किंमतीसाठी डॉक्टरांचा सल्ला आवश्यक आहे."
  },
  "Teeth Whitening": {
    price: "₹6,000",
    en: "Purpose: Lighten the shade of natural teeth.\nBenefits: Instantly boosts smile brightness (up to 8 shades) and eliminates deep food/tobacco stains.\nProcedure: Professional application of whitening gel activated by specialized laser light. Safe, effective, completed in 45 minutes. A consultation is required for exact pricing.",
    hi: "उद्देश्य: दांतों का रंग गोरा करना।\nलाभ: मुस्कान को तुरंत चमकाए (8 शेड तक) और भोजन/तंबाकू के गहरे दागों को खत्म करे।\nप्रक्रिया: लेजर लाइट द्वारा एक्टिवेटेड वाइटनिंग जेल लगाना। सुरक्षित और प्रभावी, 45 मिनट में पूरा। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: दातांचा रंग उजळणे.\nफायदे: स्मितहास्य लगेच उजळते (८ शेड्सपर्यंत) आणि डाग काढून टाकते.\nप्रक्रिया: लेझर लाईटद्वारे एक्टिव्हेटेड व्हाइटनिंग जेल लावणे. सुरक्षित आणि प्रभावी, ४५ मिनिटांत पूर्ण. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Invisalign": {
    price: "₹1,20,000",
    isPremium: true,
    en: "Purpose: Straighten crooked, crowded teeth or correct bite issues.\nBenefits: Virtually invisible, highly comfortable, removable, custom 3D-mapped aligners. No painful wires or dietary restrictions.\nProcedure: Digital scanning, custom-fabricated aligner trays changed weekly. Perfect for professionals! A consultation is required for exact pricing. Would you like to book a free digital scan appointment?",
    hi: "उद्देश्य: टेढ़े-मेढ़े, भीड़भाड़ वाले दांतों को सीधा करना या बाइट को ठीक करना।\nलाभ: लगभग अदृश्य, अत्यधिक आरामदायक, हटाने योग्य, कस्टम 3D अलाइनर। कोई दर्दनाक तार या खाने-पीने पर रोक नहीं।\nप्रक्रिया: डिजिटल स्कैनिंग, साप्ताहिक रूप से बदले जाने वाले कस्टम अलाइनर ट्रे। कामकाजी पेशेवरों के लिए उत्तम! सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: वाकडे-तिकडे दात सरळ करणे किंवा बाइट सुधारणे.\nफायदे: जवळजवळ अदृश्य, अत्यंत सोयीस्कर, काढता येण्याजोगे, ३डी अलाइनर. कोणतीही वेदनादायक वायर किंवा खाण्यावर बंदी नाही.\nप्रक्रिया: डिजिटल स्कॅनिंग, साप्ताहिक बदलल्या जाणाऱ्या ट्रे. नोकरदारांसाठी उत्तम! अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Dental Implants": {
    price: "₹35,000",
    isPremium: true,
    en: "Purpose: Permanent replacement of missing teeth.\nBenefits: Restores 100% chewing function, prevents jawbone loss, looks and feels exactly like natural teeth, highly durable.\nProcedure: Surgical placement of a titanium root post, followed by healing and custom crown placement. Lifetime warranty on implants. A consultation is required for exact pricing. Would you like to book an implant consultation?",
    hi: "उद्देश्य: लापता दांतों का स्थायी प्रतिस्थापन।\nलाभ: 100% चबाने की क्षमता बहाल करे, जबड़े की हड्डी के नुकसान को रोके, प्राकृतिक दांतों की तरह दिखे और महसूस हो, अत्यधिक टिकाऊ।\nप्रक्रिया: टाइटेनियम रूट पोस्ट का सर्जिकल प्लेसमेंट, उसके बाद हीलिंग और कस्टम क्राउन। लाइफटाइम वारंटी। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: गमावलेल्या दातांची कायमस्वरूपी जागा घेणे.\nफायदे: १००% चावण्याची क्षमता परत मिळते, जबड्याचे हाड झिजण्यापासून रोखते, नैसर्गिक दातासारखे दिसते, अत्यंत टिकाऊ.\nप्रक्रिया: सर्जिकल पद्धतीने टायटॅनियम पोस्ट बसवणे, त्यानंतर हिलिंग आणि क्राउन. लाइफटाइम वॉरंटी. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Braces": {
    price: "₹40,000",
    en: "Purpose: Orthodontic correction of teeth alignment.\nBenefits: Highly effective for severe bite alignment and skeletal issues, suitable for all ages.\nProcedure: Bonding ceramic or metal brackets to teeth, periodic tightening, followed by retainers. A consultation is required for exact pricing. Would you like to book an orthodontic evaluation?",
    hi: "उद्देश्य: दांतों के संरेखण का ऑर्थोडॉन्टिक सुधार।\nलाभ: गंभीर बाइट संरेखण और समस्याओं के लिए अत्यधिक प्रभावी, सभी उम्र के लिए उपयुक्त।\nप्रक्रिया: दांतों पर सिरेमिक या मेटल ब्रैकेट लगाना, समय-समय पर टाइट करना। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: दातांचे संरेखन सुधारणे.\nफायदे: तीव्र बाइट संरेखन आणि जबड्याच्या समस्यांसाठी अत्यंत प्रभावी, सर्व वयोगटांसाठी योग्य.\nप्रक्रिया: दातांवर सिरॅमिक किंवा मेटल ब्रॅकेट जोडणे, वेळोवेळी टाइट करणे. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Root Canal Treatment": {
    price: "₹4,500",
    en: "Purpose: Save a severely decayed or infected tooth.\nBenefits: Relieves intense toothache, halts spread of infection, prevents tooth extraction.\nProcedure: Cleaning infected nerve tissue from root canals, disinfecting, filling, and placing a protective crown. Done under painless local anesthesia in 1-2 visits. A consultation is required for exact pricing. Would you like to book a consultation?",
    hi: "उद्देश्य: गंभीर रूप से सड़े या संक्रमित दांत को बचाना।\nलाभ: तीव्र दांत दर्द से राहत, संक्रमण के फैलाव को रोकना, दांत निकालने से बचाव।\nप्रक्रिया: संक्रमित तंत्रिका ऊतक को हटाना, कीटाणुशोधन, फिलिंग और एक सुरक्षात्मक क्राउन लगाना। 1-2 मुलाक़ातों में दर्द रहित लोकल एनेस्थीसिया के तहत। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: गंभीर किडलेला किंवा संसर्ग झालेला दात वाचवणे.\nफायदे: तीव्र दातदुखीपासून आराम, संसर्ग पसरण्यापासून रोखणे, दात काढण्यापासून बचाव.\nप्रक्रिया: संसर्ग झालेली नस साफ करणे, जंतुनाशक भरणे आणि संरक्षणात्मक क्राउन बसवणे. १-२ भेटींमध्ये पूर्ण. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Wisdom Tooth Extraction": {
    price: "₹5,000",
    en: "Purpose: Removal of impacted or painful wisdom teeth.\nBenefits: Stops swelling, pain, prevents crowding and decay in adjacent healthy teeth.\nProcedure: Local anesthesia, gentle bone contouring if needed, extraction, and suturing. Fast recovery within 3-5 days. A consultation is required for exact pricing.",
    hi: "उद्देश्य: प्रभावित या दर्दनाक ज्ञान दांत (अकल दाढ़) को निकालना।\nलाभ: सूजन और दर्द को रोकता है, आसपास के स्वस्थ दांतों में सड़न से बचाता है।\nप्रक्रिया: लोकल एनेस्थीसिया, जेंटल एक्सट्रैक्शन और टांके लगाना। 3-5 दिनों में तेजी से रिकवरी। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: त्रासदायक अक्कलदाढ काढून टाकणे.\nफायदे: सूज आणि वेदना थांबवते, शेजारील निरोगी दातांमधील किडणे टाळते.\nप्रक्रिया: लोकल ऍनेस्थेसिया, सौम्य एक्सट्रॅक्शन आणि टाके घालणे. ३-५ दिवसांत जलद रिकव्हरी. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Veneers": {
    price: "₹12,000 per tooth",
    isPremium: true,
    en: "Purpose: Cosmetic enhancement of front teeth.\nBenefits: Corrects discolored, chipped, gapped, or slightly crooked teeth. Stunning natural aesthetic finish, stain-resistant.\nProcedure: Minimal tooth prep, custom porcelain shell fabrication, and bonding. Instant smile makeover! A consultation is required for exact pricing. Would you like to schedule a smile makeover consultation?",
    hi: "उद्देश्य: सामने के दांतों का सौंदर्य निखारना।\nलाभ: बदरंग, टूटे हुए, अंतराल या थोड़े टेढ़े दांतों को ठीक करता है। शानदार प्राकृतिक चमक, दाग-प्रतिरोधी।\nप्रक्रिया: न्यूनतम तैयारी, कस्टम चीनी मिट्टी के लिबास का निर्माण और बॉन्डिंग। इंस्टेंट स्माइल मेकओवर! सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: समोरील दातांचे सौंदर्य सुधारणे.\nफायदे: रंगहीन, तुटलेले किंवा थोडे वाकडे दात दुरुस्त करणे. नैसर्गिक चमक मिळते. डाग-प्रतिरोधक.\nप्रक्रिया: कमीत कमी दात घासणे, कस्टम पोर्सिलेन शेल बनवणे आणि बाँडिंग. त्वरित स्माइल मेकओवर! अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Dentures": {
    price: "₹15,000",
    en: "Purpose: Replace multiple missing teeth with a removable appliance.\nBenefits: Restores chewing ability, supports facial muscles, natural-looking smile, cost-effective.\nProcedure: Impressions, custom design of acrylic or flexible cobalt-chromium denture frames, trial fitting, and delivery. A consultation is required for exact pricing.",
    hi: "उद्देश्य: हटाने योग्य उपकरण से लापता दांतों को बदलना।\nलाभ: चबाने की क्षमता बहाल करे, चेहरे की मांसपेशियों को सहारा दे, किफायती और प्राकृतिक मुस्कान।\nप्रक्रिया: इम्प्रेशंस, ऐक्रेलिक या लचीले कोबाल्ट-क्रोमियम फ्रेम का कस्टम डिज़ाइन, ट्रायल फिटिंग। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: काढता येण्याजोग्या उपकरणाने गमावलेले दात बदलणे.\nफायदे: चावण्याची क्षमता परत मिळते, चेहऱ्याच्या स्नायूंना आधार मिळतो, नैसर्गिक हास्य, परवडणारे.\nप्रक्रिया: इम्प्रेशन्स, ऍक्रेलिक किंवा लवचिक फ्रेमचे सानुकूल डिझाइन, ट्रायल फिटिंग आणि डिलिव्हरी. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Pediatric Dentistry": {
    price: "₹1,200",
    en: "Purpose: Dental care and cavity prevention for infants and children.\nBenefits: Habit breaking guides, fluoride protective sealants, cavity-free childhood, child-friendly specialists.\nProcedure: Non-invasive cleanings, fillings, space maintainers, and gentle advice in a playful setting. A consultation is required for exact pricing.",
    hi: "उद्देश्य: शिशुओं और बच्चों के लिए दंत चिकित्सा और कैविटी की रोकथाम।\nलाभ: बुरी आदतें छुड़ाने के निर्देश, फ्लोराइड प्रोटेक्टिव सीलेंट, कैविटी-मुक्त बचपन, अनुकूल माहौल।\nप्रक्रिया: गैर-आक्रामक सफाई, फिलिंग और चंचल वातावरण में कोमल सलाह। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: लहान मुलांचे दात निरोगी ठेवणे आणि किडण्यापासून रोखणे.\nफायदे: सवयी सुधारणे, फ्लोराईड सीलंट, किडमुक्त बालपण, अनुकूल विशेषज्ञ.\nप्रक्रिया: साधी स्वच्छता, फिलिंग आणि खेळकर वातावरणात दिलेला सल्ला. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Gum Treatment": {
    price: "₹3,000",
    en: "Purpose: Treatment of swelling, bleeding, or receding gums.\nBenefits: Stops bleeding gums, cures bad breath, prevents loose teeth and tooth loss.\nProcedure: Deep root scaling, antibiotic therapy, or laser curettage. A consultation is required for exact pricing.",
    hi: "उद्देश्य: मसूड़ों की सूजन, रक्तस्राव या मसूड़ों के सिकुड़ने का इलाज।\nलाभ: मसूड़ों से खून आना बंद करे, मुंह की दुर्गंध ठीक करे, दांतों को हिलने या गिरने से बचाए।\nप्रक्रिया: डीप रूट स्केलिंग, एंटीबायोटिक थेरेपी या लेजर क्यूरेटेज। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: हिरड्यांची सूज, रक्तस्त्राव किंवा हिरड्या कमी होण्यावर उपचार.\nफायदे: हिरड्यांमधून रक्त येणे थांबवणे, श्वासाची दुर्गंधी दूर करणे, दात हलण्यापासून रोखणे.\nप्रक्रिया: डीप रूट स्केलिंग, अँटीबायोटिक थेरेपी किंवा लेझर उपचार. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Cosmetic Dentistry": {
    price: "₹10,000",
    isPremium: true,
    en: "Purpose: Holistic enhancement of smile aesthetics.\nBenefits: Corrects tooth alignment, chips, gaps, gummy smiles, and shade flaws simultaneously. Dramatically boosts self-confidence.\nProcedure: Customized treatment plans combining veneers, crowns, bleaching, and gingival shaping. A consultation is required for exact pricing. Would you like to schedule a smile design consultation?",
    hi: "उद्देश्य: मुस्कान के सौंदर्य को समग्र रूप से बढ़ाना।\nलाभ: दांतों के संरेखण, चिप्स, अंतराल, मसूड़ों की मुस्कान को एक साथ ठीक करे। आत्मविश्वास बढ़ाता है।\nप्रक्रिया: विभिन्न उपचारों का अनुकूलित संयोजन। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: स्माईलचे सौंदर्य वाढवणे.\nफायदे: दात सरळ करणे, गॅप्स भरणे, दातांचे डाग घालवणे या सर्व गोष्टी एकाच वेळी होतात. आत्मविश्वास वाढतो.\nप्रक्रिया: विविध उपचारांचे एकत्र नियोजन. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  },
  "Dental Crowns": {
    price: "₹4,500",
    en: "Purpose: Cap a broken or root-canal-treated tooth.\nBenefits: Restores full biting strength, protects tooth against fractures, matches natural tooth appearance.\nProcedure: Tooth preparation, digital scan, milling of zirconia or ceramic crowns, and permanent cementation. A consultation is required for exact pricing.",
    hi: "उद्देश्य: टूटे हुए या आरसीटी किए हुए दांत को कवर करना।\nलाभ: चबाने की पूरी ताकत वापस लाए, फ्रैक्चर से बचाए, प्राकृतिक दांत जैसा दिखे।\nप्रक्रिया: दांत की तैयारी, डिजिटल स्कैन, जिरकोनिया या सिरेमिक क्राउन लगाना। सटीक मूल्य निर्धारण के लिए डॉक्टर से परामर्श आवश्यक है।",
    mr: "उद्देश्य: तुटलेल्या किंवा आरसीटी केलेल्या दाताला कव्हर करणे.\nफायदे: चावण्याची ताकद वाढवते, दात तुटण्यापासून वाचवते, नैसर्गिक दातासारखा लूक.\nप्रक्रिया: दात घासणे, डिजिटल स्कॅन, झिरकोनिया किंवा सिरॅमिक क्राउन बसवणे. अचूक किंमतीसाठी सल्ला आवश्यक आहे."
  }
};

const GEMINI_SYSTEM_INSTRUCTION = `You are DentalAI, the intelligent virtual receptionist and empathetic patient care assistant for Apex Dental Care.

PRIMARY OBJECTIVE:
Qualify leads, encourage appointment bookings, address pricing questions, triage emergencies, and answer general FAQs.

PERSONALITY:
- Warm, polite, empathetic (especially to patients expressing fear/pain).
- Clear, concise, professional.
- Never diagnose medical conditions, prescribe drugs, or guarantee treatment outcomes. Always emphasize that exact clinical evaluations are required in person by a licensed dentist.

CLINIC INFORMATION:
- Location: Ground Floor, Zenith Plaza, Bandra West, Mumbai, MH - 400050.
- Phone: +91 98765 43210 (24/7 Emergency Line).
- Hours: Mon-Sat, 9:00 AM - 8:00 PM. Closed on Sundays.
- Parking: Complimentary valet parking right in front of Zenith Plaza.
- Payment Options: Cash, Credit/Debit cards, UPI (GPay/PhonePe), Net Banking, 0% Interest EMI for up to 12 months (Bajaj Finserv, credit cards) for bills > ₹15,000.
- Insurance Accepted: Cashless facilities for Star Health, Niva Bupa, HDFC Ergo, ICICI Lombard.
- Dentists: MDS specialists with 10+ years experience, including certified Implantologists (ICOI USA) and Smile Design specialists.
- Languages spoken: English, Hindi, Marathi. Respond in the language used by the patient.

TREATMENTS & ESTIMATED STARTING PRICES:
- Dental Cleaning: ₹1,500 (plaque removal, prophylaxis)
- Teeth Whitening: ₹6,000 (laser whitening, up to 8 shades)
- Invisalign Clear Aligners: ₹1,20,000 (removable aligners, ideal for professionals)
- Dental Implants: ₹35,000 (titanium screw, crown replacement)
- Orthodontic Braces: ₹40,000 (traditional braces)
- Root Canal Treatment (RCT): ₹4,500 (infection removal, local anesthesia)
- Wisdom Tooth Extraction: ₹5,000 (surgical/non-surgical extraction)
- Porcelain Veneers: ₹12,000 per tooth (Hollywood Smile makeovers)
- Dentures: ₹15,000 (removable full/partial)
- Gum Treatment: ₹3,000 (scaling/root planing)
- Pediatric Dentistry: ₹1,200 (child checkups, sealants)
- Dental Crowns: ₹4,500 (protective cap)
- Cosmetic Smile Makeover: Custom plans (combining RCT, crowns, veneers).
* NOTE: Always state that a consultation is required for exact pricing.

SPECIAL SALES INSTRUCTIONS:
- If discussing Implants, Invisalign, Veneers, or Smile Makeovers, highlight their durability/aesthetics and encourage scheduling a consult.

OBJECTION HANDLING:
- Too expensive: Highlight flexible payment plans/consult options.
- Need to think: Offer to temporarily reserve a tentative slot.
- Fear of dentist: Explain gentle, pain-free dentistry and sedation options.

EMERGENCY PROTOCOL:
- If the patient mentions bleeding, swelling, trauma, knocked-out tooth, or severe pain, recommend urgent evaluation, provide emergency phone, and transition to triage.

CRITICAL INSTRUCTION: ROUTER COMMAND TAGS
At the end of your response, you MUST append a specific command tag in brackets if the patient demonstrates specific intents:
- If the patient wants to book or schedule an appointment, or responds 'Yes' to a booking proposal: Append "[TRIGGER_BOOKING]" at the very end of your response.
- If the patient describes an emergency (trauma, severe pain, swelling, bleeding): Append "[TRIGGER_EMERGENCY]" at the very end.
- If the patient requests a WhatsApp check-in or WhatsApp lead options: Append "[TRIGGER_WHATSAPP]" at the very end.
- If the patient demands a human receptionist, doctor, staff, or is making a complaint: Append "[TRIGGER_HANDOFF]" at the very end.
- Otherwise, do NOT append any tag. Just reply normally.`;

// Chat Engine Instance Class
class ChatbotEngine {
  constructor() {
    this.lang = 'en';
    this.state = BOT_STATES.IDLE;
    this.tempData = {};
    this.chatHistory = []; // Current session messages for handoff
    this.activeSessionId = this.generateSessionId();
    
    // Default suggestion chips
    this.defaultChips = {
      en: ["📅 Book Appointment", "🚨 Dental Emergency", "🦷 Treatments & Prices", "💬 WhatsApp Check-in", "❓ Ask a Question"],
      hi: ["📅 अपॉइंटमेंट बुक करें", "🚨 डेंटल इमरजेंसी", "🦷 इलाज और कीमतें", "💬 WhatsApp चेक-इन", "❓ एक सवाल पूछें"],
      mr: ["📅 अपॉइंटमेंट बुक करा", "🚨 डेंटल इमर्जन्सी", "🦷 उपचार आणि किमती", "💬 WhatsApp चेक-इन", "❓ प्रश्न विचारा"]
    };
  }

  async askGemini(userInput) {
    const apiKey = window.decryptObfuscate ? window.decryptObfuscate(localStorage.getItem('gemini_api_key')) : localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      throw new Error("Gemini API Key is missing. Add it in settings.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Map this.chatHistory to Gemini format
    const rawHistory = this.chatHistory.map(msg => ({
      role: msg.sender === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    
    if (rawHistory.length === 0) {
      rawHistory.push({
        role: 'user',
        parts: [{ text: userInput }]
      });
    }

    // Merge consecutive same-role messages to comply with Gemini API requirements
    const mergedHistory = [];
    for (const msg of rawHistory) {
      if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === msg.role) {
        mergedHistory[mergedHistory.length - 1].parts[0].text += "\n" + msg.parts[0].text;
      } else {
        mergedHistory.push({
          role: msg.role,
          parts: [{ text: msg.parts[0].text }]
        });
      }
    }

    // Slice to keep last 6 messages of conversation context
    let contextHistory = mergedHistory.slice(-6);
    
    // Ensure the conversation starts with the 'user' role (required by Gemini API)
    while (contextHistory.length > 0 && contextHistory[0].role === 'model') {
      contextHistory.shift();
    }

    if (contextHistory.length === 0) {
      contextHistory.push({
        role: 'user',
        parts: [{ text: userInput }]
      });
    }

    const payload = {
      contents: contextHistory,
      systemInstruction: {
        parts: [{ text: compileSystemInstruction() }]
      },
      generationConfig: {
        temperature: 0.4
      }
    };

    if (window.logSystemEvent) {
      window.logSystemEvent('Gemini API Request', `Dispatched prompt context to Gemini API model`, payload);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error?.message || "Gemini API error";
      if (window.logSystemEvent) {
        window.logSystemEvent('Gemini API Error', `HTTP status: ${response.status}. Msg: ${errMsg}`, errData);
      }
      throw new Error(errMsg);
    }

    const resJson = await response.json();
    if (resJson.candidates && resJson.candidates[0].content && resJson.candidates[0].content.parts && resJson.candidates[0].content.parts[0]) {
      const responseText = resJson.candidates[0].content.parts[0].text;
      if (window.logSystemEvent) {
        window.logSystemEvent('Gemini API Response', `Successfully received generated text content`, { responseText });
      }
      return responseText;
    } else {
      if (window.logSystemEvent) {
        window.logSystemEvent('Gemini Response Empty', `Candidates array contains no generated content blocks`, resJson);
      }
      throw new Error("No response content from Gemini API.");
    }
  }

  generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9);
  }

  setLanguage(newLang) {
    if (DICTIONARY[newLang]) {
      this.lang = newLang;
      this.updateLanguageDropdownUI(newLang);
    }
  }

  updateLanguageDropdownUI(lang) {
    const select = document.getElementById('chat-language-select');
    if (select) select.value = lang;
  }

  // Get localized string
  t(key) {
    return DICTIONARY[this.lang][key] || DICTIONARY['en'][key] || key;
  }

  // Reset chatbot state
  resetState() {
    this.state = BOT_STATES.IDLE;
    this.tempData = {};
  }

  getTREATMENT_INFO() {
    const config = configService.getCurrentConfig() || { currency: '₹' };
    const treatments = treatmentService.getTreatmentsList() || [];
    
    const info = {};
    treatments.forEach(t => {
      info[t.name] = {
        price: formatCurrency(t.price, config.currency || '₹'),
        isPremium: t.featured === true || t.featured === 'true',
        en: t.description,
        hi: t.description,
        mr: t.description
      };
    });

    if (Object.keys(info).length === 0) {
      return TREATMENT_INFO;
    }
    return info;
  }

  getSpecialistsList() {
    const cid = configService.clinicId || 'default_clinic';
    const saved = localStorage.getItem(`specialists_${cid}`);
    if (saved) {
      try {
        const list = JSON.parse(saved);
        if (list && list.length > 0) return list;
      } catch(e) {}
    }
    // Return some default mock doctors if empty
    return [
      { name: "Dr. Aditi Sen", specialty: "Pediatric Dentist (MDS)", experience: "8 Years Exp", photo: "👩‍⚕️" },
      { name: "Dr. Rohan Kulkarni", specialty: "Implantologist (ICOI USA)", experience: "12 Years Exp", photo: "👨‍⚕️" }
    ];
  }

  // Initial bot message
  initGreeting() {
    this.resetState();
    const config = configService.getCurrentConfig();
    const clinicName = config ? config.clinicName : "Apex Dental Care";
    let greet = this.t('greeting');
    return greet.replace("Apex Dental Care", clinicName);
  }

  // Format current date
  formatTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Validations
  validatePhone(phone) {
    const clean = phone.replace(/[^0-9]/g, '');
    return clean.length === 10;
  }

  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  validateDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    return d >= today;
  }

  validateTime(timeStr) {
    // Basic validation for time format (HH:MM or HH:MM AM/PM)
    return timeStr.trim().length >= 4;
  }

  // Main processing logic
  async processUserMessage(userInput) {
    const cid = configService.clinicId || 'default_clinic';
    const takeoverActive = localStorage.getItem('chat_takeover_active_' + this.activeSessionId) === 'true';
    if (takeoverActive) {
      const handoffs = JSON.parse(localStorage.getItem(`handoffs_${cid}`) || '[]');
      const handIndex = handoffs.findIndex(h => h.sessionId === this.activeSessionId);
      let isTimedOut = false;
      if (handIndex !== -1) {
        const lastAct = handoffs[handIndex].lastActivity || Date.now();
        if (Date.now() - lastAct > 5 * 60 * 1000) {
          isTimedOut = true;
        }
      }
      if (isTimedOut) {
        localStorage.removeItem('chat_takeover_active_' + this.activeSessionId);
        if (handIndex !== -1) {
          handoffs[handIndex].status = 'Staff Attended';
          localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
          this.dispatchEvent('dataChanged');
          this.syncToGoogleSheets('attendHandoff', { id: handoffs[handIndex].id, status: 'Staff Attended' });
        }
        // Takeover has timed out; fall through to normal chatbot response
      } else {
        this.chatHistory.push({ sender: 'user', text: userInput, timestamp: this.formatTime() });
        if (handIndex !== -1) {
          handoffs[handIndex].transcript = this.chatHistory;
          handoffs[handIndex].status = 'Staff Takeover';
          handoffs[handIndex].lastActivity = Date.now();
          localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
          this.dispatchEvent('dataChanged');
          this.syncToGoogleSheets('addHandoff', handoffs[handIndex]);
        }
        return { reply: null, chips: [], isTakeover: true };
      }
    }

    // Log user message
    this.chatHistory.push({ sender: 'user', text: userInput, timestamp: this.formatTime() });
    
    const text = userInput.trim();
    const cleanTextLower = text.toLowerCase();
    
    // Offline Language Detection Fallback (inspect script characters)
    const DevanagariRegex = /[\u0900-\u097F]/;
    if (DevanagariRegex.test(text)) {
      const marathiKeywords = ["आहे", "आहेत", "नमस्कार", "माझे", "नाव", "माहिती", "किंमत", "पत्ता", "होय", "नाही", "नको"];
      const isMarathi = marathiKeywords.some(kw => cleanTextLower.includes(kw));
      this.setLanguage(isMarathi ? 'mr' : 'hi');
    } else {
      const englishKeywords = ["hello", "hi", "dentist", "appointment", "booking", "price", "treatment", "yes", "no"];
      const isEnglish = englishKeywords.some(kw => cleanTextLower.includes(kw));
      if (isEnglish) {
        this.setLanguage('en');
      }
    }

    // Global override for emergency keywords if not in a critical flow
    const emergencyKeywords = ["emergency", "severe pain", "swelling", "bleeding", "broken tooth", "knocked out", "trauma", "दांत दर्द", "रक्तस्राव", "सूजन", "दुखणे", "रक्त येणे", "सूज"];
    const isEmergKeyword = emergencyKeywords.some(kw => cleanTextLower.includes(kw));

    if (isEmergKeyword && this.state !== BOT_STATES.EMERGENCY_DETAILS && this.state !== BOT_STATES.EMERGENCY_CONTACT) {
      this.state = BOT_STATES.EMERGENCY_DETAILS;
      this.chatHistory.push({ sender: 'bot', text: this.t('emergencyWarn'), timestamp: this.formatTime() });
      return {
        reply: this.t('emergencyWarn'),
        chips: [],
        alert: true
      };
    }

    // --- GEMINI AI HYBRID ROUTER ---
    const aiEnabled = localStorage.getItem('gemini_ai_enabled') === 'true';
    const apiKey = window.decryptObfuscate ? window.decryptObfuscate(localStorage.getItem('gemini_api_key')) : localStorage.getItem('gemini_api_key');
    if (aiEnabled && apiKey && this.state === BOT_STATES.IDLE) {
      try {
        const reply = await this.askGemini(text);
        
        let finalReply = reply;
        
        // Parse Language tag: [LANG_EN], [LANG_HI], [LANG_MR]
        const langMatch = finalReply.match(/^\[(LANG_EN|LANG_HI|LANG_MR)\]\s*/i);
        if (langMatch) {
          const tag = langMatch[0];
          const langCode = langMatch[1].toLowerCase().replace('lang_', '');
          this.setLanguage(langCode);
          finalReply = finalReply.replace(tag, '');
        }

        let nextChips = this.defaultChips[this.lang];
        let alertHandoff = false;
        
        const cleanReply = finalReply.trim();
        const bookingRegex = /\[\s*TRIGGER_BOOKING\s*\]/i;
        const emergencyRegex = /\[\s*TRIGGER_EMERGENCY\s*\]/i;
        const whatsappRegex = /\[\s*TRIGGER_WHATSAPP\s*\]/i;
        const handoffRegex = /\[\s*TRIGGER_HANDOFF\s*\]/i;

        if (bookingRegex.test(cleanReply)) {
          finalReply = cleanReply.replace(bookingRegex, '').trim();
          this.state = BOT_STATES.BOOK_NAME;
          nextChips = [];
          finalReply += `\n\n**DentalAI**: ${this.t('askName')}`;
        } else if (emergencyRegex.test(cleanReply)) {
          finalReply = cleanReply.replace(emergencyRegex, '').trim();
          this.state = BOT_STATES.EMERGENCY_DETAILS;
          nextChips = ["Toothache", "Swollen Gums", "Bleeding", "Broken Tooth"];
          finalReply += `\n\n**DentalAI**: ${this.t('emergDetails')}`;
        } else if (whatsappRegex.test(cleanReply)) {
          finalReply = cleanReply.replace(whatsappRegex, '').trim();
          this.state = BOT_STATES.WA_NAME;
          nextChips = [];
          finalReply += `\n\n**DentalAI**: ${this.t('waName')}`;
        } else if (handoffRegex.test(cleanReply)) {
          finalReply = cleanReply.replace(handoffRegex, '').trim();
          this.triggerHandoff("AI Escalation: Patient requested human staff / complaint", "Web Visitor", "Not Collected");
          alertHandoff = true;
        }
        
        // Log bot response
        this.chatHistory.push({ sender: 'bot', text: finalReply, timestamp: this.formatTime() });
        return {
          reply: finalReply,
          chips: nextChips,
          alert: alertHandoff
        };
      } catch (err) {
        console.error("Gemini AI failed, falling back to rule engine:", err);
      }
    }

    // Process based on state machine
    switch(this.state) {
      // --- APPOINTMENT BOOKING FLOW ---
      case BOT_STATES.BOOK_NAME:
        this.tempData.name = text;
        this.state = BOT_STATES.BOOK_PHONE;
        return { reply: this.t('askPhone'), chips: [] };
        
      case BOT_STATES.BOOK_PHONE:
        if (!this.validatePhone(text)) {
          return { reply: this.t('invalidPhone'), chips: [] };
        }
        this.tempData.phone = text;
        this.tempData.email = "Not Provided";
        this.state = BOT_STATES.BOOK_DATE;
        return { reply: this.t('askDate'), chips: ["Tomorrow", "In 2 Days", "Next Monday"] };
        
      case BOT_STATES.BOOK_EMAIL:
        if (!this.validateEmail(text)) {
          return { reply: this.t('invalidEmail'), chips: [] };
        }
        this.tempData.email = text;
        this.state = BOT_STATES.BOOK_DATE;
        return { reply: this.t('askDate'), chips: ["Tomorrow", "In 2 Days", "Next Monday"] };
        
      case BOT_STATES.BOOK_DATE:
        let selectedDate = text;
        if (cleanTextLower === "tomorrow") {
          const d = new Date(); d.setDate(d.getDate() + 1);
          selectedDate = d.toISOString().split('T')[0];
        } else if (cleanTextLower.includes("2 days")) {
          const d = new Date(); d.setDate(d.getDate() + 2);
          selectedDate = d.toISOString().split('T')[0];
        } else if (cleanTextLower.includes("next monday")) {
          const d = new Date();
          d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
          selectedDate = d.toISOString().split('T')[0];
        }
        
        if (!this.validateDate(selectedDate)) {
          return { reply: this.t('invalidDate') + " (Format: YYYY-MM-DD)", chips: ["Tomorrow", "In 2 Days"] };
        }
        this.tempData.date = selectedDate;
        this.state = BOT_STATES.BOOK_TIME;
        return { reply: this.t('askTime'), chips: ["10:00 AM", "12:30 PM", "4:00 PM", "6:30 PM"] };
        
      case BOT_STATES.BOOK_TIME:
        if (!this.validateTime(text)) {
          return { reply: this.t('invalidTime'), chips: ["10:00 AM", "4:00 PM"] };
        }
        
        // --- GOOGLE CALENDAR CONFLICT CHECK ---
        const selectedTimeClean = text.trim();
        const selectedDateStr = this.tempData.date;
        const cid = configService.clinicId || 'default_clinic';
        const existingApps = JSON.parse(localStorage.getItem(`appointments_${cid}`) || localStorage.getItem('appointments') || '[]');
        
        // Helper to normalize time strings (e.g. '10:30', '10:30 AM', '14:30' -> '10:30am')
        const normalizeTime = (t) => {
          let timeClean = t.toLowerCase().replace(/[^0-9a-z:]/g, '');
          let isPm = timeClean.includes('pm');
          let isAm = timeClean.includes('am');
          
          let digits = timeClean.replace(/[^0-9:]/g, '');
          let parts = digits.split(':');
          let hr = parseInt(parts[0], 10) || 0;
          let min = parts[1] || '00';
          if (min.length === 1) min = '0' + min;
          
          if (hr > 12) {
            hr = hr - 12;
            isPm = true;
          } else if (hr === 12) {
            isPm = true;
          } else if (hr === 0) {
            hr = 12;
            isAm = true;
          }
          
          if (!isAm && !isPm) {
            if (hr >= 9 && hr < 12) isAm = true;
            else isPm = true;
          }
          
          return `${hr}:${min}${isPm ? 'pm' : 'am'}`;
        };
        
        const normalizedSelected = normalizeTime(selectedTimeClean);
        const hasConflict = existingApps.some(app => {
          if (app.date !== selectedDateStr) return false;
          try {
            return normalizeTime(app.time) === normalizedSelected;
          } catch(e) {
            return false;
          }
        });
        
        if (hasConflict) {
          const altTimes = ["11:30 AM", "2:00 PM", "5:30 PM"].filter(t => {
            try {
              return normalizeTime(t) !== normalizedSelected;
            } catch(e) {
              return true;
            }
          });
          
          return {
            reply: `⚠️ Calendar Conflict: Dr. MDS is already booked on **${selectedDateStr}** at **${selectedTimeClean}** in Google Calendar. Can we schedule one of these open slots instead?`,
            chips: altTimes
          };
        }
        
        this.tempData.time = text;
        this.state = BOT_STATES.BOOK_TREATMENT;
        return { 
          reply: this.t('askTreatment'), 
          chips: Object.keys(TREATMENT_INFO).slice(0, 5)
        };
        
      case BOT_STATES.BOOK_TREATMENT:
        this.tempData.treatment = text;
        this.state = BOT_STATES.BOOK_STATUS;
        return { 
          reply: this.t('askStatus'), 
          chips: this.lang === 'en' ? ["New Patient", "Existing Patient"] : 
                 this.lang === 'hi' ? ["नया मरीज (New)", "पुराना मरीज (Existing)"] : 
                 ["नवीन रुग्ण (New)", "जुना रुग्ण (Existing)"]
        };
        
      case BOT_STATES.BOOK_STATUS:
        let isExisting = false;
        if (cleanTextLower.includes("exist") || cleanTextLower.includes("पुराना") || cleanTextLower.includes("जुना") || cleanTextLower.includes("yes")) {
          isExisting = true;
        }
        this.tempData.status = isExisting ? "Existing Patient" : "New Patient";
        
        // Finalize appointment booking!
        const finalApp = {
          id: 'app_' + Date.now(),
          name: this.tempData.name,
          phone: this.tempData.phone,
          email: this.tempData.email,
          date: this.tempData.date,
          time: this.tempData.time,
          treatment: this.tempData.treatment,
          status: this.tempData.status,
          dateCreated: new Date().toLocaleDateString()
        };
        
        this.saveAppointment(finalApp);
        this.resetState();
        
        const summary = this.t('confirmBooking')
          .replace('{name}', finalApp.name)
          .replace('{phone}', finalApp.phone)
          .replace('{email}', finalApp.email)
          .replace('{date}', finalApp.date)
          .replace('{time}', finalApp.time)
          .replace('{treatment}', finalApp.treatment)
          .replace('{status}', finalApp.status);
          
        return {
          reply: summary + "\n\n" + this.t('ending'),
          chips: this.defaultChips[this.lang],
          success: true
        };

      // --- LEAD QUALIFICATION FLOW ---
      case BOT_STATES.LEAD_TREATMENT:
        this.tempData.treatment = text;
        this.state = BOT_STATES.LEAD_WHEN;
        return {
          reply: this.lang === 'en' ? "When would you like to start your treatment?" : 
                 this.lang === 'hi' ? "आप अपना इलाज कब शुरू करना चाहेंगे?" :
                 "तुम्हाला उपचार केव्हा सुरू करायचे आहेत?",
          chips: this.lang === 'en' ? ["Immediately", "Within 1 month", "Just inquiring"] :
                 this.lang === 'hi' ? ["तुरंत (Immediately)", "1 महीने के भीतर", "सिर्फ जानकारी चाहिए"] :
                 ["त्वरित (Immediately)", "१ महिन्याच्या आत", "फक्त चौकशी"]
        };
        
      case BOT_STATES.LEAD_WHEN:
        this.tempData.timeframe = text;
        this.state = BOT_STATES.LEAD_VISITED;
        return {
          reply: this.t('leadVisited'),
          chips: this.lang === 'en' ? ["Yes, visited before", "No, first time"] :
                 this.lang === 'hi' ? ["हाँ, पहले आए हैं", "नहीं, पहली बार"] :
                 ["होय, आधी आलो आहे", "नाही, पहिल्यांदाच"]
        };
        
      case BOT_STATES.LEAD_VISITED:
        this.tempData.visited = text;
        this.state = BOT_STATES.LEAD_URGENCY;
        return {
          reply: this.t('leadUrgency'),
          chips: this.lang === 'en' ? ["Low concern", "Medium discomfort", "Severe pain / Emergency"] :
                 this.lang === 'hi' ? ["सामान्य चिंता", "मध्यम बेचैनी", "गंभीर दर्द / इमरजेंसी"] :
                 ["सामान्य काळजी", "मध्यम अस्वस्थता", "तीव्र वेदना / इमर्जन्सी"]
        };
        
      case BOT_STATES.LEAD_URGENCY:
        this.tempData.urgency = text;
        
        // Calculate Lead Score & Tag
        let leadTag = "Warm Lead";
        let score = 50;
        
        const whenLower = this.tempData.timeframe.toLowerCase();
        const urgLower = this.tempData.urgency.toLowerCase();
        const visitedLower = this.tempData.visited.toLowerCase();
        
        if (urgLower.includes("severe") || urgLower.includes("emerg") || urgLower.includes("गंभीर") || urgLower.includes("तीव्र")) {
          leadTag = "Emergency";
          score = 100;
        } else if (whenLower.includes("immed") || whenLower.includes("तुरंत") || whenLower.includes("त्वरित")) {
          leadTag = "Hot Lead";
          score = 90;
        } else if (visitedLower.includes("yes") || visitedLower.includes("हाँ") || visitedLower.includes("होय")) {
          leadTag = "Existing Patient";
          score = 75;
        } else if (whenLower.includes("inqu") || whenLower.includes("सिर्फ") || whenLower.includes("चौकशी")) {
          leadTag = "Warm Lead";
          score = 30;
        }
        
        const leadData = {
          id: 'lead_' + Date.now(),
          name: this.tempData.name || "Anonymous Patient",
          phone: this.tempData.phone || "Not Provided (Chat Session)",
          email: this.tempData.email || "Not Provided",
          treatment: this.tempData.treatment,
          timeframe: this.tempData.timeframe,
          urgency: this.tempData.urgency,
          visited: this.tempData.visited,
          leadTag: leadTag,
          score: score,
          dateCreated: new Date().toLocaleDateString(),
          source: 'Web Chatbot'
        };
        
        this.saveLead(leadData);
        this.resetState();
        
        const leadSuccessMsg = this.lang === 'en' ? 
          `Excellent! I've noted down your preferences. Your lead profile is qualified as a **${leadTag}** (Score: ${score}/100).\n\nWould you like to proceed and book a consultation slot now?` :
          this.lang === 'hi' ?
          `बहुत बढ़िया! मैंने आपकी प्राथमिकताओं को नोट कर लिया है। आपकी प्रोफाइल को **${leadTag}** (स्कोर: ${score}/100) के रूप में वर्गीकृत किया गया है।\n\nक्या आप अभी परामर्श के लिए अपॉइंटमेंट बुक करना चाहेंगे?` :
          `उत्कृष्ट! मी तुमच्या आवडीनिवडी नोंदवून घेतल्या आहेत. तुमचे प्रोफाइल **${leadTag}** (स्कोअर: ${score/100}) म्हणून वर्गीकृत केले आहे.\n\nतुम्हाला आता प्रत्यक्ष सल्लामसलत करण्यासाठी अपॉइंटमेंट बुक करायची आहे का?`;
          
        return {
          reply: leadSuccessMsg,
          chips: this.lang === 'en' ? ["📅 Yes, book appointment", "❌ No, thank you"] :
                 this.lang === 'hi' ? ["📅 हाँ, बुक करें", "❌ नहीं, धन्यवाद"] :
                 ["होय, बुक करा", "नाही, धन्यवाद"]
        };

      // --- EMERGENCY TRIAGE FLOW ---
      case BOT_STATES.EMERGENCY_DETAILS:
        this.tempData.symptoms = text;
        this.state = BOT_STATES.EMERGENCY_CONTACT;
        return { reply: this.t('emergContact'), chips: [] };
        
      case BOT_STATES.EMERGENCY_CONTACT:
        if (!this.validatePhone(text)) {
          return { reply: this.t('invalidPhone'), chips: [] };
        }
        this.tempData.phone = text;
        
        // Save Emergency Lead & trigger Human handoff escalation!
        const emergLead = {
          id: 'lead_' + Date.now(),
          name: "Emergency Patient",
          phone: this.tempData.phone,
          email: "emergency@clinic.com",
          treatment: "Dental Trauma / Emergency Triage",
          timeframe: "Immediate",
          urgency: "Severe Pain / Trauma: " + this.tempData.symptoms,
          visited: "Unknown",
          leadTag: "Emergency",
          score: 100,
          dateCreated: new Date().toLocaleDateString(),
          source: 'Emergency Triage'
        };
        
        this.saveLead(emergLead);
        this.triggerHandoff("Emergency Triage: " + this.tempData.symptoms, emergLead.name, emergLead.phone);
        this.resetState();
        
        return {
          reply: this.t('emergencyEscalation') + "\n\n" + this.t('ending'),
          chips: this.defaultChips[this.lang],
          alert: true
        };

      // --- WHATSAPP LEAD COLLECTION FLOW ---
      case BOT_STATES.WA_NAME:
        this.tempData.name = text;
        this.state = BOT_STATES.WA_PHONE;
        return { reply: this.t('waPhone'), chips: [] };
        
      case BOT_STATES.WA_PHONE:
        if (!this.validatePhone(text)) {
          return { reply: this.t('invalidPhone'), chips: [] };
        }
        this.tempData.phone = text;
        this.state = BOT_STATES.WA_TREATMENT;
        return { reply: this.t('waTreat'), chips: Object.keys(TREATMENT_INFO).slice(0, 5) };
        
      case BOT_STATES.WA_TREATMENT:
        this.tempData.treatment = text;
        this.state = BOT_STATES.WA_TIME;
        return { reply: this.t('waTime'), chips: ["Tomorrow morning", "This Saturday", "Next week"] };
        
      case BOT_STATES.WA_TIME:
        this.tempData.timePref = text;
        
        // Save to Local CRM as WhatsApp Lead
        const waLead = {
          id: 'lead_' + Date.now(),
          name: this.tempData.name,
          phone: this.tempData.phone,
          email: "whatsapp@crm.com",
          treatment: this.tempData.treatment,
          timeframe: this.tempData.timePref,
          urgency: "WhatsApp Inbound",
          visited: "No",
          leadTag: "Warm Lead",
          score: 60,
          dateCreated: new Date().toLocaleDateString(),
          source: 'WhatsApp'
        };
        
        this.saveLead(waLead);
        this.resetState();
        
        // Generate formatting card string
        const crmFormatted = `Name: ${waLead.name}\nPhone: ${waLead.phone}\nTreatment: ${waLead.treatment}\nAppointment Preference: ${waLead.timeframe}\nLead Score: ${waLead.score}\nSource: WhatsApp`;
        
        return {
          reply: this.t('whatsappHeading') + "\n\n" + crmFormatted + "\n\n" + this.t('ending'),
          chips: this.defaultChips[this.lang],
          crmCard: crmFormatted
        };

      // --- IDLE / NATURAL LANGUAGE PARSING ---
      case BOT_STATES.IDLE:
        // Direct Action Chip matching
        if (cleanTextLower.includes("book appointment") || cleanTextLower.includes("अपॉइंटमेंट बुक") || cleanTextLower.includes("अपॉइंटमेंट बुक करा") || cleanTextLower === "1" || cleanTextLower === "book") {
          this.state = BOT_STATES.BOOK_NAME;
          return { reply: this.t('askName'), chips: [] };
        }
        
        if (cleanTextLower.includes("emergency") || cleanTextLower.includes("इमरजेंसी") || cleanTextLower.includes("आपातकाल") || cleanTextLower.includes("इमर्जन्सी") || cleanTextLower === "2") {
          this.state = BOT_STATES.EMERGENCY_DETAILS;
          return { reply: this.t('emergDetails'), chips: ["Toothache", "Swollen Gums", "Bleeding", "Broken Tooth"] };
        }
        
        if (cleanTextLower.includes("whatsapp check-in") || cleanTextLower.includes("whatsapp लीड") || cleanTextLower.includes("whatsapp") || cleanTextLower === "4") {
          this.state = BOT_STATES.WA_NAME;
          return { reply: this.t('waName'), chips: [] };
        }
        
        if (cleanTextLower.includes("treatments") || cleanTextLower.includes("prices") || cleanTextLower.includes("इलाज") || cleanTextLower.includes("उपचार") || cleanTextLower === "3") {
          const treatmentInfo = this.getTREATMENT_INFO();
          let listText = "";
          if (this.lang === 'en') {
            listText = "Which treatment are you interested in? Click one to enquire:\n\n";
            listText += Object.keys(treatmentInfo).slice(0, 6).map(key => {
              const t = treatmentInfo[key];
              const desc = t.en.split('\n')[0].replace('Purpose:', '').replace('Benefits:', '').trim();
              const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
              return `- ${key}: ${t.price} (${shortDesc})`;
            }).join('\n');
          } else if (this.lang === 'hi') {
            listText = "आप किस इलाज के बारे में जानना चाहते हैं? पूछताछ के लिए क्लिक करें:\n\n";
            listText += Object.keys(treatmentInfo).slice(0, 6).map(key => {
              const t = treatmentInfo[key];
              const desc = t.hi.split('\n')[0].replace('उद्देश्य:', '').replace('लाभ:', '').trim();
              const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
              return `- ${key}: ${t.price} (${shortDesc})`;
            }).join('\n');
          } else {
            listText = "तुम्हाला कोणत्या उपचाराबद्दल माहिती हवी आहे? विचारण्यासाठी क्लिक करा:\n\n";
            listText += Object.keys(treatmentInfo).slice(0, 6).map(key => {
              const t = treatmentInfo[key];
              const desc = t.mr.split('\n')[0].replace('उद्देश्य:', '').replace('फायदे:', '').trim();
              const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
              return `- ${key}: ${t.price} (${shortDesc})`;
            }).join('\n');
          }

          return { 
            reply: listText,
            chips: Object.keys(treatmentInfo)
          };
        }
        
        if (cleanTextLower.includes("ask a question") || cleanTextLower.includes("सवाल") || cleanTextLower.includes("प्रश्न")) {
          return {
            reply: this.lang === 'en' ? "Please type in your question about our hours, location, payment modes, insurance, or dentists!" :
                   this.lang === 'hi' ? "कृपया हमारे समय, स्थान, भुगतान के तरीकों, बीमा या डॉक्टरों के बारे में अपना प्रश्न टाइप करें!" :
                   "कृपया आमच्या वेळा, स्थान, पेमेंट पद्धती, विमा किंवा डॉक्टरांबद्दल तुमचा प्रश्न टाईप करा!",
            chips: ["What are clinic hours?", "Where is clinic located?", "Do you accept insurance?", "What payment options?"]
          };
        }

        // Objection Handler: Too Expensive
        if (cleanTextLower.includes("expensive") || cleanTextLower.includes("costly") || cleanTextLower.includes("महंगा") || cleanTextLower.includes("खर्च") || cleanTextLower.includes("महाग")) {
          const objectionReply = "We understand. We offer structured consultations where the dentist can discuss alternative treatment options and flexible payment plans, including 0% Interest EMI options to suit your budget. Would you like to reserve a consultation slot?";
          return {
            reply: objectionReply,
            chips: ["📅 Book Consultation", "❌ No, thanks"]
          };
        }

        // Objection Handler: Need to think
        if (cleanTextLower.includes("think") || cleanTextLower.includes("सोचना") || cleanTextLower.includes("विचार")) {
          const objectionReply = "I understand. Dental health is important. Would you like us to reserve a tentative consultation slot for you while you decide? There is no obligation to proceed.";
          return {
            reply: objectionReply,
            chips: ["📅 Reserve a slot", "❌ No, thank you"]
          };
        }

        // Objection Handler: Scared
        if (cleanTextLower.includes("scared") || cleanTextLower.includes("fear") || cleanTextLower.includes("pain") || cleanTextLower.includes("डर") || cleanTextLower.includes("भीती") || cleanTextLower.includes("दुख")) {
          const objectionReply = "Many of our patients feel anxious before visiting. Please be assured that Apex Dental specializes in gentle, pain-free dentistry using advanced technologies like computer-guided anesthesia and inhalation sedation. Our team focuses on gentle and comfortable care. Would you like to check out our reviews or talk to us?";
          return {
            reply: objectionReply,
            chips: ["📅 Schedule consultation", "📞 Contact staff"]
          };
        }

        // Yes/No responses in IDLE (usually following a lead proposal)
        if (cleanTextLower === "yes" || cleanTextLower === "हाँ" || cleanTextLower === "होय" || cleanTextLower.includes("book consultation") || cleanTextLower.includes("yes, book")) {
          this.state = BOT_STATES.BOOK_NAME;
          return { reply: this.t('askName'), chips: [] };
        }
        
        if (cleanTextLower === "no" || cleanTextLower === "नहीं" || cleanTextLower === "नाही" || cleanTextLower.includes("no, thanks")) {
          return { reply: this.t('ending'), chips: this.defaultChips[this.lang] };
        }

        // Handoff request
        if (cleanTextLower.includes("staff") || cleanTextLower.includes("human") || cleanTextLower.includes("receptionist") || cleanTextLower.includes("talk to doctor") || cleanTextLower.includes("कॉल") || cleanTextLower.includes("संपर्क")) {
          this.triggerHandoff("Patient requested staff handoff", "Web Visitor", "Not Collected");
          return { reply: this.t('handoffMsg'), chips: this.defaultChips[this.lang], alert: true };
        }

        // Check FAQs knowledge base
        for (const key in FAQ_KNOWLEDGE) {
          // simple regex matching keys in clean text
          if (cleanTextLower.includes(key) || 
             (key === 'hours' && (cleanTextLower.includes('time') || cleanTextLower.includes('समय') || cleanTextLower.includes('वेळ') || cleanTextLower.includes('ओपन'))) ||
             (key === 'location' && (cleanTextLower.includes('address') || cleanTextLower.includes('पता') || cleanTextLower.includes('पत्ता') || cleanTextLower.includes('कुठे'))) ||
             (key === 'parking' && (cleanTextLower.includes('car') || cleanTextLower.includes('गाड़ी') || cleanTextLower.includes('गाडी'))) ||
             (key === 'insurance' && (cleanTextLower.includes('cashless') || cleanTextLower.includes('बीमा') || cleanTextLower.includes('विमा'))) ||
             (key === 'payments' && (cleanTextLower.includes('upi') || cleanTextLower.includes('card') || cleanTextLower.includes('pay') || cleanTextLower.includes('पैसे') || cleanTextLower.includes('भुगतान'))) ||
             (key === 'financing' && (cleanTextLower.includes('emi') || cleanTextLower.includes('loan') || cleanTextLower.includes('किस्त'))) ||
             (key === 'languages' && (cleanTextLower.includes('speak') || cleanTextLower.includes('भाषा'))) ||
             (key === 'qualifications' && (cleanTextLower.includes('dentist') || cleanTextLower.includes('doctor') || cleanTextLower.includes('mds') || cleanTextLower.includes('डॉक्टर') || cleanTextLower.includes('डिग्री'))) ||
             (key === 'availability' && (cleanTextLower.includes('appointment') || cleanTextLower.includes('खाली') || cleanTextLower.includes('मिलेगा')))
          ) {
            const answer = FAQ_KNOWLEDGE[key][this.lang] || FAQ_KNOWLEDGE[key]['en'];
            let replyText = answer + "\n\n";
            if (key === 'qualifications') {
              const specs = this.getSpecialistsList();
              replyText += specs.slice(0, 3).map(s => `- Specialist: ${s.name} (${s.specialty} | ${s.experience} | ${s.photo || '👨‍⚕️'})`).join('\n');
            } else {
              replyText += this.t('ending');
            }
            return {
              reply: replyText,
              chips: this.defaultChips[this.lang]
            };
          }
        }

        // Check Treatments knowledge base
        const treatmentInfo = this.getTREATMENT_INFO();
        for (const key in treatmentInfo) {
          const keyLower = key.toLowerCase();
          if (cleanTextLower.includes(keyLower) || 
             (key === 'Dental Cleaning' && (cleanTextLower.includes('clean') || cleanTextLower.includes('scaling') || cleanTextLower.includes('साफ'))) ||
             (key === 'Teeth Whitening' && (cleanTextLower.includes('whiten') || cleanTextLower.includes('bleach') || cleanTextLower.includes('सफेद'))) ||
             (key.includes('Invisalign') && (cleanTextLower.includes('aligner') || cleanTextLower.includes('clear') || cleanTextLower.includes('अलाइनर') || cleanTextLower.includes('invisalign'))) ||
             (key.includes('Implants') && (cleanTextLower.includes('implant') || cleanTextLower.includes('screw') || cleanTextLower.includes('दांत लगाना'))) ||
             (key.includes('Braces') && (cleanTextLower.includes('wire') || cleanTextLower.includes('तार') || cleanTextLower.includes('ब्रैकेट') || cleanTextLower.includes('braces'))) ||
             (key.includes('Root Canal') && (cleanTextLower.includes('root canal') || cleanTextLower.includes('rct') || cleanTextLower.includes('नसों का इलाज'))) ||
             (key.includes('Wisdom') && (cleanTextLower.includes('wisdom') || cleanTextLower.includes('extract') || cleanTextLower.includes('दाढ़ निकालना') || cleanTextLower.includes('दाढ'))) ||
             (key.includes('Veneers') && (cleanTextLower.includes('veneer') || cleanTextLower.includes('laminate') || cleanTextLower.includes('विनीयर') || cleanTextLower.includes('veneers'))) ||
             (key.includes('Cosmetic') && (cleanTextLower.includes('smile design') || cleanTextLower.includes('makeup') || cleanTextLower.includes('सुंदर')))
          ) {
            const treat = treatmentInfo[key];
            const answer = treat[this.lang] || treat['en'];
            let replyText = `**${key}**\nStarting price: ${treat.price}\n\n${answer}`;
            
            // Sales optimization checks: Implants, Invisalign, Veneers, Smile Makeovers (Cosmetic Dentistry)
            if (treat.isPremium) {
              const salesPitch = this.lang === 'en' ? 
                `\n\n⭐ *Why Premium?* We use computerized planning, digital scanner diagnostics, and high-strength aesthetic materials with clinical warranty. We strongly recommend scheduling a consultation.` :
                this.lang === 'hi' ?
                `\n\n⭐ *प्रीमियम क्यों?* हम कंप्यूटर-निर्देशित योजना, डिजिटल स्कैनर डायग्नोस्टिक्स और वारंटी वाले टिकाऊ सौंदर्य सामग्री का उपयोग करते हैं। हम दृढ़ता से परामर्श का सुझाव देते हैं।` :
                `\n\n⭐ *प्रीमियम का?* आम्ही कॉम्प्युटर-मार्गदर्शित प्लॅनिंग, डिजिटल स्कॅनर आणि वॉरंटी केलेले उत्कृष्ट सौंदर्य साहित्य वापरतो. आम्ही प्रत्यक्ष सल्ल्याची शिफारस करतो.`;
              replyText += salesPitch;
            }

            // Lead capture trigger for premium treatments
            if (treat.isPremium && !this.tempData.treatment) {
              this.state = BOT_STATES.LEAD_TREATMENT;
              this.tempData.treatment = key;
              const leadQualifyPrompt = this.lang === 'en' ? 
                `\n\nI can help you qualify for special pricing or reserve a doctor slot. Let me ask you a few quick questions. First, are you looking to start treatment immediately?` :
                this.lang === 'hi' ?
                `\n\nमैं आपको विशेष कीमतों या डॉक्टर स्लॉट आरक्षित करने में मदद कर सकता हूँ। मुझे कुछ त्वरित प्रश्न पूछने दें। सबसे पहले, क्या आप तुरंत इलाज शुरू करना चाहते हैं?` :
                `\n\nमी तुम्हाला विशेष सूट मिळवण्यासाठी किंवा डॉक्टरांची वेळ आरक्षित करण्यासाठी मदत करू शकते. मला काही द्रुत प्रश्न विचारू द्या. सर्वात पहिले, तुम्हाला लगेच उपचार सुरू करायचे आहेत का?`;
              
              return {
                reply: replyText + leadQualifyPrompt,
                chips: this.lang === 'en' ? ["Immediately", "In 1 Month", "Just inquiring"] :
                       this.lang === 'hi' ? ["तुरंत", "1 महीने में", "सिर्फ पूछताछ"] :
                       ["त्वरित", "१ महिन्यात", "फक्त चौकशी"]
              };
            }

            return {
              reply: replyText + "\n\n" + this.t('ending'),
              chips: this.defaultChips[this.lang]
            };
          }
        }

        // Fallback default response
        const fallbackText = this.lang === 'en' ? 
          `I'm sorry, I didn't quite catch that. You can book an appointment, view treatment prices, or ask about our clinic. What would you like to do?` :
          this.lang === 'hi' ?
          `क्षमा करें, मैं समझ नहीं पाया। आप अपॉइंटमेंट बुक कर सकते हैं, इलाज की दरें देख सकते हैं, या हमारे क्लिनिक के बारे में पूछ सकते हैं। आप क्या करना चाहेंगे?` :
          `क्षमस्व, मला नीट समजले नाही. तुम्ही अपॉइंटमेंट बुक करू शकता, उपचारांचे दर पाहू शकता किंवा आमच्या क्लिनिकबद्दल विचारू शकता. आपण काय करू इच्छिता?`;
          
        return {
          reply: fallbackText,
          chips: this.defaultChips[this.lang]
        };
    }
  }

  // Helper to sync data to Google Sheets via Apps Script Web App
  async syncToGoogleSheets(action, data) {
    const url = window.app && typeof window.app.getSheetsUrl === 'function' 
      ? window.app.getSheetsUrl() 
      : (localStorage.getItem('google_sheets_url') || 'https://script.google.com/macros/s/AKfycbVHD0613YEjCT0fPFmSS4gYrXI2ddjHKBf2mghV8edSi8G6yrjVT3azA8jM7LXxpJG/exec');
    const cid = configService.clinicId || 'default_clinic';
    
    const logDetails = { 
      action: action, 
      clinicId: cid,
      data: data,
      notificationEmail: localStorage.getItem('receptionist_email') || 'Not Configured',
      calendarId: localStorage.getItem('google_calendar_id') || 'Not Configured'
    };
    
    if (window.logSystemEvent) {
      window.logSystemEvent('Sheets Post Request', `Triggering sync connection for action "${action}"`, logDetails);
    }

    if (!url) {
      if (window.logSystemEvent) {
        window.logSystemEvent('Sheets Post Cancelled', 'No Google Sheets Web App URL defined in settings. Changes are temporarily cached in browser Local Storage.');
      }
      return;
    }
    
    const notificationEmail = localStorage.getItem('receptionist_email') || '';
    const calendarId = localStorage.getItem('google_calendar_id') || '';
    
    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify({ 
          action: action, 
          clinicId: cid,
          data: data,
          notificationEmail: notificationEmail,
          calendarId: calendarId
        })
      })
      .then(async response => {
        const text = await response.text();
        let resJson;
        try {
          resJson = JSON.parse(text);
        } catch(e) {
          resJson = { status: 'success', rawResponse: text };
        }
        
        if (window.logSystemEvent) {
          if (resJson.status === 'success') {
            window.logSystemEvent('Sheets Post Success', `Google Apps Script executed sync successfully.`, resJson);
          } else {
            window.logSystemEvent('Sheets Post Error', `Google Apps Script returned an execution error: ${resJson.message}`, resJson);
          }
        }
      })
      .catch(err => {
        if (window.logSystemEvent) {
          window.logSystemEvent('Sheets Post Failure', `Background sync request failed during fetch execution. This usually happens if CORS is blocked (e.g. settings are not set to 'Who has access: Anyone') or the URL is invalid.\nError: ${err.message}`, err.toString());
        }
      });
    } catch (e) {
      console.error("Google Sheets Sync failed:", e);
      if (window.logSystemEvent) {
        window.logSystemEvent('Sheets Post Sync Crash', `Google Sheets Sync routine crashed: ${e.message}`, e.toString());
      }
    }
  }

  // Helper storage routines triggering events to sync dashboard
  saveAppointment(appData) {
    const cid = configService.clinicId || 'default_clinic';
    const apps = JSON.parse(localStorage.getItem(`appointments_${cid}`) || localStorage.getItem('appointments') || '[]');
    apps.push(appData);
    localStorage.setItem(`appointments_${cid}`, JSON.stringify(apps));
    this.dispatchEvent('dataChanged');
    this.syncToGoogleSheets('addAppointment', appData);
  }

  saveLead(leadData) {
    const cid = configService.clinicId || 'default_clinic';
    const leads = JSON.parse(localStorage.getItem(`leads_${cid}`) || localStorage.getItem('leads') || '[]');
    leads.push(leadData);
    localStorage.setItem(`leads_${cid}`, JSON.stringify(leads));
    this.dispatchEvent('dataChanged');
    this.syncToGoogleSheets('addLead', leadData);
  }

  triggerHandoff(reason, name, phone) {
    const cid = configService.clinicId || 'default_clinic';
    const handoffs = JSON.parse(localStorage.getItem(`handoffs_${cid}`) || localStorage.getItem('handoffs') || '[]');
    const newHandoff = {
      id: 'hand_' + Date.now(),
      sessionId: this.activeSessionId,
      name: name,
      phone: phone,
      reason: reason,
      transcript: this.chatHistory,
      status: 'Active Escalation',
      dateCreated: new Date().toLocaleDateString()
    };
    handoffs.push(newHandoff);
    localStorage.setItem(`handoffs_${cid}`, JSON.stringify(handoffs));
    this.dispatchEvent('dataChanged');
    this.syncToGoogleSheets('addHandoff', newHandoff);
  }

  // Basic event emitter model
  addEventListener(event, callback) {
    if (!this._listeners) this._listeners = {};
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  dispatchEvent(event) {
    if (this._listeners && this._listeners[event]) {
      this._listeners[event].forEach(cb => cb());
    }
  }
}

// Singleton Export
export const chatbot = new ChatbotEngine();
window.chatbotInstance = chatbot; // For global debug inspect

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
