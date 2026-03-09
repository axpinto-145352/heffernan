/**
 * Address Labels Google Doc — Apps Script
 * ========================================
 * Container-bound script attached to each Address Labels Google Doc
 * (General and Non-Profit). Provides:
 *   - Bold first line (prospect name) formatting
 *   - Reset to {{LabelN}} template placeholders
 *   - Menu for manual access to both operations
 *   - doPost endpoint for programmatic access (e.g., from Sheets script)
 *
 * Table layout: 3 label columns (0, 2, 4) + 2 spacer columns (1, 3)
 * Labels use {{Label1}} through {{Label402}} placeholders.
 *
 * SETUP:
 *   1. Open the Google Doc → Extensions → Apps Script
 *   2. Replace the script with this file
 *   3. Set Script Properties:
 *      - dopost_api_token → same value as the Sheets script's dopost_api_token
 *   4. Deploy as Web App: Execute as "Me", Access "Anyone"
 */

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const LABEL_COLS = [0, 2, 4];      // 0-based column indices for label cells
const SPACER_COLS = [1, 3];         // 0-based column indices for spacer cells
const NUM_LABELS = 402;             // Total number of label placeholders
const NAME_FONT = 'Arial Black';   // Font for prospect name (first line)
const ADDRESS_FONT = 'Comfortaa';  // Font for address lines

// ─── BOLD FIRST LINE ────────────────────────────────────────────────────────

/**
 * Format all label cells: first line = Arial Black (bold name),
 * remaining lines = Comfortaa (address).
 */
function boldLowercaseText() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  let existingTable = null;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TABLE) {
      existingTable = child.asTable();
      break;
    }
  }

  if (!existingTable) {
    Logger.log('No table found');
    return { cellsProcessed: 0, error: 'No table found' };
  }

  const numRows = existingTable.getNumRows();
  let cellsProcessed = 0;

  Logger.log('=== BOLD FIRST LINE ===');

  for (let row = 0; row < numRows; row++) {
    const tableRow = existingTable.getRow(row);
    const numCols = tableRow.getNumCells();
    for (let colIdx of LABEL_COLS) {
      if (colIdx >= numCols) continue;

      try {
        const cell = tableRow.getCell(colIdx);
        const fullText = cell.getText();

        // Skip empty cells or {{Label}} patterns
        if (!fullText || fullText.trim() === '') continue;
        if (/\{\{Label\d+\}\}/.test(fullText)) continue;

        // Get all non-empty lines
        const lines = fullText.split('\n').filter(line => line.trim().length > 0);

        if (lines.length === 0) continue;

        Logger.log('R' + row + 'C' + colIdx + ': name="' + lines[0] + '"');

        // Clear the cell
        cell.clear();

        // Add each line as separate paragraph
        for (let i = 0; i < lines.length; i++) {
          const para = cell.appendParagraph(lines[i]);
          para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

          const text = para.editAsText();
          text.setForegroundColor('#000000');

          if (i === 0) {
            text.setFontFamily(NAME_FONT);
          } else {
            text.setFontFamily(ADDRESS_FONT);
          }
        }

        cellsProcessed++;

      } catch (err) {
        Logger.log('Error R' + row + 'C' + colIdx + ': ' + err.toString());
      }
    }
  }

  Logger.log('=== COMPLETE: ' + cellsProcessed + ' cells ===');
  return { cellsProcessed: cellsProcessed };
}

// ─── RESET TO TEMPLATE ──────────────────────────────────────────────────────

/**
 * Reset all label cells back to {{Label1}} through {{Label402}} placeholders.
 * Preserves the table structure (3 label cols + 2 spacer cols per row).
 */
function resetToTemplate() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  let existingTable = null;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TABLE) {
      existingTable = child.asTable();
      break;
    }
  }

  if (!existingTable) {
    Logger.log('No table found');
    return { labelCount: 0, error: 'No table found' };
  }

  const numRows = existingTable.getNumRows();
  let labelCounter = 1;

  for (let row = 0; row < numRows; row++) {
    const tableRow = existingTable.getRow(row);
    const numCols = tableRow.getNumCells();

    for (let colIdx of LABEL_COLS) {
      if (colIdx < numCols) {
        const cell = tableRow.getCell(colIdx);
        cell.clear();

        if (labelCounter <= NUM_LABELS) {
          const para = cell.appendParagraph('{{Label' + labelCounter + '}}');
          para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          labelCounter++;
        }
      }
    }

    for (let colIdx of SPACER_COLS) {
      if (colIdx < numCols) {
        const cell = tableRow.getCell(colIdx);
        cell.clear();
      }
    }
  }

  Logger.log('Reset complete: ' + (labelCounter - 1) + ' labels');
  return { labelCount: labelCounter - 1 };
}

// ─── CUSTOM MENU ────────────────────────────────────────────────────────────

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Label Tools')
    .addItem('Reset to Template', 'resetToTemplate')
    .addItem('Bold First Line', 'boldLowercaseText')
    .addToUi();
}

// ─── WEB APP ENDPOINT ───────────────────────────────────────────────────────

/**
 * doPost endpoint — accepts POST requests for programmatic label operations.
 * Supported triggers: reset_to_template, bold_first_line / bold_lowercase
 *
 * Authentication: requires matching dopost_api_token in Script Properties.
 */
function doPost(e) {
  try {
    const bodyText = e?.postData?.contents || '{}';
    const body = JSON.parse(bodyText);

    // Authenticate: require matching API token (fail-closed)
    const token = body.token || '';
    const expectedToken = PropertiesService.getScriptProperties().getProperty('dopost_api_token') || '';
    if (!expectedToken || token !== expectedToken) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const trigger = String(body.trigger || '').trim();

    Logger.log('doPost received trigger: "' + trigger + '"');

    if (trigger === 'reset_to_template') {
      const result = resetToTemplate();
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          action: 'reset_to_template',
          result: result
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (trigger === 'bold_lowercase' || trigger === 'bold_first_line') {
      const result = boldLowercaseText();
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          action: 'bold_first_line',
          result: result
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Unknown trigger: ' + trigger,
        availableTriggers: ['reset_to_template', 'bold_first_line', 'bold_lowercase']
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Error in doPost: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Internal error'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ready',
      message: 'Address Labels Doc API',
      availableTriggers: ['bold_first_line', 'bold_lowercase', 'reset_to_template']
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
