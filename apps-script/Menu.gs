/**
 * Menu.gs — Custom menu and menu action handlers
 * =================================================
 * All UI menu items and their handler functions.
 *
 * Error handling convention:
 *   - Menu handlers catch errors and show them via ui.alert() (user-facing)
 *   - Never throw unhandled — would show a raw Apps Script error dialog
 */

// ─── CUSTOM MENU ────────────────────────────────────────────────────────────

/**
 * Add Automation Tools menu to spreadsheet UI.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // Check for missing configuration on open (non-blocking)
  try { validateSetup_(); } catch (_) { /* non-blocking */ }

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

// ─── MENU HANDLERS ─────────────────────────────────────────────────────────

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
      sheet.getRange(i + 1, 1, 1, data[i].length).setBackground(CONFIG.AUDIT_HIGHLIGHT);
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

  const confirm = ui.prompt('FINAL CONFIRMATION', 'Type DELETE to confirm:', ui.ButtonSet.OK_CANCEL);
  if (confirm.getSelectedButton() !== ui.Button.OK || confirm.getResponseText().trim() !== 'DELETE') {
    ui.alert('Cancelled. You must type DELETE exactly to proceed.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  for (const name of CONFIG.NUCLEAR_RESET_SHEETS) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
  }

  // Reset Address Label docs via their own doPost endpoints
  for (const [type, url] of Object.entries(CONFIG.ADDRESS_LABELS_DOC_URLS)) {
    if (!url) {
      Logger.log(`No Web App URL configured for ${type} doc — skipping reset`);
      continue;
    }
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          trigger: 'reset_to_template',
          token: CONFIG.DOPOST_API_TOKEN,
        }),
        muteHttpExceptions: true,
      });
      const code = response.getResponseCode();
      if (code < 200 || code >= 300) {
        Logger.log(`${type} doc reset failed (HTTP ${code}): ${response.getContentText().substring(0, 200)}`);
      }
    } catch (e) {
      Logger.log(`Could not reset ${type} doc: ${e.message}`);
    }
  }

  ui.alert('All data cleared.');
}
