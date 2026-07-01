const SHEET_NAME = "data";
const PASSWORD = "CHANGE_THIS_PASSWORD";

function doPost(e) {
  try {
    const password = (e.parameter.password || "").trim();
    if (password !== PASSWORD) {
      return json({ ok: false, error: "Неправильний пароль" });
    }

    const action = e.parameter.action || "load";
    const payload = JSON.parse(e.parameter.payload || "{}");

    if (action === "save") {
      saveData(payload);
      return json({ ok: true });
    }

    return json({ ok: true, data: loadData() });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function doGet(e) {
  const callback = e.parameter.callback || "";
  const password = (e.parameter.password || "").trim();
  const action = e.parameter.action || "";

  if (callback && action === "load") {
    if (password !== PASSWORD) {
      return javascript(callback, { ok: false, error: "Неправильний пароль" });
    }
    return javascript(callback, { ok: true, data: loadData() });
  }

  return json({ ok: true, message: "Сховище для обліку мандрівок працює" });
}

function loadData() {
  const sheet = getSheet();
  const value = sheet.getRange("A1").getValue();
  if (!value) {
    return { trips: [], activeTripId: null };
  }
  return JSON.parse(value);
}

function saveData(data) {
  const sheet = getSheet();
  sheet.getRange("A1").setValue(JSON.stringify(data));
  sheet.getRange("A2").setValue(new Date());
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function javascript(callback, data) {
  const safeCallback = callback.replace(/[^\w.$]/g, "");
  return ContentService
    .createTextOutput(safeCallback + "(" + JSON.stringify(data) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
