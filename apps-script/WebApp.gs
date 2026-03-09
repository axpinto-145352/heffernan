/**
 * WebApp.gs — doPost/doGet endpoint and setup validation
 * ========================================================
 * Web App entry points for n8n and external callers.
 *
 * Error handling convention:
 *   - doPost: catches all errors, returns JSON with status + generic message
 *   - Logs full error details to Audit Log (never exposes internals to caller)
 */

// ─── DOPOST WEB APP ────────────────────────────────────────────────────────

/**
 * Web App endpoint — accepts POST requests from n8n.
 * Supported triggers: reformat_a_renewal_rows, clear_all_data_formatting,
 * main_scheduled_runner
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Authenticate: require matching API token (fail-closed)
    const token = body.token || '';
    const expectedToken = CONFIG.DOPOST_API_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        logToAudit_(ss, 'unknown', 'doPost', '', '', 'AUTH_FAILURE', 'Invalid or missing auth token');
      } catch (_) { /* best effort */ }
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Unauthorized' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

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
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      logToAudit_(ss, 'system', 'doPost', '', '', 'ERROR', err.message.substring(0, 500));
    } catch (_) { /* best effort */ }
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Internal error — check Audit Log for details' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── SETUP VALIDATION ──────────────────────────────────────────────────────

/**
 * Validates that all required ScriptProperties are set.
 */
function validateSetup_() {
  const props = PropertiesService.getScriptProperties();
  const required = [
    { key: 'employee_webhook_url', label: 'Employee Webhook URL' },
    { key: 'seamless_webhook_url', label: 'Seamless Webhook URL' },
    { key: 'dopost_api_token', label: 'doPost API Token' },
    { key: 'address_labels_doc_general', label: 'Address Labels Doc ID (General)' },
    { key: 'address_labels_doc_nonprofit', label: 'Address Labels Doc ID (Non-Profit)' },
    { key: 'address_labels_doc_url_general', label: 'Address Labels Doc Web App URL (General)' },
    { key: 'address_labels_doc_url_nonprofit', label: 'Address Labels Doc Web App URL (Non-Profit)' },
  ];

  const missing = required.filter(r => !props.getProperty(r.key));
  if (missing.length > 0) {
    const names = missing.map(m => '  • ' + m.label).join('\n');
    SpreadsheetApp.getUi().alert(
      '⚠ Setup Incomplete',
      'The following Script Properties are not set:\n\n' + names +
      '\n\nSet them via: Extensions → Apps Script → Project Settings → Script Properties',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}
