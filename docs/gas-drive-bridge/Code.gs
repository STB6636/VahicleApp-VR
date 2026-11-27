/**
 * Vehicle App — Companion Google Apps Script Drive Bridge (Phase 3)
 *
 * Deploy as Web App:
 *   - Execute as: Me (BMA Admin Google Account with Drive folder access)
 *   - Who has access: Anyone (CORS-friendly text/plain JSON endpoint)
 * Copy the `/exec` URL into `vehicleapp.app_settings` -> `gas_drive_bridge_url`.
 */

var ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
var MAX_BYTES = 15 * 1024 * 1024;

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var req = JSON.parse(raw);
    var action = String(req.action || '');

    if (action === 'testFolder') {
      return jsonOut_(handleTestFolder_(req));
    }
    if (action === 'uploadFile') {
      return jsonOut_(handleUploadFile_(req));
    }
    return jsonOut_({ ok: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function handleTestFolder_(req) {
  var folderId = String(req.folderId || '').trim();
  if (!folderId) throw new Error('Missing folderId');
  var folder = DriveApp.getFolderById(folderId);
  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    message: 'เชื่อมต่อโฟลเดอร์ "' + folder.getName() + '" สำเร็จ',
  };
}

function handleUploadFile_(req) {
  var rootFolderId = String(req.rootFolderId || '').trim();
  var existingFolderId = String(req.existingFolderId || '').trim();
  var mimeType = String(req.mimeType || '').toLowerCase();
  var base64Data = String(req.base64Data || '');
  var fileName = String(req.fileName || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
  var vehicleCode = String(req.vehicleCode || 'VEHICLE').replace(/[\\/:*?"<>|]/g, '_');
  var vehicleLabel = String(req.vehicleLabel || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);

  if (ALLOWED_MIMES.indexOf(mimeType) === -1) {
    throw new Error('รองรับเฉพาะไฟล์ PDF, JPG, PNG เท่านั้น');
  }
  if (!base64Data) {
    throw new Error('ไม่พบข้อมูลไฟล์ Base64');
  }

  var bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_BYTES) {
    throw new Error('ขนาดไฟล์เกินกำหนดสูงสุดของ Drive Bridge');
  }

  var targetFolder = null;
  if (existingFolderId) {
    try {
      targetFolder = DriveApp.getFolderById(existingFolderId);
    } catch (e) {
      targetFolder = null;
    }
  }
  if (!targetFolder) {
    if (!rootFolderId) throw new Error('Missing rootFolderId');
    var root = DriveApp.getFolderById(rootFolderId);
    var subName = vehicleLabel ? vehicleCode + ' - ' + vehicleLabel : vehicleCode;
    var existingIter = root.getFoldersByName(subName);
    targetFolder = existingIter.hasNext() ? existingIter.next() : root.createFolder(subName);
  }

  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  var finalName = stamp + '-' + fileName;
  var blob = Utilities.newBlob(bytes, mimeType, finalName);
  var created = targetFolder.createFile(blob);

  return {
    ok: true,
    url: created.getUrl(),
    folderId: targetFolder.getId(),
    fileName: finalName,
  };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
