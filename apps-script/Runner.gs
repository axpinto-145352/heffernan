/**
 * Runner.gs — Main scheduled runner and step functions
 * =====================================================
 * All automation steps that run on the timer trigger.
 *
 * Error handling convention:
 *   - Step functions THROW on failure (runner catches and logs per step)
 *   - Runner logs errors per step but continues to next step
 */

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
 */
function fillNewHereFormulas_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const bnCol = headers['Bureau Number'];
  if (!bnCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const bnValues = sheet.getRange(2, bnCol, lastRow - 1, 1).getValues();

  const filterCol = headers['Filter'];
  const wcPremCol = headers['WC Premium'];
  const eeCol = headers["EE's"];

  for (let i = 0; i < bnValues.length; i++) {
    const bn = bnValues[i][0];
    if (!bn) continue;

    const row = i + 2;

    if (filterCol) {
      const filterVal = sheet.getRange(row, filterCol).getValue();
      if (!filterVal && filterVal !== 0) {
        const wcCell = sheet.getRange(row, wcPremCol).getA1Notation().replace(/\d+/, '');
        const eeCell = sheet.getRange(row, eeCol).getA1Notation().replace(/\d+/, '');
        sheet.getRange(row, filterCol).setFormula(
          `=OR(${wcCell}${row}>=${CONFIG.WC_PREMIUM_MIN}, ${eeCell}${row}>=${CONFIG.EE_COUNT_MIN})`
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

  const lastRow = Math.max(sheet.getLastRow(), 2);

  const wcRange = sheet.getRange(2, wcCol, lastRow - 1, 1);
  const eeRange = sheet.getRange(2, eeCol, lastRow - 1, 1);

  // Clear existing conditional format rules for these ranges, then re-add
  const rules = sheet.getConditionalFormatRules().filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r =>
      (r.getColumn() === wcCol || r.getColumn() === eeCol) && r.getRow() === 2
    );
  });

  if (CONFIG.WC_PREMIUM_MIN > 0) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(CONFIG.WC_PREMIUM_MIN)
        .setBackground(CONFIG.GREEN_HIGHLIGHT)
        .setRanges([wcRange])
        .build()
    );
  }

  if (CONFIG.EE_COUNT_MIN > 0) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(CONFIG.EE_COUNT_MIN)
        .setBackground(CONFIG.GREEN_HIGHLIGHT)
        .setRanges([eeRange])
        .build()
    );
  }

  sheet.setConditionalFormatRules(rules);
}

/**
 * Add Yes/No dropdowns to NEW HERE action columns.
 */
function applyNewHereDropdownsAndFormatting_(ss) {
  const sheet = ss.getSheetByName(CONFIG.NEW_HERE_SHEET);
  if (!sheet) return;

  const headers = getHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const yesNoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'], true)
    .build();

  const yesRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes'], true)
    .build();

  for (const h of CONFIG.YES_NO_DROPDOWN_HEADERS) {
    const col = headers[h];
    if (col) {
      sheet.getRange(2, col, lastRow - 1, 1).setDataValidation(yesNoRule);
    }
  }

  for (const h of CONFIG.YES_ONLY_DROPDOWN_HEADERS) {
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
  if (lastRow < 3) return;

  const headers = getHeaderMap(sheet);
  const sortCol = CONFIG.SORT_COLUMN === 'employees'
    ? headers["EE's"]
    : headers['WC Premium'];

  if (!sortCol) return;

  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  dataRange.sort({ column: sortCol, ascending: false });
}

/**
 * Fill Address Labels sheet formulas when Prospect column is populated.
 */
function fillAddressLabelsFormulas_(ss) {
  for (const sheetName of CONFIG.ADDRESS_LABELS_SHEETS) {
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

    const labelVals = labelCol ? sheet.getRange(2, labelCol, lastRow - 1, 1).getValues() : [];
    const labelNumVals = labelNumCol ? sheet.getRange(2, labelNumCol, lastRow - 1, 1).getValues() : [];

    const corrNameCol = headers['Corrected Name'];
    const addrCol = headers['Combined Address'];

    const labelUpdates = [];
    const labelNumUpdates = [];

    for (let i = 0; i < prospects.length; i++) {
      if (!prospects[i][0]) continue;

      const row = i + 2;

      if (labelCol && !labelVals[i][0] && corrNameCol && addrCol) {
        labelUpdates.push({
          row,
          formula: `=IF(${getColLetter(prospectCol)}${row}<>"", ${getColLetter(prospectCol)}${row}&CHAR(10)&${getColLetter(corrNameCol)}${row}&CHAR(10)&${getColLetter(addrCol)}${row}, "")`
        });
      }

      if (labelNumCol && !labelNumVals[i][0]) {
        labelNumUpdates.push({
          row,
          formula: `="{{Label"&ROW()-1&"}}"`
        });
      }
    }

    for (const u of labelUpdates) {
      sheet.getRange(u.row, labelCol).setFormula(u.formula);
    }
    for (const u of labelNumUpdates) {
      sheet.getRange(u.row, labelNumCol).setFormula(u.formula);
    }
  }
}

/**
 * Add "Yes" dropdown to Address Labels send column.
 */
function applyAddressLabelsColumnQDropdown_(ss) {
  for (const sheetName of CONFIG.ADDRESS_LABELS_SHEETS) {
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

  const allPocValues = pocNums.map(r => [...r]);
  let hasChanges = false;

  for (let i = 0; i < domains.length; i++) {
    if (domains[i][0] && !pocNums[i][0]) {
      allPocValues[i][0] = i + 2;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    sheet.getRange(2, pocNumCol, allPocValues.length, 1).setValues(allPocValues);
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

  const updatedPocRows = pocRows.map(r => [...r]);
  let hasChanges = false;
  for (let i = 0; i < Math.max(prospects.length, emails.length); i++) {
    const hasProspect = prospects[i] && prospects[i][0];
    const hasEmail = emails[i] && emails[i][0];

    if ((hasProspect || hasEmail) && !pocRows[i][0]) {
      updatedPocRows[i][0] = i + 2;
      hasChanges = true;
    }
  }
  if (hasChanges) {
    sheet.getRange(2, pocRowCol, updatedPocRows.length, 1).setValues(updatedPocRows);
  }
}

/**
 * Remove trailing blank rows from Filtered Accounts sheet.
 */
function deleteTrailingBlankRows_(ss) {
  const sheet = ss.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const maxRow = sheet.getMaxRows();

  if (maxRow > lastRow + CONFIG.TRAILING_BLANK_BUFFER) {
    sheet.deleteRows(lastRow + 2, maxRow - lastRow - CONFIG.TRAILING_BLANK_BUFFER);
  }
}
