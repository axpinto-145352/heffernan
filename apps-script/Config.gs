/**
 * Config.gs — Centralized configuration and constants
 * ====================================================
 * All configuration, magic numbers, and ScriptProperties access in one place.
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────

/**
 * Load CONFIG from ScriptProperties (secrets never in source code).
 * Set these once via: Script Editor → Project Settings → Script Properties
 *   - employee_webhook_url
 *   - seamless_webhook_url
 *   - address_labels_doc_general
 *   - address_labels_doc_nonprofit
 *   - address_labels_doc_url_general
 *   - address_labels_doc_url_nonprofit
 *   - dopost_api_token  (shared secret for authenticating n8n → Apps Script calls)
 */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    // ── Sheet names ──────────────────────────────────────────────────
    RENEWAL_SHEET: '1. Filtered Accounts & POCs',
    NEW_HERE_SHEET: '0. NEW HERE',
    POCS_SHEET: '2. POCs',
    AUDIT_LOG_SHEET: 'Audit Log',
    WCIRB_RATES_SHEET: 'WCIRB Rates',
    ADDRESS_LABELS_SHEETS: [
      'Address Labels (General)',
      'Address Labels (Non-Profit)',
    ],
    NUCLEAR_RESET_SHEETS: [
      '0. NEW HERE',
      '1. Filtered Accounts & POCs',
      '2. POCs',
      'Address Labels (General)',
      'Address Labels (Non-Profit)',
      'Sources',
      'Z1. All entries',
      'Z2. All filtered entries',
    ],

    // ── Secrets from ScriptProperties (never hardcoded) ──────────────
    EMPLOYEE_WEBHOOK_URL: props.getProperty('employee_webhook_url') || '',
    SEAMLESS_WEBHOOK_URL: props.getProperty('seamless_webhook_url') || '',
    DOPOST_API_TOKEN: props.getProperty('dopost_api_token') || '',

    // ── Address Label Google Docs ────────────────────────────────────
    ADDRESS_LABELS_DOC_IDS: {
      GENERAL: props.getProperty('address_labels_doc_general') || '',
      NON_PROFIT: props.getProperty('address_labels_doc_nonprofit') || '',
    },
    ADDRESS_LABELS_DOC_URLS: {
      GENERAL: props.getProperty('address_labels_doc_url_general') || '',
      NON_PROFIT: props.getProperty('address_labels_doc_url_nonprofit') || '',
    },

    // ── Tunable constants ────────────────────────────────────────────
    RUNNER_MIN_GAP_SEC: 45,
    AUDIT_LOG_MAX_ROWS: 10000,
    WEBHOOK_MAX_RETRIES: 3,
    WEBHOOK_BASE_DELAY_MS: 2000,
    ROWS_PER_COMPANY: 5,
    TRAILING_BLANK_BUFFER: 5,

    // ── Thresholds (from ScriptProperties, with defaults) ────────────
    WC_PREMIUM_MIN: parseInt(props.getProperty('vv_wc_premium_min') || '25000', 10),
    EE_COUNT_MIN: parseInt(props.getProperty('vv_employee_count_min') || '0', 10),
    SORT_COLUMN: props.getProperty('vv_sort_column') || 'wc_premium',

    // ── Formatting constants ─────────────────────────────────────────
    GREEN_HIGHLIGHT: '#C6EFCE',
    DEFAULT_BG: '#FFFFFF',
    DEFAULT_TEXT: '#000000',
    DEFAULT_FONT: 'Arial',
    DEFAULT_FONT_SIZE: 10,
    AUDIT_HIGHLIGHT: '#FFFF00',

    // ── Headers that get Yes/No dropdowns on NEW HERE ─────────────────
    YES_NO_DROPDOWN_HEADERS: ['EE Done', 'Domain Done', 'Revenue Done'],
    YES_ONLY_DROPDOWN_HEADERS: ['Manual Override to Add?', 'Final Okay to Add?'],

    // ── Headers to copy from NEW HERE → Filtered ─────────────────────
    COPY_HEADERS: [
      'Bureau Number', 'Primary Name', 'Street Address', 'City', 'State', 'Zip Code',
      "EE's", 'WC Premium', 'ExMod', 'Governing Class', 'Governing Class Description',
      'SubClass 2', 'SubClass 2 Description', 'SubClass 3', 'SubClass 3 Description',
      'Rate', 'Rate 2', 'Rate 3', 'Domain', 'Revenue ($M)', 'Industry', 'SIC Code',
      'For-Profit/Non-Profit', 'Prospect', 'Title', 'LI Profile',
    ],
  };
}

// Lazy-loaded CONFIG singleton (avoids repeated property reads)
let _configCache = null;
const CONFIG = new Proxy({}, {
  get(target, prop) {
    if (!_configCache) _configCache = getConfig_();
    return _configCache[prop];
  }
});
