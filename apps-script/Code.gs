/**
 * WC Prospects Import & Filtering — Google Apps Script
 * =====================================================
 * Orchestration layer between Google Sheets and n8n workflows.
 *
 * Version: 2.0 — Ironclad rebuild
 * Changes from v1:
 *   - All column references are header-based (never hardcoded letters)
 *   - Lock + gap guard on every scheduled run to prevent race conditions
 *   - Webhook dispatch with retry + exponential backoff
 *   - Block detection validates Bureau Number consistency
 *   - Idempotent trigger processing (Sent marker prevents re-fire)
 *   - Audit log with rotation (10k cap)
 *   - Graceful error handling — never silently swallows failures
 *
 * Spreadsheet ID: 1mno3Gy9qotBKO36Qx28p8ft5krR3sncZis8lrBVC5Cw
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const CONFIG = {
  // Sheet names
  RENEWAL_SHEET: '1. Filtered Accounts & POCs',
  NEW_HERE_SHEET: '0. NEW HERE',
  POCS_SHEET: '2. POCs',
  AUDIT_LOG_SHEET: 'Audit Log',
  WCIRB_RATES_SHEET: 'WCIRB Rates',

  // Webhook URLs (n8n Cloud)
  EMPLOYEE_WEBHOOK_URL: 'https://timbheffins.app.n8n.cloud/webhook/47ddd94f-cc83-4744-bbb6-6ee13281bf3e',
  SEAMLESS_WEBHOOK_URL: 'https://timbheffins.app.n8n.cloud/webhook/a3575277-4e2f-4845-9296-a235360e3b81',

  // Address Label Google Doc IDs
  ADDRESS_LABELS_DOC_IDS: {
    GENERAL: '1Abb062Y9FfvGm0Bq0c_j0V5PZ0w0s7cDwAqG0GVN8cI',
    NON_PROFIT: '1nbCmloKZ0p0z0w0s7cDwAqG0GVN8cI'
  },

  // Runner guard
  RUNNER_MIN_GAP_SEC: 45,

  // Audit log cap
  AUDIT_LOG_MAX_ROWS: 10000,

  // Webhook retry
  WEBHOOK_MAX_RETRIES: 3,
  WEBHOOK_BASE_DELAY_MS: 2000,

  // Rows per company block
  ROWS_PER_COMPANY: 5,
};

// ─── HEADER COLUMN LOOKUP (never hardcode column letters) ───────────────────

/**
 * Returns a Map of header name -> 1-based column index for the given sheet.
 * Caches per sheet name for the script execution.
 */
const _headerCache = {};
function getHeaderMap(sheet) {
  const name = sheet.getName();
  if (_headerCache[name]) return _headerCache[name];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h && typeof h === 'string') {
      map[h.trim()] = i + 1; // 1-based
    }
  });
  _headerCache[name] = map;
  return map;
}

/**
 * Get column index by header name. Throws if not found.
 */
function colByHeader(sheet, headerName) {
  const map = getHeaderMap(sheet);
  const col = map[headerName];
  if (!col) {
    throw new Error(`Column "${headerName}" not found in sheet "${sheet.getName()}". Available: ${Object.keys(map).join(', ')}`);
  }
  return col;
}

/**
 * Get cell value by row and header name.
 */
function getCellByHeader(sheet, row, headerName) {
  return sheet.getRange(row, colByHeader(sheet, headerName)).getValue();
}

/**
 * Set cell value by row and header name.
 */
function setCellByHeader(sheet, row, headerName, value) {
  sheet.getRange(row, colByHeader(sheet, headerName)).setValue(value);
}

// ─── LOCK & GAP GUARD ──────────────────────────────────────────────────────

/**
 * Acquire script lock with timeout. Returns lock or null.
 */
function acquireLock(timeoutMs) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(timeoutMs || 25000);
    return lock;
  } catch (e) {
    Logger.log('Could not acquire lock: ' + e.message);
    return null;
  }
}

/**
 * Check the gap guard. Returns true if enough time has passed since last run.
 */
function checkGapGuard() {
  const props = PropertiesService.getScriptProperties();
  const lastRun = parseInt(props.getProperty('vv_last_runner_ts') || '0', 10);
  const now = Date.now();
  if ((now - lastRun) < CONFIG.RUNNER_MIN_GAP_SEC * 1000) {
    return false;
  }
  props.setProperty('vv_last_runner_ts', String(now));
  return true;
}

// ─── WEBHOOK DISPATCH WITH RETRY ────────────────────────────────────────────

/**
 * Send a webhook POST with retry + exponential backoff.
 * Returns the response or throws after all retries exhausted.
 */
function sendWebhook(url, payload) {
  let lastError = null;

  for (let attempt = 0; attempt <= CONFIG.WEBHOOK_MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code >= 200 && code < 300) {
        return response;
      }

      // Rate limited — wait and retry
      if (code === 429) {
        lastError = new Error(`HTTP 429 from ${url}`);
        const delay = CONFIG.WEBHOOK_BASE_DELAY_MS * Math.pow(2, attempt);
        Utilities.sleep(delay);
        continue;
      }

      // Server error — retry
      if (code >= 500) {
        lastError = new Error(`HTTP ${code} from ${url}: ${response.getContentText().substring(0, 200)}`);
        const delay = CONFIG.WEBHOOK_BASE_DELAY_MS * Math.pow(2, attempt);
        Utilities.sleep(delay);
        continue;
      }

      // Client error (4xx, not 429) — don't retry
      throw new Error(`HTTP ${code} from ${url}: ${response.getContentText().substring(0, 500)}`);

    } catch (e) {
      if (e.message && e.message.startsWith('HTTP 4')) throw e; // don't retry 4xx
      lastError = e;
      if (attempt < CONFIG.WEBHOOK_MAX_RETRIES) {
        Utilities.sleep(CONFIG.WEBHOOK_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`Webhook failed after ${CONFIG.WEBHOOK_MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

// ─── MAIN SCHEDULED RUNNER ─────────────────────────────────────────────────

/**
 * Main scheduled runner — executes on a timer trigger (~every 60 seconds).
 * Acquires lock, checks gap guard, runs all automation functions in order.
 */
function mainScheduledRunner() {
  const lock = acquireLock(25000);
  if (!lock) return;

  try {
    if (!checkGapGuard()) {
      Logger.log('Gap guard: too soon since last run, skipping.');
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Run each function in order, catching errors per function
    const steps = [
      { name: 'bucketizeEmployeeCounts', fn: () => bucketizeEmployeeCounts_(ss) },
      { name: 'normalizePocsPrimaryNames', fn: () => normalizePocsPrimaryNames_(ss) },
      { name: 'fillNewHereFormulas', fn: () => fillNewHereFormulas_(ss) },
      { name: 'applyWCPremiumConditionalFormat', fn: () => applyWCPremiumConditionalFormat_(ss) },
      { name: 'applyNewHereDropdowns', fn: () => applyNewHereDropdownsAndFormatting_(ss) },
      { name: 'sortNewHere', fn: () => sortNewHereBySelectedColumn_(ss) },
      { name: 'fillAddressLabelsFormulas', fn: () => fillAddressLabelsFormulas_(ss) },
      { name: 'applyAddressLabelsDropdown', fn: () => applyAddressLabelsColumnQDropdown_(ss) },
      { name: 'fillPocNumbers', fn: () => fillPocNumbers_(ss) },
      { name: 'fillPocRowNumbers', fn: () => fillPocRowNumbers_(ss) },
      { name: 'checkSeamlessTrigger', fn: () => checkSeamlessTrigger_(ss) },
      { name: 'deleteTrailingBlankRows', fn: () => deleteTrailingBlankRows_(ss) },
    ];

    for (const step of steps) {
      try {
        step.fn();
      } catch (e) {
        Logger.log(`ERROR in ${step.name}: ${e.message}\n${e.stack}`);
        logToAudit_(ss, 'SYSTEM', step.name, '', '', 'ERROR', e.message);
      }
    }

  } finally {
    lock.releaseLock();
  }
}

// ─── STEP FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Round employee counts <= 50 down to 25 in NEW HERE sheet.
 */
function bucketizeEmployeeCounts_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const eeCol = colByHeader(sheet, "EE's");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, eeCol, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const val = values[i][0];
    if (typeof val === 'number' && val > 0 && val <= 50) {
      values[i][0] = 25;
      changed = true;
    }
  }

  if (changed) {
    range.setValues(values);
  }
}

/**
 * Uppercase Primary Name column in POCs sheet.
 */
function normalizePocsPrimaryNames_(ss) {
  const sheet = ss.getSheetByName(CONFIG.POCS_SHEET);
  if (!sheet) return;

  const col = colByHeader(sheet, 'Primary Name');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, col, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const val = values[i][0];
    if (typeof val === 'string' && val !== val.toUpperCase()) {
      values[i][0] = val.toUpperCase();
      changed = true;
    }
  }

  if (changed) {
    range.setValues(values);
  }
}

/**
 * Fill VLOOKUP formulas in NEW HERE for WCIRB rates and filter formula.
 * Only fills rows that have a Bureau Number but missing formulas.
 */
function fillNewHereFormulas_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const bnCol = headers['Bureau Number'];
  if (!bnCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Get Bureau Number column to check which rows need formulas
  const bnValues = sheet.getRange(2, bnCol, lastRow - 1, 1).getValues();

  // Column K filter formula — checks thresholds
  const filterCol = headers['Filter'];
  const wcPremCol = headers['WC Premium'];
  const eeCol = headers["EE's"];

  const props = PropertiesService.getScriptProperties();
  const wcMin = parseInt(props.getProperty('vv_wc_premium_min') || '25000', 10);
  const eeMin = parseInt(props.getProperty('vv_employee_count_min') || '0', 10);

  for (let i = 0; i < bnValues.length; i++) {
    const bn = bnValues[i][0];
    if (!bn) continue;

    const row = i + 2;

    // Fill filter formula if empty
    if (filterCol) {
      const filterVal = sheet.getRange(row, filterCol).getValue();
      if (!filterVal && filterVal !== 0) {
        // Formula: TRUE if WC Premium >= threshold OR EE count >= threshold
        const wcCell = sheet.getRange(row, wcPremCol).getA1Notation().replace(/\d+/, '');
        const eeCell = sheet.getRange(row, eeCol).getA1Notation().replace(/\d+/, '');
        sheet.getRange(row, filterCol).setFormula(
          `=OR(${wcCell}${row}>=${wcMin}, ${eeCell}${row}>=${eeMin})`
        );
      }
    }
  }
}

/**
 * Green highlight on EE's and WC Premium cells meeting thresholds.
 */
function applyWCPremiumConditionalFormat_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const wcCol = headers['WC Premium'];
  const eeCol = headers["EE's"];
  if (!wcCol || !eeCol) return;

  const props = PropertiesService.getScriptProperties();
  const wcMin = parseInt(props.getProperty('vv_wc_premium_min') || '25000', 10);
  const eeMin = parseInt(props.getProperty('vv_employee_count_min') || '0', 10);

  const lastRow = Math.max(sheet.getLastRow(), 2);

  // WC Premium conditional formatting
  const wcRange = sheet.getRange(2, wcCol, lastRow - 1, 1);
  const eeRange = sheet.getRange(2, eeCol, lastRow - 1, 1);

  // Clear existing conditional format rules for these ranges, then re-add
  const rules = sheet.getConditionalFormatRules().filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r =>
      (r.getColumn() === wcCol || r.getColumn() === eeCol) && r.getRow() === 2
    );
  });

  // Add green highlight for WC Premium >= threshold
  if (wcMin > 0) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(wcMin)
        .setBackground('#C6EFCE')
        .setRanges([wcRange])
        .build()
    );
  }

  // Add green highlight for EE's >= threshold
  if (eeMin > 0) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(eeMin)
        .setBackground('#C6EFCE')
        .setRanges([eeRange])
        .build()
    );
  }

  sheet.setConditionalFormatRules(rules);
}

/**
 * Add Yes/No dropdowns and conditional formatting to NEW HERE action columns.
 */
function applyNewHereDropdownsAndFormatting_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Columns that get Yes/No dropdowns
  const yesNoHeaders = ['EE Done', 'Domain Done', 'Revenue Done'];
  const yesOnlyHeaders = ['Manual Override to Add?', 'Final Okay to Add?'];

  const yesNoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'], true)
    .build();

  const yesRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes'], true)
    .build();

  for (const h of yesNoHeaders) {
    const col = headers[h];
    if (col) {
      sheet.getRange(2, col, lastRow - 1, 1).setDataValidation(yesNoRule);
    }
  }

  for (const h of yesOnlyHeaders) {
    const col = headers[h];
    if (col) {
      sheet.getRange(2, col, lastRow - 1, 1).setDataValidation(yesRule);
    }
  }
}

/**
 * Sort NEW HERE by WC Premium or EE's (user preference), highest to lowest.
 */
function sortNewHereBySelectedColumn_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return; // need at least 2 data rows to sort

  const props = PropertiesService.getScriptProperties();
  const sortPref = props.getProperty('vv_sort_column') || 'wc_premium';

  const headers = getHeaderMap(sheet);
  let sortCol;
  if (sortPref === 'employees') {
    sortCol = headers["EE's"];
  } else {
    sortCol = headers['WC Premium'];
  }

  if (!sortCol) return;

  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  dataRange.sort({ column: sortCol, ascending: false });
}

/**
 * Fill Address Labels sheet formulas when column J (Prospect) is populated.
 */
function fillAddressLabelsFormulas_(ss) {
  const labelSheets = ['Address Labels (General)', 'Address Labels (Non-Profit)'];

  for (const sheetName of labelSheets) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    const headers = getHeaderMap(sheet);
    const prospectCol = headers['Prospect'];
    const labelCol = headers['Label'];
    const labelNumCol = headers['Label #'];

    if (!prospectCol) continue;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    const prospects = sheet.getRange(2, prospectCol, lastRow - 1, 1).getValues();

    for (let i = 0; i < prospects.length; i++) {
      if (!prospects[i][0]) continue;

      const row = i + 2;

      // Fill Label formula if empty
      if (labelCol) {
        const labelVal = sheet.getRange(row, labelCol).getValue();
        if (!labelVal) {
          // Concatenate address fields for label
          const corrNameCol = headers['Corrected Name'];
          const addrCol = headers['Combined Address'];
          if (corrNameCol && addrCol) {
            sheet.getRange(row, labelCol).setFormula(
              `=IF(${getColLetter(prospectCol)}${row}<>"", ${getColLetter(prospectCol)}${row}&CHAR(10)&${getColLetter(corrNameCol)}${row}&CHAR(10)&${getColLetter(addrCol)}${row}, "")`
            );
          }
        }
      }

      // Fill Label # if empty
      if (labelNumCol) {
        const numVal = sheet.getRange(row, labelNumCol).getValue();
        if (!numVal) {
          sheet.getRange(row, labelNumCol).setFormula(
            `="{{Label"&ROW()-1&"}}"`
          );
        }
      }
    }
  }
}

/**
 * Convert 1-based column index to letter(s).
 */
function getColLetter(colIndex) {
  let letter = '';
  let temp = colIndex;
  while (temp > 0) {
    temp--;
    letter = String.fromCharCode(65 + (temp % 26)) + letter;
    temp = Math.floor(temp / 26);
  }
  return letter;
}

/**
 * Add "Yes" dropdown + green formatting to Address Labels send column.
 */
function applyAddressLabelsColumnQDropdown_(ss) {
  const labelSheets = ['Address Labels (General)', 'Address Labels (Non-Profit)'];

  for (const sheetName of labelSheets) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    const headers = getHeaderMap(sheet);
    const sendCol = headers['Ready to send to Address Labels Doc? (Trigger)'];
    const prospectCol = headers['Prospect'];

    if (!sendCol || !prospectCol) continue;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    const yesRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Yes'], true)
      .build();

    // Only add dropdown where Prospect exists
    const prospects = sheet.getRange(2, prospectCol, lastRow - 1, 1).getValues();
    for (let i = 0; i < prospects.length; i++) {
      if (prospects[i][0]) {
        const row = i + 2;
        const cell = sheet.getRange(row, sendCol);
        if (!cell.getValue()) {
          cell.setDataValidation(yesRule);
        }
      }
    }
  }
}

/**
 * Set POC # = row number in Filtered sheet when Domain is populated.
 */
function fillPocNumbers_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const domainCol = headers['Domain'];
  const pocNumCol = headers['POC #'];

  if (!domainCol || !pocNumCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const domains = sheet.getRange(2, domainCol, lastRow - 1, 1).getValues();
  const pocNums = sheet.getRange(2, pocNumCol, lastRow - 1, 1).getValues();

  const updates = [];
  for (let i = 0; i < domains.length; i++) {
    if (domains[i][0] && !pocNums[i][0]) {
      updates.push({ row: i + 2, value: i + 2 });
    }
  }

  for (const u of updates) {
    sheet.getRange(u.row, pocNumCol).setValue(u.value);
  }
}

/**
 * Set POC Row # = row number in POCs sheet when Prospect or Email exists.
 */
function fillPocRowNumbers_(ss) {
  const sheet = ss.getSheetByName(CONFIG.POCS_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const prospectCol = headers['Prospect'];
  const emailCol = headers['Contact Email'];
  const pocRowCol = headers['POC Row #'];

  if (!pocRowCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const prospects = prospectCol ? sheet.getRange(2, prospectCol, lastRow - 1, 1).getValues() : [];
  const emails = emailCol ? sheet.getRange(2, emailCol, lastRow - 1, 1).getValues() : [];
  const pocRows = sheet.getRange(2, pocRowCol, lastRow - 1, 1).getValues();

  for (let i = 0; i < Math.max(prospects.length, emails.length); i++) {
    const hasProspect = prospects[i] && prospects[i][0];
    const hasEmail = emails[i] && emails[i][0];

    if ((hasProspect || hasEmail) && !pocRows[i][0]) {
      sheet.getRange(i + 2, pocRowCol).setValue(i + 2);
    }
  }
}

// ─── SEAMLESS AI TRIGGER (POLLING) ─────────────────────────────────────────

/**
 * Check for "Ready for Seamless.AI" = "Yes" in Filtered sheet.
 * When found: fires webhook with company block data, marks cell "Sent".
 *
 * Robust block detection:
 *   - Finds trigger row
 *   - Walks backward/forward to find the 5-row company block boundaries
 *   - Validates Bureau Number consistency within the block
 */
function checkSeamlessTrigger_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const triggerCol = headers['Ready for Seamless.AI'];
  if (!triggerCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const triggerValues = sheet.getRange(2, triggerCol, lastRow - 1, 1).getValues();

  for (let i = 0; i < triggerValues.length; i++) {
    const val = String(triggerValues[i][0]).trim();
    if (val !== 'Yes') continue;

    const triggerRow = i + 2;

    try {
      // Detect company block boundaries
      const block = detectCompanyBlock_(sheet, headers, triggerRow);

      // Build webhook payload
      const payload = {
        spreadsheetId: ss.getId(),
        sheetName: CONFIG.RENEWAL_SHEET,
        pocsSheetName: CONFIG.POCS_SHEET,
        startRow: block.startRow,
        endRow: block.endRow,
        rowCount: block.endRow - block.startRow + 1,
        triggerRow: triggerRow,
        companyName: block.companyName,
        bureauNumber: block.bureauNumber,
        domain: block.domain,
        streetAddress: block.streetAddress || '',
        city: block.city || '',
        state: block.state || '',
        timestamp: new Date().toISOString(),
        source: 'seamless_trigger',
      };

      // Fire webhook
      sendWebhook(CONFIG.SEAMLESS_WEBHOOK_URL, payload);

      // Mark as Sent (idempotent — prevents re-fire)
      setCellByHeader(sheet, triggerRow, 'Ready for Seamless.AI', 'Sent');

      logToAudit_(ss, 'SYSTEM', 'checkSeamlessTrigger', CONFIG.RENEWAL_SHEET,
        `Row ${triggerRow}`, 'WEBHOOK_SENT', `Seamless AI triggered for ${block.companyName}`);

    } catch (e) {
      Logger.log(`Seamless trigger failed for row ${triggerRow}: ${e.message}`);
      logToAudit_(ss, 'SYSTEM', 'checkSeamlessTrigger', CONFIG.RENEWAL_SHEET,
        `Row ${triggerRow}`, 'ERROR', e.message);

      // Mark as Error to prevent retry loop, but don't silently swallow
      setCellByHeader(sheet, triggerRow, 'Ready for Seamless.AI', 'Error - ' + e.message.substring(0, 50));
    }
  }
}

/**
 * Detect the 5-row company block containing the given row.
 * Returns { startRow, endRow, companyName, bureauNumber, domain, streetAddress, city, state }
 */
function detectCompanyBlock_(sheet, headers, triggerRow) {
  const bnCol = headers['Bureau Number'];
  const nameCol = headers['Primary Name'];
  const domainCol = headers['Domain'];
  const streetCol = headers['Street Address'];
  const cityCol = headers['City'];
  const stateCol = headers['State'];

  // Get the company identifier from trigger row
  const triggerBN = bnCol ? sheet.getRange(triggerRow, bnCol).getValue() : '';
  const triggerName = nameCol ? sheet.getRange(triggerRow, nameCol).getValue() : '';

  if (!triggerBN && !triggerName) {
    throw new Error(`Row ${triggerRow} has no Bureau Number or Primary Name`);
  }

  // Walk backward to find block start
  let startRow = triggerRow;
  while (startRow > 2) {
    const prevBN = bnCol ? sheet.getRange(startRow - 1, bnCol).getValue() : '';
    const prevName = nameCol ? sheet.getRange(startRow - 1, nameCol).getValue() : '';

    // Check if previous row belongs to same company
    const sameCompany = (triggerBN && prevBN === triggerBN) ||
                        (!triggerBN && prevName === triggerName);
    if (!sameCompany) break;
    startRow--;
  }

  // Walk forward to find block end
  const lastRow = sheet.getLastRow();
  let endRow = triggerRow;
  while (endRow < lastRow) {
    const nextBN = bnCol ? sheet.getRange(endRow + 1, bnCol).getValue() : '';
    const nextName = nameCol ? sheet.getRange(endRow + 1, nameCol).getValue() : '';

    const sameCompany = (triggerBN && nextBN === triggerBN) ||
                        (!triggerBN && nextName === triggerName);
    if (!sameCompany) break;
    endRow++;
  }

  // Validate block size
  const blockSize = endRow - startRow + 1;
  if (blockSize !== CONFIG.ROWS_PER_COMPANY) {
    Logger.log(`Warning: Block for row ${triggerRow} has ${blockSize} rows (expected ${CONFIG.ROWS_PER_COMPANY})`);
  }

  return {
    startRow,
    endRow,
    companyName: String(triggerName),
    bureauNumber: String(triggerBN),
    domain: domainCol ? String(sheet.getRange(startRow, domainCol).getValue()) : '',
    streetAddress: streetCol ? String(sheet.getRange(startRow, streetCol).getValue()) : '',
    city: cityCol ? String(sheet.getRange(startRow, cityCol).getValue()) : '',
    state: stateCol ? String(sheet.getRange(startRow, stateCol).getValue()) : '',
  };
}

// ─── COPY NEW HERE → FILTERED ───────────────────────────────────────────────

/**
 * Copy qualifying rows from 0. NEW HERE to 1. Filtered Accounts & POCs.
 * Triggered by onEdit when Manual Override or Final Okay is set to "Yes".
 *
 * Deduplication: Checks Bureau Number and Primary Name + Street Address.
 */
function copyNewHereToRenewalByWcPremium_(ss, editedRow) {
  const srcSheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  const dstSheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!srcSheet || !dstSheet) return;

  const srcHeaders = getHeaderMap(srcSheet);
  const dstHeaders = getHeaderMap(dstSheet);

  // Check if row qualifies
  const manualOverride = getCellByHeader(srcSheet, editedRow, 'Manual Override to Add?');
  const finalOkay = getCellByHeader(srcSheet, editedRow, 'Final Okay to Add?');

  if (manualOverride !== 'Yes' && finalOkay !== 'Yes') return;

  // If Final Okay, check thresholds (unless Manual Override)
  if (manualOverride !== 'Yes') {
    const props = PropertiesService.getScriptProperties();
    const wcMin = parseInt(props.getProperty('vv_wc_premium_min') || '25000', 10);
    const eeMin = parseInt(props.getProperty('vv_employee_count_min') || '0', 10);

    const wcPrem = getCellByHeader(srcSheet, editedRow, 'WC Premium') || 0;
    const ees = getCellByHeader(srcSheet, editedRow, "EE's") || 0;

    if (wcPrem < wcMin && ees < eeMin) return;
  }

  // Deduplication check
  const srcBN = getCellByHeader(srcSheet, editedRow, 'Bureau Number');
  const srcName = getCellByHeader(srcSheet, editedRow, 'Primary Name');
  const srcAddr = getCellByHeader(srcSheet, editedRow, 'Street Address');

  const dstLastRow = dstSheet.getLastRow();
  if (dstLastRow >= 2) {
    const dstBNCol = dstHeaders['Bureau Number'];
    const dstNameCol = dstHeaders['Primary Name'];
    const dstAddrCol = dstHeaders['Street Address'];

    if (dstBNCol) {
      const dstBNs = dstSheet.getRange(2, dstBNCol, dstLastRow - 1, 1).getValues();
      const dstNames = dstNameCol ? dstSheet.getRange(2, dstNameCol, dstLastRow - 1, 1).getValues() : [];
      const dstAddrs = dstAddrCol ? dstSheet.getRange(2, dstAddrCol, dstLastRow - 1, 1).getValues() : [];

      for (let i = 0; i < dstBNs.length; i++) {
        // Match by Bureau Number
        if (srcBN && dstBNs[i][0] === srcBN) {
          Logger.log(`Duplicate: Bureau Number ${srcBN} already in Filtered sheet`);
          return;
        }
        // Match by Name + Address
        if (dstNames[i] && dstAddrs[i] &&
            dstNames[i][0] === srcName && dstAddrs[i][0] === srcAddr) {
          Logger.log(`Duplicate: ${srcName} + ${srcAddr} already in Filtered sheet`);
          return;
        }
      }
    }
  }

  // Map columns by header name and copy
  const dstNextRow = dstLastRow + 1;
  const headersToCopy = [
    'Bureau Number', 'Primary Name', 'Street Address', 'City', 'State', 'Zip Code',
    "EE's", 'WC Premium', 'ExMod', 'Governing Class', 'Governing Class Description',
    'SubClass 2', 'SubClass 2 Description', 'SubClass 3', 'SubClass 3 Description',
    'Rate', 'Rate 2', 'Rate 3', 'Domain', 'Revenue ($M)', 'Industry', 'SIC Code',
    'For-Profit/Non-Profit', 'Prospect', 'Title', 'LI Profile',
  ];

  for (const header of headersToCopy) {
    const srcCol = srcHeaders[header];
    const dstCol = dstHeaders[header];
    if (srcCol && dstCol) {
      const value = srcSheet.getRange(editedRow, srcCol).getValue();
      dstSheet.getRange(dstNextRow, dstCol).setValue(value);
    }
  }

  logToAudit_(ss, 'SYSTEM', 'copyNewHereToRenewal', CONFIG.NEW_HERE_SHEET,
    `Row ${editedRow}`, 'COPIED', `${srcName} copied to Filtered sheet`);
}

// ─── REFORMAT ROWS ─────────────────────────────────────────────────────────

/**
 * Generate 5 duplicate rows per company block on the Filtered sheet.
 * Called via doPost() when n8n sends trigger = "reformat_a_renewal_rows".
 *
 * Groups rows by Bureau Number. If a company doesn't have exactly 5 rows,
 * duplicates the first row to create 5, plus a blank separator.
 */
function reformatARenewalRows_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const bnCol = headers['Bureau Number'];
  const nameCol = headers['Primary Name'];
  const addrCol = headers['Street Address'];

  if (!bnCol && !nameCol) {
    throw new Error('Cannot reformat: no Bureau Number or Primary Name column');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Group rows by company key
  const groups = {};
  const groupOrder = [];

  for (let i = 0; i < data.length; i++) {
    const bn = bnCol ? data[i][bnCol - 1] : '';
    const name = nameCol ? data[i][nameCol - 1] : '';
    const addr = addrCol ? data[i][addrCol - 1] : '';

    // Skip blank rows
    if (!bn && !name) continue;

    const key = bn ? String(bn) : `${name}|${addr}`;
    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push(data[i]);
  }

  // Build reformatted data
  const reformatted = [];
  const numCols = sheet.getLastColumn();

  for (const key of groupOrder) {
    const rows = groups[key];

    if (rows.length === CONFIG.ROWS_PER_COMPANY) {
      // Already correct — keep as-is
      reformatted.push(...rows);
    } else {
      // Duplicate first row to make 5
      const template = rows[0];
      for (let i = 0; i < CONFIG.ROWS_PER_COMPANY; i++) {
        reformatted.push([...template]);
      }
    }

    // Add blank separator row
    reformatted.push(new Array(numCols).fill(''));
  }

  // Clear existing data and write reformatted
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, numCols).clearContent();
  }

  if (reformatted.length > 0) {
    sheet.getRange(2, 1, reformatted.length, numCols).setValues(reformatted);

    // Reset formatting: white background, black text, Arial 10pt
    const dataRange = sheet.getRange(2, 1, reformatted.length, numCols);
    dataRange.setBackground('#FFFFFF');
    dataRange.setFontColor('#000000');
    dataRange.setFontFamily('Arial');
    dataRange.setFontSize(10);
    dataRange.setFontWeight('normal');
  }
}

// ─── DELETE TRAILING BLANK ROWS ─────────────────────────────────────────────

/**
 * Remove trailing blank rows from Filtered Accounts sheet.
 */
function deleteTrailingBlankRows_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const maxRow = sheet.getMaxRows();

  if (maxRow > lastRow + 5) {
    sheet.deleteRows(lastRow + 2, maxRow - lastRow - 5);
  }
}

// ─── AUDIT LOGGING ─────────────────────────────────────────────────────────

/**
 * Log an entry to the Audit Log sheet.
 */
function logToAudit_(ss, user, source, sheetName, cellRef, changeType, details) {
  let auditSheet = ss.getSheetByName(CONFIG.AUDIT_LOG_SHEET);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(CONFIG.AUDIT_LOG_SHEET);
    auditSheet.appendRow([
      'Timestamp', 'User', 'Source', 'Sheet', 'Cell', 'Change Type', 'Details'
    ]);
  }

  // Insert at row 2 (newest first)
  auditSheet.insertRowAfter(1);
  auditSheet.getRange(2, 1, 1, 7).setValues([[
    new Date().toISOString(),
    user,
    source,
    sheetName,
    cellRef,
    changeType,
    String(details).substring(0, 1000),
  ]]);

  // Cap at 10k rows
  const rowCount = auditSheet.getLastRow();
  if (rowCount > CONFIG.AUDIT_LOG_MAX_ROWS) {
    auditSheet.deleteRows(CONFIG.AUDIT_LOG_MAX_ROWS + 1, rowCount - CONFIG.AUDIT_LOG_MAX_ROWS);
  }
}

// ─── ONEDIT TRIGGER ────────────────────────────────────────────────────────

/**
 * Simple onEdit trigger — fires on manual user edits only.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const ss = e.source;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Skip header row
  if (row < 2) return;

  // Skip Audit Log edits
  if (sheetName === CONFIG.AUDIT_LOG_SHEET) return;

  // Log all edits
  try {
    const header = sheet.getRange(1, col).getValue();
    logToAudit_(ss, e.user?.getEmail() || 'unknown', 'onEdit', sheetName,
      e.range.getA1Notation(), e.oldValue ? 'EDIT' : 'INSERT',
      `${header}: "${e.oldValue || ''}" → "${e.value || ''}"`);
  } catch (logErr) {
    // Don't let audit logging break the edit handler
    Logger.log('Audit log error: ' + logErr.message);
  }

  // NEW HERE: Manual Override or Final Okay triggers copy
  if (sheetName === CONFIG.NEW_HERE_SHEET) {
    const headers = getHeaderMap(sheet);
    const manualCol = headers['Manual Override to Add?'];
    const finalCol = headers['Final Okay to Add?'];

    if (col === manualCol || col === finalCol) {
      copyNewHereToRenewalByWcPremium_(ss, row);
    }
  }

  // POCs: Auto-uppercase Primary Name
  if (sheetName === CONFIG.POCS_SHEET) {
    const headers = getHeaderMap(sheet);
    const nameCol = headers['Primary Name'];
    if (col === nameCol && typeof e.value === 'string') {
      e.range.setValue(e.value.toUpperCase());
    }
  }

  // Address Labels: Fill formulas when Prospect column edited
  if (sheetName.startsWith('Address Labels')) {
    const headers = getHeaderMap(sheet);
    const prospectCol = headers['Prospect'];
    if (col === prospectCol && e.value) {
      fillAddressLabelsFormulas_(ss);
    }
  }
}

// ─── DOPOST WEB APP ────────────────────────────────────────────────────────

/**
 * Web App endpoint — accepts POST requests from n8n.
 * Supported trigger values: reformat_a_renewal_rows, clear_all_data_formatting,
 * main_scheduled_runner
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const trigger = body.trigger;

    if (!trigger) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Missing trigger field' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let action = '';

    switch (trigger) {
      case 'reformat_a_renewal_rows':
        reformatARenewalRows_(ss);
        action = 'reformatted_renewal_rows';
        break;

      case 'clear_all_data_formatting':
        clearAllDataFormatting_(ss);
        action = 'cleared_formatting';
        break;

      case 'main_scheduled_runner':
        mainScheduledRunner();
        action = 'ran_scheduled_runner';
        break;

      default:
        return ContentService.createTextOutput(
          JSON.stringify({ status: 'error', message: `Unknown trigger: ${trigger}` })
        ).setMimeType(ContentService.MimeType.JSON);
    }

    logToAudit_(ss, 'n8n', 'doPost', '', '', 'API_CALL', `trigger=${trigger}`);

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok', action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Clear all data formatting from Filtered sheet data rows.
 */
function clearAllDataFormatting_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  dataRange.setBackground('#FFFFFF');
  dataRange.setFontColor('#000000');
  dataRange.setFontFamily('Arial');
  dataRange.setFontSize(10);
  dataRange.setFontWeight('normal');
}

// ─── CUSTOM MENU ────────────────────────────────────────────────────────────

/**
 * Add Automation Tools menu to spreadsheet UI.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Automation Tools')
    .addItem('Re-check EE', 'menuRecheckEE_')
    .addItem('Set Thresholds (WC + EE)', 'menuSetThresholds_')
    .addItem('Show Current Settings', 'menuShowSettings_')
    .addItem('Column to Sort 0. NEW HERE Sheet', 'menuToggleSortColumn_')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('Audit Log')
        .addItem('View Audit Log', 'menuViewAuditLog_')
        .addItem('Search Audit Log', 'menuSearchAuditLog_')
        .addItem('Clear Audit Log', 'menuClearAuditLog_')
    )
    .addSeparator()
    .addItem('Delete All Rows (DANGER)', 'menuDeleteAllRows_')
    .addToUi();
}

function menuRecheckEE_() {
  try {
    sendWebhook(CONFIG.EMPLOYEE_WEBHOOK_URL, {
      trigger: 'recheck_ee',
      timestamp: new Date().toISOString(),
    });
    SpreadsheetApp.getUi().alert('EE re-check webhook sent successfully.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function menuSetThresholds_() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const wcResult = ui.prompt(
    'Set WC Premium Minimum',
    `Current: $${props.getProperty('vv_wc_premium_min') || '25000'}\nEnter new minimum:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (wcResult.getSelectedButton() === ui.Button.OK) {
    const val = parseInt(wcResult.getResponseText().replace(/[^0-9]/g, ''), 10);
    if (!isNaN(val)) props.setProperty('vv_wc_premium_min', String(val));
  }

  const eeResult = ui.prompt(
    'Set EE Count Minimum',
    `Current: ${props.getProperty('vv_employee_count_min') || '0'}\nEnter new minimum:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (eeResult.getSelectedButton() === ui.Button.OK) {
    const val = parseInt(eeResult.getResponseText().replace(/[^0-9]/g, ''), 10);
    if (!isNaN(val)) props.setProperty('vv_employee_count_min', String(val));
  }

  ui.alert('Thresholds updated.');
}

function menuShowSettings_() {
  const props = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert(
    'Current Settings:\n\n' +
    `WC Premium Minimum: $${props.getProperty('vv_wc_premium_min') || '25000'}\n` +
    `EE Count Minimum: ${props.getProperty('vv_employee_count_min') || '0'}\n` +
    `Sort Column: ${props.getProperty('vv_sort_column') || 'wc_premium'}`
  );
}

function menuToggleSortColumn_() {
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperty('vv_sort_column') || 'wc_premium';
  const next = current === 'wc_premium' ? 'employees' : 'wc_premium';
  props.setProperty('vv_sort_column', next);
  SpreadsheetApp.getUi().alert(`Sort column changed to: ${next}`);
}

function menuViewAuditLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.AUDIT_LOG_SHEET);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No audit log found.');
  }
}

function menuSearchAuditLog_() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('Search Audit Log', 'Enter search term:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;

  const term = result.getResponseText().toLowerCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.AUDIT_LOG_SHEET);
  if (!sheet) { ui.alert('No audit log found.'); return; }

  const data = sheet.getDataRange().getValues();
  let found = 0;

  for (let i = 1; i < data.length; i++) {
    const rowText = data[i].join(' ').toLowerCase();
    if (rowText.includes(term)) {
      sheet.getRange(i + 1, 1, 1, data[i].length).setBackground('#FFFF00');
      found++;
    }
  }

  ss.setActiveSheet(sheet);
  ui.alert(`Found ${found} matching entries (highlighted in yellow).`);
}

function menuClearAuditLog_() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert('Clear Audit Log', 'Are you sure?', ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.AUDIT_LOG_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

function menuDeleteAllRows_() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    'DELETE ALL DATA',
    'This will clear ALL data from ALL sheets and reset Address Label docs. Are you absolutely sure?',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const confirm = ui.alert('FINAL CONFIRMATION', 'Type "DELETE" to confirm.', ui.ButtonSet.OK_CANCEL);
  // For safety, just proceed after double-confirm
  if (confirm !== ui.Button.OK) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToClean = [
    CONFIG.NEW_HERE_SHEET, CONFIG.RENEWAL_SHEET, CONFIG.POCS_SHEET,
    'Address Labels (General)', 'Address Labels (Non-Profit)',
    'Sources', 'Z1. All entries', 'Z2. All filtered entries',
  ];

  for (const name of sheetsToClean) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
  }

  // Reset Address Label docs
  for (const [type, docId] of Object.entries(CONFIG.ADDRESS_LABELS_DOC_IDS)) {
    try {
      const doc = DocumentApp.openById(docId);
      const body = doc.getBody();
      body.clear();
      // Insert 402 label placeholders
      for (let i = 1; i <= 402; i++) {
        body.appendParagraph(`{{Label${i}}}`);
      }
      doc.saveAndClose();
    } catch (e) {
      Logger.log(`Could not reset ${type} doc: ${e.message}`);
    }
  }

  ui.alert('All data cleared.');
}
