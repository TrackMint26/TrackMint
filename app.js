const storageKey = "scanspend-expenses"; // kept only as the source for the one-time local-to-cloud migration below
const settingsKey = "scanspend-settings";
const profileKey = "scanspend-profile";
const legacyStorageKey = "msme-expense-scanner-expenses";
const legacySettingsKey = "msme-expense-scanner-settings";
const themeKey = "scanspend-theme"; // theme stays a per-device preference, not synced — no reason it needs to match across devices
const paymentsKey = "track-mint-payments";
const migratedKey = "track-mint-cloud-migrated";

const readJson = (key, fallback) => JSON.parse(localStorage.getItem(key) || fallback);
const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

// Accounts, sessions, and all business data (expenses/payments/settings/
// profile) now live in Firebase — Authentication for login, Firestore for
// data — instead of this browser's own localStorage. That's what makes the
// same email show the same content on a laptop and a phone: the account is
// no longer tied to one device's storage.
//
// These values are this project's own Firebase project identifiers, not
// secrets — they're meant to be visible in client code; access is enforced
// by Firestore's security rules (see the ones supplied alongside this
// change), not by hiding this config.
const firebaseConfig = {
  apiKey: "AIzaSyBaKAB_NO6lzyWuVxnuuO02aF2ghHuIw_8",
  authDomain: "trackmint26.firebaseapp.com",
  projectId: "trackmint26",
  storageBucket: "trackmint26.firebasestorage.app",
  messagingSenderId: "116424787867",
  appId: "1:116424787867:web:2417080a16d149386c033e",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// Local cache + offline write queue, on top of the existing service-worker
// offline support — lets the app keep reading/writing expenses offline the
// same way it already works today, syncing once the connection returns.
// Fails harmlessly if e.g. a second tab has this app open already; the app
// still works, just without the offline cache in that tab.
db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
  console.warn("Firestore offline persistence unavailable:", error);
});

const state = {
  expenses: [],
  payments: [],
  settings: {},
  profile: {},
  user: null,
  selectedExpenseId: null,
  authMode: "login",
};

// OCR runs entirely in the browser via Tesseract.js (WebAssembly) — no local
// server, no installed Tesseract binary, works the same on desktop and
// mobile browsers (Android/iOS) since it's just JS+WASM shipped with the page.

const fields = {
  authScreen: document.getElementById("authScreen"),
  appContent: document.getElementById("appContent"),
  authForm: document.getElementById("authForm"),
  authName: document.getElementById("authName"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authPasswordToggle: document.getElementById("authPasswordToggle"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  logoutButton: document.getElementById("logoutButton"),
  sidebar: document.getElementById("sidebar"),
  menuToggleButton: document.getElementById("menuToggleButton"),
  navBackdrop: document.getElementById("navBackdrop"),
  navButtons: [...document.querySelectorAll("[data-screen]")],
  authModeButtons: [...document.querySelectorAll("[data-auth-mode]")],
  screens: [...document.querySelectorAll(".screen")],
  screenTitle: document.getElementById("screenTitle"),
  screenEyebrow: document.getElementById("screenEyebrow"),
  quickScanButton: document.getElementById("quickScanButton"),
  themeToggle: document.getElementById("themeToggle"),
  offlineBadge: document.getElementById("offlineBadge"),
  image: document.getElementById("billImage"),
  preview: document.getElementById("previewImage"),
  dropText: document.getElementById("dropText"),
  takePhotoButton: document.getElementById("takePhotoButton"),
  cameraModal: document.getElementById("cameraModal"),
  cameraVideo: document.getElementById("cameraVideo"),
  cameraError: document.getElementById("cameraError"),
  capturePhotoButton: document.getElementById("capturePhotoButton"),
  closeCameraButton: document.getElementById("closeCameraButton"),
  scanOcrButton: document.getElementById("scanOcrButton"),
  ocrProgress: document.getElementById("ocrProgress"),
  ocrProgressBar: document.getElementById("ocrProgressBar"),
  ocrStatus: document.getElementById("ocrStatus"),
  ocrText: document.getElementById("ocrText"),
  nerStatus: document.getElementById("nerStatus"),
  vendor: document.getElementById("vendor"),
  supplierPhone: document.getElementById("supplierPhone"),
  supplierLookup: document.getElementById("supplierLookup"),
  date: document.getElementById("date"),
  dateWarning: document.getElementById("dateWarning"),
  category: document.getElementById("category"),
  amount: document.getElementById("amount"),
  amountWarning: document.getElementById("amountWarning"),
  gstin: document.getElementById("gstin"),
  tax: document.getElementById("tax"),
  materialItem: document.getElementById("materialItem"),
  quantity: document.getElementById("quantity"),
  notes: document.getElementById("notes"),
  status: document.getElementById("status"),
  rows: document.getElementById("expenseRows"),
  empty: document.getElementById("emptyState"),
  duplicateFilterNotice: document.getElementById("duplicateFilterNotice"),
  duplicateFilterText: document.getElementById("duplicateFilterText"),
  clearDuplicateFilterButton: document.getElementById("clearDuplicateFilterButton"),
  totalSpend: document.getElementById("totalSpend"),
  gstCredit: document.getElementById("gstCredit"),
  pendingCount: document.getElementById("pendingCount"),
  approvedCount: document.getElementById("approvedCount"),
  rawMaterialSpend: document.getElementById("rawMaterialSpend"),
  supplierCount: document.getElementById("supplierCount"),
  alertPanel: document.getElementById("alertPanel"),
  alertMessage: document.getElementById("alertMessage"),
  sendSmsButton: document.getElementById("sendSmsButton"),
  sendEmailButton: document.getElementById("sendEmailButton"),
  categoryBars: document.getElementById("categoryBars"),
  categoryStatCards: document.getElementById("categoryStatCards"),
  chartTooltip: document.getElementById("chartTooltip"),
  recentExpenses: document.getElementById("recentExpenses"),
  trendChart: document.getElementById("trendChart"),
  supplierChart: document.getElementById("supplierChart"),
  supplierStatCards: document.getElementById("supplierStatCards"),
  periodButtons: [...document.querySelectorAll("[data-period]")],
  detailVendorSelect: document.getElementById("detailVendorSelect"),
  detailSummary: document.getElementById("detailSummary"),
  detailStatus: document.getElementById("detailStatus"),
  detailGrid: document.getElementById("detailGrid"),
  detailMonthlyReport: document.getElementById("detailMonthlyReport"),
  detailYearlyReport: document.getElementById("detailYearlyReport"),
  paymentForm: document.getElementById("paymentForm"),
  paymentExpense: document.getElementById("paymentExpense"),
  paymentMethod: document.getElementById("paymentMethod"),
  paymentAmount: document.getElementById("paymentAmount"),
  paymentDate: document.getElementById("paymentDate"),
  paymentReference: document.getElementById("paymentReference"),
  paymentNotes: document.getElementById("paymentNotes"),
  upiPaySection: document.getElementById("upiPaySection"),
  paymentUpiVpa: document.getElementById("paymentUpiVpa"),
  generateUpiButton: document.getElementById("generateUpiButton"),
  upiQrContainer: document.getElementById("upiQrContainer"),
  upiQrCode: document.getElementById("upiQrCode"),
  upiPayLink: document.getElementById("upiPayLink"),
  paymentHistory: document.getElementById("paymentHistory"),
  monthlyReport: document.getElementById("monthlyReport"),
  supplierReport: document.getElementById("supplierReport"),
  aiWorkflowReport: document.getElementById("aiWorkflowReport"),
  aiRecommendations: document.getElementById("aiRecommendations"),
  workflowSteps: [...document.querySelectorAll("[data-workflow-step]")],
  profileForm: document.getElementById("profileForm"),
  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  businessName: document.getElementById("businessName"),
  businessPhone: document.getElementById("businessPhone"),
  businessGstin: document.getElementById("businessGstin"),
  userRole: document.getElementById("userRole"),
  settingsForm: document.getElementById("settingsForm"),
  settingsOwnerNote: document.getElementById("settingsOwnerNote"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  rawMaterialLimit: document.getElementById("rawMaterialLimit"),
  alertPhone: document.getElementById("alertPhone"),
  alertEmail: document.getElementById("alertEmail"),
  alertViaSms: document.getElementById("alertViaSms"),
  alertViaEmail: document.getElementById("alertViaEmail"),
  alarmEnabled: document.getElementById("alarmEnabled"),
  importButton: document.getElementById("importButton"),
  importFileInput: document.getElementById("importFileInput"),
  importModal: document.getElementById("importModal"),
  importHelp: document.querySelector(".import-help"),
  importError: document.getElementById("importError"),
  importMappingTable: document.getElementById("importMappingTable"),
  importMappingBody: document.getElementById("importMappingBody"),
  importSummary: document.getElementById("importSummary"),
  importConfirmButton: document.getElementById("importConfirmButton"),
  importCancelButton: document.getElementById("importCancelButton"),
};

// The first account ever registered on this device is the business Owner.
// Only the Owner may view or change alert contact details and spend limits.
const isOwner = () => !!state.user?.isOwner;

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(value) || 0);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

// Expenses are stored as ISO "YYYY-MM-DD" (required by the native <input type="date">
// element) but displayed as DD-MM-YYYY everywhere else in the app.
const formatDisplayDate = (isoDate) => {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate || "";
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-06" -> "Jun 2026", so a different year's same month never looks like
// a duplicate label, and multi-year monthly trends read at a glance.
const formatMonthLabel = (isoMonth) => {
  const match = String(isoMonth || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return isoMonth || "";
  const [, year, month] = match;
  const name = MONTH_ABBR[Number(month) - 1];
  return name ? `${name} ${year}` : isoMonth;
};

// Whole-array-per-document: one Firestore doc holds the entire expenses (or
// payments) array. This is deliberately simple rather than "one Firestore
// doc per expense" (the more scalable design) because every existing
// "mutate state.expenses, then call saveExpenses()" call site throughout
// this file keeps working completely unchanged — only these two functions
// needed to change. Tradeoff, disclosed rather than hidden: a Firestore
// document has a 1 MiB size limit, which comfortably covers a small
// business's expense history (thousands of records at this data's size) but
// isn't unlimited. If that ceiling is ever actually hit, the fix is moving
// to one document per expense (a subcollection) — a data-layer change, not
// another rewrite of every call site.
const userDataDoc = (name) => db.collection("users").doc(state.user.uid).collection("data").doc(name);
const userProfileDoc = () => db.collection("users").doc(state.user.uid);

const saveExpenses = () => {
  if (!state.user?.uid) return;
  userDataDoc("expenses")
    .set({ list: state.expenses })
    .catch((error) => console.warn("Failed to sync expenses to your account:", error));
};
const savePayments = () => {
  if (!state.user?.uid) return;
  userDataDoc("payments")
    .set({ list: state.payments })
    .catch((error) => console.warn("Failed to sync payments to your account:", error));
};
const saveProfile = () => {
  if (!state.user?.uid) return;
  userProfileDoc()
    .set({ profile: state.profile }, { merge: true })
    .catch((error) => console.warn("Failed to sync profile to your account:", error));
};
const saveSettings = () => {
  if (!isOwner()) return;
  state.settings = {
    rawMaterialLimit: fields.rawMaterialLimit.value,
    alertPhone: fields.alertPhone.value,
    alertEmail: fields.alertEmail.value,
    alertViaSms: fields.alertViaSms.checked,
    alertViaEmail: fields.alertViaEmail.checked,
    alarmEnabled: fields.alarmEnabled.checked,
  };
  if (!state.user?.uid) return;
  userProfileDoc()
    .set({ settings: state.settings }, { merge: true })
    .catch((error) => console.warn("Failed to sync settings to your account:", error));
};

// Non-owner users may still see the current alert configuration (for transparency)
// but cannot edit it — only the Owner controls where alerts are sent.
const applySettingsAccess = () => {
  const owner = isOwner();
  const lockedFields = [
    fields.rawMaterialLimit,
    fields.alertPhone,
    fields.alertEmail,
    fields.alertViaSms,
    fields.alertViaEmail,
    fields.alarmEnabled,
  ];
  lockedFields.forEach((field) => {
    field.disabled = !owner;
  });
  fields.saveSettingsButton.disabled = !owner;
  fields.settingsOwnerNote.hidden = owner;
};

const getPreferredTheme = () => {
  const saved = localStorage.getItem(themeKey);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  if (fields.themeToggle) {
    fields.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    fields.themeToggle.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    fields.themeToggle.setAttribute("aria-label", fields.themeToggle.title);
  }
  localStorage.setItem(themeKey, theme);
};

const today = () => new Date().toISOString().slice(0, 10);

// Dot-matrix/thermal bill photos are the hardest OCR case this app handles,
// and character-level digit confusion in a year (e.g. "26" misread as "04")
// produces a date-shaped string that's still wrong. Bills are realistically
// dated close to today, not decades back, so a plausibility window catches
// this class of error instead of silently trusting anything date-shaped.
const isPlausibleBillDate = (isoDate) => {
  const year = Number(String(isoDate).slice(0, 4));
  if (!year) return false;
  const currentYear = new Date().getFullYear();
  return year >= currentYear - 5 && year <= currentYear + 1;
};
const isRawMaterial = (expense) => expense.category === "Raw Materials";
const cleanPhone = (phone) => phone.replace(/[^\d+]/g, "");
const getRawMaterialTotal = () =>
  state.expenses.filter(isRawMaterial).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

const buildSmsUrl = (phone, message) => {
  const separator = /iphone|ipad|ipod/i.test(navigator.userAgent) ? "&" : "?";
  return `sms:${cleanPhone(phone)}${separator}body=${encodeURIComponent(message)}`;
};

const byAmount = (items) => items.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));

const groupTotal = (items, keyFn) =>
  items.reduce((map, item) => {
    const key = keyFn(item) || "Unknown";
    map[key] = (map[key] || 0) + Number(item.amount || 0);
    return map;
  }, {});

const workflowStageByScreen = {
  dashboard: "analytics",
  scan: "capture",
  expenses: "duplicates",
  details: "duplicates",
  payments: "duplicates",
  reports: "analytics",
  profile: "capture",
  settings: "alerts",
};

const setWorkflowStage = (stage) => {
  const order = ["capture", "classify", "duplicates", "analytics", "alerts"];
  const activeIndex = Math.max(order.indexOf(stage), 0);
  fields.workflowSteps.forEach((step) => {
    const index = order.indexOf(step.dataset.workflowStep);
    step.classList.toggle("active", index === activeIndex);
    step.classList.toggle("complete", index < activeIndex);
  });
};

const setScreen = (name) => {
  // Only stop the camera when actually leaving the scan screen — setScreen
  // re-fires for the *same* screen too (e.g. the "Scan Receipt" quick-action
  // button present on every screen, or the async hashchange this function's
  // own `location.hash = name` triggers), which must not kill an open camera
  // modal the user hasn't actually navigated away from.
  if (name !== "scan") stopCameraStream();
  fields.screens.forEach((screen) => screen.classList.toggle("active", screen.id === `${name}Screen`));
  fields.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.screen === name));
  const active = document.getElementById(`${name}Screen`);
  fields.screenTitle.textContent = active.dataset.title;
  fields.screenEyebrow.textContent = active.dataset.eyebrow;
  setWorkflowStage(workflowStageByScreen[name] || "capture");
  location.hash = name;
};

const setAuthMode = (mode) => {
  state.authMode = mode;
  fields.authModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  fields.authSubmitButton.textContent = mode === "login" ? "Login" : "Create Account";
  fields.authName.parentElement.style.display = mode === "login" ? "none" : "grid";
};

const showApp = () => {
  fields.authScreen.hidden = true;
  fields.appContent.hidden = false;
  const appFrame = document.querySelector('.app-frame');
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) sidebar.hidden = false;
  if (appFrame) appFrame.classList.remove('no-sidebar');
  loadProfileFields();
  loadSettingsFields();
  render();
  setScreen(location.hash.replace("#", "") || "dashboard");
};

const showAuth = () => {
  fields.authScreen.hidden = false;
  fields.appContent.hidden = true;
  const appFrame = document.querySelector('.app-frame');
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) sidebar.hidden = true;
  if (appFrame) appFrame.classList.add('no-sidebar');
};

const setOcrProgress = (status, progress = 0) => {
  fields.ocrProgress.hidden = false;
  fields.ocrStatus.textContent = status;
  fields.ocrProgressBar.style.width = `${Math.round(progress * 100)}%`;
};

const normalizeLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

const normalizeText = (text) =>
  text
    .replace(/\r?\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

// Tesseract frequently misreads the digit 0 as the letter O/o (and 1 as l/I) inside
// numbers such as dates, amounts, and quantities. Only touch tokens that already
// contain at least one real digit, so ordinary words (Other, Vendor, Steel...) are
// left untouched.
const fixOcrDigitConfusion = (text) =>
  text.replace(/[A-Za-z0-9]+/g, (token) => {
    if (!/\d/.test(token)) return token;
    return token.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
  });

// The 14th character of a GSTIN is always the literal "Z" per the official
// government format (a fixed/reserved position — every real GSTIN has it,
// it's not something that varies between businesses like the rest of the
// string does), but Tesseract commonly misreads it as "2" or another
// visually similar character. Accepting any alphanumeric there and
// correcting it back to "Z" afterward recovers GSTINs that would otherwise
// be silently rejected as invalid by a stricter pattern.
const GSTIN_SHAPE = "\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z\\d][A-Z\\d][A-Z\\d]";
const GSTIN_PATTERN = new RegExp(`^${GSTIN_SHAPE}$`);
const GSTIN_SEARCH_PATTERN = new RegExp(`\\b${GSTIN_SHAPE}\\b`, "i");
const correctGstinChecksumLetter = (gstin) =>
  gstin && gstin.length === 15 ? `${gstin.slice(0, 13)}Z${gstin.slice(14)}` : gstin;

// OCR occasionally drops in a stray space in the middle of a GSTIN (kerning
// artifacts, often right before the fixed "Z" checksum letter). Only merge two
// adjacent tokens when doing so produces a structurally valid GSTIN, so this
// never touches unrelated word pairs.
const fixSplitGstin = (text) =>
  text.replace(/\b([0-9A-Za-z]{2,14})\s+([0-9A-Za-z]{1,13})\b/g, (match, a, b) => {
    const merged = (a + b).toUpperCase();
    return GSTIN_PATTERN.test(merged) ? merged : match;
  });

// Tesseract often can't render the rupee glyph (₹) and substitutes a lookalike
// character instead (?, f, T, €, £...). Only fix it directly in front of a
// decimal money amount (e.g. "f576.00" -> "₹576.00") so real punctuation and
// ordinary words elsewhere in the text are never touched.
const fixCurrencySymbol = (text) =>
  text.replace(/(?<![A-Za-z0-9])[?fT€£¥](?=\d[\d,]*\.\d{2}\b)/g, "₹");

// Same problem fixCurrencySymbol solves above, but for the harder case:
// Tesseract merging "₹" into a literal leading DIGIT glued onto the amount
// instead of a distinguishable stand-in character (e.g. "₹6,400.00" read as
// "76,400.00"). A "7" is a valid digit on its own, so this can only be
// caught by checking the number against another value on the same bill
// that's independently derivable — reuses the same cross-validation
// primitives parseAmount/parseTax use downstream for the parsed VALUES
// (defined further down this file; safe to reference here since this only
// runs when normalizeOcrText is actually called, well after the whole
// module has loaded), so what the user sees in the OCR text box itself
// reads correctly too, not just the fields extracted from it.
const fixMisreadCurrencyDigitInText = (text) => {
  const lines = text.split(/\r?\n/);
  const taxLinePattern = /\b(?:cgst|sgst|igst|gstin|tax)\b/i;
  const plainLines = lines.map((line) => line.trim()).filter(Boolean);
  const lineItemTotal = sumLineItemAmounts(plainLines, taxLinePattern);

  const replaceTrailingNumber = (line, expectedValue) => {
    if (!expectedValue) return line;
    const match = line.match(/([\d,]+(?:\.\d{1,2})?)\s*$/);
    if (!match) return line;
    const raw = match[1];
    if (raw.replace(/,/g, "").length < 2) return line;
    const stripped = Number(raw.replace(/,/g, "").slice(1));
    if (Math.abs(stripped - expectedValue) >= 0.01) return line;
    return line.slice(0, match.index) + "₹" + raw.slice(1);
  };

  const subtotalLabel = /\bsub[\s-]*total\b/i;
  const subtotalLineIdx = lines.findIndex((line) => subtotalLabel.test(line));
  let subtotalGuess = 0;
  if (subtotalLineIdx >= 0) {
    const numberMatch = lines[subtotalLineIdx].match(/([\d,]+(?:\.\d{1,2})?)\s*$/);
    if (numberMatch) subtotalGuess = stripLikelyMisreadLeadingDigit(numberMatch[1], lineItemTotal);
  }
  const taxTotal = subtotalGuess ? parseTax(text, subtotalGuess) : 0;
  const grandTotalLabel = /(?:grand total|invoice total|total amount|amount payable|net amount|balance due|amount due|final amount|total payable)/i;
  const taxRatePattern = /\b(?:cgst|sgst|igst)\b\s*(?:[@(]\s*([\d.]+)\s*%\s*\)?)?/i;

  return lines
    .map((line) => {
      if (subtotalLabel.test(line)) return replaceTrailingNumber(line, lineItemTotal);
      const rateMatch = line.match(taxRatePattern);
      if (rateMatch && rateMatch[1] && subtotalGuess) {
        return replaceTrailingNumber(line, (Number(rateMatch[1]) / 100) * subtotalGuess);
      }
      if (grandTotalLabel.test(line) && !taxLinePattern.test(line) && subtotalGuess && taxTotal) {
        return replaceTrailingNumber(line, subtotalGuess + taxTotal);
      }
      return line;
    })
    .join("\n");
};

// Additional normalization to fix common OCR artifacts before parsing
const normalizeOcrText = (text) => {
  if (!text) return "";
  let t = text;
  // Remove unusual quotes and non-printables while preserving Unicode symbols like currency signs
  t = t.replace(/[\u2018\u2019\u201c\u201d\u00A0]/g, "").trim();
  // Collapse repeated horizontal whitespace only — never eat newlines here.
  // Structured invoices (label on one line, value on the next, blank lines
  // between sections) rely on real line breaks for extractVendorSection,
  // parseAmount's per-line scan, etc.; collapsing "\s" (which matches \n too)
  // used to merge whole paragraphs onto one line and broke all of that.
  t = t.replace(/[ \t]{2,}/g, " ");
  // Fix common OCR splitting of characters (e.g. G S T I N).
  // Requires whitespace between every letter and a boundary before G, so it only
  // matches a genuinely letter-spaced "G S T I N" and never merges into an
  // unrelated adjacent word (e.g. "CGST INR" must NOT become "CGSTINR").
  t = t.replace(/\bG\s+S\s+T\s+I\s+N/gi, "GSTIN");
  // Common OCR misspells
  t = t.replace(/\bvender\b/gi, "vendor");
  t = t.replace(/\bShcll\b/gi, "Shell");
  // Fix digit/letter confusion (0/O, 1/l/I) inside number-like tokens
  t = fixOcrDigitConfusion(t);
  // Rejoin a GSTIN that OCR split with a stray space
  t = fixSplitGstin(t);
  // Fix mangled rupee symbol in front of money amounts
  t = fixCurrencySymbol(t);
  // Catch the harder case: "₹" merged into a literal leading digit rather
  // than a distinguishable stand-in character (handled just above).
  t = fixMisreadCurrencyDigitInText(t);
  // Remove only control characters, preserve currency symbols and Unicode text
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return t;
};

const findSectionValue = (lines, regex) => {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(regex);
    if (match && match[1] && match[1].trim()) return match[1].trim();
    if (regex.test(line) && lines[i + 1]) return lines[i + 1].trim();
  }
  return "";
};

const parseDate = (text) => {
  const monthNames = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const candidateTexts = [];
  const normalized = normalizeText(text);
  if (normalized) candidateTexts.push(normalized);
  normalizeLines(text).forEach((line) => {
    if (line) candidateTexts.push(line);
  });

  const formatDate = (year, month, day) => {
    const parsedMonth = Number(month);
    const parsedDay = Number(day);
    if (parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31) {
      return `${year}-${String(parsedMonth).padStart(2, "0")}-${String(parsedDay).padStart(2, "0")}`;
    }
    return "";
  };

  for (const candidate of candidateTexts) {
    const compact = candidate.replace(/\s+/g, " ").trim();

    const isoMatch = compact.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const formatted = formatDate(year, month, day);
      if (formatted) return formatted;
    }

    const numericMatch = compact.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    if (numericMatch) {
      const [, first, second, third] = numericMatch;
      const year = third.length === 2 ? `20${third}` : third;
      const formatted = formatDate(year, second, first);
      if (formatted) return formatted;
    }

    const textMatch = compact.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i);
    if (textMatch) {
      const [, day, monthName, year] = textMatch;
      const month = monthNames[monthName.slice(0, 3).toLowerCase()];
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }

    const labeledMatch = compact.match(/(?:date|invoice date|bill date|invoice\s*date|bill\s*date)\s*[:\-]?\s*(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i);
    if (labeledMatch) {
      const [, day, monthName, year] = labeledMatch;
      const month = monthNames[monthName.slice(0, 3).toLowerCase()];
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }

    const labeledNumericMatch = compact.match(/(?:date|invoice date|bill date|invoice\s*date|bill\s*date)\s*[:\-]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i);
    if (labeledNumericMatch) {
      const [, first, second, third] = labeledNumericMatch;
      const year = third.length === 2 ? `20${third}` : third;
      const formatted = formatDate(year, second, first);
      if (formatted) return formatted;
    }
  }

  return "";
};

const parseAmountLegacy = (text) => {
  const lines = normalizeLines(text);
  const labelPattern = /(?:grand total|invoice total|total amount|amount payable|net amount|balance due|amount due|final amount|total payable)\D{0,20}([\d,]+(?:\.\d{1,2})?)/i;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(labelPattern);
    if (match) return Number(match[1].replace(/,/g, ""));
  }

  const currencyPattern = /(?:[₹$€£¥]|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(currencyPattern);
    if (match) return Number(match[1].replace(/,/g, ""));
  }

  const values = [...text.matchAll(/[\d,]+(?:\.\d{1,2})?/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((value) => value > 0);
  return values.length ? Math.max(...values) : 0;
};

const parseTaxLegacy = (text) => {
  let cgst = 0;
  let sgst = 0;
  for (const match of text.matchAll(/\b(cgst|sgst)\b\D{0,20}([\d,]+(?:\.\d{1,2})?)/gi)) {
    const type = match[1].toLowerCase();
    const value = Number(match[2].replace(/,/g, ""));
    if (type === "cgst") cgst += value;
    if (type === "sgst") sgst += value;
  }
  if (cgst || sgst) return cgst + sgst;

  const lines = normalizeLines(text);
  const taxValues = lines
    .filter((line) => /(?:tax|gst)/i.test(line))
    .flatMap((line) => [...line.matchAll(/([\d,]+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1].replace(/,/g, ""))));

  if (taxValues.length) return taxValues.reduce((sum, value) => sum + value, 0);

  const genericMatch = text.match(/tax\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return genericMatch ? Number(genericMatch[1].replace(/,/g, "")) : 0;
};

// Returns { value, confident }. confident=true means an explicit total was
// actually found on the bill (a labeled total, or a subtotal+tax figure
// that's mathematically derived from explicit numbers); confident=false
// means no such declaration was found anywhere and the value is a
// best-effort estimate that could be missing tax or other line items — the
// caller should surface that distinction rather than presenting a guess
// with the same confidence as a confirmed reading.
// Sum of amounts on lines that look like table rows (2+ decimal-formatted
// numbers, e.g. a Rate then an Amount column) — used as an Amount-field
// fallback when no total is found at all, AND as an independent reference
// value to sanity-check the Subtotal/Grand Total figures against.
const sumLineItemAmounts = (lines, taxLinePattern) => {
  const rows = lines.filter((line) => {
    if (taxLinePattern.test(line)) return false;
    const decimalCount = (line.match(/\d+\.\d{1,2}/g) || []).length;
    return decimalCount >= 2;
  });
  return rows.reduce((total, line) => {
    const decimals = [...line.matchAll(/[\d,]+\.\d{1,2}/g)].map((match) => Number(match[0].replace(/,/g, "")));
    return total + (decimals.length ? decimals[decimals.length - 1] : 0);
  }, 0);
};

// Tesseract doesn't always substitute a distinguishable stand-in character
// for "₹" (handled by fixCurrencySymbol above) — sometimes it merges the
// symbol into a literal leading DIGIT glued onto the amount instead, e.g.
// "₹6,400.00" read as "76,400.00". A "7" is a perfectly valid digit on its
// own, so this can only be caught by checking whether the number makes
// arithmetic sense against another value that's independently derivable
// from the same bill — if stripping one leading digit brings the number
// back in line with that reference, the leading digit was almost certainly
// a misread currency symbol, not a real part of the amount.
const stripLikelyMisreadLeadingDigit = (rawString, expectedValue) => {
  const digits = String(rawString || "").replace(/,/g, "");
  const asIs = Number(digits);
  if (!expectedValue || Math.abs(asIs - expectedValue) < 0.01 || digits.length < 2) return asIs;
  const stripped = Number(digits.slice(1));
  return Math.abs(stripped - expectedValue) < 0.01 ? stripped : asIs;
};

const parseAmount = (text) => {
  const lines = normalizeLines(text);
  const taxLinePattern = /\b(?:cgst|sgst|igst|gstin|tax)\b/i;
  const lineItemTotal = sumLineItemAmounts(lines, taxLinePattern);

  // Strong, unambiguous "this IS the bill total" labels always take priority
  // — checked as a full separate pass so a table's own line-item amount can
  // never outrank the real total, regardless of which one happens to appear
  // first/last in the OCR'd text. When the bill's own line items and tax are
  // independently legible, cross-check the matched total against their sum
  // in case the label's own number has a misread-currency-symbol digit.
  const strongLabelPattern = /(?:grand total|invoice total|total amount|amount payable|net amount|balance due|amount due|final amount|total payable)\D{0,30}([\d,]+(?:\.\d{1,2})?)/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (taxLinePattern.test(lines[i])) continue;
    const match = lines[i].match(strongLabelPattern);
    if (match) {
      const expectedTotal = lineItemTotal ? lineItemTotal + parseTax(text, lineItemTotal) : 0;
      return { value: stripLikelyMisreadLeadingDigit(match[1], expectedTotal), confident: true };
    }
  }

  // Weaker fallback: a bare "Amount" label with no stronger total wording
  // found anywhere. Excludes "Amount (₹)" / "Amount (Rs.)" specifically —
  // that parenthesised-unit shape is how a TABLE COLUMN HEADER reads, not an
  // actual total declaration (which reads like "Amount: 5000" or
  // "Amount ₹5000", no parens), and was matching a line item's amount on
  // multi-row invoices instead of the real total.
  const weakLabelPattern = /^amount\b(?!\s*\()\D{0,30}([\d,]+(?:\.\d{1,2})?)/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (taxLinePattern.test(lines[i])) continue;
    const match = lines[i].match(weakLabelPattern);
    if (match) return { value: Number(match[1].replace(/,/g, "")), confident: true };
  }

  const currencyPattern = /(?:[₹$€£¥]|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (taxLinePattern.test(lines[i])) continue;
    const match = lines[i].match(currencyPattern);
    if (match) return { value: Number(match[1].replace(/,/g, "")), confident: true };
  }

  // No "total"-style label was legible at all — a real, common failure mode
  // on formal tax invoices, where the summary block (Subtotal/tax/Grand
  // Total) often sits in a shaded/differently-formatted table section that
  // OCR reads worse than, or drops entirely versus, plain line items. If a
  // Subtotal and tax lines ARE legible, the true total is derivable
  // arithmetically (subtotal + tax) — far more reliable than guessing from
  // whichever number happens to be numerically largest. Cross-check the
  // Subtotal's own raw number against the line-item sum too, same reasoning
  // as the Grand Total check above.
  const subtotalLine = lines.find((line) => /\bsub[\s-]*total\b/i.test(line));
  if (subtotalLine) {
    const subtotalNumbers = [...subtotalLine.matchAll(/([\d,]+(?:\.\d{1,2})?)/g)];
    const rawSubtotal = subtotalNumbers.length ? subtotalNumbers[subtotalNumbers.length - 1][1] : "";
    const subtotal = rawSubtotal ? stripLikelyMisreadLeadingDigit(rawSubtotal, lineItemTotal) : 0;
    const taxTotal = parseTax(text, subtotal);
    if (subtotal && taxTotal) return { value: subtotal + taxTotal, confident: true };
  }

  // The whole summary block (Subtotal/Grand Total) can go missing entirely,
  // not just misread — a table's shaded/differently-laid-out header and
  // total rows can fail OCR's line segmentation altogether while plain
  // white-background line items still read fine. When that happens, sum
  // every line that looks like a table row (multiple decimal-formatted
  // numbers on one line, e.g. a Rate then an Amount column) rather than
  // picking just the single largest one — a bill with two ₹85,000 and
  // ₹5,000 line items is closer to ₹90,000 than to either item alone, even
  // though this still can't recover tax that was never read at all.
  if (lineItemTotal) return { value: lineItemTotal, confident: false };

  // Last resort: no label, currency symbol, derivable subtotal+tax, or
  // multi-row line-item pattern found at all (common on badly garbled OCR
  // text). Prefer amounts written with cents — the standard money format on
  // a bill — over bare whole numbers; this also stops an ID number
  // (FSSAI/GSTIN digits/phone number) from being mistaken for the total just
  // because it's numerically bigger.
  const rawNumbers = [...text.matchAll(/[\d,]+(?:\.\d{1,2})?/g)]
    .map((match) => match[0].replace(/,/g, ""))
    .filter((raw) => Number(raw) > 0);

  const decimalValues = rawNumbers.filter((raw) => raw.includes(".")).map(Number);
  if (decimalValues.length) return { value: Math.max(...decimalValues), confident: false };

  // No decimal amount anywhere — fall back to whole numbers, but cap the
  // digit count so a long ID number can't pass as a rupee amount.
  const wholeValues = rawNumbers.filter((raw) => raw.length <= 7).map(Number);
  return { value: wholeValues.length ? Math.max(...wholeValues) : 0, confident: false };
};

const parseTax = (text, subtotalHint) => {
  // Allow an optional "(9%)" OR "@9%" rate call-out between the label and the
  // amount (e.g. "CGST (9%): ₹576.00" or "CGST @9% 8,100.00" — the latter is
  // the standard notation on Indian tax invoices) so the rate digit isn't
  // mistaken for the amount. Rate is captured too (see cross-check below).
  const taxPattern = /\b(cgst|sgst|igst)\b\s*(?:[@(]\s*([\d.]+)\s*%\s*\)?)?\s*[:\-]?\s*[^\d\n]{0,20}([\d,]+(?:\.\d{1,2})?)/gi;
  const entries = [...text.matchAll(taxPattern)].map((match) => {
    const rate = match[2] ? Number(match[2]) : null;
    // When a subtotal is independently known and this line states its own
    // rate, the expected tax amount (rate% of subtotal) is a strong
    // reference to catch the same misread-leading-digit problem here too —
    // e.g. "CGST (9%): 3576.00" for a true "₹576.00" on a ₹6,400 subtotal.
    const expected = subtotalHint && rate ? (rate / 100) * subtotalHint : 0;
    return {
      type: match[1].toLowerCase(),
      rate,
      value: stripLikelyMisreadLeadingDigit(match[3], expected),
    };
  });
  if (entries.length) {
    // CGST and SGST are always levied at the same rate on the same base for
    // intra-state supply. Tesseract occasionally misreads the ₹ symbol as a
    // bare digit glued directly onto one amount (e.g. "3576.00" for a true
    // "₹576.00") — when both lines state the same explicit rate but parse to
    // different amounts, that stray digit is far more likely than a genuine
    // mismatch, so trust the smaller, mutually-consistent reading.
    const cgst = entries.find((entry) => entry.type === "cgst");
    const sgst = entries.find((entry) => entry.type === "sgst");
    if (cgst && sgst && cgst.rate !== null && cgst.rate === sgst.rate && cgst.value !== sgst.value) {
      const shared = Math.min(cgst.value, sgst.value);
      cgst.value = shared;
      sgst.value = shared;
    }
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    if (total) return total;
  }

  // Fallback: take only the last number on each tax-related line (the amount),
  // not every number on the line, so an embedded rate like "(9%)" isn't summed in.
  const taxValues = normalizeLines(text)
    .filter((line) => /(?:tax|gst)/i.test(line) && !/\bgstin\b/i.test(line))
    .map((line) => {
      const numbers = [...line.matchAll(/([\d,]+(?:\.\d{1,2})?)/g)];
      return numbers.length ? Number(numbers[numbers.length - 1][1].replace(/,/g, "")) : 0;
    })
    .filter((value) => value > 0);

  if (taxValues.length) return taxValues.reduce((sum, value) => sum + value, 0);

  const genericMatch = text.match(/tax\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return genericMatch ? Number(genericMatch[1].replace(/,/g, "")) : 0;
};

const cleanVendorName = (value) =>
  value
    .replace(/^(?:vendor\s*details|supplier\s*details|seller\s*details|seller\s*information|supplier\s*information)\s*[:\-]?\s*/i, "")
    .replace(/^(?:vendor\s*name|supplier\s*name|seller\s*name|vendor|supplier|bill\s*to|ship\s*to|invoice\s*to|from)\s*[:\-]?\s*/i, "")
    .replace(/\s*[:\-]\s*$/, "")
    .trim();

const extractLabeledVendorName = (lines) => {
  // Join with newlines (not spaces) so the capture below, which stops at the
  // end of the line, can't run on and swallow the GSTIN/Address lines that follow.
  const joined = lines.join("\n");
  const match = joined.match(/\b(?:vendor|supplier|seller)\s*name\s*[:\-]\s*([^|,;\n\r]+)/i);
  return match ? match[1].trim() : "";
};

const extractVendorSection = (text) => {
  const lines = normalizeLines(text);

  const vendorSectionHeaders = [
    /\b(?:vendor details|supplier details|seller details|seller information|supplier information|vender details|sold by|bill from|bill from details)\b/i,
  ];
  const vendorLabelPatterns = [
    /(?:vendor name|supplier name|seller name|supplier|vendor|seller)\s*[:\-]?/i,
  ];
  const sectionEndPatterns = [
    /^(?:expense details|bill summary|bill details|expense summary|grand total|total|amount due|payment terms|notes|signature|authorized by|terms and conditions)\s*[:\-]?/i,
  ];

  const findSectionEnd = (startIndex) => {
    for (let i = startIndex; i < lines.length; i += 1) {
      if (sectionEndPatterns.some((pattern) => pattern.test(lines[i]))) {
        return i;
      }
    }
    return lines.length;
  };

  let vendorStartIdx = -1;
  for (const headerRegex of vendorSectionHeaders) {
    vendorStartIdx = lines.findIndex((line) => headerRegex.test(line));
    if (vendorStartIdx >= 0) break;
  }

  if (vendorStartIdx >= 0) {
    const vendorEndIdx = findSectionEnd(vendorStartIdx + 1);
    return lines.slice(vendorStartIdx + 1, vendorEndIdx);
  }

  let vendorLabelIdx = -1;
  for (const labelRegex of vendorLabelPatterns) {
    vendorLabelIdx = lines.findIndex((line) => labelRegex.test(line));
    if (vendorLabelIdx >= 0) break;
  }

  if (vendorLabelIdx >= 0) {
    return lines.slice(vendorLabelIdx, Math.min(vendorLabelIdx + 6, lines.length));
  }

  return [];
};

const hasExplicitVendorSection = (text) => extractVendorSection(text).length > 0;

const extractVendorGstin = (text) => {
  const vendorLines = extractVendorSection(text);

  // 1) Look for labeled GSTIN within vendor section
  if (vendorLines.length >= 1) {
    const gstinLabelMatch = vendorLines.find((line) => /^(?:vendor\s+gstin|supplier\s+gstin|seller\s+gstin|vender\s+gstin)\s*[:\-]?\s*(.+)$/i.test(line));
    if (gstinLabelMatch) {
      const match = gstinLabelMatch.match(GSTIN_SEARCH_PATTERN);
      if (match) return correctGstinChecksumLetter(match[0].toUpperCase());
    }

    // 2) First strict GSTIN in vendor block
    for (const line of vendorLines) {
      const match = line.match(GSTIN_SEARCH_PATTERN);
      if (match) return correctGstinChecksumLetter(match[0].toUpperCase());
    }
  }

  // 3) Tolerant search across whole document: compact non-alphanumerics and check 15-char tokens
  const compact = text.replace(/[^A-Za-z0-9]/g, "");
  const candidates = [...compact.matchAll(/[A-Za-z0-9]{15}/g)].map((m) => m[0].toUpperCase());
  for (const cand of candidates) {
    if (GSTIN_PATTERN.test(cand)) return correctGstinChecksumLetter(cand);
  }

  // 4) Final strict fallback anywhere in document
  const fullMatch = text.match(GSTIN_SEARCH_PATTERN);
  return fullMatch ? correctGstinChecksumLetter(fullMatch[0].toUpperCase()) : "";
};

// Find line index containing a GSTIN-like token within an array of lines (tolerant)
const findGstinIndexInLines = (lines) => {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (GSTIN_SEARCH_PATTERN.test(line)) return i;
    const compact = line.replace(/[^A-Za-z0-9]/g, "");
    if (GSTIN_PATTERN.test(compact.toUpperCase())) return i;
  }
  return -1;
};

const tidyVendor = (value) =>
  cleanVendorName(value)
    .replace(/\b(?:Ho\.?|No\.?|Address|Addr\.?|Ph\.?|Phone|Mobile|Tel|GSTIN|CSTIN)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 80)
    .trim();

const guessVendor = (text) => {
  // normalize OCR noise before extracting vendor lines
  const normalizedText = normalizeOcrText(text);
  const vendorLines = extractVendorSection(normalizedText);

  if (vendorLines.length) {
    const labeledName = extractLabeledVendorName(vendorLines);
    if (labeledName) return tidyVendor(labeledName);
  }

  // Use vendor section when present, otherwise use the top lines from the document
  const lines = vendorLines.length ? vendorLines : normalizeLines(normalizedText).slice(0, 8);

  const companyKeywords = /pvt\.?|ltd\.?|inc\.?|corp\.?|company|solutions|supplies|traders|enterprises|group|industries|manufacturing|services|llp|llc|pte|works|contractors|motors|stores|mart/i;
  const noisePatterns = /^(?:invoice|bill|date|gstin|total|amount|tax|subtotal|qty|quantity|gst|cgst|sgst|igst|rupee|inr|amount due|phone|mobile|tel|gst no)/i;

  const candidates = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cleaned = raw.replace(/[^A-Za-z0-9 &\-\/\.,'()]/g, " ").replace(/\s{2,}/g, " ").trim();
    if (cleaned) candidates.push({ text: cleaned, idx: i });
    // also consider adjacent two-line combo (common in long vendor names)
    if (i + 1 < lines.length) {
      const nextClean = lines[i + 1].replace(/[^A-Za-z0-9 &\-\/\.,'()]/g, " ").replace(/\s{2,}/g, " ").trim();
      const combo = `${cleaned} ${nextClean}`.trim();
      if (combo && combo.length > cleaned.length) candidates.push({ text: combo, idx: i });
    }
  }

  if (!candidates.length) return "Unknown Vendor";

  // Score candidates heuristically
  candidates.forEach((c) => {
    let score = 0;
    if (companyKeywords.test(c.text)) score += 30;
    if (/\b(co|company|and|&|&amp;)\b/i.test(c.text) && c.text.split(/\s+/).length >= 2) score += 6;
    if (/^[A-Z0-9][A-Za-z0-9\s\&\-\.']+$/.test(c.text) && c.text.split(/\s+/).length >= 2) score += 8;
    if (noisePatterns.test(c.text)) score -= 25;
    if (/\b(gstin|gst no|gst\b)/i.test(c.text)) score -= 10;
    if (/\b(\d{2,})\b/.test(c.text) && c.text.split(/\s+/).length <= 2) score -= 8; // likely an invoice id or code
    if (/₹|rs\.?|inr/i.test(c.text)) score -= 20;
    if (c.text.length > 80) score -= 5; // too long often contains address lines
    if (c.text.length <= 60 && c.text.length >= 3) score += 2;
    c.score = score;
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best && best.score > 0) return tidyVendor(best.text);

  // Fallback: pick first non-noise line
  const fallback = lines.find((line) => line.length > 3 && !noisePatterns.test(line));
  if (fallback) return tidyVendor(fallback);

  // If a GSTIN exists near vendor area, prefer the line above it as vendor name
  const gstinIdx = findGstinIndexInLines(lines);
  if (gstinIdx >= 0) {
    for (let j = gstinIdx - 1; j >= Math.max(0, gstinIdx - 4); j -= 1) {
      const candidate = lines[j].trim();
      if (candidate && !noisePatterns.test(candidate) && candidate.length > 3) return tidyVendor(candidate);
    }
    // try just below if not found above
    if (lines[gstinIdx + 1]) return tidyVendor(lines[gstinIdx + 1]);
  }

  return "Unknown Vendor";
};

// Bills use many everyday synonyms for "phone number", not just the word
// "Phone" — Contact, Cell, Mob, WhatsApp, Helpline, Landline, "Reach us at"
// are all common in day-to-day/reporting language. Try each label pattern in
// turn, then fall back to a bare 10-digit Indian mobile number if no label
// is present at all (tolerating the common "XXXXX XXXXX" spacing).
const PHONE_LABEL_WORD = "(?:phone|mobile|contact|tel(?:ephone)?|cell|mob|ph|call(?:\\s*us)?|whatsapp|helpline|landline)";
const PHONE_PATTERNS = [
  new RegExp(`${PHONE_LABEL_WORD}\\s*(?:no\\.?|number|num\\.?|details?)?\\s*[:\\-]?\\s*([\\d\\s+()-]{8,})`, "i"),
  /reach(?:\s*(?:us|out))?\s*(?:at|on)?\s*[:\-]?\s*([\d\s+()-]{8,})/i,
];

const findPhoneNumber = (text) => {
  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/[^\d+]/g, "");
  }
  const bare = text.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/);
  return bare ? bare[0].replace(/[^\d+]/g, "") : "";
};

const guessPhone = (text) => {
  const vendorLines = extractVendorSection(text);
  if (vendorLines.length === 0) return ""; // No vendor section found
  return findPhoneNumber(vendorLines.join(" "));
};

const guessMaterialItem = (text) => {
  const lines = normalizeLines(text);

  const labeledLine = lines.find((line) => /^material(?:\s*(?:item|description))?\s*[:\-]?\s+\S/i.test(line));
  if (labeledLine) {
    const labeled = labeledLine.replace(/^material(?:\s*(?:item|description))?\s*[:\-]?\s*/i, "").trim();
    if (labeled) return labeled;
  }

  // Look for "Expense Details" or "Item Description" section
  let expenseSectionIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(?:expense details|item description|items|services|products)\s*[:\-]?\s*$/i.test(lines[i]) || 
        /item|description|material|product/.test(lines[i]) && /qty|quantity|unit price|amount/i.test(lines[i])) {
      expenseSectionIdx = i;
      break;
    }
  }
  
  // Extract items from the table/section
  if (expenseSectionIdx >= 0) {
    for (let i = expenseSectionIdx + 1; i < lines.length; i += 1) {
      const line = lines[i];
      // Skip the table's own column-header row (e.g. "Item Description
      // Category Quantity Unit Price Amount") — it matches the same
      // item+qty/amount shape used to find expenseSectionIdx above, so
      // without an explicit skip it gets mistaken for the item itself.
      if (/item|description|material|product/i.test(line) && /qty|quantity|unit price|amount/i.test(line)) {
        continue;
      }
      // Skip headers, totals, metadata
      if (/^(?:subtotal|cgst|sgst|igst|tax|total|balance|payment|approval|submitted|approved|grand)/i.test(line) ||
          /(?:qty|quantity|unit price|amount|rate|₹|\d{1,2}%)/i.test(line)) {
        if (/[A-Z][a-z]+/.test(line) && !/(?:qty|quantity|amount|rate|price|₹|\%)/i.test(line.split(/\s+/)[0])) {
          return line.split(/(?:\d+|\s{2,})/)[0].trim();
        }
        continue;
      }
      // Return first meaningful item description
      if (line.length > 5 && !/^[0-9]/.test(line)) {
        return line;
      }
    }
  }
  
  // Fallback: Look for known material keywords
  const known = text.match(/steel|cement|fabric|packaging|parts|timber|plastic|copper|aluminium|paper|ink|stationery|supplies|cartridge|kit/i);
  return known ? known[0] : "";
};

const guessQuantity = (text) => {
  // Look in expense details section first
  const lines = normalizeLines(text);
  let expenseSectionIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(?:expense details|item description|items)\s*[:\-]?\s*$/i.test(lines[i]) || 
        /item|description/.test(lines[i]) && /qty|quantity|unit price/.test(lines[i])) {
      expenseSectionIdx = i;
      break;
    }
  }
  
  let searchText = text;
  if (expenseSectionIdx >= 0) {
    searchText = lines.slice(expenseSectionIdx, Math.min(expenseSectionIdx + 10, lines.length)).join(" ");
  }
  
  const quantity = searchText.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|ton|tons|box|boxes|unit|units|pcs|pieces|ltr|litre|litres|l|mtr|meter|meters|ream|reams)\b/i);
  return quantity ? quantity[0] : "";
};

const guessCategory = (text) => {
  const lower = text.toLowerCase();
  
  // Check for vendor category clues in materials/items.
  // "vi" and "rent" are word-bounded — unbounded they matched the "vi" inside
  // "visit"/"visiting" (Phone/Internet false positive) and the "rent" inside
  // "current"/"different" (Rent false positive) on real bill text.
  if (/printer|paper|ink|cartridge|stationery|office/.test(lower)) return "Office Supplies";
  if (/airtel|jio|\bvi\b|vodafone|bsnl|phone|mobile|broadband|internet|telecom/.test(lower)) return "Phone / Internet";
  if (/uber|ola|fuel|petrol|diesel|unleaded|rail|flight|hotel|travel|cab|taxi/.test(lower)) return "Travel";
  if (/restaurant|food|cafe|swiggy|zomato|meal|lunch|dinner/.test(lower)) return "Food";
  if (/\brent\b|lease|property/.test(lower)) return "Rent";
  if (/electric|power|water|utility|gas|supply|energy/.test(lower)) return "Utilities";
  if (/raw|material|steel|cement|fabric|parts|goods|product|chemicals|metal|plastic|wood/.test(lower)) return "Raw Materials";
  
  return "Other";
};

const guessVendorFromLines = (lines) => {
  const labeled = extractLabeledVendorName(lines);
  return labeled ? tidyVendor(labeled) : guessVendor(lines.join("\n"));
};

const guessPhoneFromLines = (lines) => findPhoneNumber(lines.join(" "));

const extractVendorGstinFromLines = (lines) => {
  const match = lines.join(" ").match(GSTIN_SEARCH_PATTERN);
  return match ? correctGstinChecksumLetter(match[0].toUpperCase()) : "";
};

const extractVendorAddress = (lines) =>
  lines
    .filter((line) => {
      const cleaned = cleanVendorName(line);
      return (
        cleaned &&
        !new RegExp(`^${PHONE_LABEL_WORD}\\b`, "i").test(cleaned) &&
        !/^(?:reach|gstin|gst no|vendor|supplier|seller)\b/i.test(cleaned)
      );
    })
    .slice(1, 4)
    .map((line) => line.replace(/^(?:address|addr\.?)\s*[:\-]?\s*/i, "").trim())
    .join(", ");

const clearNonSupplierOcrFields = () => {
  fields.category.value = "Other";
  fields.amount.value = "";
  fields.tax.value = "";
  fields.materialItem.value = "";
  fields.quantity.value = "";
};

// Named Entity Recognition — Xenova/bert-base-NER (an ONNX build of
// dslim/bert-base-NER) running fully client-side via transformers.js/WASM,
// same "no server, ships with the page" pattern as the Tesseract.js OCR
// engine. Used specifically as a VENDOR-NAME fallback, not a replacement for
// the regex/label-based extraction above: bert-base-NER recognizes PERSON/
// ORGANIZATION/LOCATION/MISC spans, which is exactly suited to catching a
// business name when a bill has no explicit "Vendor Name:" label for the
// existing rule-based extractor to latch onto — it has no concept of dates,
// amounts, or GSTINs, so those stay purely rule-based.
let nerPipelinePromise = null;
const getNerPipeline = () => {
  if (!nerPipelinePromise) {
    nerPipelinePromise = import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0").then(
      ({ pipeline }) =>
        pipeline("token-classification", "Xenova/bert-base-NER", {
          progress_callback: (event) => {
            if (!fields.nerStatus) return;
            fields.nerStatus.hidden = false;
            if (event.status === "progress" && typeof event.progress === "number") {
              fields.nerStatus.textContent = `Loading AI model for supplier detection (one-time download)... ${Math.round(event.progress)}%`;
            } else if (event.status === "initiate" || event.status === "download") {
              fields.nerStatus.textContent = "Loading AI model for supplier detection (one-time download)...";
            }
          },
        })
    );
  }
  return nerPipelinePromise;
};

const guessVendorWithNer = async (text) => {
  const classifier = await getNerPipeline();
  // The vendor/business name is almost always the very first line of a bill.
  // Testing showed feeding the model several lines at once occasionally
  // fuses the org span with an adjacent line (e.g. "Company Name" + the next
  // line's address town both tagged as one entity) — restricting to just the
  // first line removes that ambiguity rather than trying to filter it out
  // after the fact.
  const firstLine = normalizeLines(text)[0] || text.slice(0, 100);
  const entities = await classifier(firstLine, { aggregation_strategy: "simple" });
  const org = entities
    .filter((entity) => entity.entity_group === "ORG" && entity.score > 0.5)
    .sort((a, b) => b.score - a.score)[0];
  return org ? org.word.trim() : "";
};

// Best-effort, free, keyless supplier lookup via DuckDuckGo's Instant Answer
// API (which sources its Abstract field from Wikipedia). No API key, no
// backend — a plain client-side fetch, same "free/local first" pattern as
// the rest of this app's AI features. Coverage is real but limited: it finds
// large/known companies (has a Wikipedia entry) and returns nothing for most
// small local suppliers, which this app honestly surfaces rather than hides.
const searchWebUrl = (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

// The lookup API has no confidence field of its own, so this measures the one
// thing we actually can: how well the result's title matches the supplier
// name that was searched (plus a small boost if DuckDuckGo tags it as a
// "company"/business entity). This is a MATCH confidence — whether the result
// is really about the searched supplier — not a claim about whether the
// Wikipedia text itself is factually accurate.
const significantWords = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["the", "and", "ltd", "llp", "inc", "pvt", "private", "limited"].includes(word));

// DuckDuckGo's disambiguation candidates (RelatedTopics) don't carry an Entity
// field like the primary Abstract result does, so a plain word-overlap score
// can't tell a real company apart from an unrelated topic that merely shares
// one word (e.g. "Secure Shell" the network protocol vs "Shell plc" the fuel
// company, for a query starting with "Shell"). This text-based hint fills
// that gap for the candidate-list path. Since the underlying data is sourced
// from Wikipedia, which skews heavily toward films/celebrities/sports for any
// common word, this also explicitly penalizes those sectors — Track Mint's
// suppliers are businesses, not movies, so a film sharing a word with a
// vendor name should rank below (or be dropped in favor of) an actual company.
const BUSINESS_HINT_WORDS = [
  "company", "corporation", "plc", "multinational", "enterprise", "enterprises", "retailer", "retail",
  "headquartered", "founded", "manufactur", "supplier", "traders", "industries", "group", "chain",
  "franchise", "dealership", "petrol", "fuel", "store", "shop", "distributor", "wholesaler", "exporter",
  "importer", "hardware", "textile", "chemicals", "electronics", "engineering", "construction",
  "logistics", "packaging", "machinery", "components", "spare parts", "raw material", "msme", "sme",
];
const NON_BUSINESS_SECTOR_WORDS = [
  // Entertainment / media
  "film", "movie", "actor", "actress", "singer", "musician", "album", "song", "television series",
  "tv series", "novel", "video game", "wrestler", "band", "celebrity", "filmmaker", "rapper", "comedian",
  "anime", "web series",
  // Sports
  "footballer", "cricketer", "athlete", "football club", "cricket club", "sports club", "national team",
  "olympic", "tournament", "hockey club", "basketball club",
  // Religion / mythology
  "deity", "hinduism", "mythology", "goddess", "temple dedicated", "sacred",
  // Geography
  "country in", "state in", "city in", "district in", "river in", "village in", "island in", "capital of",
  // Politics / history
  "emperor", "dynasty", "empire", "political party", "prime minister", "president of",
  // Unrelated technical/academic topics (protocols, languages, etc.)
  "protocol", "programming language", "operating system", "algorithm",
];
const isNonBusinessTopic = (data) => {
  const entity = (data.Entity || "").toLowerCase();
  const text = (data.Abstract || "").toLowerCase();
  return NON_BUSINESS_SECTOR_WORDS.some((word) => entity.includes(word) || text.includes(word));
};
const looksLikeBusiness = (data) => {
  const entity = (data.Entity || "").toLowerCase();
  if (entity.includes("compan") || entity.includes("business")) return true;
  const text = (data.Abstract || "").toLowerCase();
  return BUSINESS_HINT_WORDS.some((word) => text.includes(word));
};

const supplierMatchConfidence = (queryName, data) => {
  const queryWords = significantWords(queryName);
  const headingWords = new Set(significantWords(data.Heading || ""));
  const abstractWords = new Set(significantWords(data.Abstract || ""));
  if (!queryWords.length) return { score: 0, label: "Low", className: "confidence-low" };

  const matchedInHeading = queryWords.filter((word) => headingWords.has(word)).length;
  const matchedInAbstract = queryWords.filter((word) => abstractWords.has(word)).length;
  let score = Math.max(matchedInHeading / queryWords.length, matchedInAbstract / queryWords.length);
  if (looksLikeBusiness(data)) {
    score = Math.min(1, score + 0.15);
  }
  if (isNonBusinessTopic(data)) {
    score = Math.max(0, score - 0.4);
  }

  if (score >= 0.7) return { score, label: "High", className: "confidence-high" };
  if (score >= 0.35) return { score, label: "Medium", className: "confidence-medium" };
  return { score, label: "Low", className: "confidence-low" };
};

const fetchDdgTopic = async (query, { skipDisambig = false } = {}) => {
  try {
    const params = new URLSearchParams({ q: query, format: "json", no_html: "1" });
    if (skipDisambig) params.set("skip_disambig", "1");
    const response = await fetch(`https://api.duckduckgo.com/?${params.toString()}`);
    if (response.ok) return await response.json();
  } catch (error) {
    console.warn("Supplier lookup failed:", error);
  }
  return null;
};

const renderSupplierCard = (name, data) => {
  const heading = data.Heading || name;
  const summary = data.AbstractText || data.Abstract || "";
  const truncated = summary.length > 260 ? `${summary.slice(0, 260).trim()}...` : summary;
  const image = data.Image ? (String(data.Image).startsWith("http") ? data.Image : `https://duckduckgo.com${data.Image}`) : "";
  const confidence = supplierMatchConfidence(name, data);
  fields.supplierLookup.innerHTML = `
    <div class="supplier-lookup-card">
      ${image ? `<img src="${escapeHtml(image)}" alt="" />` : ""}
      <div>
        <strong>${escapeHtml(heading)}</strong>
        ${summary ? `<p>${escapeHtml(truncated)}</p>` : ""}
        <div class="supplier-lookup-meta">
          ${String(data.AbstractURL || "").startsWith("http") ? `<a href="${escapeHtml(data.AbstractURL)}" target="_blank" rel="noopener">Source: ${escapeHtml(data.AbstractSource || "Wikipedia")} &#8599;</a>` : ""}
          <span class="supplier-lookup-disclaimer">Free public lookup, not an official business/GST verification.</span>
        </div>
        <div class="confidence-badge ${confidence.className}" title="How closely this result's title matches the scanned supplier name — not a measure of the information's factual accuracy.">
          Match confidence: ${confidence.label} (${Math.round(confidence.score * 100)}%)
        </div>
      </div>
    </div>
  `;
};

// DuckDuckGo's RelatedTopics entries don't come with a clean name field — the
// cleanest name is the last segment of the topic's own URL (its Wikipedia
// page title), not the run-on Text sentence, which just repeats it.
const parseRelatedTopic = (topic) => {
  const pageTitle = decodeURIComponent(String(topic.FirstURL || "").split("/").pop() || "").replace(/_/g, " ");
  let text = topic.Text || "";
  if (pageTitle && text.startsWith(pageTitle)) {
    text = text.slice(pageTitle.length).trim();
  }
  return { heading: pageTitle || text.slice(0, 40), text, url: topic.FirstURL || "" };
};

let currentSupplierCandidates = [];

const renderSupplierCandidates = (name, candidates) => {
  currentSupplierCandidates = candidates;
  const rows = candidates
    .map((candidate, index) => {
      const confidence = supplierMatchConfidence(name, { Heading: candidate.heading, Abstract: candidate.text });
      return `
        <div class="supplier-candidate">
          <div>
            <strong>${escapeHtml(candidate.heading)}</strong>
            <p>${escapeHtml(candidate.text)}</p>
            <div class="confidence-badge ${confidence.className}" title="How closely this candidate matches the scanned supplier name — not a measure of the information's factual accuracy.">
              Match confidence: ${confidence.label} (${Math.round(confidence.score * 100)}%)
            </div>
          </div>
          <div class="supplier-candidate-actions">
            ${candidate.url ? `<a href="${escapeHtml(candidate.url)}" target="_blank" rel="noopener">View &#8599;</a>` : ""}
            <button type="button" class="secondary" data-use-candidate="${index}">Use this</button>
          </div>
        </div>
      `;
    })
    .join("");
  fields.supplierLookup.innerHTML = `
    <div class="supplier-lookup-candidates">
      <p class="supplier-lookup-status">OCR text can be inaccurate — here are the closest free-source matches for "${escapeHtml(name)}". Pick the right one, or search manually:</p>
      ${rows}
      <div class="supplier-lookup-meta"><a href="${escapeHtml(searchWebUrl(name))}" target="_blank" rel="noopener">None of these — search the web instead &#8599;</a></div>
    </div>
  `;
};

const selectSupplierCandidate = (index) => {
  const candidate = currentSupplierCandidates[index];
  if (!candidate) return;
  fields.vendor.value = candidate.heading;
  renderSupplierCard(candidate.heading, {
    Heading: candidate.heading,
    Abstract: candidate.text,
    AbstractText: candidate.text,
    AbstractURL: candidate.url,
    AbstractSource: "Wikipedia",
  });
};

const lookupSupplierInfo = async (vendorName) => {
  const name = (vendorName || "").trim();
  if (name.length < 3) {
    fields.supplierLookup.hidden = true;
    fields.supplierLookup.innerHTML = "";
    return;
  }

  fields.supplierLookup.hidden = false;
  fields.supplierLookup.innerHTML = `<p class="supplier-lookup-status">Checking free public sources for "${escapeHtml(name)}"...</p>`;

  const primary = await fetchDdgTopic(name, { skipDisambig: true });
  if (primary && primary.Abstract && !isNonBusinessTopic(primary)) {
    renderSupplierCard(name, primary);
    return;
  }

  // The exact full name rarely matches (a legal-entity-style name is often
  // just not itself a distinct organization DuckDuckGo knows), but a
  // progressively shorter PREFIX of it often does — and stays much closer to
  // the actual searched name than jumping straight to a single word. E.g.
  // for "Tata Steel Processing and Distribution Ltd", "Tata Steel" alone
  // correctly finds the real Tata Steel Limited, which is a far more
  // specific and relevant match than "Tata" alone matching only the much
  // broader, less specific "Tata Group" — verified via direct API calls
  // before writing this, not assumed. Tried longest-prefix-first, and
  // sequentially (not in parallel) so it can stop at the first, most
  // specific hit instead of firing every shorter prefix unnecessarily.
  const prefixWords = significantWords(name);
  for (let take = prefixWords.length - 1; take >= 2; take -= 1) {
    const phrase = prefixWords.slice(0, take).join(" ");
    const prefixResult = await fetchDdgTopic(phrase, { skipDisambig: true });
    if (prefixResult && prefixResult.Abstract && !isNonBusinessTopic(prefixResult)) {
      renderSupplierCard(name, prefixResult);
      return;
    }
  }

  // OCR garbling doesn't hit every word the same way — the brand word might
  // read cleanly while a later word is mangled, or vice versa. Reading only
  // the first word (as this used to) misses any name where OCR happened to
  // get a LATER word right instead. So every significant word in the full
  // name gets its own lookup, run in parallel, and every word's disambiguation
  // candidates are pooled together before ranking — the whole name is read,
  // not just its first token.
  const words = significantWords(name).slice(0, 6);
  let candidates = [];
  if (words.length) {
    const fallbackResults = await Promise.all(words.map((word) => fetchDdgTopic(word)));
    const topicCandidates = [];
    fallbackResults.forEach((fallback, index) => {
      if (!fallback) return;
      (fallback.RelatedTopics || [])
        .filter((topic) => topic.FirstURL && topic.Text)
        .map(parseRelatedTopic)
        .forEach((candidate) => topicCandidates.push(candidate));
      if (fallback.Abstract) {
        topicCandidates.push({
          heading: fallback.Heading || words[index],
          text: fallback.AbstractText || fallback.Abstract,
          url: fallback.AbstractURL || "",
        });
      }
    });

    // The candidate list comes from single generic words (not the full
    // vendor name), so word-overlap alone is a weak signal here — matching
    // just "Krishna" out of "Krishna Traders" scores the same whether the
    // result is a real trading company or, say, a religious mantra. A cheap
    // pre-filter narrows to plausible candidates first (business-hint text,
    // no known-irrelevant category, top-scoring by word overlap).
    const seen = new Set();
    const preFiltered = topicCandidates
      .filter((candidate) => {
        if (!candidate.heading || seen.has(candidate.heading)) return false;
        if (isNonBusinessTopic({ Abstract: candidate.text })) return false;
        if (!looksLikeBusiness({ Abstract: candidate.text })) return false;
        seen.add(candidate.heading);
        return true;
      })
      .sort(
        (a, b) =>
          supplierMatchConfidence(name, { Heading: b.heading, Abstract: b.text }).score -
          supplierMatchConfidence(name, { Heading: a.heading, Abstract: a.text }).score
      )
      .slice(0, 6);

    // RelatedTopics entries don't carry their own Entity field, so that
    // cheap text heuristic alone can't tell a real company apart from a
    // generic encyclopedia concept that merely uses business-adjacent
    // vocabulary — e.g. "Materiel" (a military-logistics TERM, not a
    // company) surfaced from searching "Supplies" alone, since its
    // description mentions "supply-chain management". Verified via direct
    // API calls: a dedicated lookup of a candidate's own heading DOES return
    // a structured Entity field ("company" for every real business tested —
    // Tata Steel, Shell plc, Mohan Meakin — vs. empty for Materiel), so each
    // pre-filtered candidate gets that one extra verification call before
    // being shown at all.
    const verified = await Promise.all(
      preFiltered.map(async (candidate) => {
        const ownTopic = await fetchDdgTopic(candidate.heading, { skipDisambig: true });
        const entity = (ownTopic?.Entity || "").toLowerCase();
        // No fallback to the text heuristic here on purpose — that's the
        // exact check that let "Materiel" through in the first place (its
        // description mentions "supply-chain", which matches this file's own
        // business-hint word list). An empty Entity from a dedicated,
        // disambiguated lookup is itself real evidence this isn't a company,
        // not an inconclusive result to paper over — every verified real
        // business tested (Shell plc, Mohan Meakin, Tata Steel, TCS) reliably
        // returns Entity "company" from this same kind of lookup.
        const isVerifiedBusiness =
          entity.includes("compan") || entity.includes("business") || entity.includes("organis") || entity.includes("organiz") || entity.includes("brand");
        return isVerifiedBusiness ? candidate : null;
      })
    );

    candidates = verified
      .filter(Boolean)
      .sort(
        (a, b) =>
          supplierMatchConfidence(name, { Heading: b.heading, Abstract: b.text }).score -
          supplierMatchConfidence(name, { Heading: a.heading, Abstract: a.text }).score
      )
      .slice(0, 4);
  }

  if (candidates.length) {
    renderSupplierCandidates(name, candidates);
  } else {
    fields.supplierLookup.innerHTML = `
      <div class="supplier-lookup-card supplier-lookup-empty">
        <div>
          <strong>No public info found for "${escapeHtml(name)}"</strong>
          <p>This is common for small/local suppliers that don't have an online presence indexed by the free lookup.</p>
          <div class="supplier-lookup-meta">
            <a href="${escapeHtml(searchWebUrl(name))}" target="_blank" rel="noopener">Search the web instead &#8599;</a>
          </div>
        </div>
      </div>
    `;
  }
};

const extractDetails = async () => {
  const raw = fields.ocrText.value || "";
  const text = normalizeOcrText(raw.trim());
  if (!text) {
    alert("Paste bill text or use the sample bill first.");
    return;
  }
  // Show the corrected text, not just use it internally — otherwise the OCR
  // box still displays misread currency symbols/digits even though the
  // parsed fields below are already reading the fixed version.
  fields.ocrText.value = text;
  fields.nerStatus.hidden = true;
  fields.supplierLookup.hidden = true;
  fields.supplierLookup.innerHTML = "";
  clearNonSupplierOcrFields();
  const normalizedDate = parseDate(text);
  if (normalizedDate) {
    fields.date.value = normalizedDate;
  }
  if (fields.date.value && !isPlausibleBillDate(fields.date.value)) {
    fields.dateWarning.hidden = false;
    fields.dateWarning.textContent = `OCR read the date as ${formatDisplayDate(fields.date.value)}, which looks unlikely for a real bill — please double-check it.`;
  } else {
    fields.dateWarning.hidden = true;
  }

  const amountResult = parseAmount(text);
  fields.amount.value = amountResult.value ? amountResult.value : "";
  if (amountResult.value && !amountResult.confident) {
    fields.amountWarning.hidden = false;
    fields.amountWarning.textContent = `Could not find an explicit total on the bill — ${formatMoney(amountResult.value)} is an estimate from visible line items, and may be missing tax or other charges. Please verify against the bill.`;
  } else {
    fields.amountWarning.hidden = true;
  }
  const lineItemTotalForTax = sumLineItemAmounts(normalizeLines(text), /\b(?:cgst|sgst|igst|gstin|tax)\b/i);
  const tax = parseTax(text, lineItemTotalForTax || undefined);
  fields.tax.value = tax ? tax : "";
  fields.materialItem.value = guessMaterialItem(text);
  fields.quantity.value = guessQuantity(text);
  fields.category.value = guessCategory(text);

  // Prefer strict vendor section extraction when the document contains an explicit Vendor/Supplier area
  let vendorFromRules = "";
  if (hasExplicitVendorSection(text)) {
    const vendorLines = extractVendorSection(text);
    vendorFromRules = guessVendorFromLines(vendorLines);
    fields.supplierPhone.value = guessPhoneFromLines(vendorLines);
    fields.gstin.value = extractVendorGstinFromLines(vendorLines);
    const address = extractVendorAddress(vendorLines);
    fields.notes.value = "Captured from Track Mint OCR" + (address ? ` | Vendor Address: ${address}` : "");
  } else {
    vendorFromRules = guessVendor(text);
    fields.supplierPhone.value = guessPhone(text) || guessPhoneFromLines(normalizeLines(text));
    fields.gstin.value = extractVendorGstin(text);
    fields.notes.value = "Captured from Track Mint OCR";
  }
  fields.vendor.value = vendorFromRules;
  setWorkflowStage("classify");

  if (!vendorFromRules || vendorFromRules.length < 3) {
    try {
      const nerVendor = await guessVendorWithNer(text);
      if (nerVendor) {
        fields.vendor.value = nerVendor;
        fields.nerStatus.textContent = `AI (NER) detected supplier name: "${nerVendor}"`;
        fields.nerStatus.hidden = false;
      } else {
        fields.nerStatus.hidden = true;
      }
    } catch (error) {
      console.warn("NER vendor detection failed:", error);
      fields.nerStatus.hidden = true;
    }
  }

  lookupSupplierInfo(fields.vendor.value);
};

const dataURLToBlob = (dataURL) => {
  const [prefix, base64] = dataURL.split(",");
  const contentType = prefix.split(":")[1].split(";")[0];
  const raw = atob(base64);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; i += 1) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

const pdfToImageBlob = async (file) => {
  if (!window.pdfjsLib) {
    throw new Error("PDF support not loaded.");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  // A PDF page's point-size doesn't tell you the resolution of a photo
  // embedded inside it — testing against a real receipt PDF found the source
  // photo was ~3680px on its long edge while a scale of 2.2 was only
  // rendering ~1700px, throwing away real detail Tesseract could have used.
  // A higher scale costs some render time but never loses information.
  const viewport = page.getViewport({ scale: 4 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) return resolve(blob);
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataURLToBlob(dataUrl));
    }, "image/png");
  });
};

const extractPdfText = async (file) => {
  if (!window.pdfjsLib) {
    throw new Error("PDF support not loaded.");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + " \n ";
  }
  return text.replace(/\s{2,}/g, " ").trim();
};

const preprocessImageBlob = async (blob) => {
  const imageUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imageUrl;
  });
  URL.revokeObjectURL(imageUrl);

  // Scale toward a target long-edge resolution rather than always doubling —
  // a low-res upload gets boosted for better OCR detail, but a modern phone
  // camera photo (already 3000-4000px+) doesn't get needlessly blown up
  // further, which would just cost memory/time on mobile for no benefit.
  const TARGET_LONG_EDGE = 2800;
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight, 1);
  const scale = Math.min(3, Math.max(0.5, TARGET_LONG_EDGE / longEdge));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => canvas.toBlob((processed) => resolve(processed), "image/png"));
};

// A single reusable Tesseract.js worker — the WASM core + English language
// data (~2-4MB) load once per session on first scan, not on every scan.
let ocrWorkerPromise = null;

const getOcrWorker = () => {
  if (!ocrWorkerPromise) {
    if (!window.Tesseract) {
      throw new Error("OCR engine failed to load — check your internet connection and reload the page.");
    }
    ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
      logger: (message) => {
        if (!message || !message.status) return;
        if (message.status === "recognizing text") {
          setOcrProgress("Reading bill text...", 0.5 + (message.progress || 0) * 0.5);
        } else {
          setOcrProgress(`Loading OCR engine (${message.status})...`, (message.progress || 0) * 0.5);
        }
      },
    }).then(async (worker) => {
      // PSM 6 (uniform block of text) tested most reliably against real
      // receipts — sparser modes (4/11) misread a receipt's dashed/starred
      // border patterns as extra text columns and injected garbage lines.
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      return worker;
    });
  }
  return ocrWorkerPromise;
};

const runBrowserOcr = async (file) => {
  const blobToSend = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    ? await pdfToImageBlob(file)
    : await preprocessImageBlob(file);

  if (!blobToSend) {
    throw new Error("Failed to prepare the image for OCR.");
  }

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blobToSend);
  return (data?.text || "").trim();
};

// Digit/letter confusion is the dominant error mode on degraded (dot-matrix,
// thermal, low-light) receipts — Tesseract has to choose between ~62
// alphanumeric characters per glyph. Restricting the character set to just
// digits and date separators removes almost all of that ambiguity for a
// second pass, so it reads numerals noticeably more accurately than the
// general-purpose first pass. This mutates the shared OCR worker's
// parameters, so it MUST restore them afterward or every future normal scan
// would silently be limited to digits too.
const rescanDateWithDigitWhitelist = async (blob) => {
  const worker = await getOcrWorker();
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789/-:. " });
    const { data } = await worker.recognize(blob);
    return (data?.text || "").trim();
  } finally {
    await worker.setParameters({ tessedit_char_whitelist: "" });
  }
};

const hasTotalIndicators = (text) =>
  /\b(?:grand\s*total|sub[\s-]*total|total\s*amount|amount\s*payable|net\s*amount|balance\s*due|cgst|sgst|igst)\b/i.test(text || "");

// PSM 6 ("uniform block of text", this app's default) was chosen for plain
// single-column receipts, but formal multi-column tax invoices with a
// bordered/shaded table structure are a different layout the same mode
// doesn't handle as well — verified directly (not assumed) by rendering a
// synthetic invoice matching that structure and running it through every
// PSM mode: 6 dropped the entire table header and line items outright, 11
// and 12 dropped or garbled the Grand Total row, while 3 (fully automatic
// page segmentation) read the whole table correctly, including Grand Total.
// PSM 4 also worked in that test but was previously found to misread a
// receipt's dashed/starred border patterns as extra text columns, so 3 is
// the safer pick for a supplementary pass that must not regress receipts.
const rescanWithAutoPageSegmentation = async (blob) => {
  const worker = await getOcrWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
    const { data } = await worker.recognize(blob);
    return (data?.text || "").trim();
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
  }
};

const runImageOcr = async () => {
  const file = fields.image.files[0];
  if (!file) {
    alert("Upload or capture a bill image first.");
    return;
  }
  if (file.type === "text/plain") {
    const text = await file.text();
    fields.ocrText.value = text;
    await extractDetails();
    setOcrProgress("Text loaded from file. Supplier details populated.", 1);
    return;
  }
  let ocrFile = file;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      setOcrProgress("Rendering first page of PDF for OCR...", 0.15);
      const imageBlob = await pdfToImageBlob(file);
      if (!imageBlob) throw new Error("Failed to render PDF page.");
      ocrFile = new File([imageBlob], "bill-preview.png", { type: "image/png" });
    } catch (error) {
      alert("Unable to read PDF. Please use an image bill or plain text file.");
      setOcrProgress("PDF reading failed.", 1);
      return;
    }
  }

  try {
    setOcrProgress("Starting OCR...", 0.05);
    let text = await runBrowserOcr(ocrFile);
    if (text) {
      // A formal invoice's bordered/shaded summary table (Subtotal/tax/Grand
      // Total) can go missing from the general-purpose pass entirely, not
      // just misread — verified directly against a synthetic invoice with
      // this exact structure. When nothing total/tax-shaped survived at all,
      // retry with a page-segmentation mode built for structured, mixed-
      // layout pages and use that reading if it actually finds what the
      // first pass missed.
      if (!hasTotalIndicators(text)) {
        setOcrProgress("No bill total found — re-scanning with a different layout mode...", 0.55);
        try {
          const layoutBlob = await preprocessImageBlob(ocrFile);
          const layoutText = await rescanWithAutoPageSegmentation(layoutBlob);
          if (hasTotalIndicators(layoutText)) {
            text = layoutText;
          }
        } catch (error) {
          console.warn("Layout re-scan failed:", error);
        }
      }

      fields.ocrText.value = text;
      await extractDetails();

      // The general-purpose OCR pass found a date, but it landed outside a
      // plausible range for a real bill — most likely a digit misread, not
      // a genuinely decades-old invoice. Re-scan the same image with the
      // engine restricted to digits only, which is meaningfully more
      // accurate for numerals, and use that reading if it actually resolves
      // to a plausible date. This corrects the OCR reading itself rather
      // than guessing or discarding it.
      if (fields.date.value && !isPlausibleBillDate(fields.date.value)) {
        const firstPassDate = fields.date.value;
        setOcrProgress("Bill date looked unlikely — re-scanning it more closely...", 0.9);
        try {
          const digitBlob = await preprocessImageBlob(ocrFile);
          const digitOnlyText = await rescanDateWithDigitWhitelist(digitBlob);
          const rescannedDate = parseDate(digitOnlyText);
          if (rescannedDate && isPlausibleBillDate(rescannedDate)) {
            fields.date.value = rescannedDate;
            fields.dateWarning.hidden = false;
            fields.dateWarning.textContent = `Corrected via a numerals-only re-scan: first read as ${formatDisplayDate(firstPassDate)}, corrected to ${formatDisplayDate(rescannedDate)}. Please verify against the bill.`;
          } else {
            fields.dateWarning.hidden = false;
            fields.dateWarning.textContent = `OCR read the date as ${formatDisplayDate(firstPassDate)}, which looks unlikely for a real bill, and a closer re-scan couldn't confirm a better reading — please check the bill and correct it manually.`;
          }
        } catch (error) {
          console.warn("Digit-only date rescan failed:", error);
        }
      }

      setOcrProgress("OCR complete. Supplier details extracted.", 1);
      return;
    }
    setOcrProgress("No text detected in the image. Try a clearer photo.", 1);
  } catch (error) {
    console.warn("Browser OCR failed:", error);
    setOcrProgress("OCR failed. Check your internet connection (needed once, to load the OCR engine) and try again.", 1);
  }
};

const playAlarm = () => {
  if (!fields.alarmEnabled.checked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const now = context.currentTime;
    [0, 0.22, 0.44].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.18);
    });
  } catch (error) {
    // Some browsers block audio when permission is unavailable.
  }
};

const getAlertPhone = () => {
  const explicit = state.settings.alertPhone?.trim();
  if (explicit) return explicit;
  return state.profile.businessPhone?.trim() || "";
};

const getAlertEmail = () => {
  const explicit = state.settings.alertEmail?.trim();
  if (explicit) return explicit;
  return state.profile.email?.trim() || "";
};

const buildMailtoUrl = (email, subject, message) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

const showSupplyAlert = (expense, rawTotal, limit, playSound = true) => {
  const phone = getAlertPhone();
  const email = getAlertEmail();
  const smsEnabled = state.settings.alertViaSms !== false;
  const emailEnabled = !!state.settings.alertViaEmail;
  const targetLabel = "Owner/Manager";
  const message = [
    "Track Mint alert: supply expense limit crossed.",
    `Raw material spend: INR ${formatMoney(rawTotal)}.`,
    `Limit: INR ${formatMoney(limit)}.`,
    `Supplier: ${expense.vendor || "Not entered"}.`,
    `Material: ${expense.materialItem || "Not entered"}.`,
    `Latest expense: INR ${formatMoney(expense.amount)}.`,
  ].join(" ");
  fields.alertPanel.hidden = false;
  fields.alertMessage.textContent = message;

  const showSms = smsEnabled;
  fields.sendSmsButton.hidden = !showSms;
  fields.sendSmsButton.href = phone ? buildSmsUrl(phone, message) : "#";
  fields.sendSmsButton.textContent = phone ? `Send SMS Alert to ${targetLabel}` : "Add Alert Phone in Settings";

  const showEmail = emailEnabled;
  fields.sendEmailButton.hidden = !showEmail;
  fields.sendEmailButton.href = email ? buildMailtoUrl(email, "Track Mint supply expense alert", message) : "#";
  fields.sendEmailButton.textContent = email ? `Send Email Alert to ${targetLabel}` : "Add Alert Email in Settings";

  if (playSound) playAlarm();
};

// Every record currently flagged as a duplicate of at least one other bill —
// the single source of truth for the alert banner's count, the Reports
// "Duplicate matches" tile, AND the "Review Expense" list, so none of the
// three can ever disagree about how many bills are involved.
const getFlaggedDuplicateExpenses = () => state.expenses.filter((expense) => findDuplicateExpenses(expense).length > 0);

const countFlaggedDuplicateExpenses = () => getFlaggedDuplicateExpenses().length;

// Tracks whether the currently-active alert is the same one already shown,
// so the alarm sound only plays when a problem is newly detected — not on
// every re-render while it remains unresolved.
let lastAlertSignature = null;

// Recomputed on every render (including the very first one after a page
// reload) so an unresolved alert reappears automatically instead of only
// existing transiently right after the save that triggered it.
const updateAlertBanner = () => {
  const rawLimit = Number(fields.rawMaterialLimit.value || 0);
  const rawTotal = getRawMaterialTotal();
  const cashFlowExpense = rawLimit > 0 && rawTotal > rawLimit ? state.expenses.find(isRawMaterial) : null;

  if (cashFlowExpense) {
    const isNewAlert = lastAlertSignature !== "cashflow";
    lastAlertSignature = "cashflow";
    showSupplyAlert(cashFlowExpense, rawTotal, rawLimit, isNewAlert);
    return;
  }

  const duplicateExpense = state.expenses.find((expense) => findDuplicateExpenses(expense).length > 0);
  if (duplicateExpense) {
    const totalFlagged = countFlaggedDuplicateExpenses();
    lastAlertSignature = "duplicate";
    fields.alertPanel.hidden = false;
    fields.alertMessage.textContent = `Possible duplicate detected for ${duplicateExpense.vendor || "this supplier"}. ${totalFlagged} bill${totalFlagged === 1 ? "" : "s"} in your records ${totalFlagged === 1 ? "is" : "are"} currently flagged as duplicates.`;
    fields.sendSmsButton.hidden = false;
    fields.sendSmsButton.href = "#";
    fields.sendSmsButton.textContent = "Review Expense";
    fields.sendEmailButton.hidden = true;
    return;
  }

  lastAlertSignature = null;
  fields.alertPanel.hidden = true;
};

const normalizeForMatch = (value) => String(value || "").trim().toLowerCase();

// Every one of these must match for two bills to count as a duplicate of
// each other — vendor first (short-circuits the rest when it already
// differs), then phone, date, category, material, quantity, amount, GSTIN.
// A difference in even one field (e.g. Category) means it is NOT a duplicate.
const findDuplicateExpenses = (expense) =>
  state.expenses.filter((existing) => {
    // Exclude the expense from matching itself when recomputed live over
    // already-saved records (at save time it isn't in state.expenses yet,
    // so this is a no-op there).
    if (expense.id && existing.id === expense.id) return false;
    if (normalizeForMatch(existing.vendor) !== normalizeForMatch(expense.vendor)) return false;
    if (normalizeForMatch(existing.supplierPhone) !== normalizeForMatch(expense.supplierPhone)) return false;
    if (existing.date !== expense.date) return false;
    if (normalizeForMatch(existing.category) !== normalizeForMatch(expense.category)) return false;
    if (normalizeForMatch(existing.materialItem) !== normalizeForMatch(expense.materialItem)) return false;
    if (normalizeForMatch(existing.quantity) !== normalizeForMatch(expense.quantity)) return false;
    if (Number(existing.amount || 0) !== Number(expense.amount || 0)) return false;
    if (normalizeForMatch(existing.gstin) !== normalizeForMatch(expense.gstin)) return false;
    return true;
  });

const buildAiFlags = (expense) => {
  const duplicates = findDuplicateExpenses(expense);
  const amount = Number(expense.amount || 0);
  const supplierTotal = state.expenses
    .filter((item) => normalizeForMatch(item.vendor) === normalizeForMatch(expense.vendor))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rawLimit = Number(fields.rawMaterialLimit.value || 0);
  const rawTotalAfterSave = getRawMaterialTotal() + (isRawMaterial(expense) ? amount : 0);
  return {
    duplicate: duplicates.length > 0,
    duplicateCount: duplicates.length,
    anomaly: amount >= 50000 || (supplierTotal > 0 && amount > supplierTotal * 1.5),
    cashFlowAlert: isRawMaterial(expense) && rawLimit > 0 && rawTotalAfterSave > rawLimit,
  };
};

const describeAiFlags = (flags = {}) => ({
  duplicate: flags.duplicate ? `${flags.duplicateCount} matching saved bill found` : "No duplicate match found",
  anomaly: flags.anomaly ? "Unusual amount pattern detected" : "No unusual amount pattern",
  cashFlowAlert: flags.cashFlowAlert ? "Raw material limit will be crossed" : "No cash flow limit issue",
});

const renderMetricPanels = () => {
  const total = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const gst = state.expenses.reduce((sum, expense) => sum + Number(expense.tax || 0), 0);
  const suppliers = new Set(
    state.expenses.filter((expense) => expense.vendor || expense.supplierPhone).map((expense) => `${expense.vendor}|${expense.supplierPhone}`)
  );
  fields.totalSpend.textContent = `INR ${formatMoney(total)}`;
  fields.gstCredit.textContent = `INR ${formatMoney(gst)}`;
  fields.rawMaterialSpend.textContent = `INR ${formatMoney(getRawMaterialTotal())}`;
  fields.pendingCount.textContent = state.expenses.filter((expense) => expense.status === "Pending").length;
  fields.approvedCount.textContent = state.expenses.filter((expense) => expense.status === "Approved").length;
  fields.supplierCount.textContent = suppliers.size;
};

// Fixed hue order, validated colorblind-safe against this app's chart surfaces
// (adjacent CVD ΔE >= 8, normal-vision floor >= 15 — see styles.css :root).
const CATEGORY_COLOR_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

// Pie/donut charts read reliably only up to ~6 segments; keep the top 5 by
// amount and fold everything past that into a single "Other" slice.
const foldToTopSlices = (totals, maxSlices = 5) => {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (entries.length <= maxSlices) return entries.map(([label, value]) => ({ label, value }));
  const top = entries.slice(0, maxSlices).map(([label, value]) => ({ label, value }));
  const restTotal = entries.slice(maxSlices).reduce((sum, [, value]) => sum + value, 0);
  return [...top, { label: "Other", value: restTotal }];
};

// --- Shared floating tooltip, reused by every dashboard chart ---
const positionChartTooltip = (clientX, clientY) => {
  const tooltip = fields.chartTooltip;
  if (!tooltip || tooltip.hidden) return;
  const offset = 14;
  const rect = tooltip.getBoundingClientRect();
  let x = clientX + offset;
  let y = clientY + offset;
  if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - offset;
  if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - offset;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
};

const showChartTooltip = (clientX, clientY, title, rows) => {
  const tooltip = fields.chartTooltip;
  if (!tooltip) return;
  tooltip.innerHTML = "";
  if (title) {
    const titleEl = document.createElement("div");
    titleEl.className = "chart-tooltip-title";
    titleEl.textContent = title;
    tooltip.appendChild(titleEl);
  }
  rows.forEach(({ label, value, color }) => {
    const row = document.createElement("div");
    row.className = "tooltip-row";
    if (color) {
      const key = document.createElement("span");
      key.className = "tooltip-key";
      key.style.background = color;
      row.appendChild(key);
    }
    const labelEl = document.createElement("span");
    labelEl.className = "tooltip-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.className = "tooltip-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    tooltip.appendChild(row);
  });
  tooltip.hidden = false;
  positionChartTooltip(clientX, clientY);
};

const hideChartTooltip = () => {
  if (fields.chartTooltip) fields.chartTooltip.hidden = true;
};

const tooltipAnchorFromElement = (el) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
};

const bindMarkTooltip = (mark, title, rows) => {
  mark.addEventListener("pointerenter", (event) => showChartTooltip(event.clientX, event.clientY, title, rows));
  mark.addEventListener("pointermove", (event) => positionChartTooltip(event.clientX, event.clientY));
  mark.addEventListener("pointerleave", hideChartTooltip);
  mark.addEventListener("focus", () => {
    const anchor = tooltipAnchorFromElement(mark);
    showChartTooltip(anchor.x, anchor.y, title, rows);
  });
  mark.addEventListener("blur", hideChartTooltip);
};

// Small worth+share KPI cards, one per item — the "how much and what share"
// readout that supplements the donut/bar chart rather than replacing it.
const renderMiniStatCards = (container, items) => {
  if (!container) return;
  container.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "mini-stat-card";
    card.style.setProperty("--stat-color", item.color || "var(--primary)");

    const label = document.createElement("span");
    label.className = "mini-stat-label";
    label.textContent = item.label;
    label.title = item.label;

    const value = document.createElement("span");
    value.className = "mini-stat-value";
    value.textContent = `INR ${formatMoney(item.value)}`;

    const percent = document.createElement("span");
    percent.className = "mini-stat-percent";
    percent.textContent = `${Math.round((item.share || 0) * 100)}% of total`;

    card.append(label, value, percent);
    container.appendChild(card);
  });
};

const renderCategoryDonut = () => {
  const totals = groupTotal(state.expenses, (expense) => expense.category);
  const container = fields.categoryBars;
  container.innerHTML = "";
  if (!Object.keys(totals).length) {
    container.innerHTML = '<p class="empty-state">No category data yet.</p>';
    if (fields.categoryStatCards) fields.categoryStatCards.innerHTML = "";
    return;
  }

  const slices = foldToTopSlices(totals, 5).map((slice, index) => ({
    ...slice,
    color: slice.label === "Other" ? "var(--series-other)" : CATEGORY_COLOR_VARS[index],
  }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;

  // Canvas is bigger than the ring itself so there's room for leader-line
  // callouts outside it — small slices can't fit a legible label inline.
  // (300 leaves enough margin that even a worst-case callout — a slice
  // pointing straight left/right, plus its label text — never clips the edge.)
  const size = 300;
  const center = size / 2;
  const outerR = 92;
  const innerR = 56;
  const midR = (outerR + innerR) / 2;
  const strokeWidth = outerR - innerR;
  const circumference = 2 * Math.PI * midR;
  const gapPx = 3;
  const INLINE_LABEL_THRESHOLD = 0.08;

  let cumulative = 0;
  const segments = slices.map((slice) => {
    const share = slice.value / total;
    const rawLength = share * circumference;
    const dashLength = Math.max(rawLength - gapPx, 0);
    const dashOffset = -cumulative;
    const midAngleDeg = ((cumulative + rawLength / 2) / circumference) * 360 - 90;
    cumulative += rawLength;
    const midAngleRad = (midAngleDeg * Math.PI) / 180;
    const cos = Math.cos(midAngleRad);
    const sin = Math.sin(midAngleRad);
    return {
      ...slice,
      share,
      dashLength,
      dashOffset,
      labelX: center + cos * midR,
      labelY: center + sin * midR,
      cos,
      sin,
    };
  });

  const circles = segments
    .map(
      (seg, index) => `
      <circle
        class="chart-mark" data-index="${index}"
        cx="${center}" cy="${center}" r="${midR}"
        fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${seg.dashLength} ${Math.max(circumference - seg.dashLength, 0)}"
        stroke-dashoffset="${seg.dashOffset}"
        transform="rotate(-90 ${center} ${center})"
        tabindex="0" role="img"
        aria-label="${seg.label}: INR ${formatMoney(seg.value)}, ${Math.round(seg.share * 100)} percent of total spend"
      ></circle>`
    )
    .join("");

  // Big-enough slices get their % set directly on the ring; slices too thin
  // for legible inline text get a leader line pointing out to the label
  // instead — every category still shows a % somewhere on the chart itself.
  const sliceLabels = segments
    .filter((seg) => seg.share >= INLINE_LABEL_THRESHOLD)
    .map(
      (seg) =>
        `<text class="donut-slice-label" x="${seg.labelX.toFixed(1)}" y="${seg.labelY.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${Math.round(seg.share * 100)}%</text>`
    )
    .join("");

  const callouts = segments
    .filter((seg) => seg.share > 0 && seg.share < INLINE_LABEL_THRESHOLD)
    .map((seg) => {
      const side = seg.cos >= 0 ? 1 : -1;
      const calloutR = outerR + 18;
      const startX = center + seg.cos * outerR;
      const startY = center + seg.sin * outerR;
      const endX = center + seg.cos * calloutR;
      const endY = center + seg.sin * calloutR;
      const textX = endX + side * 4;
      return `
        <line class="donut-callout-line" x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" />
        <text class="donut-callout-label" x="${textX.toFixed(1)}" y="${endY.toFixed(1)}" text-anchor="${side > 0 ? "start" : "end"}" dominant-baseline="middle">${Math.round(seg.share * 100)}%</text>
      `;
    })
    .join("");

  const svgWrap = document.createElement("div");
  svgWrap.className = "donut-svg-wrap";
  svgWrap.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Category spend breakdown, total INR ${formatMoney(total)}">
      ${circles}
      ${sliceLabels}
      ${callouts}
      <text class="donut-center-value" x="${center}" y="${center - 6}" text-anchor="middle">INR ${formatMoney(total)}</text>
      <text class="donut-center-label" x="${center}" y="${center + 14}" text-anchor="middle">Total Spend</text>
    </svg>
  `;

  container.append(svgWrap);

  svgWrap.querySelectorAll(".chart-mark").forEach((mark) => {
    const seg = segments[Number(mark.dataset.index)];
    bindMarkTooltip(mark, null, [
      { label: seg.label, value: `INR ${formatMoney(seg.value)} (${Math.round(seg.share * 100)}%)`, color: seg.color },
    ]);
  });

  renderMiniStatCards(fields.categoryStatCards, segments);
};

const renderRecent = () => {
  fields.recentExpenses.innerHTML = "";
  state.expenses.slice(0, 5).forEach((expense) => {
    const item = document.createElement("div");
    item.className = "mini-item";
    item.innerHTML = `<div><strong>${expense.vendor}</strong><span>${expense.category} - ${formatDisplayDate(expense.date)}</span></div><strong>INR ${formatMoney(expense.amount)}</strong>`;
    fields.recentExpenses.appendChild(item);
  });
  if (!state.expenses.length) fields.recentExpenses.innerHTML = '<p class="empty-state">No recent expenses yet.</p>';
};

// When set (via "Review Expense" on the duplicate alert), the ledger table
// shows only this specific duplicate cluster instead of every saved bill.
let duplicateFilterIds = null;

// Kept in sync with the #status <select> options in the Scan/Add Expense form.
const STATUS_OPTIONS = ["Pending", "Approved", "Rejected"];

const renderRows = () => {
  // Once deletions bring the cluster down to one bill (or none), there's
  // nothing left to compare — fall back to the full list automatically.
  if (duplicateFilterIds && state.expenses.filter((expense) => duplicateFilterIds.includes(expense.id)).length <= 1) {
    duplicateFilterIds = null;
  }

  const visibleExpenses = duplicateFilterIds
    ? state.expenses.filter((expense) => duplicateFilterIds.includes(expense.id))
    : state.expenses;

  if (fields.duplicateFilterNotice) {
    fields.duplicateFilterNotice.hidden = !duplicateFilterIds;
    if (duplicateFilterIds && fields.duplicateFilterText) {
      fields.duplicateFilterText.textContent = `Showing ${visibleExpenses.length} bills flagged as duplicates — delete the extra entries below.`;
    }
  }

  fields.rows.innerHTML = "";
  visibleExpenses.forEach((expense) => {
    const row = document.createElement("tr");
    [expense.vendor, expense.supplierPhone || "-", formatDisplayDate(expense.date), expense.category, expense.materialItem || "-", expense.quantity || "-", `INR ${formatMoney(expense.amount)}`, expense.gstin || "-"].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");
    statusSelect.className = `status-select status ${expense.status}`;
    statusSelect.dataset.statusId = expense.id;
    STATUS_OPTIONS.forEach((option) => {
      const optionEl = document.createElement("option");
      optionEl.value = option;
      optionEl.textContent = option;
      optionEl.selected = option === expense.status;
      statusSelect.appendChild(optionEl);
    });
    statusCell.appendChild(statusSelect);
    row.appendChild(statusCell);

    const openCell = document.createElement("td");
    const openButton = document.createElement("button");
    openButton.className = "open-button";
    openButton.dataset.openId = expense.id;
    openButton.textContent = "View";
    openCell.appendChild(openButton);
    row.appendChild(openCell);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "row-button";
    deleteButton.dataset.id = expense.id;
    deleteButton.textContent = "X";
    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);
    fields.rows.appendChild(row);
  });
  fields.empty.hidden = visibleExpenses.length > 0;
};

const getSupplierNames = () =>
  Array.from(new Set(state.expenses.map((expense) => expense.vendor).filter(Boolean))).sort((a, b) => a.localeCompare(b));

// A supplier can have many bills over time — picking a supplier from the
// dropdown shows their most recent one as the representative record.
const latestExpenseForVendor = (vendor) => {
  const matches = state.expenses.filter((expense) => expense.vendor === vendor);
  return matches.reduce((latest, expense) => (!latest || (expense.date || "") > (latest.date || "") ? expense : latest), null);
};

const populateDetailVendorSelect = (selectedVendor) => {
  const suppliers = getSupplierNames();
  fields.detailVendorSelect.innerHTML = "";
  if (!suppliers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No expense selected";
    fields.detailVendorSelect.appendChild(option);
    fields.detailVendorSelect.disabled = true;
    return;
  }
  fields.detailVendorSelect.disabled = false;
  suppliers.forEach((vendor) => {
    const option = document.createElement("option");
    option.value = vendor;
    option.textContent = vendor;
    fields.detailVendorSelect.appendChild(option);
  });
  fields.detailVendorSelect.value = suppliers.includes(selectedVendor) ? selectedVendor : suppliers[0];
};

// Monthly/yearly totals for whichever supplier is currently selected —
// distinct from the Reports screen's business-wide monthly summary.
const renderSupplierPeriodTotals = (vendor) => {
  const supplierExpenses = state.expenses.filter((expense) => expense.vendor === vendor);
  const monthly = groupTotal(supplierExpenses, (expense) => (expense.date || "").slice(0, 7));
  const yearly = groupTotal(supplierExpenses, (expense) => (expense.date || "").slice(0, 4));

  fields.detailMonthlyReport.innerHTML = "";
  Object.entries(monthly)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([month, amount]) => {
      const item = document.createElement("div");
      item.className = "report-item";
      item.innerHTML = `<span>${formatMonthLabel(month)}</span><strong>INR ${formatMoney(amount)}</strong>`;
      fields.detailMonthlyReport.appendChild(item);
    });
  if (!Object.keys(monthly).length) fields.detailMonthlyReport.innerHTML = '<p class="empty-state">No monthly data yet.</p>';

  fields.detailYearlyReport.innerHTML = "";
  Object.entries(yearly)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([year, amount]) => {
      const item = document.createElement("div");
      item.className = "report-item";
      item.innerHTML = `<span>${year}</span><strong>INR ${formatMoney(amount)}</strong>`;
      fields.detailYearlyReport.appendChild(item);
    });
  if (!Object.keys(yearly).length) fields.detailYearlyReport.innerHTML = '<p class="empty-state">No yearly data yet.</p>';
};

const showExpenseDetails = (expense) => {
  state.selectedExpenseId = expense ? expense.id : null;
  populateDetailVendorSelect(expense ? expense.vendor : "");
  if (!expense) {
    fields.detailSummary.textContent = "Open a record from the expense list to view full details.";
    fields.detailStatus.textContent = "Pending";
    fields.detailStatus.className = "status Pending";
    fields.detailGrid.innerHTML = "";
    fields.detailMonthlyReport.innerHTML = "";
    fields.detailYearlyReport.innerHTML = "";
    return;
  }
  fields.detailSummary.textContent = `${expense.category} - INR ${formatMoney(expense.amount)} - ${formatDisplayDate(expense.date)}`;
  fields.detailStatus.textContent = expense.status;
  fields.detailStatus.className = `status ${expense.status}`;
  const aiReview = describeAiFlags(buildAiFlags(expense));
  const details = [
    ["Supplier Phone", expense.supplierPhone || "-"],
    ["Material Item", expense.materialItem || "-"],
    ["Quantity", expense.quantity || "-"],
    ["GSTIN", expense.gstin || "-"],
    ["Tax", `INR ${formatMoney(expense.tax)}`],
    ["AI Duplicate Check", aiReview.duplicate],
    ["AI Pattern Check", aiReview.anomaly],
    ["AI Cash Flow Check", aiReview.cashFlowAlert],
    ["Notes", expense.notes || "-"],
  ];
  fields.detailGrid.innerHTML = "";
  details.forEach(([label, value]) => {
    const box = document.createElement("div");
    box.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    fields.detailGrid.appendChild(box);
  });
  renderSupplierPeriodTotals(expense.vendor);
};

// Payments — deliberately scoped to what a static, backend-less, unlicensed
// site can safely and legally do. Track Mint is NOT a payment aggregator and
// never will be from the browser alone: real card/bank-transfer processing
// needs an RBI-authorized Payment Aggregator, PCI-DSS handling for card data,
// and a backend — none of which exist here, and none of which should be
// faked. What IS safe and standard: (1) UPI's `upi://pay` deep-link/QR
// scheme, which simply hands off to the payer's own bank-linked UPI app —
// the app never touches the money or a PIN; (2) recording a REFERENCE for
// any method (UPI txn ID, bank UTR, cheque number, card auth code) for the
// user's own bookkeeping — never a card number, CVV, or bank login.
const getPaymentsForExpense = (expenseId) => state.payments.filter((payment) => payment.expenseId === expenseId);

const getPaidTotalForExpense = (expenseId) =>
  getPaymentsForExpense(expenseId).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

const populatePaymentExpenseSelect = () => {
  if (!fields.paymentExpense) return;
  const previousValue = fields.paymentExpense.value;
  fields.paymentExpense.innerHTML = '<option value="">Select an expense</option>';
  [...state.expenses]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .forEach((expense) => {
      const paid = getPaidTotalForExpense(expense.id);
      const paidNote = paid > 0 ? ` (Paid INR ${formatMoney(paid)})` : "";
      const option = document.createElement("option");
      option.value = expense.id;
      option.textContent = `${expense.vendor || "Unknown"} - INR ${formatMoney(expense.amount)} - ${formatDisplayDate(expense.date)}${paidNote}`;
      fields.paymentExpense.appendChild(option);
    });
  if ([...fields.paymentExpense.options].some((option) => option.value === previousValue)) {
    fields.paymentExpense.value = previousValue;
  }
};

// Standard UPI deep-link scheme (supported by every UPI app — PhonePe,
// Google Pay, Paytm, BHIM, bank apps, etc.). Building this link/QR requires
// no license: the payer's own UPI app performs the actual transfer, Track
// Mint only assembles the request URL from public, non-sensitive fields.
const buildUpiLink = ({ vpa, payeeName, amount, note }) => {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName || "Supplier",
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
};

const updateUpiSectionVisibility = () => {
  if (!fields.upiPaySection) return;
  const isUpi = fields.paymentMethod.value === "UPI";
  fields.upiPaySection.hidden = !isUpi;
  if (!isUpi) fields.upiQrContainer.hidden = true;
};

const generateUpiPayRequest = () => {
  const vpa = fields.paymentUpiVpa.value.trim();
  const amount = Number(fields.paymentAmount.value || 0);
  if (!vpa || !vpa.includes("@")) {
    alert("Enter the supplier's UPI ID (e.g. vendor@bank) first.");
    return;
  }
  if (!amount) {
    alert("Enter the amount to pay first.");
    return;
  }
  const expense = state.expenses.find((item) => item.id === fields.paymentExpense.value);
  const link = buildUpiLink({
    vpa,
    payeeName: expense ? expense.vendor : "Supplier",
    amount,
    note: expense ? `${expense.category} - Track Mint` : "Track Mint payment",
  });
  fields.upiQrCode.innerHTML = "";
  if (window.QRCode) {
    // eslint-disable-next-line no-new
    new QRCode(fields.upiQrCode, { text: link, width: 176, height: 176, correctLevel: QRCode.CorrectLevel.M });
  }
  fields.upiPayLink.href = link;
  fields.upiQrContainer.hidden = false;
};

const renderPaymentHistory = () => {
  if (!fields.paymentHistory) return;
  fields.paymentHistory.innerHTML = "";
  const sorted = [...state.payments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  sorted.forEach((payment) => {
    const expense = state.expenses.find((item) => item.id === payment.expenseId);
    const item = document.createElement("div");
    item.className = "report-item";
    const label = `${expense ? expense.vendor : "Unknown expense"} - ${payment.method}${payment.reference ? ` (${payment.reference})` : ""}`;
    item.innerHTML = `<span>${label}<br /><small>${formatDisplayDate(payment.date)}</small></span><strong>INR ${formatMoney(payment.amount)}</strong>`;
    fields.paymentHistory.appendChild(item);
  });
  if (!sorted.length) fields.paymentHistory.innerHTML = '<p class="empty-state">No payments recorded yet.</p>';
};

// Free, local, rule-based "AI recommendations" — every insight here is
// computed directly from state.expenses in the browser: no API key, no
// network call, no cloud model. Kept distinct from the NER model above
// (which reads unstructured text to find a name) — this reads the
// already-structured expense records to spot patterns worth flagging.
const generateAiRecommendations = () => {
  const recommendations = [];
  if (!state.expenses.length) {
    return [{ level: "info", text: "No expenses recorded yet — scan a bill to start seeing recommendations here." }];
  }

  const grandTotal = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || 1;

  // Month-over-month spend trend
  const monthlyTotals = groupTotal(state.expenses, (expense) => (expense.date || "").slice(0, 7));
  const months = Object.keys(monthlyTotals).filter(Boolean).sort();
  if (months.length >= 2) {
    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];
    const current = monthlyTotals[currentMonth];
    const previous = monthlyTotals[previousMonth];
    if (previous > 0) {
      const changePct = ((current - previous) / previous) * 100;
      if (changePct >= 20) {
        recommendations.push({
          level: "warning",
          text: `Spending in ${formatMonthLabel(currentMonth)} is up ${Math.round(changePct)}% vs ${formatMonthLabel(previousMonth)} (INR ${formatMoney(current)} vs INR ${formatMoney(previous)}) — worth a quick review.`,
        });
      } else if (changePct <= -20) {
        recommendations.push({
          level: "success",
          text: `Spending in ${formatMonthLabel(currentMonth)} is down ${Math.round(Math.abs(changePct))}% vs ${formatMonthLabel(previousMonth)}.`,
        });
      }
    }
  }

  // Supplier concentration risk
  const supplierTotals = groupTotal(state.expenses, (expense) => expense.vendor);
  const topSupplier = byAmount(Object.entries(supplierTotals).map(([vendor, amount]) => ({ vendor, amount })))[0];
  if (topSupplier && Object.keys(supplierTotals).length > 1) {
    const share = topSupplier.amount / grandTotal;
    if (share >= 0.4) {
      recommendations.push({
        level: "warning",
        text: `${topSupplier.vendor} accounts for ${Math.round(share * 100)}% of total spend — consider a backup supplier to reduce dependency risk.`,
      });
    }
  }

  // Raw material budget proximity (mirrors the alert-banner threshold logic)
  const rawLimit = Number(fields.rawMaterialLimit.value || 0);
  const rawTotal = getRawMaterialTotal();
  if (rawLimit > 0) {
    const usedShare = rawTotal / rawLimit;
    if (usedShare >= 1) {
      recommendations.push({
        level: "warning",
        text: `Raw material spend (INR ${formatMoney(rawTotal)}) has crossed your set limit of INR ${formatMoney(rawLimit)}.`,
      });
    } else if (usedShare >= 0.8) {
      recommendations.push({
        level: "warning",
        text: `Raw material spend is at ${Math.round(usedShare * 100)}% of your INR ${formatMoney(rawLimit)} limit — approaching the threshold.`,
      });
    }
  }

  // Duplicate bills awaiting review
  const duplicateCount = countFlaggedDuplicateExpenses();
  if (duplicateCount > 0) {
    recommendations.push({
      level: "warning",
      text: `${duplicateCount} bill${duplicateCount > 1 ? "s" : ""} flagged as possible duplicates — review the Expense List to confirm they aren't double-counted.`,
    });
  }

  // Pending approvals backlog
  const pendingCount = state.expenses.filter((expense) => expense.status === "Pending").length;
  if (pendingCount >= 5) {
    recommendations.push({
      level: "info",
      text: `${pendingCount} bills are still marked Pending — approve or reject them to keep the ledger current.`,
    });
  }

  // Missing-GSTIN compliance check
  const missingGstinCount = state.expenses.filter((expense) => !expense.gstin).length;
  if (missingGstinCount > 0) {
    const share = Math.round((missingGstinCount / state.expenses.length) * 100);
    if (share >= 20) {
      recommendations.push({
        level: "info",
        text: `${missingGstinCount} bill${missingGstinCount > 1 ? "s" : ""} (${share}%) have no GSTIN recorded — worth checking for GST input credit eligibility.`,
      });
    }
  }

  // Top category concentration
  const categoryTotals = groupTotal(state.expenses, (expense) => expense.category);
  const topCategory = byAmount(Object.entries(categoryTotals).map(([category, amount]) => ({ category, amount })))[0];
  if (topCategory) {
    const share = topCategory.amount / grandTotal;
    if (share >= 0.5) {
      recommendations.push({
        level: "info",
        text: `${topCategory.category} makes up ${Math.round(share * 100)}% of all spend — your single biggest cost category.`,
      });
    }
  }

  if (!recommendations.length) {
    recommendations.push({ level: "success", text: "No unusual spending patterns detected — everything looks steady." });
  }
  return recommendations;
};

const renderAiRecommendations = () => {
  if (!fields.aiRecommendations) return;
  fields.aiRecommendations.innerHTML = "";
  generateAiRecommendations().forEach((rec) => {
    const item = document.createElement("div");
    item.className = `recommendation-item recommendation-${rec.level}`;
    item.textContent = rec.text;
    fields.aiRecommendations.appendChild(item);
  });
};

const renderReports = () => {
  renderAiRecommendations();
  const monthly = groupTotal(state.expenses, (expense) => (expense.date || "").slice(0, 7));
  fields.monthlyReport.innerHTML = "";
  Object.entries(monthly).forEach(([month, amount]) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.innerHTML = `<span>${month}</span><strong>INR ${formatMoney(amount)}</strong>`;
    fields.monthlyReport.appendChild(item);
  });
  if (!Object.keys(monthly).length) fields.monthlyReport.innerHTML = '<p class="empty-state">No monthly data yet.</p>';

  const supplierTotals = groupTotal(state.expenses, (expense) => expense.vendor);
  fields.supplierReport.innerHTML = "";
  byAmount(Object.entries(supplierTotals).map(([vendor, amount]) => ({ vendor, amount }))).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.innerHTML = `<span>${entry.vendor}</span><strong>INR ${formatMoney(entry.amount)}</strong>`;
    fields.supplierReport.appendChild(item);
  });
  if (!Object.keys(supplierTotals).length) fields.supplierReport.innerHTML = '<p class="empty-state">No supplier data yet.</p>';

  if (fields.aiWorkflowReport) {
    // Recompute live against the current data and current matching rules —
    // expense.aiFlags is a snapshot frozen at save time and goes stale
    // whenever new expenses arrive or the matching logic changes.
    const liveFlags = state.expenses.map((expense) => buildAiFlags(expense));
    const duplicateCount = countFlaggedDuplicateExpenses();
    const anomalyCount = liveFlags.filter((flags) => flags.anomaly).length;
    const alertCount = liveFlags.filter((flags) => flags.cashFlowAlert).length;
    const items = [
      ["OCR captured bills", state.expenses.length],
      ["Duplicate matches", duplicateCount],
      ["Pattern alerts", anomalyCount],
      ["Cash flow alerts", alertCount],
    ];
    fields.aiWorkflowReport.innerHTML = "";
    items.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "report-item";
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      fields.aiWorkflowReport.appendChild(item);
    });
  }
};

const formatChartValue = (value) => `₹${formatMoney(value)}`;

const buildSeries = (grouped, order) => {
  const labels = order || Object.keys(grouped).sort();
  return labels.map((label) => ({ label, value: Number(grouped[label] || 0) }));
};

// Picks a "clean" axis maximum/step (1/2/5 x 10^n) so Y-axis ticks read like
// 0 / 5,000 / 10,000 rather than an arbitrary fraction of the data's max.
const niceAxisScale = (maxValue, tickCount = 4) => {
  const safeMax = Math.max(maxValue, 1);
  const roughStep = safeMax / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceResidual = 10;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  const step = niceResidual * magnitude;
  return { step, niceMax: step * tickCount, ticks: Array.from({ length: tickCount + 1 }, (_, i) => step * i) };
};

const truncateLabel = (label, maxChars) => (label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label);

// Column with a rounded top and a square baseline (never rounded all the
// way around — the baseline is where the bar "grows from").
const roundedTopBarPath = (x, y, width, height, radius) => {
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  if (r <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return `M${x},${y + r} a${r},${r} 0 0 1 ${r},${-r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - r} h${-width} Z`;
};

const CHART_PADDING = { top: 28, right: 22, bottom: 46, left: 66 };

// Bar/column chart — one series, ranked magnitude comparison (e.g. spend by
// supplier). Y-axis carries clean-number ticks; each bar is its own hover/
// focus target with a tooltip carrying the value the label may not fit.
const drawBarChart = (svg, items, options = {}) => {
  if (!svg || !items.length) return;
  const color = options.color || "var(--primary)";
  const width = 800;
  const height = 320;
  const { top, right, bottom, left } = CHART_PADDING;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const count = items.length;
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  const { niceMax, ticks } = niceAxisScale(maxValue, 4);
  const barWidth = Math.min(24, Math.max(14, plotWidth / count - 14));
  const gap = count > 1 ? (plotWidth - count * barWidth) / (count - 1) : 0;
  const slotWidth = barWidth + gap;
  const maxChars = Math.max(6, Math.floor(slotWidth / 6.5));

  const axis = ticks
    .map((tick) => {
      const y = top + plotHeight - (tick / niceMax) * plotHeight;
      return `
        <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid-line" />
        <text x="${left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-tick">${formatChartValue(tick)}</text>
      `;
    })
    .join("");
  const baseline = `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis-line" />`;

  const barGradientId = `${svg.id || "bar"}Gradient`;
  // Vertical gradient on the fill only — the bar's height (the encoded value)
  // is untouched, so this adds depth without distorting what it reports.
  const barDefs = `<defs><linearGradient id="${barGradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.78" />
      <stop offset="100%" stop-color="${color}" stop-opacity="1" />
    </linearGradient></defs>`;

  const bars = items
    .map((item, index) => {
      const x = left + index * slotWidth;
      const barHeight = niceMax > 0 ? (item.value / niceMax) * plotHeight : 0;
      const y = top + plotHeight - barHeight;
      const path = roundedTopBarPath(x, y, barWidth, barHeight, 4);
      const valueLabel =
        barHeight > 24
          ? `<text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" class="chart-value">${formatChartValue(item.value)}</text>`
          : "";
      return `
        <g>
          <path class="chart-mark" data-index="${index}" d="${path}" fill="url(#${barGradientId})" tabindex="0" role="img" aria-label="${item.label}: ${formatChartValue(item.value)}"></path>
          ${valueLabel}
          <text x="${x + barWidth / 2}" y="${height - bottom + 20}" text-anchor="middle" class="chart-label">${truncateLabel(item.label, maxChars)}</text>
        </g>
      `;
    })
    .join("");

  svg.innerHTML = `${barDefs}${axis}${baseline}${bars}`;

  svg.querySelectorAll(".chart-mark").forEach((mark) => {
    const item = items[Number(mark.dataset.index)];
    bindMarkTooltip(mark, item.label, [{ label: "Amount", value: formatChartValue(item.value), color }]);
  });
};

// Line chart — a single series' trend over time. Area wash under the line,
// clean-number Y ticks, X-axis labels thinned to whatever actually fits, and
// a per-point hover target (bigger than the visible dot) driving a crosshair.
const drawLineChart = (svg, items) => {
  if (!svg || !items.length) return;
  const width = 800;
  const height = 320;
  const { top, right, bottom, left } = CHART_PADDING;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const count = items.length;
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  const { niceMax, ticks } = niceAxisScale(maxValue, 4);

  const xFor = (index) => (count <= 1 ? left + plotWidth / 2 : left + (index / (count - 1)) * plotWidth);
  const yFor = (value) => top + plotHeight - (niceMax > 0 ? (value / niceMax) * plotHeight : 0);

  const axis = ticks
    .map((tick) => {
      const y = yFor(tick);
      return `
        <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid-line" />
        <text x="${left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-tick">${formatChartValue(tick)}</text>
      `;
    })
    .join("");
  const baseline = `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis-line" />`;

  // However many points there are, never show more X labels than fit without colliding.
  const maxLabels = Math.max(2, Math.floor(plotWidth / 70));
  const labelStep = Math.max(1, Math.ceil(count / maxLabels));
  const xLabels = items
    .map((item, index) => {
      if (index % labelStep !== 0 && index !== count - 1) return "";
      return `<text x="${xFor(index).toFixed(1)}" y="${height - bottom + 20}" text-anchor="middle" class="chart-label">${item.label}</text>`;
    })
    .join("");

  const points = items.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.value) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    count > 1
      ? `${linePath} L${points[count - 1].x.toFixed(1)},${(top + plotHeight).toFixed(1)} L${points[0].x.toFixed(1)},${(top + plotHeight).toFixed(1)} Z`
      : "";

  const dots = points
    .map(
      (p, index) => `
      <circle class="chart-dot" data-index="${index}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"></circle>
      <circle class="chart-hit-target chart-mark" data-index="${index}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14" tabindex="0" role="img" aria-label="${p.label}: ${formatChartValue(p.value)}"></circle>
    `
    )
    .join("");

  const lastPoint = points[count - 1];
  const endLabel = `<text x="${lastPoint.x.toFixed(1)}" y="${(lastPoint.y - 12).toFixed(1)}" text-anchor="${count > 1 ? "end" : "middle"}" class="chart-value">${formatChartValue(lastPoint.value)}</text>`;

  svg.innerHTML = `
    ${axis}
    ${baseline}
    ${xLabels}
    <line class="chart-crosshair" id="${svg.id}Crosshair" x1="0" y1="${top}" x2="0" y2="${top + plotHeight}" style="opacity:0"></line>
    ${areaPath ? `<path d="${areaPath}" fill="var(--primary)" opacity="0.1"></path>` : ""}
    ${count > 1 ? `<path class="chart-line-mark" d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
    ${dots}
    ${endLabel}
  `;

  const crosshair = svg.querySelector(`#${svg.id}Crosshair`);
  svg.querySelectorAll(".chart-hit-target").forEach((hit) => {
    const point = points[Number(hit.dataset.index)];
    const dot = svg.querySelector(`.chart-dot[data-index="${hit.dataset.index}"]`);
    const activate = (clientX, clientY) => {
      if (crosshair) {
        crosshair.setAttribute("x1", point.x);
        crosshair.setAttribute("x2", point.x);
        crosshair.style.opacity = "1";
      }
      if (dot) dot.classList.add("chart-dot-hover");
      showChartTooltip(clientX, clientY, point.label, [{ label: "Spend", value: formatChartValue(point.value), color: "var(--primary)" }]);
    };
    const deactivate = () => {
      if (crosshair) crosshair.style.opacity = "0";
      if (dot) dot.classList.remove("chart-dot-hover");
      hideChartTooltip();
    };
    hit.addEventListener("pointerenter", (event) => activate(event.clientX, event.clientY));
    hit.addEventListener("pointermove", (event) => positionChartTooltip(event.clientX, event.clientY));
    hit.addEventListener("pointerleave", deactivate);
    hit.addEventListener("focus", () => {
      const anchor = tooltipAnchorFromElement(hit);
      activate(anchor.x, anchor.y);
    });
    hit.addEventListener("blur", deactivate);
  });
};

const groupByPeriod = (period) => {
  const data = {};
  const todayDate = new Date();
  const labels = new Set();
  state.expenses.forEach((expense) => {
    if (!expense.date) return;
    const date = new Date(expense.date);
    if (Number.isNaN(date.getTime())) return;
    let key;
    if (period === "daily") {
      key = date.toISOString().slice(0, 10);
    } else if (period === "monthly") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } else if (period === "yearly") {
      key = `${date.getFullYear()}`;
    } else {
      key = `${date.getFullYear()}`;
    }
    labels.add(key);
    data[key] = (data[key] || 0) + Number(expense.amount || 0);
  });
  const ordered = Array.from(labels).sort();
  // Sort chronologically on the ISO key first, then convert only the display label,
  // so daily/monthly points read as real dates/months without breaking the ordering
  // (and a month from one year never collides with the same month in another).
  if (period === "daily") {
    return ordered.map((key) => ({ label: formatDisplayDate(key), value: Number(data[key] || 0) }));
  }
  if (period === "monthly") {
    return ordered.map((key) => ({ label: formatMonthLabel(key), value: Number(data[key] || 0) }));
  }
  return buildSeries(data, ordered);
};

const renderTrendChart = () => {
  if (!fields.trendChart) return;
  const series = groupByPeriod(state.chartPeriod || "monthly");
  if (!series.length) {
    fields.trendChart.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="chart-value">No expense data available</text>`;
    return;
  }
  drawLineChart(fields.trendChart, series);
};

const renderSupplierChart = () => {
  if (!fields.supplierChart) return;
  const totals = groupTotal(state.expenses, (expense) => expense.vendor || "Unknown");
  // Cards report each supplier's share of the business's total spend, not just
  // share of the top 8 shown on the chart — the two totals shouldn't diverge.
  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  const items = buildSeries(totals, Object.entries(totals)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 8)
    .map(([label]) => label));
  if (!items.length) {
    fields.supplierChart.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="chart-value">No supplier data available</text>`;
    if (fields.supplierStatCards) fields.supplierStatCards.innerHTML = "";
    return;
  }
  drawBarChart(fields.supplierChart, items, { color: "var(--accent)" });
  renderMiniStatCards(
    fields.supplierStatCards,
    items.map((item) => ({ ...item, share: item.value / grandTotal, color: "var(--accent)" }))
  );
};

const render = () => {
  renderMetricPanels();
  renderCategoryDonut();
  renderRecent();
  renderTrendChart();
  renderSupplierChart();
  renderRows();
  renderReports();
  populatePaymentExpenseSelect();
  renderPaymentHistory();
  updateAlertBanner();
  const selected = state.expenses.find((expense) => expense.id === state.selectedExpenseId) || state.expenses[0];
  showExpenseDetails(selected || null);
};

const loadProfileFields = () => {
  fields.profileName.value = state.profile.name || state.user?.name || "";
  fields.profileEmail.value = state.profile.email || state.user?.email || "";
  fields.businessName.value = state.profile.businessName || "";
  fields.businessPhone.value = state.profile.businessPhone || "";
  fields.businessGstin.value = state.profile.businessGstin || "";
  fields.userRole.value = state.profile.userRole || "";
};

const loadSettingsFields = () => {
  fields.rawMaterialLimit.value = state.settings.rawMaterialLimit || "";
  fields.alertPhone.value = state.settings.alertPhone || "";
  fields.alertEmail.value = state.settings.alertEmail || "";
  fields.alertViaSms.checked = state.settings.alertViaSms !== false;
  fields.alertViaEmail.checked = !!state.settings.alertViaEmail;
  fields.alarmEnabled.checked = state.settings.alarmEnabled !== false;
  applySettingsAccess();
};

const authErrorMessage = (error) => {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account with that email already exists. Please login instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Login failed. Please check your email and password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your internet connection and try again.";
    default:
      return `Something went wrong (${error.message || "please try again"}).`;
  }
};

let unsubscribeUserDoc = null;
let unsubscribeExpenses = null;
let unsubscribePayments = null;

const detachUserDataListeners = () => {
  [unsubscribeUserDoc, unsubscribeExpenses, unsubscribePayments].forEach((unsubscribe) => unsubscribe && unsubscribe());
  unsubscribeUserDoc = null;
  unsubscribeExpenses = null;
  unsubscribePayments = null;
};

// One-time only, guarded by a local flag: if this browser still has
// expenses/payments/settings from before this account existed in the cloud
// (the old localStorage-only version of this app), carry that history into
// the newly created/signed-in account instead of silently losing it. Only
// writes into fields that are still empty in the cloud, so it can never
// clobber real cloud data with stale local data on a later login.
const migrateLocalDataIfNeeded = async () => {
  if (localStorage.getItem(migratedKey)) return;
  const localExpenses = readJson(storageKey, localStorage.getItem(legacyStorageKey) || "[]");
  const localPayments = readJson(paymentsKey, "[]");
  const localSettings = readJson(settingsKey, localStorage.getItem(legacySettingsKey) || "{}");
  const localProfile = readJson(profileKey, "{}");

  try {
    const [expensesDoc, paymentsDoc] = await Promise.all([userDataDoc("expenses").get(), userDataDoc("payments").get()]);
    if (!expensesDoc.exists && localExpenses.length) {
      await userDataDoc("expenses").set({ list: localExpenses });
    }
    if (!paymentsDoc.exists && localPayments.length) {
      await userDataDoc("payments").set({ list: localPayments });
    }
    if (Object.keys(localSettings).length || Object.keys(localProfile).length) {
      await userProfileDoc().set({ settings: localSettings, profile: localProfile }, { merge: true });
    }
    localStorage.setItem(migratedKey, "1");
  } catch (error) {
    console.warn("Local-to-cloud migration failed (will retry next login):", error);
  }
};

// Subscribes to this account's Firestore data and resolves once the first
// reading of all three documents has arrived — so showApp() never flashes
// an empty dashboard before the real data loads. After that first load,
// each listener keeps state in sync live, including from a change made on
// another device (or another tab).
const loadUserData = () =>
  new Promise((resolve) => {
    const ready = { profile: false, expenses: false, payments: false };
    let resolved = false;
    const maybeResolve = () => {
      if (resolved || !ready.profile || !ready.expenses || !ready.payments) return;
      resolved = true;
      resolve();
    };

    unsubscribeUserDoc = userProfileDoc().onSnapshot(
      (doc) => {
        const data = doc.data() || {};
        state.profile = data.profile || {};
        state.settings = data.settings || {};
        ready.profile = true;
        maybeResolve();
        if (resolved) {
          loadProfileFields();
          loadSettingsFields();
        }
      },
      (error) => {
        console.warn("Profile/settings sync error:", error);
        ready.profile = true;
        maybeResolve();
      }
    );
    unsubscribeExpenses = userDataDoc("expenses").onSnapshot(
      (doc) => {
        state.expenses = (doc.data() || {}).list || [];
        ready.expenses = true;
        maybeResolve();
        if (resolved) render();
      },
      (error) => {
        console.warn("Expenses sync error:", error);
        ready.expenses = true;
        maybeResolve();
      }
    );
    unsubscribePayments = userDataDoc("payments").onSnapshot(
      (doc) => {
        state.payments = (doc.data() || {}).list || [];
        ready.payments = true;
        maybeResolve();
        if (resolved) render();
      },
      (error) => {
        console.warn("Payments sync error:", error);
        ready.payments = true;
        maybeResolve();
      }
    );
  });

fields.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = fields.authEmail.value.trim().toLowerCase();
  const password = fields.authPassword.value;
  const name = fields.authName.value.trim() || "Track Mint User";

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }
  if (password.length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }

  // Determine mode from global variable or button state
  const isRegisterMode = window.currentAuthMode === 'register' || document.querySelector('[data-auth-mode="register"]')?.classList.contains('active');

  fields.authSubmitButton.disabled = true;
  try {
    if (isRegisterMode) {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      // Every account owns its own data outright now that data is scoped
      // per-account in the cloud rather than shared per-browser, so there's
      // no "first person on this device" Owner race to resolve anymore.
      await db
        .collection("users")
        .doc(credential.user.uid)
        .set({ profile: { name, email }, settings: {} }, { merge: true });
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    // auth.onAuthStateChanged (registered near the bottom of this file)
    // picks up the signed-in user from here, loads their Firestore data,
    // and calls showApp() once that data has actually arrived.
  } catch (error) {
    alert(authErrorMessage(error));
  } finally {
    fields.authSubmitButton.disabled = false;
  }
});

fields.authModeButtons.forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
fields.navButtons.forEach((button) =>
  button.addEventListener("click", () => {
    setScreen(button.dataset.screen);
    closeMenu();
  })
);
fields.quickScanButton.addEventListener("click", () => setScreen("scan"));
const doLogout = () => {
  detachUserDataListeners();
  auth.signOut();
};
fields.logoutButton.addEventListener("click", doLogout);

const openMenu = () => {
  fields.sidebar.classList.add("open");
  fields.navBackdrop.hidden = false;
  fields.menuToggleButton.setAttribute("aria-expanded", "true");
};
const closeMenu = () => {
  fields.sidebar.classList.remove("open");
  fields.navBackdrop.hidden = true;
  fields.menuToggleButton.setAttribute("aria-expanded", "false");
};
fields.menuToggleButton.addEventListener("click", () => {
  fields.sidebar.classList.contains("open") ? closeMenu() : openMenu();
});
fields.navBackdrop.addEventListener("click", closeMenu);


document.getElementById("extractButton").addEventListener("click", extractDetails);
fields.scanOcrButton.addEventListener("click", runImageOcr);

document.getElementById("sampleButton").addEventListener("click", () => {
  fields.ocrText.value = `Sharma Steel Traders
Invoice No RM-2048
Date 09/06/2026
GSTIN 27ABCDE1234F1Z5
Material Steel sheets
Quantity 50 kg
Amount INR 15000
CGST INR 1350
SGST INR 1350`;
  extractDetails();
});

// Live camera capture — an alternative to picking an existing file. Feeds the
// captured frame into the SAME #billImage input (via DataTransfer + a
// dispatched "change" event) so every downstream handler — preview, OCR —
// works unmodified regardless of which path the image came from.
let cameraStream = null;

const stopCameraStream = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  fields.cameraVideo.srcObject = null;
  fields.cameraModal.hidden = true;
};

const openCameraModal = async () => {
  fields.cameraError.hidden = true;
  fields.cameraError.textContent = "";
  fields.cameraModal.hidden = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fields.cameraError.textContent = "Camera capture needs a secure connection (HTTPS or localhost) — it won't work when this page is opened directly from a file:// path. Upload a photo instead.";
    fields.cameraError.hidden = false;
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    fields.cameraVideo.srcObject = cameraStream;
  } catch (error) {
    console.warn("Camera access failed:", error);
    fields.cameraError.textContent = "Camera access was denied or unavailable. Allow camera permission for this site in your browser settings, or upload a photo instead.";
    fields.cameraError.hidden = false;
  }
};

const captureCameraPhoto = () => {
  if (!cameraStream) return;
  const video = fields.cameraVideo;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], `bill-capture-${Date.now()}.png`, { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fields.image.files = dataTransfer.files;
    fields.image.dispatchEvent(new Event("change", { bubbles: true }));
    stopCameraStream();
  }, "image/png");
};

fields.takePhotoButton.addEventListener("click", openCameraModal);
fields.closeCameraButton.addEventListener("click", stopCameraStream);
fields.capturePhotoButton.addEventListener("click", captureCameraPhoto);

fields.image.addEventListener("change", async () => {
  const file = fields.image.files[0];
  if (!file) return;
  fields.ocrText.value = "";
  fields.ocrProgress.hidden = true;
  fields.ocrProgressBar.style.width = "0";
  fields.ocrStatus.textContent = "Ready to scan";
  fields.dropText.hidden = true;
  if (file.type.startsWith("image/")) {
    fields.preview.src = URL.createObjectURL(file);
    fields.preview.hidden = false;
    return;
  }
  fields.preview.hidden = true;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    fields.ocrStatus.textContent = "PDF selected. Click OCR to extract text.";
    return;
  }
  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    fields.ocrStatus.textContent = "Text file selected. Click OCR to parse supplier details.";
    return;
  }
  fields.ocrStatus.textContent = "Unsupported file type. Use JPG, PNG, PDF, or TXT.";
});

document.getElementById("expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const expense = {
    id: crypto.randomUUID(),
    vendor: fields.vendor.value.trim(),
    supplierPhone: fields.supplierPhone.value.trim(),
    date: fields.date.value,
    category: fields.category.value,
    amount: Number(fields.amount.value || 0),
    gstin: fields.gstin.value.trim().toUpperCase(),
    tax: Number(fields.tax.value || 0),
    materialItem: fields.materialItem.value.trim(),
    quantity: fields.quantity.value.trim(),
    notes: fields.notes.value.trim(),
    status: fields.status.value,
  };
  expense.aiFlags = buildAiFlags(expense);
  state.expenses.unshift(expense);
  saveExpenses();
  render(); // also runs updateAlertBanner(), which shows any unresolved alert live
  event.target.reset();
  if (!expense.date) {
    fields.date.value = today();
  }
  setWorkflowStage(expense.aiFlags.cashFlowAlert ? "alerts" : "duplicates");
  setScreen("expenses");
});

fields.detailVendorSelect.addEventListener("change", () => {
  const vendor = fields.detailVendorSelect.value;
  showExpenseDetails(latestExpenseForVendor(vendor) || null);
});

fields.supplierLookup.addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-candidate]");
  if (!button) return;
  selectSupplierCandidate(Number(button.dataset.useCandidate));
});
fields.paymentMethod.addEventListener("change", updateUpiSectionVisibility);
fields.generateUpiButton.addEventListener("click", generateUpiPayRequest);

fields.paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!fields.paymentExpense.value) {
    alert("Select which expense this payment is for.");
    return;
  }
  const payment = {
    id: crypto.randomUUID(),
    expenseId: fields.paymentExpense.value,
    method: fields.paymentMethod.value,
    amount: Number(fields.paymentAmount.value || 0),
    date: fields.paymentDate.value || today(),
    reference: fields.paymentReference.value.trim(),
    notes: fields.paymentNotes.value.trim(),
  };
  state.payments.unshift(payment);
  savePayments();
  populatePaymentExpenseSelect();
  renderPaymentHistory();
  event.target.reset();
  fields.paymentDate.value = today();
  updateUpiSectionVisibility();
});

fields.rows.addEventListener("click", (event) => {
  const openButton = event.target.closest("button[data-open-id]");
  const deleteButton = event.target.closest("button[data-id]");
  if (openButton) {
    const expense = state.expenses.find((item) => item.id === openButton.dataset.openId);
    showExpenseDetails(expense);
    setScreen("details");
  }
  if (deleteButton) {
    state.expenses = state.expenses.filter((expense) => expense.id !== deleteButton.dataset.id);
    saveExpenses();
    render(); // re-evaluates the alert banner live — it only clears once the underlying issue is actually gone
  }
});

// Each row's status dropdown is independent — changing one bill's status
// (per supplier/row) never touches any other row.
fields.rows.addEventListener("change", (event) => {
  const statusSelect = event.target.closest("select[data-status-id]");
  if (!statusSelect) return;
  const expense = state.expenses.find((item) => item.id === statusSelect.dataset.statusId);
  if (!expense) return;
  expense.status = statusSelect.value;
  saveExpenses();
  render();
});

fields.sendSmsButton.addEventListener("click", (event) => {
  if (fields.sendSmsButton.getAttribute("href") === "#") {
    event.preventDefault();
    if (fields.sendSmsButton.textContent === "Review Expense") {
      // The complete flagged set — same definition as the alert's count and
      // the Reports tile — so however many the alert says, that many rows show up here.
      duplicateFilterIds = getFlaggedDuplicateExpenses().map((expense) => expense.id);
      setScreen("expenses");
      render();
      return;
    }
    setScreen("settings");
    if (isOwner()) fields.alertPhone.focus();
  }
});

fields.clearDuplicateFilterButton?.addEventListener("click", () => {
  duplicateFilterIds = null;
  renderRows();
});

fields.sendEmailButton.addEventListener("click", (event) => {
  if (fields.sendEmailButton.getAttribute("href") === "#") {
    event.preventDefault();
    setScreen("settings");
    if (isOwner()) fields.alertEmail.focus();
  }
});

document.getElementById("clearButton").addEventListener("click", () => {
  if (!state.expenses.length || !confirm("Clear all saved expenses?")) return;
  state.expenses = [];
  saveExpenses();
  render();
});

fields.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    fields.periodButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    state.chartPeriod = button.dataset.period;
    renderTrendChart();
  });
});

document.getElementById("exportCsvButton").addEventListener("click", () => {
  const columns = [
    ["Vendor", "vendor"],
    ["Supplier Phone", "supplierPhone"],
    ["Date", "date"],
    ["Category", "category"],
    ["Material Item", "materialItem"],
    ["Quantity", "quantity"],
    ["Amount", "amount"],
    ["GSTIN", "gstin"],
    ["Tax", "tax"],
    ["Status", "status"],
    ["Notes", "notes"],
  ];
  const headers = columns.map(([header]) => header);
  const rows = state.expenses.map((expense) =>
    columns
      .map(([, key]) => {
        const value = key === "date" ? formatDisplayDate(expense.date) : expense[key];
        return `"${String(value || "").replaceAll('"', '""')}"`;
      })
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "track-mint-expenses.csv";
  link.click();
});

// --- Spreadsheet import (CSV / Excel, or exports from Tally / Zoho Books) ---
// Runs entirely client-side via SheetJS (CDN-loaded in index.html, same
// pattern as Tesseract.js/pdf.js). Spreadsheet exports from different tools
// name their columns differently (Tally: "Particulars"; Zoho: "Expense
// Account"; a plain spreadsheet: anything at all) so this guesses a mapping
// from each header's wording and lets the user confirm or correct it before
// anything is saved — never imports blind off a fixed header list.
const IMPORT_FIELD_DEFS = [
  { key: "", label: "Ignore this column" },
  { key: "vendor", label: "Vendor / Supplier", keywords: ["vendor", "supplier", "party", "payee", "paid to"] },
  { key: "date", label: "Date", keywords: ["date"] },
  { key: "category", label: "Category", keywords: ["category", "head", "ledger"] },
  { key: "materialItem", label: "Material / Item", keywords: ["item", "material", "particulars", "description"] },
  { key: "quantity", label: "Quantity", keywords: ["qty", "quantity"] },
  { key: "amount", label: "Amount", keywords: ["amount", "value", "debit", "total"] },
  { key: "gstin", label: "GSTIN", keywords: ["gstin", "gst no", "gst"] },
  { key: "tax", label: "Tax", keywords: ["tax", "cgst", "sgst", "igst", "vat"] },
  { key: "status", label: "Status", keywords: ["status"] },
  { key: "notes", label: "Notes / Remarks", keywords: ["notes", "remark", "narration"] },
];

const guessImportField = (header) => {
  const lower = String(header || "").toLowerCase();
  const match = IMPORT_FIELD_DEFS.find((def) => def.keywords?.some((keyword) => lower.includes(keyword)));
  return match ? match.key : "";
};

const KNOWN_IMPORT_CATEGORIES = ["Phone / Internet", "Travel", "Food", "Office Supplies", "Rent", "Utilities", "Raw Materials", "Staff Welfare", "Other"];
const normalizeImportCategory = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "Other";
  return KNOWN_IMPORT_CATEGORIES.find((c) => c.toLowerCase() === v) || "Other";
};

const KNOWN_IMPORT_STATUSES = ["Pending", "Approved", "Rejected"];
const normalizeImportStatus = (value) => {
  const v = String(value || "").trim().toLowerCase();
  return KNOWN_IMPORT_STATUSES.find((s) => s.toLowerCase() === v) || "Pending";
};

// Handles an Excel date serial number and the various text date formats
// Tally/Zoho/spreadsheet exports use (ISO, "05/01/2026", "5-Jan-2026", ...);
// falls back to today() so one unparseable date never blocks the whole row.
const parseImportDate = (value) => {
  if (value === null || value === undefined || value === "") return today();
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569); // Excel's day-0 is 1899-12-30
    const parsed = new Date(utcDays * 86400 * 1000);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (ddmmyyyy) {
    let [, day, month, year] = ddmmyyyy;
    if (year.length === 2) year = `20${year}`;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }
  const native = new Date(raw);
  if (!isNaN(native.getTime()) && /\d{4}/.test(raw)) return native.toISOString().slice(0, 10);
  return today();
};

let importParsedRows = []; // array of arrays: [headerRow, ...dataRows]
let importColumnMap = []; // parallel to headerRow: Track Mint field key per column, "" = ignore

const resetImportModal = () => {
  importParsedRows = [];
  importColumnMap = [];
  fields.importError.hidden = true;
  fields.importMappingTable.hidden = true;
  fields.importMappingBody.innerHTML = "";
  fields.importSummary.hidden = true;
  fields.importConfirmButton.hidden = true;
  fields.importHelp.hidden = false;
};

const closeImportModal = () => {
  fields.importModal.hidden = true;
  fields.importFileInput.value = "";
  resetImportModal();
};

const renderImportMapping = (headerRow) => {
  importColumnMap = headerRow.map((header) => guessImportField(header));
  fields.importMappingBody.innerHTML = headerRow
    .map((header, index) => {
      const previewValues = importParsedRows
        .slice(1, 4)
        .map((row) => row[index])
        .filter((value) => value !== undefined && value !== "")
        .join(", ");
      const options = IMPORT_FIELD_DEFS.map(
        (def) => `<option value="${def.key}" ${def.key === importColumnMap[index] ? "selected" : ""}>${escapeHtml(def.label)}</option>`
      ).join("");
      return `
        <tr>
          <td>${escapeHtml(header || `Column ${index + 1}`)}</td>
          <td><select data-import-column="${index}">${options}</select></td>
          <td class="import-preview-cell" title="${escapeHtml(previewValues)}">${escapeHtml(previewValues) || "—"}</td>
        </tr>
      `;
    })
    .join("");
  fields.importMappingTable.hidden = false;
  fields.importHelp.hidden = true;
  const rowCount = importParsedRows.length - 1;
  fields.importSummary.hidden = false;
  fields.importSummary.textContent = `${rowCount} row${rowCount === 1 ? "" : "s"} found. Review the mapping above, then import.`;
  fields.importConfirmButton.hidden = false;
};

fields.importMappingBody.addEventListener("change", (event) => {
  const select = event.target.closest("[data-import-column]");
  if (!select) return;
  importColumnMap[Number(select.dataset.importColumn)] = select.value;
});

fields.importButton.addEventListener("click", () => {
  resetImportModal();
  fields.importModal.hidden = false;
  fields.importFileInput.click();
});

fields.importFileInput.addEventListener("change", async () => {
  const file = fields.importFileInput.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    if (!rows.length) {
      fields.importError.hidden = false;
      fields.importError.textContent = "That file doesn't seem to have any rows in its first sheet.";
      return;
    }
    importParsedRows = rows;
    renderImportMapping(rows[0]);
  } catch (error) {
    console.error("Import parse failed:", error);
    fields.importError.hidden = false;
    fields.importError.textContent = "Couldn't read that file. Make sure it's a CSV or Excel (.xlsx/.xls) file exported from your spreadsheet, Tally, or Zoho Books.";
  }
});

fields.importConfirmButton.addEventListener("click", () => {
  const dataRows = importParsedRows.slice(1);
  let imported = 0;
  dataRows.forEach((row) => {
    const isBlankRow = row.every((cell) => cell === undefined || cell === "");
    if (isBlankRow) return;
    const values = {};
    importColumnMap.forEach((key, index) => {
      if (!key) return;
      values[key] = row[index];
    });
    // A row with neither a vendor name nor an amount is almost certainly a
    // stray subtotal/header line from the source report, not a real expense.
    if (!values.vendor && !values.amount) return;
    const expense = {
      id: crypto.randomUUID(),
      vendor: String(values.vendor || "").trim(),
      supplierPhone: "",
      date: parseImportDate(values.date),
      category: normalizeImportCategory(values.category),
      amount: Number(values.amount) || 0,
      gstin: String(values.gstin || "").trim().toUpperCase(),
      tax: Number(values.tax) || 0,
      materialItem: String(values.materialItem || "").trim(),
      quantity: String(values.quantity || "").trim(),
      notes: String(values.notes || "").trim(),
      status: normalizeImportStatus(values.status),
    };
    expense.aiFlags = buildAiFlags(expense);
    state.expenses.unshift(expense);
    imported += 1;
  });
  saveExpenses();
  render();
  closeImportModal();
  alert(`Imported ${imported} expense${imported === 1 ? "" : "s"}.`);
});

fields.importCancelButton.addEventListener("click", closeImportModal);

fields.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.profile = {
    name: fields.profileName.value.trim(),
    email: fields.profileEmail.value.trim(),
    businessName: fields.businessName.value.trim(),
    businessPhone: fields.businessPhone.value.trim(),
    businessGstin: fields.businessGstin.value.trim().toUpperCase(),
    userRole: fields.userRole.value.trim(),
  };
  saveProfile();
  alert("Profile saved.");
});

fields.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isOwner()) {
    alert("Only the account owner can change alert settings.");
    return;
  }
  saveSettings();
  alert("Settings saved.");
});

[fields.rawMaterialLimit, fields.alertPhone, fields.alertEmail, fields.alertViaSms, fields.alertViaEmail, fields.alarmEnabled].forEach((field) => {
  field.addEventListener("change", saveSettings);
});

window.addEventListener("hashchange", () => {
  const screen = location.hash.replace("#", "");
  if (screen && document.getElementById(`${screen}Screen`)) setScreen(screen);
});

fields.date.value = today();
fields.paymentDate.value = today();
updateUpiSectionVisibility();
state.chartPeriod = "monthly";
applyTheme(getPreferredTheme());
if (fields.themeToggle) {
  fields.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });
}

fields.authPasswordToggle.addEventListener("click", () => {
  const showing = fields.authPassword.type === "text";
  fields.authPassword.type = showing ? "password" : "text";
  fields.authPasswordToggle.querySelector(".icon-eye").hidden = !showing;
  fields.authPasswordToggle.querySelector(".icon-eye-off").hidden = showing;
  fields.authPasswordToggle.setAttribute("aria-pressed", String(!showing));
  fields.authPasswordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});
// Offline support: a service worker caches the app shell and every CDN
// script/asset (Tesseract.js, pdf.js, and the WASM/traineddata Tesseract.js
// itself fetches at runtime) the first time they're used online, so the app
// keeps working — including OCR — without a connection afterward. Service
// workers require a secure context (HTTPS or localhost); registration is a
// silent no-op failure when the page is opened directly via file://, which
// is why the badge below only ever reflects actual network status, not
// whether offline support is active.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("Service worker registration failed (offline support unavailable):", error);
    });
  });

  // sw.js already calls skipWaiting()+clients.claim() so a new version takes
  // over immediately rather than waiting for every tab to close — but that
  // alone still leaves an already-open window running the OLD app.js/HTML in
  // memory until something reloads it. An installed desktop/PWA window in
  // particular tends to sit open across an update far longer than a browser
  // tab does, which is exactly the gap that let a real device keep showing
  // pre-migration local-only data after this app moved to Firebase-backed
  // accounts. "controllerchange" fires once the new worker actually takes
  // control, so reload right then to pick up the fresh code automatically —
  // guarded so a page never reload-loops if this somehow fired more than once.
  let reloadedForNewServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForNewServiceWorker) return;
    reloadedForNewServiceWorker = true;
    window.location.reload();
  });
}

const updateOfflineBadge = () => {
  if (fields.offlineBadge) fields.offlineBadge.hidden = navigator.onLine;
};
window.addEventListener("online", updateOfflineBadge);
window.addEventListener("offline", updateOfflineBadge);
updateOfflineBadge();

setAuthMode("login");
// Fires once on load with whatever session Firebase has cached (or null),
// and again on every future sign-in/sign-out — this is the async
// replacement for the old synchronous "read localStorage, decide screen"
// check, since a real login now has to be confirmed with the server first.
auth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    state.user = { uid: firebaseUser.uid, email: firebaseUser.email, name: "Track Mint User", isOwner: true };
    await migrateLocalDataIfNeeded();
    await loadUserData();
    showApp();
  } else {
    detachUserDataListeners();
    state.user = null;
    state.expenses = [];
    state.payments = [];
    state.profile = {};
    state.settings = {};
    showAuth();
  }
});
