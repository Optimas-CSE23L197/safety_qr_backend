// =============================================================================
// Lightweight user agent parser
// Avoids a heavy dependency like ua-parser-js for a simple device string
// stored in ScanLog for anomaly analysis.
// =============================================================================

/**
 * @param {string} ua - raw User-Agent header value
 * @returns {string} simplified device descriptor e.g. "iPhone / Mobile Safari"
 */
export const parseUserAgent = (ua) => {
  if (!ua) return "Unknown";

  // OS detection
  let os = "Unknown";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  // Browser detection
  let browser = "Unknown";
  if (/CriOS/.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS/.test(ua)) browser = "Firefox iOS";
  else if (/EdgA/.test(ua)) browser = "Edge Android";
  else if (/Chrome/.test(ua)) browser = "Chrome";
  else if (/Safari/.test(ua)) browser = "Safari";
  else if (/Firefox/.test(ua)) browser = "Firefox";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Browser";

  // Type
  const type = /Mobile|Android|iPhone|iPad/.test(ua) ? "Mobile" : "Desktop";

  return `${os} / ${browser} / ${type}`;
};
