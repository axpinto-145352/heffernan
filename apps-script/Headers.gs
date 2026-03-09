/**
 * Headers.gs — Header-based column lookup utilities
 * ===================================================
 * All column references are header-based (never hardcoded letters).
 */

// ─── HEADER COLUMN LOOKUP ───────────────────────────────────────────────────

const _headerCache = {};

/**
 * Returns a Map of header name -> 1-based column index for the given sheet.
 * Caches per sheet name for the script execution.
 */
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
 * Sanitizes string values to prevent formula injection.
 */
function setCellByHeader(sheet, row, headerName, value) {
  sheet.getRange(row, colByHeader(sheet, headerName)).setValue(sanitizeForSheet_(value));
}

/**
 * Sanitize a value before writing to Google Sheets.
 * Prevents formula injection by prefixing dangerous strings with a single quote.
 */
function sanitizeForSheet_(value) {
  if (typeof value !== 'string') return value;
  if (value.length === 0) return value;
  const firstChar = value.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
    return "'" + value;
  }
  return value;
}

/**
 * Convert 1-based column index to letter(s). E.g. 1→A, 27→AA.
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
