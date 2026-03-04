/**
 * card-back.template.js
 *
 * Renders the BACK face of the ResQID card.
 *
 * TWO VARIANTS:
 *
 * "preloaded" — Student info back:
 *   Photo · Name · Class/Section
 *   Blood group (large red — most critical)
 *   Allergy pill (amber warning)
 *   Medical conditions
 *   School footer
 *
 * "blank" — First-aid + registration back:
 *   How to use (3 steps)
 *   First aid: CPR, choking, bleeding
 *   Emergency helplines
 *   "SCAN TO REGISTER" CTA
 *
 * WHY TWO VARIANTS IN ONE FILE:
 * Single import, single function call, variant resolved by cardType param.
 * Caller (card.service.js) doesn't need to know which file to import.
 */

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * @param {object} params
 * @param {"preloaded"|"blank"} params.cardType
 * @param {object|null} params.student   - { first_name, last_name, class, section, photo_url }
 * @param {object|null} params.emergency - { blood_group, allergies, conditions }
 * @param {object}      params.school    - { name, phone }
 * @param {object|null} params.template  - CardTemplate from DB or null
 * @param {"horizontal"|"vertical"} params.orientation
 * @returns {string} Complete HTML document string
 */
export const renderCardBack = ({
  cardType = "blank",
  student = null,
  emergency = null,
  school,
  template = null,
  orientation = "horizontal",
}) => {
  const isH = orientation === "horizontal";
  const W = isH ? "323px" : "204px";
  const H = isH ? "204px" : "323px";
  const primary = template?.primary_color ?? "#E63946";
  const bg = template?.background_color ?? "#FFFFFF";
  const text = template?.text_color ?? "#1A1A2E";

  return cardType === "preloaded"
    ? preloadedBack({
        student,
        emergency,
        school,
        primary,
        bg,
        text,
        isH,
        W,
        H,
      })
    : blankBack({ school, primary, bg, text, isH, W, H });
};

// =============================================================================
// PRELOADED BACK
// =============================================================================

const preloadedBack = ({
  student,
  emergency,
  school,
  primary,
  bg,
  text,
  isH,
  W,
  H,
}) => {
  const name =
    `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim();
  const classSection = [student?.class, student?.section]
    .filter(Boolean)
    .join(" – ");
  const bloodGroup = emergency?.blood_group ?? null;
  const allergies = emergency?.allergies ?? null;
  const conditions = emergency?.conditions ?? null;
  const photoUrl = student?.photo_url ?? null;

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

  html, body { width: ${W}; height: ${H}; overflow: hidden; background: ${bg}; }

  .card {
    width: ${W}; height: ${H};
    background: ${bg};
    display: flex;
    flex-direction: column;
    padding: ${isH ? "7px 10px 10px" : "10px 8px 12px"};
    gap: ${isH ? "5px" : "6px"};
    position: relative;
    font-family: 'DM Sans', sans-serif;
  }

  /* Bottom accent bar (mirrored from front) */
  .card::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3.5px;
    background: ${primary};
  }

  .top-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  /* Photo */
  .photo, .photo-ph {
    width: ${isH ? "44px" : "38px"};
    height: ${isH ? "54px" : "46px"};
    border-radius: 3px;
    flex-shrink: 0;
    object-fit: cover;
    border: 1.5px solid rgba(0,0,0,0.09);
    background: #ececec;
  }

  .photo-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #bbb;
  }

  .name-block { flex: 1; min-width: 0; }

  .student-name {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "13px" : "11px"};
    color: ${text};
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .class-row {
    font-size: ${isH ? "7.5px" : "7px"};
    color: ${text};
    opacity: 0.5;
    font-weight: 500;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .divider {
    height: 1px;
    background: rgba(0,0,0,0.07);
  }

  /* Medical pills row */
  .medical {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .blood {
    background: ${primary};
    color: #fff;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "11px" : "10px"};
    padding: 2px 7px;
    border-radius: 3px;
    letter-spacing: 0.4px;
    white-space: nowrap;
  }

  .blood.unknown { background: #9e9e9e; }

  .allergy {
    background: #FFF3CD;
    color: #856404;
    font-size: ${isH ? "7px" : "6.5px"};
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #FFDA6A;
    max-width: ${isH ? "155px" : "115px"};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conditions {
    font-size: ${isH ? "6.5px" : "6px"};
    color: ${text};
    opacity: 0.55;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* School footer */
  .school-row {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 5px;
  }

  .school-name-text {
    font-size: ${isH ? "6.5px" : "6px"};
    color: ${text};
    opacity: 0.4;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    max-width: ${isH ? "165px" : "115px"};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .school-phone {
    font-size: ${isH ? "6.5px" : "6px"};
    color: ${text};
    opacity: 0.4;
    font-weight: 500;
  }
</style>
</head>
<body>
<div class="card">

  <div class="top-row">
    ${
      photoUrl
        ? `<img class="photo" src="${photoUrl}" alt="" />`
        : `<div class="photo-ph">👤</div>`
    }
    <div class="name-block">
      <div class="student-name">${escapeHtml(name || "Student")}</div>
      ${classSection ? `<div class="class-row">${escapeHtml(classSection)}</div>` : ""}
    </div>
  </div>

  <div class="divider"></div>

  <div class="medical">
    ${
      bloodGroup
        ? `<div class="blood">🩸 ${escapeHtml(bloodGroup)}</div>`
        : `<div class="blood unknown">🩸 N/A</div>`
    }
    ${allergies ? `<div class="allergy">⚠ ${escapeHtml(allergies)}</div>` : ""}
  </div>

  ${conditions ? `<div class="conditions">${escapeHtml(conditions)}</div>` : ""}

  <div class="school-row">
    <div class="school-name-text">${escapeHtml(school.name)}</div>
    ${school.phone ? `<div class="school-phone">${escapeHtml(school.phone)}</div>` : ""}
  </div>

</div>
</body>
</html>`;
};

// =============================================================================
// BLANK BACK — First aid + how to use
// =============================================================================

const blankBack = ({ school, primary, bg, text, isH, W, H }) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');

  *, *::before, *::after {
    margin: 0; padding: 0; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  html, body { width: ${W}; height: ${H}; overflow: hidden; background: ${bg}; }

  .card {
    width: ${W}; height: ${H};
    background: ${bg};
    display: flex;
    flex-direction: ${isH ? "row" : "column"};
    padding: ${isH ? "7px 9px" : "8px"};
    gap: 7px;
    position: relative;
    font-family: 'DM Sans', sans-serif;
  }

  .card::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3.5px;
    background: ${primary};
  }

  .col { display: flex; flex-direction: column; gap: ${isH ? "5px" : "4px"}; }
  .col-left  { flex: 0 0 42%; }
  .col-right { flex: 1; }

  .sep {
    ${
      isH
        ? `width: 1px; align-self: stretch; background: rgba(0,0,0,0.07);`
        : `height: 1px; background: rgba(0,0,0,0.07);`
    }
    flex-shrink: 0;
  }

  .sec-title {
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "7.5px" : "7px"};
    color: ${primary};
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 1px;
  }

  /* Steps */
  .step { display: flex; align-items: flex-start; gap: 4px; }

  .step-num {
    background: ${primary};
    color: #fff;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: 7px;
    width: 12px; height: 12px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 0.5px;
  }

  .step-text {
    font-size: ${isH ? "6.5px" : "6px"};
    color: ${text};
    opacity: 0.72;
    line-height: 1.35;
  }

  /* CTA */
  .cta {
    margin-top: auto;
    background: ${primary};
    color: #fff;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: ${isH ? "7.5px" : "7px"};
    padding: 3px 6px;
    border-radius: 3px;
    text-align: center;
    letter-spacing: 0.4px;
  }

  /* First aid items */
  .aid { display: flex; align-items: flex-start; gap: 3px; }
  .aid-icon { font-size: 8px; flex-shrink: 0; margin-top: 0.5px; }
  .aid-text {
    font-size: ${isH ? "6px" : "5.5px"};
    color: ${text};
    opacity: 0.68;
    line-height: 1.35;
  }
  .aid-text b { font-weight: 600; }
</style>
</head>
<body>
<div class="card">

  <div class="col col-left">
    <div class="sec-title">How to use</div>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Flip card, scan QR with any phone camera</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Emergency info + parent contact appears instantly</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Tap to call — number masked for child safety</div>
    </div>
    <div class="cta">SCAN TO REGISTER →</div>
  </div>

  <div class="sep"></div>

  <div class="col col-right">
    <div class="sec-title">First Aid</div>
    <div class="aid">
      <div class="aid-icon">🫀</div>
      <div class="aid-text"><b>CPR:</b> 30 compressions, 2 breaths. Repeat.</div>
    </div>
    <div class="aid">
      <div class="aid-icon">😮</div>
      <div class="aid-text"><b>Choking:</b> 5 back blows, 5 abdominal thrusts.</div>
    </div>
    <div class="aid">
      <div class="aid-icon">🩹</div>
      <div class="aid-text"><b>Bleeding:</b> Press firmly. Do not remove cloth.</div>
    </div>
    <div class="aid">
      <div class="aid-icon">📞</div>
      <div class="aid-text"><b>Emergency:</b> Ambulance 108 · Police 100 · Child 1098</div>
    </div>
  </div>

</div>
</body>
</html>`;
