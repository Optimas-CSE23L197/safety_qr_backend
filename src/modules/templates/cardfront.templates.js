/**
 * card-front.template.js
 *
 * Renders the FRONT face of the ResQID card.
 * Identical for ALL cards — blank and preloaded.
 *
 * Contains: ResQID brand bar · QR code · card number · "Emergency ID" badge
 *
 * WHY INLINE CSS (not external stylesheet):
 * Puppeteer renders HTML in isolation. External stylesheets require network
 * or file system access inside the browser context. Inline CSS is guaranteed
 * to work regardless of environment — local, Docker, Lambda.
 *
 * WHY GOOGLE FONTS via @import:
 * Puppeteer has network access during render. Fonts load reliably.
 * If you go offline/serverless, replace with base64 font data URLs.
 *
 * CR80 card dimensions at 96dpi:
 *   Horizontal: 85.6mm × 54mm  (323px × 204px)
 *   Vertical:   54mm × 85.6mm  (204px × 323px)
 */

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * @param {object} params
 * @param {string} params.cardNumber  - e.g. "RESQID-A4F9B2"
 * @param {string} params.qrDataUrl   - base64 PNG data URL from generateQRDataUrl()
 * @param {object} params.school      - { name }
 * @param {object} [params.template]  - CardTemplate row from DB or null
 * @param {"horizontal"|"vertical"} params.orientation
 * @returns {string} Complete HTML document string
 */
export const renderCardFront = ({
  cardNumber,
  qrDataUrl,
  school,
  template = null,
  orientation = "horizontal",
}) => {
  const isH = orientation === "horizontal";
  const W = isH ? "323px" : "204px";
  const H = isH ? "204px" : "323px";

  // Branding — fall back to ResQID defaults if no template
  const primary = template?.primary_color ?? "#E63946";
  const bg = template?.background_color ?? "#FFFFFF";
  const text = template?.text_color ?? "#1A1A2E";

  const qrSize = isH ? "108px" : "126px";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=DM+Sans:wght@400;500&display=swap');

  *, *::before, *::after {
    margin: 0; padding: 0;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html, body {
    width: ${W}; height: ${H};
    overflow: hidden;
    background: ${bg};
  }

  .card {
    width: ${W}; height: ${H};
    background: ${bg};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: ${isH ? "8px 10px 7px" : "10px 8px 8px"};
    position: relative;
    font-family: 'DM Sans', sans-serif;
  }

  /* Top accent bar */
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3.5px;
    background: ${primary};
  }

  .header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "13px" : "11px"};
    color: ${primary};
    letter-spacing: 0.4px;
    line-height: 1;
  }

  .brand em {
    color: ${text};
    font-style: normal;
  }

  .school-name {
    font-size: ${isH ? "6.5px" : "6px"};
    color: ${text};
    opacity: 0.5;
    font-weight: 500;
    max-width: ${isH ? "125px" : "95px"};
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .qr-box {
    width: ${qrSize};
    height: ${qrSize};
    padding: 4px;
    background: #fff;
    border: 1.5px solid rgba(0,0,0,0.09);
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  }

  .qr-box img {
    width: 100%; height: 100%;
    display: block;
  }

  .scan-hint {
    font-size: ${isH ? "6px" : "5.5px"};
    color: ${text};
    opacity: 0.4;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-number {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 600;
    font-size: ${isH ? "9px" : "8px"};
    color: ${text};
    letter-spacing: 1.2px;
    opacity: 0.65;
  }

  .badge {
    background: ${primary};
    color: #fff;
    font-size: ${isH ? "5.5px" : "5px"};
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 2px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="card">

  <div class="header">
    <div class="brand">RESQ<em>ID</em></div>
    <div class="school-name">${escapeHtml(school.name)}</div>
  </div>

  <div class="qr-section">
    <div class="qr-box">
      <img src="${qrDataUrl}" alt="QR Code" />
    </div>
    <div class="scan-hint">Scan in emergency</div>
  </div>

  <div class="footer">
    <div class="card-number">${escapeHtml(cardNumber)}</div>
    <div class="badge">Emergency ID</div>
  </div>

</div>
</body>
</html>`;
};
