/**
 * top-cover.template.js
 *
 * Renders the SLIDING TOP COVER of the ResQID card.
 * Sits on top of the card front, hiding the QR code from casual view.
 * Same design for every card in a school batch — printed once, not per student.
 *
 * Contains:
 *   School logo + name
 *   "SOS Emergency Card" heading
 *   National helplines: Police 100 · Ambulance 108 · Child Help 1098 · School phone
 *   Slide hint arrow
 *   Deterrence text (legal warning)
 *
 * WHY ALWAYS DARK BACKGROUND:
 * The cover must be visually distinct from the card front.
 * When someone picks up the card, the dark cover immediately signals
 * "this is a safety item" — different from a school ID, different from an access card.
 * It's a deliberate design choice, not a template option.
 */

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * @param {object} params
 * @param {object}      params.school     - { name, logo_url, phone }
 * @param {object|null} params.template   - CardTemplate from DB or null
 * @param {"horizontal"|"vertical"} params.orientation
 * @returns {string} Complete HTML document string
 */
export const renderTopCover = ({
  school,
  template = null,
  orientation = "horizontal",
}) => {
  const isH = orientation === "horizontal";
  const W = isH ? "323px" : "204px";
  const H = isH ? "204px" : "323px";
  const primary = template?.primary_color ?? "#E63946";
  const accent = "#F4D03F"; // warning yellow — used for helpline numbers

  // Cover background is ALWAYS dark — intentional (see WHY above)
  const coverBg = "#1A1A2E";

  const schoolInitial = (school.name ?? "S").charAt(0).toUpperCase();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');

  *, *::before, *::after {
    margin: 0; padding: 0; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  html, body {
    width: ${W}; height: ${H};
    overflow: hidden;
    background: ${coverBg};
  }

  .cover {
    width: ${W}; height: ${H};
    background: ${coverBg};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: ${isH ? "7px 10px 6px" : "10px 8px 7px"};
    position: relative;
    font-family: 'DM Sans', sans-serif;
    color: #fff;
  }

  /* Top accent */
  .cover::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: ${primary};
  }

  /* School header row */
  .school-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .logo, .logo-ph {
    width: ${isH ? "22px" : "20px"};
    height: ${isH ? "22px" : "20px"};
    border-radius: 3px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .logo { background: #fff; padding: 2px; }

  .logo-ph {
    background: ${primary};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: 11px;
    color: #fff;
  }

  .school-info { flex: 1; min-width: 0; }

  .issued-by {
    font-size: ${isH ? "5.5px" : "5px"};
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .school-name {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "9px" : "8px"};
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  /* SOS badge */
  .sos-block { text-align: center; }

  .sos-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: ${primary};
    color: #fff;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "13px" : "11px"};
    padding: ${isH ? "3px 10px" : "3px 8px"};
    border-radius: 3px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  .sos-sub {
    font-size: ${isH ? "6.5px" : "6px"};
    color: rgba(255,255,255,0.45);
    margin-top: 3px;
    letter-spacing: 0.2px;
  }

  /* Helplines */
  .helplines {
    width: 100%;
    display: flex;
    gap: 4px;
  }

  .helpline {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: ${isH ? "3px 2px" : "4px 2px"};
    gap: 1px;
  }

  .hl-number {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "10px" : "9px"};
    color: ${accent};
    line-height: 1;
  }

  .hl-number.sm { font-size: ${isH ? "7px" : "6.5px"}; }

  .hl-label {
    font-size: ${isH ? "5px" : "4.5px"};
    color: rgba(255,255,255,0.45);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 500;
  }

  /* Bottom row */
  .bottom-row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 4px;
  }

  .slide-hint {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: ${isH ? "6.5px" : "6px"};
    color: rgba(255,255,255,0.45);
    font-weight: 500;
  }

  .arrow { color: ${accent}; font-size: 10px; }

  .deterrence {
    font-size: ${isH ? "5px" : "4.5px"};
    color: rgba(255,255,255,0.22);
    text-align: right;
    max-width: ${isH ? "130px" : "100px"};
    line-height: 1.4;
    font-style: italic;
  }
</style>
</head>
<body>
<div class="cover">

  <!-- School header -->
  <div class="school-row">
    ${
      school.logo_url
        ? `<img class="logo" src="${school.logo_url}" alt="" />`
        : `<div class="logo-ph">${escapeHtml(schoolInitial)}</div>`
    }
    <div class="school-info">
      <div class="issued-by">Issued by</div>
      <div class="school-name">${escapeHtml(school.name)}</div>
    </div>
  </div>

  <!-- SOS -->
  <div class="sos-block">
    <div class="sos-badge">🆘 SOS Emergency Card</div>
    <div class="sos-sub">Slide cover up to reveal QR code</div>
  </div>

  <!-- Helplines -->
  <div class="helplines">
    <div class="helpline">
      <div class="hl-number">100</div>
      <div class="hl-label">Police</div>
    </div>
    <div class="helpline">
      <div class="hl-number">108</div>
      <div class="hl-label">Ambulance</div>
    </div>
    <div class="helpline">
      <div class="hl-number">1098</div>
      <div class="hl-label">Child Help</div>
    </div>
    ${
      school.phone
        ? `
    <div class="helpline">
      <div class="hl-number ${school.phone.length > 8 ? "sm" : ""}">${escapeHtml(school.phone)}</div>
      <div class="hl-label">School</div>
    </div>`
        : ""
    }
  </div>

  <!-- Bottom -->
  <div class="bottom-row">
    <div class="slide-hint">
      <span class="arrow">↑</span> Slide up to scan
    </div>
    <div class="deterrence">
      Scanning is monitored and logged. Misuse is a criminal offence.
    </div>
  </div>

</div>
</body>
</html>`;
};
