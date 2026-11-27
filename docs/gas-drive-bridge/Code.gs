/**
 * Vehicle App — Companion Google Apps Script Drive Bridge v2.0
 *
 * Compatible with BOTH:
 *   - Portal SSO-VR DriveStorageBridge v2.7.0 protocol (`GET ?action=verify`, `POST action='upload'`)
 *   - Vehicle App legacy protocol (`POST action='testFolder'`, `POST action='uploadFile'`)
 *
 * Deploy as Web App:
 *   - Execute as: Me (BMA Admin Google Account with Drive folder access)
 *   - Who has access: Anyone (CORS-friendly JSON endpoint)
 * Copy the `/exec` URL into Vehicle App `/settings` -> Tab "Google Drive Bridge".
 */

var BRIDGE_VERSION = '2.0.0';
var ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
var MAX_BYTES = 15 * 1024 * 1024;

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || '').toLowerCase();
    var mode = String(params.mode || '').toLowerCase();

    if (action === 'verify' || action === 'ping') {
      if (mode === 'ping' || (!params.folderId && action === 'ping')) {
        return jsonOut_({
          ok: true,
          success: true,
          service: 'vehicle-app-drive-bridge',
          version: BRIDGE_VERSION,
          message: 'เชื่อมต่อ Google Apps Script Web App สำเร็จ (v' + BRIDGE_VERSION + ')',
        });
      }
      if (params.folderId) {
        return jsonOut_(handleTestFolder_({ folderId: params.folderId }));
      }
      return jsonOut_({
        ok: true,
        success: true,
        service: 'vehicle-app-drive-bridge',
        version: BRIDGE_VERSION,
      });
    }

    return jsonOut_({
      ok: true,
      success: true,
      service: 'vehicle-app-drive-bridge',
      version: BRIDGE_VERSION,
      message: 'Vehicle App Drive Bridge is running',
    });
  } catch (err) {
    return jsonOut_({
      ok: false,
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var req = JSON.parse(raw);
    var action = String(req.action || '');

    if (action === 'ping' || action === 'verify') {
      if (req.folderId) return jsonOut_(handleTestFolder_(req));
      return jsonOut_({
        ok: true,
        success: true,
        version: BRIDGE_VERSION,
        message: 'เชื่อมต่อ Google Apps Script Web App สำเร็จ (v' + BRIDGE_VERSION + ')',
      });
    }
    if (action === 'testFolder') {
      return jsonOut_(handleTestFolder_(req));
    }
    if (action === 'uploadFile' || action === 'upload') {
      return jsonOut_(handleUploadFile_(req));
    }
    return jsonOut_({ ok: false, success: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonOut_({
      ok: false,
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}

function handleTestFolder_(req) {
  var folderId = String(req.folderId || '').trim();
  if (!folderId) throw new Error('Missing folderId');
  var folder = DriveApp.getFolderById(folderId);
  return {
    ok: true,
    success: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    message: 'เชื่อมต่อโฟลเดอร์ "' + folder.getName() + '" สำเร็จ',
  };
}

function trySetFileReadable_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return;
  } catch (e1) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) {
      // Keep inherited folder permissions if domain policy blocks sharing changes
    }
  }
}

function handleUploadFile_(req) {
  var rootFolderId = String(req.rootFolderId || req.folderId || '').trim();
  var existingFolderId = String(req.existingFolderId || '').trim();
  var mimeType = String(req.mimeType || '').toLowerCase();
  var base64Data = String(req.base64Data || '');
  if (!base64Data && req.base64DataUrl) {
    var dataUrl = String(req.base64DataUrl);
    base64Data = dataUrl.indexOf(',') !== -1 ? dataUrl.split(',').pop() : dataUrl;
  }

  var fileName = String(req.fileName || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
  var vehicleCode = String(req.vehicleCode || 'VEHICLE').replace(/[\\/:*?"<>|]/g, '_');
  var vehicleLabel = String(req.vehicleLabel || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  var subFolderName = String(req.subFolderName || '').replace(/[\\/:*?"<>|]/g, '_').trim();

  if (ALLOWED_MIMES.indexOf(mimeType) === -1) {
    throw new Error('รองรับเฉพาะไฟล์ PDF, JPG, PNG เท่านั้น');
  }
  if (!base64Data) {
    throw new Error('ไม่พบข้อมูลไฟล์ Base64');
  }

  var bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_BYTES) {
    throw new Error('ขนาดไฟล์เกินกำหนดสูงสุดของ Drive Bridge (15 MB)');
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
    var subName = subFolderName || (vehicleLabel ? vehicleCode + ' - ' + vehicleLabel : vehicleCode);
    var existingIter = root.getFoldersByName(subName);
    targetFolder = existingIter.hasNext() ? existingIter.next() : root.createFolder(subName);
  }

  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  var finalName = stamp + '-' + fileName;
  var blob = Utilities.newBlob(bytes, mimeType, finalName);
  var created = targetFolder.createFile(blob);
  trySetFileReadable_(created);

  return {
    ok: true,
    success: true,
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
