/**
 * Infrastructure.gs — Lock, gap guard, webhook dispatch, audit logging
 * =====================================================================
 * Shared infrastructure used across all modules.
 *
 * Error handling convention:
 *   - Infrastructure functions THROW on failure (callers decide how to handle)
 *   - acquireLock returns null on failure (non-blocking by design)
 *   - logToAudit_ never throws (best-effort logging)
 */

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
 * Throws after all retries exhausted.
 */
function sendWebhook(url, payload) {
  if (!url) throw new Error('Webhook URL is empty — check Script Properties');

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

// ─── AUDIT LOGGING ─────────────────────────────────────────────────────────

/**
 * Log an entry to the Audit Log sheet. Never throws — best-effort.
 */
function logToAudit_(ss, user, source, sheetName, cellRef, changeType, details) {
  try {
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

    // Cap at configured max rows
    const rowCount = auditSheet.getLastRow();
    if (rowCount > CONFIG.AUDIT_LOG_MAX_ROWS) {
      auditSheet.deleteRows(CONFIG.AUDIT_LOG_MAX_ROWS + 1, rowCount - CONFIG.AUDIT_LOG_MAX_ROWS);
    }
  } catch (e) {
    Logger.log('Audit log write failed: ' + e.message);
  }
}
