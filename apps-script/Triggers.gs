/**
 * Triggers.gs — onEdit, Seamless AI trigger, copy/reformat operations
 * =====================================================================
 * Event-driven functions that respond to user edits and trigger conditions.
 *
 * Error handling convention:
 *   - onEdit: catches per-handler, logs errors, never throws (would break editing)
 *   - checkSeamlessTrigger_: catches per-row, writes error to cell + audit log
 *   - Internal helpers (detectCompanyBlock_, copyNewHereToRenewal): THROW on failure
 */

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

  // Log all edits (best-effort)
  try {
    const header = sheet.getRange(1, col).getValue();
    logToAudit_(ss, e.user?.getEmail() || 'unknown', 'onEdit', sheetName,
      e.range.getA1Notation(), e.oldValue ? 'EDIT' : 'INSERT',
      `${header}: "${e.oldValue || ''}" → "${e.value || ''}"`);
  } catch (logErr) {
    Logger.log('Audit log error: ' + logErr.message);
  }

  // NEW HERE: Manual Override or Final Okay triggers copy
  if (sheetName === CONFIG.NEW_HERE_SHEET) {
    try {
      const headers = getHeaderMap(sheet);
      const manualCol = headers['Manual Override to Add?'];
      const finalCol = headers['Final Okay to Add?'];

      if (col === manualCol || col === finalCol) {
        copyNewHereToRenewalByWcPremium_(ss, row);
      }
    } catch (err) {
      Logger.log('Copy to Filtered failed: ' + err.message);
    }
  }

  // POCs: Auto-uppercase Primary Name
  if (sheetName === CONFIG.POCS_SHEET) {
    try {
      const headers = getHeaderMap(sheet);
      const nameCol = headers['Primary Name'];
      if (col === nameCol && typeof e.value === 'string') {
        e.range.setValue(e.value.toUpperCase());
      }
    } catch (err) {
      Logger.log('POC uppercase failed: ' + err.message);
    }
  }

  // Address Labels: Fill formulas when Prospect column edited
  if (sheetName.startsWith('Address Labels')) {
    try {
      const headers = getHeaderMap(sheet);
      const prospectCol = headers['Prospect'];
      if (col === prospectCol && e.value) {
        fillAddressLabelsFormulas_(ss);
      }
    } catch (err) {
      Logger.log('Address Labels formula fill failed: ' + err.message);
    }
  }
}

// ─── SEAMLESS AI TRIGGER ─────────────────────────────────────────────────

/**
 * Check for "Ready for Seamless.AI" = "Yes" in Filtered sheet.
 * When found: fires webhook with company block data, marks cell "Sent".
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
      const block = detectCompanyBlock_(sheet, headers, triggerRow);

      const payload = {
        token: CONFIG.DOPOST_API_TOKEN,
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

      sendWebhook(CONFIG.SEAMLESS_WEBHOOK_URL, payload);

      setCellByHeader(sheet, triggerRow, 'Ready for Seamless.AI', 'Sent');

      logToAudit_(ss, 'SYSTEM', 'checkSeamlessTrigger', CONFIG.RENEWAL_SHEET,
        `Row ${triggerRow}`, 'WEBHOOK_SENT', `Seamless AI triggered for ${block.companyName}`);

    } catch (e) {
      Logger.log(`Seamless trigger failed for row ${triggerRow}: ${e.message}`);
      logToAudit_(ss, 'SYSTEM', 'checkSeamlessTrigger', CONFIG.RENEWAL_SHEET,
        `Row ${triggerRow}`, 'ERROR', e.message);

      setCellByHeader(sheet, triggerRow, 'Ready for Seamless.AI',
        'Error - ' + e.message.substring(0, 100) + ' (see Audit Log)');
    }
  }
}

/**
 * Detect the 5-row company block containing the given row.
 * Throws on invalid block size.
 */
function detectCompanyBlock_(sheet, headers, triggerRow) {
  const bnCol = headers['Bureau Number'];
  const nameCol = headers['Primary Name'];
  const domainCol = headers['Domain'];
  const streetCol = headers['Street Address'];
  const cityCol = headers['City'];
  const stateCol = headers['State'];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Sheet has no data rows');

  const numRows = lastRow - 1;
  const bnValues = bnCol ? sheet.getRange(2, bnCol, numRows, 1).getValues() : [];
  const nameValues = nameCol ? sheet.getRange(2, nameCol, numRows, 1).getValues() : [];

  const triggerIdx = triggerRow - 2;
  const triggerBN = bnValues.length > 0 ? String(bnValues[triggerIdx][0]) : '';
  const triggerName = nameValues.length > 0 ? String(nameValues[triggerIdx][0]) : '';

  if (!triggerBN && !triggerName) {
    throw new Error(`Row ${triggerRow} has no Bureau Number or Primary Name`);
  }

  // Walk backward to find block start
  let startIdx = triggerIdx;
  while (startIdx > 0) {
    const prevBN = bnValues.length > 0 ? String(bnValues[startIdx - 1][0]) : '';
    const prevName = nameValues.length > 0 ? String(nameValues[startIdx - 1][0]) : '';
    const sameCompany = (triggerBN && prevBN === triggerBN) ||
                        (!triggerBN && prevName === triggerName);
    if (!sameCompany) break;
    startIdx--;
  }

  // Walk forward to find block end
  let endIdx = triggerIdx;
  while (endIdx < numRows - 1) {
    const nextBN = bnValues.length > 0 ? String(bnValues[endIdx + 1][0]) : '';
    const nextName = nameValues.length > 0 ? String(nameValues[endIdx + 1][0]) : '';
    const sameCompany = (triggerBN && nextBN === triggerBN) ||
                        (!triggerBN && nextName === triggerName);
    if (!sameCompany) break;
    endIdx++;
  }

  const startRow = startIdx + 2;
  const endRow = endIdx + 2;

  const blockSize = endRow - startRow + 1;
  if (blockSize !== CONFIG.ROWS_PER_COMPANY) {
    const msg = `Block for row ${triggerRow} has ${blockSize} rows (expected ${CONFIG.ROWS_PER_COMPANY}). Aborting to prevent misaligned data.`;
    logToAudit_(sheet.getParent(), 'SYSTEM', 'detectCompanyBlock_', sheet.getName(), `Row ${triggerRow}`, 'BLOCK_SIZE_ERROR', msg);
    throw new Error(msg);
  }

  // Read company details from first row of block
  const details = {};
  for (const col of [domainCol, streetCol, cityCol, stateCol].filter(Boolean)) {
    details[col] = String(sheet.getRange(startRow, col).getValue());
  }

  return {
    startRow,
    endRow,
    companyName: triggerName,
    bureauNumber: triggerBN,
    domain: details[domainCol] || '',
    streetAddress: details[streetCol] || '',
    city: details[cityCol] || '',
    state: details[stateCol] || '',
  };
}

// ─── COPY NEW HERE → FILTERED ───────────────────────────────────────────────

/**
 * Copy qualifying rows from 0. NEW HERE to 1. Filtered Accounts & POCs.
 * Throws on errors (caller catches).
 */
function copyNewHereToRenewalByWcPremium_(ss, editedRow) {
  const srcSheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  const dstSheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!srcSheet || !dstSheet) throw new Error('Source or destination sheet not found');

  const srcHeaders = getHeaderMap(srcSheet);
  const dstHeaders = getHeaderMap(dstSheet);

  const manualOverride = getCellByHeader(srcSheet, editedRow, 'Manual Override to Add?');
  const finalOkay = getCellByHeader(srcSheet, editedRow, 'Final Okay to Add?');

  if (manualOverride !== 'Yes' && finalOkay !== 'Yes') return;

  // Check thresholds unless Manual Override
  if (manualOverride !== 'Yes') {
    const wcPrem = getCellByHeader(srcSheet, editedRow, 'WC Premium') || 0;
    const ees = getCellByHeader(srcSheet, editedRow, "EE's") || 0;

    if (wcPrem < CONFIG.WC_PREMIUM_MIN && ees < CONFIG.EE_COUNT_MIN) return;
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
        if (srcBN && dstBNs[i][0] === srcBN) {
          Logger.log(`Duplicate: Bureau Number ${srcBN} already in Filtered sheet`);
          return;
        }
        if (dstNames[i] && dstAddrs[i] &&
            dstNames[i][0] === srcName && dstAddrs[i][0] === srcAddr) {
          Logger.log(`Duplicate: ${srcName} + ${srcAddr} already in Filtered sheet`);
          return;
        }
      }
    }
  }

  // Copy headers from source to destination
  const dstNextRow = dstLastRow + 1;
  for (const header of CONFIG.COPY_HEADERS) {
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
 * Throws on failure.
 */
function reformatARenewalRows_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) throw new Error('Renewal sheet not found');

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
      reformatted.push(...rows);
    } else {
      const template = rows[0];
      for (let i = 0; i < CONFIG.ROWS_PER_COMPANY; i++) {
        reformatted.push([...template]);
      }
    }

    // Add blank separator row
    reformatted.push(new Array(numCols).fill(''));
  }

  // Backup before destructive rewrite
  const backupSheetName = '_Backup_Filtered';
  let backupSheet = ss.getSheetByName(backupSheetName);
  if (backupSheet) ss.deleteSheet(backupSheet);
  backupSheet = sheet.copyTo(ss).setName(backupSheetName);
  backupSheet.hideSheet();

  const props = PropertiesService.getScriptProperties();
  props.setProperty('reformatting_in_progress', 'true');

  try {
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, numCols).clearContent();
    }

    if (reformatted.length > 0) {
      sheet.getRange(2, 1, reformatted.length, numCols).setValues(reformatted);

      const dataRange = sheet.getRange(2, 1, reformatted.length, numCols);
      dataRange.setBackground(CONFIG.DEFAULT_BG);
      dataRange.setFontColor(CONFIG.DEFAULT_TEXT);
      dataRange.setFontFamily(CONFIG.DEFAULT_FONT);
      dataRange.setFontSize(CONFIG.DEFAULT_FONT_SIZE);
      dataRange.setFontWeight('normal');
    }
  } finally {
    props.setProperty('reformatting_in_progress', 'false');
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
  dataRange.setBackground(CONFIG.DEFAULT_BG);
  dataRange.setFontColor(CONFIG.DEFAULT_TEXT);
  dataRange.setFontFamily(CONFIG.DEFAULT_FONT);
  dataRange.setFontSize(CONFIG.DEFAULT_FONT_SIZE);
  dataRange.setFontWeight('normal');
}
