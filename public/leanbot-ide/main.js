// main.js

// ============================================================
// VERSION
// ============================================================

console.log(`Version = 2026.05.12 17:56`);

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UncontrolledTreeEnvironment, Tree, StaticTreeDataProvider } from 'react-complex-tree';
// import 'react-complex-tree/lib/style-modern.css';
// CSS moved to index.html
import { LeanbotSerial } from "./LeanbotSerial.js?v=3";
import { InoEditor } from "./InoEditor.js";
import { BlocklyEditor } from "./BlocklyEditor.js";
import { LeanbotCompiler } from "./LeanbotCompiler.js";
import { IdeConfig } from "./Config.js";
import { LeanFs } from "./LeanFs.js";
import { LogIdeEvent } from "./LogIdeEvent.js";
import { importExport } from './importExport.js';
import * as ideUI from "./ideUI.js";
import { UAParser } from 'my-ua-parser';
import { withLockedControls, getCompileSuccessNotice, getUploadNotice } from './ideFlowPolicy.js?v=20260930-2';

// ============================================================
//  Mount Leanbot File System
// ============================================================

const leanfs = new LeanFs();
await leanfs.mount();

// ============================================================
// CONFIG LOADING
// ============================================================

const ideConfig = new IdeConfig(leanfs);
const IDEConfig = await ideConfig.getIDEConfig();
// console.log(IDEConfig);

LeanFs.setConfig(IDEConfig.LeanFs);

ideUI.initUI(IDEConfig.IDE);
console.log('IDEConfig: ', IDEConfig);
// ============================================================
// AUTHENTICATION (REMOVED)
// ============================================================

// Parse user agent and format for logging
let formattedUA = "";
try {
  const parser = new UAParser();
  const result = parser.getResult();
  // Format: {browser}, {os}, {device}
  // Example: Chrome 147.0.0.0, Android 10, K mobile
  const browserStr = result.browser.name ? `${result.browser.name}${result.browser.version ? ' ' + result.browser.version : ''}` : "";
  const osStr = result.os.name ? `${result.os.name}${result.os.version ? ' ' + result.os.version : ''}` : "";
  const deviceStr = result.device.name || "";
  formattedUA = `${browserStr}, ${osStr}, ${deviceStr}`;
} catch (err) {
  console.error("UAParser error:", err);
  formattedUA = "";
}

LogIdeEvent({
  objectpk: "ide_load",
  thongtin: navigator.userAgent,
  noidung: formattedUA,
  server_: "",
  t_phanhoi: 0,
});

// URL PARAMETERS + GLOBAL CONFIG
console.log(`SERVER = ${IDEConfig.LeanbotCompiler.Server}`);

// ============================================================
// save config then INIT LEANBOT
// ============================================================

LeanbotSerial.setConfig(IDEConfig.LeanbotSerial);
LeanbotCompiler.setConfig(IDEConfig.LeanbotCompiler);

const leanbot = new LeanbotSerial();

// Check overall Web Serial availability (API support, secure context, and adapter)
await leanbot.checkWebSerialAvailability();

function checkSerialCriticalError() {

  if (leanbot.SerialApiNotSupported) {
    ideUI.uiShowAlertModal('Serial API not supported. Use Chrome or Edge'); // no need to block
    return true;
  }

  if (leanbot.SecureContextMissing) {
    ideUI.uiShowAlertModal('Connection requires HTTPS or localhost'); // no need to block
    return true;
  }

  return false;
}

const bleError = checkSerialCriticalError();
if (bleError) {
  setTimeout(() => {
    btnUpload2.classList.add('error');
    btnConnect.classList.add('error');
    btnReconnect.classList.add('error');
    btnMultiUploads.classList.add('error');
  }, 0);
}

// ============================================================
// EDITOR
// ============================================================

class GlobalEditor {
  onPointerdownHandler() {
    // console.log("onPointerdownHandler");
    if (!autoHideCheckbox.checked) return;

    // nếu serial đang mở thì mới hide
    if (!serialSection.classList.contains('is-hidden')) {
      uiHideSerialTab();
    }
  }

  setContentReadOnly(contentString) { // open in monaco as read-only
    // console.log("setContentReadOnly:", contentString);
    this.#uiShowMonacoEditor();
    inoEditor.setContentReadOnly(contentString);  // open in monaco only
  }

  getContent() {
    const fileId = window.currentFileId;
    // console.log("getContent");
    // console.log(fileId, leanfs.getName(fileId), leanfs.getItemType(fileId));

    if (leanfs.isBlocklyFile(fileId)) {
      return blocklyEditor.getContent();
    } else {
      return inoEditor.getContent();
    }
  }

  getCppCode() {
    const fileId = window.currentFileId;
    // console.log("getCppCode");
    // console.log(fileId, leanfs.getName(fileId), leanfs.getItemType(fileId));

    if (leanfs.isBlocklyFile(fileId)) {
      return blocklyEditor.getCppCode();
    } else {
      return inoEditor.getCppCode();
    }
  };

  async openItem(itemUUID) {
    if (!leanfs.isExist(itemUUID)) return;

    if (!inoEditor.__isMonacoReady || !inoEditor) {
      window.__pendingOpenFileId = itemUUID;
      return;
    }

    uiEnableCompileUpload(false); // disable upload and compile button by default

    const itemType = leanfs.getItemType(itemUUID);

    switch (itemType) {
      case LeanFs.leanfs_TYPE.INO:
        return this.openIno(itemUUID);

      case LeanFs.leanfs_TYPE.BLOCKLY:
        return this.openBlockly(itemUUID);

      case LeanFs.leanfs_TYPE.DIR:
        return this.openFolder(itemUUID);

      default:
        return this.openOther(itemUUID);
    }
  }

  async openIno(fileId) {
    const content = await leanfs.readFile(fileId) ?? "";
    await changeCurrentFileId(fileId);

    this.#openInMonaco(content);
    const isContentEmpty = !content || content.trim() === "";
    uiEnableCompileUpload(!isContentEmpty); // enable compile + upload (only if content not empty)
  }

  async openBlockly(fileId) {
    const content = await leanfs.readFile(fileId) ?? "";
    await changeCurrentFileId(fileId);

    await this.#openInBlockly(content);
    uiEnableCompileUpload(true); // enable compile + upload
  }

  async openFolder(folderID) {
    const folderContent = (folderID === leanfs.getRoot()) ? "\\\\" : leanfs.readDir(folderID);
    await changeCurrentFileId(folderID);

    this.setContentReadOnly(folderContent);
  }

  async openOther(fileId) {
    const content = await leanfs.readFile(fileId) ?? "";
    await changeCurrentFileId(fileId);

    this.#openInMonaco(content);
  }

  /* ================= INTERNAL ================= */

  #uiShowMonacoEditor() {
    document.getElementById("codeEditor").style.display = "block";  // show Monaco
    document.getElementById("blocklyEditor").style.display = "none";   // hide Blockly
  }

  #uiShowBlocklyEditor() {
    document.getElementById("codeEditor").style.display = "none";  // hide Monaco
    document.getElementById("blocklyEditor").style.display = "block"; // show Blockly
  }

  #openInMonaco(content) {
    this.#uiShowMonacoEditor();
    inoEditor.setContent(content);
  }

  async #openInBlockly(content) {
    this.#uiShowBlocklyEditor();
    const success = await blocklyEditor.setContent(content);
    if (!success) {
      this.#openInMonaco(content);  // fallback to Monaco if failed
    }
  }
}

const inoEditor = new InoEditor();
const blocklyEditor = new BlocklyEditor();

const globalEditor = new GlobalEditor();  // wrapper for all editor types

// =================== Tooltip for button =================== //

// Static Tooltip
// Attach tooltip for elements with `data-tooltip`
// Fallback to inner text if attribute is empty

document.querySelectorAll('.lb-icon-btn').forEach(el => {
  if (el.dataset.tooltip) {
    ideUI.mountStaticTooltip(el, el.dataset.tooltip || el.innerText.trim());
  }
})

// Dynamic Tooltip (Status ViewModel helpers)
// These functions return UI-friendly data (NOT HTML)
// Used by tooltip renderer to display status lists

function getCompileStatus() {
  return [{ label: `Compile ${leanfs.getName(window.currentFileId)}`, status: '' }];
}

function getSelectStatus() {
  if (leanbot.isConnected()) {
    return [
      { label: `Disconnect from ${getcurrentLeanbotName()}` },
      { label: "Select another Leanbot...", status: "indicator" }
    ]
  }

  return [{ label: "Select a Leanbot...", status: "indicator" }];
}

function getConnectStatus() {
  const leanbotID = getcurrentLeanbotName();
  // console.log('leanbotID: ', leanbotID);

  if (leanbot.isConnected()) { //When connected
    return [{ label: leanbotID, status: 'success' }];
  }

  if (!leanbot.isDeviceExist()) { // No Leanbot ID
    return [{ label: 'Select Leanbot...', status: 'indicator' }];
  }

  if (leanbot.isDeviceExist()) { // Not connected to Leanbot 123456 – Device available
    return [{ label: `Connect to ${leanbotID}`, status: '' }];
  }

  // Not connected to Leanbot 123456 – No Device available
  return [{ label: `Select ${leanbotID}`, status: 'indicator' }];
}

function getSerialErrorItems() {
  if (leanbot.SerialApiNotSupported) {
    return [{ label: 'Serial API not supported on this Browser' }];
  }

  if (leanbot.SecureContextMissing) {
    return [{ label: 'Requires HTTPS or localhost' }];
  }

  return [];
}

// ============================================================
// LEANBOT CONNECTION
// ============================================================
const leanbotStatus = document.getElementById("leanbotStatus");
const btnConnect = document.getElementById("btnConnect");
const btnReconnect = document.getElementById("btnReconnect");
let SerialConnectType = 'serial_connect';

function getcurrentLeanbotName() {
  return leanbot.getLeanbotName();
}

function uiShowStatus({ text, style } = {}) {
  leanbotStatus.style.display = "inline-block";

  if (text !== undefined) {
    leanbotStatus.textContent = text;
  }

  if (style !== undefined) {
    leanbotStatus.className = style;
  }

  btnReconnect.style.display = "none";

  // console.log("[uiShowStatus]: ", { text, style });
}

function uiShowReconnectButton() {

  const leanbotID = getcurrentLeanbotName();
  if (!leanbotID) {
    uiShowStatus({ text: "No Leanbot", style: "warning" });
    return;
  }

  leanbotStatus.style.display = "none";
  btnReconnect.style.display = "inline-block";
  btnReconnect.textContent = "RECONNECT " + leanbotID;

  // console.log("[uiShowReconnectButton]: RECONNECT " + leanbotID);
}

uiShowReconnectButton();


function uiCancelRequest() {
  ideUI.uiHideAllToastNotification();
  ideUI.uiHideModal();
}

function uiConnectError(exception) {

  uiShowReconnectButton();

  if (exception === "cancelled") {
    uiCancelRequest();
    return;
  }

  const critical = checkSerialCriticalError();
  if (!critical) {
    ideUI.uiShowAlertModal(`Couldn't connect to Leanbot. Please try again.\n\nDetails: ${exception}`);
  }
}

leanbot.onConnect = async () => {

  // IdeEvent = onConnect
  LogIdeEvent({
    objectpk: SerialConnectType,
    thongtin: "",
    noidung: getcurrentLeanbotName(),
    server_: "",
    t_phanhoi: Math.round(leanbot.setupConnectTimeMs()),
  });

  uiShowStatus({ text: getcurrentLeanbotName(), style: "success" });
  uiResetUpload();

  ideUI.showToastNotification(
    document.getElementById('leanbotStatusAnchor'),
    'Connected Successfully',
    { placement: 'top' },
  )
}

leanbot.onScanBegin = async () => {

  const scanMessage = 'Scanning for Leanbot...';

  // IdeEvent = onSelect
  LogIdeEvent({
    objectpk: "serial_scan",
    thongtin: "",
    noidung: scanMessage,
    server_: "",
    t_phanhoi: Math.round(leanbot.requestTimeMs()),
  });

  ideUI.uiShowModal();

  ideUI.showToastNotification(
    document.getElementById('leanbotStatusAnchor'),
    scanMessage,
    { placement: 'top', delay: 300, duration: 3600000 }, // duration 60 min ~unlimied => show toast until request end (either by choose cancel/pair/refresh web)
  )
}

leanbot.onSelect = async (LeanbotID) => {

  // IdeEvent = onSelect
  LogIdeEvent({
    objectpk: "ble_select",
    thongtin: "",
    noidung: LeanbotID,
    server_: "",
    t_phanhoi: Math.round(leanbot.requestTimeMs()),
  });

  uiShowStatus({ text: getcurrentLeanbotName(), style: "warning" });
  uiResetUpload();
  ideUI.uiHideModal();

  ideUI.showToastNotification(
    leanbotStatus,
    'Connecting...',
    { placement: 'top', duration: 3600000 },
  )
}

leanbot.onDisconnect = async () => {

  // IdeEvent = onDisconnect
  LogIdeEvent({
    objectpk: "ble_disconnect",
    thongtin: "",
    noidung: getcurrentLeanbotName(),
    server_: "",
    t_phanhoi: 0,
  });

  uiShowReconnectButton();

  ideUI.showToastNotification(
    document.getElementById('leanbotStatusAnchor'),
    'Disconnected',
    { placement: 'top' },
  )
};

leanbot.onCancel = async (error_message) => {
  // IdeEvent = onCancel

  LogIdeEvent({
    objectpk: "ble_cancel",
    thongtin: "",
    noidung: error_message,
    server_: "",
    t_phanhoi: Math.round(leanbot.requestTimeMs()), // Time between opening BLE chooser and user pressing cancel
  });
}

leanbot.onConnectError = async (error_message) => {
  // IdeEvent = onDisconnect

  LogIdeEvent({
    objectpk: "ble_err",
    thongtin: "",
    noidung: error_message,
    server_: "",
    t_phanhoi: Math.round(leanbot.connectingTimeMs()), // Time between opening BLE chooser and user pressing cancel
  });
}

btnConnect.onclick = async () => connectLeanbot();
btnReconnect.onclick = async () => reconnectLeanbot();

ideUI.mountDynamicTooltip(btnConnect, () => {
  const errorItems = getSerialErrorItems();

  if (errorItems.length > 0) {
    return {
      title: 'Not Available',
      items: errorItems,
    };
  }

  return {
    title: 'Select Leanbot',
    items: getSelectStatus(),
  };
},
  getSerialErrorItems().length > 0 && 'error',
);

ideUI.mountDynamicTooltip(btnReconnect, () => {
  const errorItems = getSerialErrorItems();

  if (errorItems.length > 0) {
    return {
      title: 'Not Available',
      items: errorItems,
    };
  }

  return {
    title: 'Reconnect',
    items: getConnectStatus(),
  };
},
  getSerialErrorItems().length > 0 && 'error',
);

async function connectLeanbot() {

  LogIdeEvent({
    objectpk: "onSelect",
    thongtin: "",
    noidung: "",
    server_: "",
    t_phanhoi: 0,
  });

  SerialConnectType = 'serial_connect';

  // Chỉ ngắt nếu đang connected để tránh log lỗi "No device found..."
  if (leanbot.isConnected()) {
    const leanbotid = getcurrentLeanbotName();
    const message = `You are connected to ${leanbotid}.
    Are you sure you want to ...?
    1. disconnect from ${leanbotid}
    2. and then select another Leanbot`;

    const ok = await ideUI.uiShowConfirmModal(message, true); // pop-up comfirm (primary no)

    if (!ok) return; // user cancel the disconnect

    const result = await leanbot.disconnect(); // only disconnect if user comfirm to change leanbot
    leanbot.clearDevice();
    if (!result.success) {
      uiConnectError(result.exception);
      return;
    }
  }

  console.log("Scanning for Leanbot...");
  const result = await leanbot.connect();
  if (result.success) return;
  leanbot.clearDevice();
  uiConnectError(result.exception);
}

async function reconnectLeanbot() {

  LogIdeEvent({
    objectpk: "onReconnect",
    thongtin: "",
    noidung: "",
    server_: "",
    t_phanhoi: 0,
  });

  console.log("Reconnecting to Leanbot...");
  SerialConnectType = 'serial_reconnect';

  const result = await leanbot.reconnect();
  if (!result.success) uiConnectError(result.exception);
}

// ============================================================
// SERIAL MONITOR
// ============================================================
const serialLog = document.getElementById("serialLog");
const inputCommand = document.getElementById("serialInput");
const btnSend = document.getElementById("btnSend");
const checkboxNewline = document.getElementById("addNewline");
const checkboxAutoScroll = document.getElementById("autoScroll");
const checkboxTimestamp = document.getElementById("showTimestamp");
const btnClear = document.getElementById("btnClear");
const btnCopy = document.getElementById("btnCopy");

btnClear.onclick = () => clearSerialLog();
btnCopy.onclick = () => copySerialLog();
btnSend.onclick = () => send();

inputCommand.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault(); // prevents form submit or newline
    send();                 // send line
  }
});

function formatTimestamp(ts) {
  const hours = String(ts.getHours()).padStart(2, '0');
  const minutes = String(ts.getMinutes()).padStart(2, '0');
  const seconds = String(ts.getSeconds()).padStart(2, '0');
  const milliseconds = String(ts.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

leanbot.Serial.onMessage = (message, timeStamp, timeGapMs) => {
  let prefix = "";
  if (checkboxTimestamp.checked) prefix = `${formatTimestamp(timeStamp)} (+${timeGapMs.toString().padStart(3, "0")}) -> `;

  serialLog.value += prefix + message;
  if (checkboxAutoScroll.checked) setTimeout(() => { serialLog.scrollTop = serialLog.scrollHeight; }, 0);
};

function clearSerialLog() {
  serialLog.value = "";
}

function copySerialLog() {
  serialLog.select();
  navigator.clipboard.writeText(serialLog.value)
    .then(() => console.log("Copied!"))
    .catch(err => console.error("Copy failed:", err));
}

async function send() {
  const newline = checkboxNewline.checked ? "\n" : "";
  await leanbot.Serial.send(inputCommand.value + newline);
  inputCommand.value = "";
}

// ============================================================
// COMPILE + UPLOAD CORE
// ============================================================

// =================== Button Compile =================== //
const btnCompile = document.getElementById("btnCompile");
const ProgramTab = document.getElementById("programGrid");
const btnPgit = document.getElementById("btnPgit");
const UploaderCompileLog = document.getElementById("compileLog");
const UploaderCompileProg = document.getElementById("progCompile");

let currentCompileCode = null; // Use to capture snapshot of the source code being compiled
let currentCompileItem = null;

window.treelocked = false; // Global UI lock flag to prevent workspace navigation or mutation

function uiEnableCompileUpload(enable) {
  btnCompile.disabled = !enable;

  // experimental: for uploader2
  btnUpload2.disabled = !enable;
  btnMultiUploads.disabled = !enable;
}

function uiEnableTreeview(enable) {
  window.treelocked = !enable;    // Lock file tree to prevent switching files, renaming
  btnNewFile.disabled = !enable;  // Disable workspace mutation actions (create / import)
  btnNewBlocklyFile.disabled = !enable;
  btnNewFolder.disabled = !enable;
  btnLoadFile.disabled = !enable;
  btnExportFile.disabled = !enable;
  btnPgit.disabled = !enable;
}

function uiEnableConnect(enable) {
  btnConnect.disabled = !enable;
}

function getSourceCode() {
  const sourceCode = globalEditor.getCppCode();
  currentCompileItem = leanfs.getName(window.currentFileId);
  currentCompileCode = sourceCode;
  return sourceCode;
}

btnCompile.addEventListener("click", async () => {

  LogIdeEvent({
    objectpk: "onCompile",
    thongtin: "",
    noidung: "",
    server_: "",
    t_phanhoi: 0,
  });

  const sourceCode = getSourceCode();

  compileStart = performance.now();
  ProgramTab.classList.add("hide-upload");
  uiShowCompileUploadTab();
  uiResetCompile();

  const uiSetEnabled = (enabled) => {
    uiEnableTreeview(enabled);
    uiEnableCompileUpload(enabled);
    uiEnableConnect(enabled);
  };

  try {
    await withLockedControls(uiSetEnabled, () => leanbot.Compiler.compile(sourceCode));
  } catch (_) {
    // errors handled in onCompileError; controls restored by withLockedControls
  }
});

leanbot.Compiler.onCompileSucess = async (compileMessage) => {

  const t_phanhoi = Math.round(leanbot.Compiler.elapsedTimeMs());
  const thongtin = t_phanhoi < 1000 ? "" : currentCompileCode;

  // IdeEvent = onRespond
  LogIdeEvent({
    objectpk: "compile_res",
    thongtin: thongtin,
    noidung: currentCompileItem + '\n' + compileMessage,
    server_: IDEConfig.LeanbotCompiler.Server,
    t_phanhoi: t_phanhoi,
  });

  UploaderCompileLog.value = compileMessage;

  if (!isCompileAndUpload) { // only compile => show notification
    const notice = getCompileSuccessNotice(compileMessage);
    ideUI.showToastNotification(
      btnCompile,
      { text: notice.text, status: notice.status },
      { placement: 'bottom' },
    );
    if (notice.closeProgram) {
      uiHideSerialTab();
    }
  } else { // compile and upload
    uploadStart = performance.now(); // reset upload start time
  }
};

leanbot.Compiler.onCompileError = async (errContext, compileMessage) => {
  const CompileCode = currentCompileCode;

  // IdeEvent = onRespond (error)
  LogIdeEvent({
    objectpk: errContext,
    thongtin: CompileCode,
    noidung: compileMessage,
    server_: IDEConfig.LeanbotCompiler.Server,
    t_phanhoi: Math.round(leanbot.Compiler.elapsedTimeMs()),
  });

  UploaderCompileLog.value = compileMessage;
  UploaderCompileProg.className = "red";

  if (!isCompileAndUpload) { // only compile => show notification
    ideUI.showToastNotification(
      btnCompile,
      { text: 'Compile Error', status: 'error' },
      { placement: 'bottom' },
    )
  }
  else { // compile and upload
    ProgramTab.classList.add("hide-upload"); // Ẩn upload khi compile lỗi
  }
};

ideUI.mountDynamicTooltip(btnCompile, () => ({
  title: "Check & Compile",
  items: getCompileStatus(),
}));

leanbot.Compiler.onCompileProgress = (elapsedTime, estimatedTotal) => {
  uiUpdateTime(compileStart, UploaderTimeCompile);
  uiUpdateProgress(UploaderCompileProg, elapsedTime, estimatedTotal); // ms = > s 
};

// =================== Button Upload 2 =================== //
const btnUpload2 = document.getElementById("btnUpload-2");
let isCompileAndUpload = false;

function uiUploadSuccess() {
  ideUI.showToastNotification(
    btnUpload2,
    { text: 'Upload Successful — You Can Disconnect The USB Cable And Run The Robot.', status: 'success' },
    { placement: 'bottom' },
  );

  setTimeout(() => uiShowSerialTab(), 1000); // Chuyển sang tab monitor sau 1 giây
}

function uiUploadError(exception) {

  if (exception === "cancelled") {
    uiCancelRequest();
    checkSerialCriticalError();
    return;
  }

  const matchConnectError = exception.match(/(?:Connection failed|Reconnect failed|Disconnect failed):\s*(.*)/i);

  if (matchConnectError) { // connect error (attempt enter boothloader)
    const detail = matchConnectError[1];
    if (!leanbot.isDeviceExist()) leanbot.clearDevice();
    uiShowReconnectButton();
    ideUI.uiShowAlertModal(`Couldn't connect to Leanbot. Please try again.\n\nDetails: ${detail}`);
  }

  ideUI.showToastNotification(
    btnUpload2,
    { text: 'Upload Error', status: 'error' },
    { placement: 'bottom', delay: 300 },
  )
}

async function runCompileUploadFlow2() {

  uiEnableTreeview(false);
  uiEnableCompileUpload(false);
  uiEnableConnect(false);

  compileStart = performance.now();
  ProgramTab.classList.remove("hide-upload"); // Hiện phần upload
  uiShowCompileUploadTab();
  uiResetCompile();

  uiResetUpload(); // Reset UI only for reconnect. For first connect, it is handled in the connect callback.
  isCompileAndUpload = true;
  const sourceCode = getSourceCode();

  try {
    const result = await leanbot.compileAndUpload2(sourceCode, IDEConfig.LeanbotCompiler.Server);
    const notice = getUploadNotice(result);
    if (notice.kind === 'success') {
      const match = result.uploadCompileInfo?.match(/(\d+)%\)\s+of program storage space/);
      const FlashUsage = match?.[1] ?? 0;
      LogIdeEvent({
        objectpk: "upload_done",
        thongtin: `${FlashUsage}%`,
        noidung: getcurrentLeanbotName(),
        server_: "Serial",
        t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
      });
      uiUploadSuccess();
    } else if (notice.kind === 'cancelled') {
      uiUploadError('cancelled');
    } else {
      uiUploadError(result.exception || notice.message || 'Upload failed.');
    }

    await leanbot.uploadFlush(); // Nếu compile chưa xong => chờ đến khi upload xong mới enable nút bấm
  } finally {
    isCompileAndUpload = false;
    uiEnableTreeview(true);
    uiEnableCompileUpload(true);
    uiEnableConnect(true);
  }
}

btnUpload2.addEventListener("click", async () => {

  LogIdeEvent({
    objectpk: "onUpload",
    thongtin: "",
    noidung: getcurrentLeanbotName(),
    server_: "",
    t_phanhoi: 0,
  });

  await runCompileUploadFlow2();
});

ideUI.mountDynamicTooltip(btnUpload2, () => {
  const errorItems = getSerialErrorItems();

  if (errorItems.length > 0) {
    return {
      title: 'Not Available',
      items: errorItems,
    };
  }

  return {
    title: 'Compile & Upload',
    items: [
      ...getConnectStatus(),
      ...getCompileStatus(),
      { label: 'Upload to Leanbot', status: '' },
    ],
  };
},
  getSerialErrorItems().length > 0 && 'error',
);

// =================== Button Multi leanbots mode  =================== //
const btnMultiUploads = document.getElementById('btnMultiUploads');

btnMultiUploads.addEventListener("click", async () => {

  LogIdeEvent({
    objectpk: "onUpload",
    thongtin: "",
    noidung: "MultiUpload",
    server_: "",
    t_phanhoi: 0,
  });

  // disconnect Leanbot cũ (nếu đang connect)
  if (leanbot.isConnected()) {
    const result = await leanbot.disconnect(); // only disconnect if user comfirm to change leanbot
    if (!result.success) {
      uiConnectError(result.exception);
      return;
    }
  }

  leanbot.clearDevice(); // clear id 
  uiShowReconnectButton();  // display "No Leanbot" 

  // connect và enter bootloader luôn

  await runCompileUploadFlow2();
});

ideUI.mountDynamicTooltip(
  btnMultiUploads,
  () => {
    const errorItems = getSerialErrorItems();

    if (errorItems.length > 0) {
      return {
        title: 'Not Available',
        items: errorItems,
      };
    }

    return {
      title: 'MultiUpload',
      items: [
        ...(leanbot.isConnected()
          ? [{ label: `Disconnect from ${getcurrentLeanbotName()}` }]
          : []),

        { label: 'Select Leanbot...', status: 'indicator' },
        ...getCompileStatus(),
        { label: 'Upload to Leanbot', status: '' },
      ],
    };
  },
  getSerialErrorItems().length > 0 && 'error',
);

// =================== Upload DOM Elements =================== //
const UploaderTitleUpload = document.getElementById("uploadTitle");
const UploaderTransfer = document.getElementById("progTransfer");
const UploaderWrite = document.getElementById("progWrite");
const UploaderVerify = document.getElementById("progVerify");
const UploaderLogUpload = document.getElementById("uploadLog");

const UploaderTimeCompile = document.getElementById("compileTime");
const UploaderRSSI = document.getElementById("uploadRSSI");
const UploaderTimeUpload = document.getElementById("uploadTime");

function uiResetCompile() {
  UploaderCompileProg.value = 0;
  UploaderCompileProg.max = 1;
  UploaderCompileProg.className = "yellow";
  UploaderCompileLog.value = "";
  UploaderTimeCompile.textContent = "0.0 sec";
}

function uiResetUpload() {
  if (!leanbot.isDeviceExist()) return;

  [UploaderTransfer, UploaderWrite, UploaderVerify].forEach(b => {
    b.value = 0;
    b.max = 1;
    b.className = "yellow";
  });

  // reset 
  UploaderLogUpload.value = "";
  UploaderTitleUpload.textContent = "Upload to " + getcurrentLeanbotName();
  UploaderTimeUpload.textContent = "0.0 sec";
  UploaderRSSI.textContent = "";
}

// =================== Uploader UI Updates =================== //
let compileStart = 0;
let uploadStart = 0;

function uiUpdateTime(start, el) {
  el.textContent = `${((performance.now() - start) / 1000).toFixed(1)} sec`;
};

function uiUpdateRSSI(rssi) {
  UploaderRSSI.textContent = `${rssi} dBm`;
}

function uiUpdateProgress(element, progress, total) {
  element.value = progress;
  element.max = total;
  if (progress === total) element.className = "green";
}

// =================== Uploader Event Handlers =================== //
// leanbot.Uploader.onMessage = ({ timeStamp, message }) => {
//   uiUpdateTime(uploadStart, UploaderTimeUpload);

//   const msg = `[${(timeStamp / 1000).toFixed(3)}] ${message}`;

//   UploaderLogUpload.value += "\n" + msg;
//   UploaderLogUpload.scrollTop = UploaderLogUpload.scrollHeight;
// };

leanbot.Uploader.onMessage = input => {
  uiUpdateTime(uploadStart, UploaderTimeUpload);

  const line =
    typeof input === "string"
      ? input
      : `[${(input.timeStamp / 1000).toFixed(3)}] ${input.message}`;

  UploaderLogUpload.value += "\n" + line;
  UploaderLogUpload.scrollTop = UploaderLogUpload.scrollHeight;
};

leanbot.Uploader.onRSSI = (rssi) => {
  uiUpdateRSSI(rssi);
};

leanbot.Uploader.onTransfer = (progress, totalBlocks) => {
  uiUpdateProgress(UploaderTransfer, progress, totalBlocks);
};

leanbot.Uploader.onTransferError = () => {
  UploaderTransfer.className = "red";
};

leanbot.Uploader.onWrite = (progress, totalBytes) => {
  uiUpdateProgress(UploaderWrite, progress, totalBytes);
};

leanbot.Uploader.onWriteError = () => {
  UploaderWrite.className = "red";
};

leanbot.Uploader.onVerify = (progress, totalBytes) => {
  uiUpdateProgress(UploaderVerify, progress, totalBytes);
};

leanbot.Uploader.onVerifyError = () => {
  UploaderVerify.className = "red";
};

// leanbot.Uploader.onSuccess = async () => {

//   // IdeEvent = onUploadDone
//   LogIdeEvent({
//     objectpk: "upload_done",
//     // thongtin: "arduino:avr:uno",
//     thongtin: `${FlashUsage}%`,
//     noidung: getcurrentLeanbotName(),
//     server_: leanbot.Uploader.isSupported()?"LbEsp32":"JDY",
//     t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
//   });
// };

leanbot.Uploader.onError = async (err) => {

  // IdeEvent = onUploadError
  LogIdeEvent({
    objectpk: "upload_err",
    thongtin: "arduino:avr:uno",
    noidung: err,
    server_: "Serial",
    t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
  });
};

leanbot.Uploader.onCancelUpload = async (err) => {

  // IdeEvent = onUploadError
  LogIdeEvent({
    objectpk: "upload_cancel",
    thongtin: "arduino:avr:uno",
    noidung: err,
    server_: "",
    t_phanhoi: Math.round(leanbot.Uploader.getTotalTimeMs()),
  });
};

leanbot.Uploader.onUploadAbnormal = async (err) => {

  // IdeEvent = onUploadError
  LogIdeEvent({
    objectpk: "upload_abnormal",
    thongtin: "arduino:avr:uno",
    noidung: err,
    server_: "",
    t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
  });
};

leanbot.Uploader.onEnterBootloader = async (retry) => {

  LogIdeEvent({
    objectpk: "jdy_bootloader",
    thongtin: retry,
    noidung: getcurrentLeanbotName(),
    server_: "JDY",
    t_phanhoi: Math.round(leanbot.Uploader.EnterBootloaderTimeMs()),
  });
};

leanbot.Uploader.onUploadStartWrite = async () => {

  LogIdeEvent({
    objectpk: "upload_write",
    thongtin: "",
    noidung: getcurrentLeanbotName(),
    server_: "",
    t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
  });
};

leanbot.Uploader.onUploadStartVerify = async () => {

  LogIdeEvent({
    objectpk: "upload_verify",
    thongtin: "",
    noidung: getcurrentLeanbotName(),
    server_: "",
    t_phanhoi: Math.round(leanbot.Uploader.elapsedTimeMs()),
  });
};

// ============================================================
// SERIAL SECTION TABS
// ============================================================
const workspace = document.getElementById("workspace");
const serialSection = document.getElementById("serialSection");
const btnSerial = document.getElementById("btnSerial");

const programPanel = document.getElementById("programPanel");
const monitorPanel = document.getElementById("monitorPanel");

const tabs = document.querySelectorAll("#serialTabs .serial-tab");
const programTab = Array.from(tabs).find(t => t.dataset.tab === "program");
const monitorTab = Array.from(tabs).find(t => t.dataset.tab === "monitor");

const btnCloseSerial = document.getElementById("btnCloseSerial");

const editorSection = document.getElementById('editorSection');
const autoHideCheckbox = document.getElementById('autoHideSerial');

function uiShowSerialTab() {
  workspace.classList.add("serial-open");
  serialSection.classList.remove("is-hidden");

  programTab.classList.remove("active");
  monitorTab.classList.add("active");

  // Update panel visibility
  programPanel.classList.add("is-hidden");
  monitorPanel.classList.remove("is-hidden");
}

function uiShowCompileUploadTab() {
  workspace.classList.add("serial-open");
  serialSection.classList.remove("is-hidden");

  programTab.classList.add("active");
  monitorTab.classList.remove("active");

  // Update panel visibility
  programPanel.classList.remove("is-hidden");
  monitorPanel.classList.add("is-hidden");
}

function uiHideSerialTab() {
  workspace.classList.remove("serial-open");
  serialSection.classList.add("is-hidden");
}

btnCloseSerial.addEventListener("click", () => {
  uiHideSerialTab();
});

// Click SERIAL → mở PROGRAM
btnSerial.addEventListener("click", () => {
  const isOpen = workspace.classList.contains("serial-open");
  if (!isOpen) {
    // open last active tab (program or monitor)
    workspace.classList.add("serial-open");
    serialSection.classList.remove("is-hidden");
  }
  else uiHideSerialTab();
});

// add listener for tab clicks
programTab.addEventListener("click", () => {
  uiShowCompileUploadTab();
});

monitorTab.addEventListener("click", () => {
  uiShowSerialTab();
});

editorSection.addEventListener('pointerdown', (e) => {
  globalEditor.onPointerdownHandler();
});

// ============================================================
// MONACO EDITOR (ARDUINO)
// ============================================================

await inoEditor.attach(document.getElementById("codeEditor"));

if (window.__pendingOpenFileId) {
  const uuid = window.__pendingOpenFileId;
  window.__pendingOpenFileId = null;
  await globalEditor.openItem(uuid);
}

// Autosave nội dung từ Monaco về fileContents
let saveTimer = null;

inoEditor.onChangeContent = () => {
  const uuid = window.currentFileId;
  if (!uuid) return;

  const currentfileContents = inoEditor.getContent();
  const isContentEmpty = !currentfileContents || currentfileContents.trim() === "";
  uiEnableCompileUpload(!isContentEmpty); // enable compile + upload (only if content not empty)

  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { await leanfs.writeFile(uuid, currentfileContents) }, IDEConfig.InoEditor.AutoSaveDelayMs); // save after 10000ms of inactivity
}

// ============================================================
// BLOCKLY EDITOR
// ============================================================

window.onChangeBlockly = function (fileId) {
  globalEditor.onPointerdownHandler();  // also trigger pointerdown event

  const uuid = fileId;
  if (!uuid) return;

  const currentfileContents = blocklyEditor.getContent();

  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { await leanfs.writeFile(uuid, currentfileContents) }, IDEConfig.InoEditor.AutoSaveDelayMs); // save after 10000ms of inactivity
}


// ============================================================
// EDITOR WRAPPER
// ============================================================



// ============================================================
// Restore Current ID
// ============================================================

const CURRENT_FILEID_KEY = "IDE_CurrentItemID";

window.currentFileId = localStorage.getItem(CURRENT_FILEID_KEY) || leanfs.getRoot() || null;

function saveCurrentFileID() {
  localStorage.setItem(CURRENT_FILEID_KEY, window.currentFileId);
}

async function changeCurrentFileId(newFileId) {
  if (newFileId === window.currentFileId) return;

  const content = globalEditor.getContent();
  await leanfs.writeFile(window.currentFileId, content);
  window.currentFileId = newFileId;
  saveCurrentFileID(); // save current file uuid to local storage
}

// ============================================================
// WORKSPACE BOOTSTRAP & INVARIANTS
// - Load .ino templates
// - Ensure workspace always contains at least one .ino file
// ============================================================

// Templates ino
const fileTemplates = {
  basicMotion: "",
  default: "",
  defaultBlockly: ""
};

async function loadText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Load template failed: ${url} (HTTP ${res.status})`);
  }
  return await res.text();
}

async function initfileTemplates() {
  fileTemplates.basicMotion = await loadText("./TemplateSourceCode/BasicMotion.ino");
  fileTemplates.default = await loadText("./TemplateSourceCode/Default.ino");
  fileTemplates.defaultBlockly = await loadText("./TemplateSourceCode/DefaultBlockly.bduino");
}

await initfileTemplates();

const dataProvider = new StaticTreeDataProvider(leanfs.getItems(), (item, data) => ({ ...item, data }));
const emitChanged = (ids) => dataProvider.onDidChangeTreeDataEmitter.emit(ids);

// Trạng thái Monaco
window.__pendingOpenFileId = window.__pendingOpenFileId ?? null;

// Create basicMotion.ino if there isnt any .ino file in the workspace

if (!leanfs.hasAnyFileOfType(LeanFs.leanfs_TYPE.INO)) { // If no .ino file exists, create a default basicMotion.ino directly at root
  console.log("[LS] No .ino file found, creating default BasicMotion.ino");
  const uuid = await leanfs.createFile(leanfs.getRoot());
  await leanfs.rename(uuid, "BasicMotion.ino");
  await leanfs.writeFile(uuid, fileTemplates.basicMotion || "");
  await changeCurrentFileId(uuid);
}

// ============================================================
//  FILE TREE management
// ============================================================

// track focus, selection để tạo file, folder, move đúng vị trí
let lastFocusedId = window.currentFileId;
let lastSelectedIds = [window.currentFileId];

// Lấy folder đích để thêm file, folder
function getTargetFolderId() {
  const focus = leanfs.isExist(lastFocusedId) ? lastFocusedId : leanfs.getRoot();
  if (leanfs.isDir(focus)) return focus;

  const parent = leanfs.getParent(focus);
  if (leanfs.isDir(parent)) return parent;

  return leanfs.getRoot();
}

// Nhận file local đã đọc từ loadFile() và tạo file mới trong tree
window.importLocalFileToTree = async (loaded) => {
  // const fileName = String(loaded.fileName || getTimestampName() + ".ino");
  const fileName = String(loaded.fileName);
  const text = String(loaded.text ?? "");

  const parentId = getTargetFolderId();

  const uuid = await leanfs.createFile(parentId);
  await leanfs.rename(uuid, fileName);

  await leanfs.writeFile(uuid, text);

  emitChanged([parentId, uuid]);

  pendingTreeFocusId = uuid;
  await globalEditor.openItem(uuid);
};

// Import local file into tree
const btnLoadFile = document.getElementById("btnLoadFile");

btnLoadFile.addEventListener("click", async () => {

  const loaded = await importExport.importFileFromLocalDrive();
  // chuyển cho FILE TREE tạo file mới + mở trong Monaco
  for (const f of loaded) {
    await window.importLocalFileToTree?.(f);
  }
});

// Drag & Drop file vào file tree
const fileTreePanel = document.getElementById("fileTreePanel");

fileTreePanel?.addEventListener("dragover", (e) => {

  // Ignore internal tree drag
  if (!e.dataTransfer?.types?.includes("Files")) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  fileTreePanel.classList.add("is-drop-hover");
});

fileTreePanel?.addEventListener("dragleave", () => {
  fileTreePanel.classList.remove("is-drop-hover");
});

fileTreePanel?.addEventListener("drop", async (e) => {
  e.preventDefault();

  fileTreePanel.classList.remove("is-drop-hover");

  if (window.treelocked) return;

  // Ignore internal tree drag
  if (!e.dataTransfer?.types?.includes("Files")) return;

  const loaded = await importExport.importFileFromLocalDrive(e.dataTransfer?.files || []);

  // chuyển cho FILE TREE tạo file mới + mở trong Monaco
  for (const f of loaded) {
    await window.importLocalFileToTree?.(f);
  }
});

// export a file to computer

const btnExportFile = document.getElementById("btnExportFile");

btnExportFile.addEventListener("click", async () => {

  if (leanfs.isDir(window.currentFileId)) {
    // alert("Cannot export a folder! Please select a file.");
    return;
  }

  const filename = leanfs.getName(window.currentFileId);
  const content = await leanfs.readFile(window.currentFileId);

  importExport.exportFileToLocalDrive(content, filename)
});

// ===== sync state tree (selected, focused) cho thao tác ngoài tree =====
window.__rctItemActions ||= new Map();
const rememberItemActions = (uuid, ctx) => uuid && ctx && window.__rctItemActions.set(uuid, ctx);

let pendingTreeFocusId = null;

function focusTreeItemNow(uuid) {
  const ctx = window.__rctItemActions.get(uuid);
  if (!ctx) return false;

  try { ctx.focusItem?.(); } catch (e) { }
  try { ctx.selectItem?.(); } catch (e) { }

  lastFocusedId = uuid;
  lastSelectedIds = [uuid];
  return true;
}

let pendingTreeRenameId = null;

// Mở folder nếu nó đang collapsed
function expandFolderChain(folderId) {
  let uuid = folderId;

  while (uuid && uuid !== leanfs.getRoot()) {
    const ctx = window.__rctItemActions.get(uuid);
    try { ctx?.expandItem?.(); } catch (e) { }
    uuid = leanfs.getParent(uuid);
  }
}

const btnShowTree = document.getElementById('btnShowTree');
const editorRow = document.getElementById('editorRow');

btnShowTree.addEventListener('click', () => {
  editorRow.classList.toggle('tree-collapsed');
});

const btnNewFile = document.getElementById("btnNewFile");
const btnNewFolder = document.getElementById("btnNewFolder");
const btnNewBlocklyFile = document.getElementById("btnNewBlocklyFile");

btnNewFile?.addEventListener("click", async () => {

  cooldownButton(btnNewFile, 1000);

  const parentId = getTargetFolderId();
  // console.log("[CREATE] target parentId =", parentId);

  const itemUUID = await leanfs.createFile(parentId); // Create a file
  const newname = NameEnsureExtension(itemUUID, '.ino');
  console.log("new file name:", newname);
  await leanfs.rename(itemUUID, newname);             // rename it to somename with .ino (for example: "2025.12.31-08.44.22.ino")
  await leanfs.writeFile(itemUUID, fileTemplates.default || ""); // content = deafult.ino

  emitChanged([parentId, itemUUID]);

  pendingTreeRenameId = itemUUID;
  pendingTreeFocusId = itemUUID;

  await globalEditor.openItem(itemUUID);
});

btnNewBlocklyFile?.addEventListener("click", async () => {

  cooldownButton(btnNewBlocklyFile, 1000);

  const parentId = getTargetFolderId();
  // console.log("[CREATE] target parentId =", parentId);

  const itemUUID = await leanfs.createFile(parentId); // Create a file
  const newname = NameEnsureExtension(itemUUID, '.bduino');
  console.log("new file name:", newname);
  await leanfs.rename(itemUUID, newname);             // rename it to somename with .bduino(for example: "2025.12.31-08.44.22.bduino")
  await leanfs.writeFile(itemUUID, fileTemplates.defaultBlockly || ""); // content = DefaultBlockly.bduino

  emitChanged([parentId, itemUUID]);

  pendingTreeRenameId = itemUUID;
  pendingTreeFocusId = itemUUID;

  await globalEditor.openItem(itemUUID);
});

btnNewFolder?.addEventListener("click", async () => {

  cooldownButton(btnNewFolder, 1000);

  const parentId = getTargetFolderId();
  // console.log("[CREATE] target parentId =", parentId);

  const itemUUID = await leanfs.createDir(parentId); // Create a dir, default name: "2025.12.31-08.44.22"

  emitChanged([parentId, itemUUID]);

  // Mở chain folder cha để nhìn thấy item mới
  // Nếu tạo folder, mở luôn chính folder đó
  setTimeout(async () => {
    expandFolderChain(parentId);
    try {
      await globalEditor.openItem(itemUUID);
      const ctx = window.__rctItemActions.get(itemUUID);
      ctx?.expandItem?.();
    } catch (e) {
      console.log("[TREE] expand new folder failed =", itemUUID, e);
    }
  }, 0);

  pendingTreeRenameId = itemUUID;
  pendingTreeFocusId = itemUUID;
});

// rename file bằng F2
async function renameFileId(uuid, newDisplayName) {

  if (leanfs.isExist(uuid) === false) return;

  await leanfs.rename(uuid, newDisplayName);

  // auto focus to local config file if created
  const isLocalConfigCreated = await ideConfig.checkRenameItem(uuid, newDisplayName);

  if (isLocalConfigCreated) {
    const localConfigUUID = leanfs.getLocalConfigUUID();

    emitChanged([uuid, localConfigUUID]);

    expandFolderChain(leanfs.getParent(uuid));
    pendingTreeFocusId = localConfigUUID;
    await globalEditor.openItem(localConfigUUID);

    return;
  }

  emitChanged([uuid]);
  pendingTreeFocusId = uuid;
}

// ============================================================
// DRAG & DROP in FILE TREE
// ============================================================

async function handleDrop(itemsDragged, target) {
  if (!target) return;

  const draggedIds = Array.from(new Set((itemsDragged || []).map(x => x.index)));

  // Xác định folder đích và vị trí chèn
  let destFolderId = leanfs.getRoot();
  let insertIndex = 0;

  if (target.targetType === "between-items") {
    // Thả giữa các item, dùng parentItem và childIndex
    destFolderId = target.parentItem || leanfs.getRoot();
  } else {
    // Thả lên item cụ thể
    const targetId = target.targetItem;

    console.log("Target item:", targetId);

    if (!leanfs.isExist(targetId)) return;

    // if target is file, move to its parent; if target is folder, move into that folder
    // in unexpected case when parent is not exist, move to root
    destFolderId = leanfs.isDir(targetId) ? targetId : (leanfs.getParent(targetId) || leanfs.getRoot());
  }

  insertIndex = Number.isFinite(target.childIndex)
    ? target.childIndex
    : (leanfs.getAllChildren(destFolderId)?.length ?? 0);

  const changed = new Set([...draggedIds, destFolderId]);

  // Chặn kéo folder vào chính con của nó
  draggedIds.forEach((uuid) => {
    if (uuid === destFolderId) return;
    if (leanfs.isAncestorOf(destFolderId, uuid)) return;
  });

  // Chèn vào folder đích theo thứ tự

  for (const [i, uuid] of draggedIds.entries()) {
    const removedParent = await leanfs.insertAtIndex(destFolderId, uuid, insertIndex + i);
    if (removedParent) changed.add(removedParent);
  }


  emitChanged(Array.from(changed));
  setTimeout(async () => {
    expandFolderChain(destFolderId);

    if (draggedIds.length === 1) {
      const movedId = draggedIds[0];
      if (!leanfs.isExist(movedId)) return;

      pendingTreeFocusId = movedId;

      // Nếu là folder: mở luôn folder đó
      if (leanfs.isDir(movedId)) {
        try {
          const ctx = window.__rctItemActions.get(movedId);
          ctx?.expandItem?.();
          console.log("[MOVE] expanded moved folder =", movedId);
        } catch (e) {
          console.log("[MOVE] expand moved folder failed =", movedId, e);
        }
        return;
      }

      // Nếu là file: mở file, đồng thời folder cha đã được expand ở trên
      console.log("[MOVE] open moved file =", movedId, "parent =", leanfs.getParent(movedId));
      await globalEditor.openItem(movedId);
    }
  }, 0);
}

// ============================================================
// TREE VIEWSTATE + CONTEXT MENU
// ============================================================
const initialOpenId = leanfs.isExist(window.currentFileId) ? window.currentFileId : null;

const ancestorFolders = leanfs.getAncestorFolders(initialOpenId);

const viewState = {
  tree: {
    expandedItems: [leanfs.getRoot(), ...ancestorFolders],
    selectedItems: initialOpenId ? [initialOpenId] : [],
    focusedItem: initialOpenId || undefined,
  },
};

// ==================== TREE CONTEXT MENU (RIGHT CLICK) ==================== //
const ctxMenu = document.getElementById("treeCtxMenu");
const ctxRenameBtn = document.getElementById("ctxRename");
const ctxDeleteBtn = document.getElementById("ctxDelete");

let ctxTargetId = null;

function uiHideTreeCtxMenu() {
  ctxMenu?.classList.add("is-hidden");
  ctxTargetId = null;
}

function uiShowTreeCtxMenu(x, y, uuid) {
  if (window.treelocked) return;
  if (!ctxMenu) return;
  ctxTargetId = uuid;

  ctxMenu.classList.remove("is-hidden");

  const pad = 6;
  const w = ctxMenu.offsetWidth || 160;
  const h = ctxMenu.offsetHeight || 90;

  ctxMenu.style.left = Math.max(pad, Math.min(x, innerWidth - w - pad)) + "px";
  ctxMenu.style.top = Math.max(pad, Math.min(y, innerHeight - h - pad)) + "px";
}

addEventListener("click", uiHideTreeCtxMenu);
// addEventListener("scroll", uiHideTreeCtxMenu, true);
// addEventListener("keydown", (e) => { if (e.key === "Escape") uiHideTreeCtxMenu(); });

ctxMenu?.addEventListener("click", (e) => e.stopPropagation());

async function deleteItemWithConfirm(uuid) {
  if (!leanfs.isExist(uuid)) return;
  if (uuid === leanfs.getRoot()) return;

  const name = leanfs.getName(uuid);
  const isFolder = leanfs.isDir(uuid);
  const childCount = isFolder ? (leanfs.getAllChildren(uuid)?.length || 0) : 0;

  let message;

  if (isFolder) {
    message = childCount > 0
      ? `Delete folder "${name}" and its ${childCount} items?`
      : `Delete folder "${name}"?`;
  } else {
    message = `Delete file "${name}"?`;
  }

  const ok = await ideUI.uiShowConfirmModal(message); // pop-up comfirm

  console.log("[DELETE] confirm =", ok ?? false, "uuid =", uuid);

  if (!ok) return;

  await deleteItemById(uuid);
}

async function deleteItemById(uuid) {
  if (!leanfs.isExist(uuid)) return;
  if (uuid === leanfs.getRoot()) return;

  const nextFocus = leanfs.pickNextItemAfterDelete(uuid);

  const reloadConfig = await ideConfig.checkDeleteItem(uuid);

  if (leanfs.isDir(uuid)) {
    await leanfs.deleteDir(uuid);
  } else {
    await leanfs.deleteFile(uuid);
  }

  window.currentFileId = nextFocus;
  saveCurrentFileID();

  if (nextFocus) {
    pendingTreeFocusId = nextFocus;
    await globalEditor.openItem(nextFocus);
  } else { // Root, or invalid state
    await globalEditor.openItem(leanfs.getRoot());
  }

  emitChanged([leanfs.getRoot()]);

  if (reloadConfig) window.location.reload(); // force reload
}

ctxDeleteBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const uuid = ctxTargetId;
  uiHideTreeCtxMenu();
  await deleteItemWithConfirm(uuid);
});

// Rename ngay khi bấm rename trong context menu
ctxRenameBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const uuid = ctxTargetId;
  uiHideTreeCtxMenu();

  const ctx = window.__rctItemActions.get(uuid);
  if (!ctx?.startRenamingItem) return;

  try { ctx.focusItem?.(); } catch (err) { }
  try { ctx.selectItem?.(); } catch (err) { }
  try { ctx.startRenamingItem(); } catch (err) { }
});

// ============================================================
// RENDER FILE TREE
// ============================================================
const mount = document.getElementById("fileTreeMount");
const reactRoot = createRoot(mount);

reactRoot.render(
  React.createElement(
    UncontrolledTreeEnvironment,
    {
      dataProvider,
      getItemTitle: (item) => item.data,
      viewState,

      allowRenaming: true,

      canDragAndDrop: true,

      canDropOnFolder: true,

      canReorderItems: true,
      canInvokePrimaryActionOnItemContainer: true,
      defaultInteractionMode: "click-arrow-to-expand",

      onFocusItem: (item) => {
        if (!item) return;
        lastFocusedId = item.index;
      },

      onSelectItems: (ids) => {
        // console.log("onSelectItems:", ids, "\nlength =", Array.isArray(ids) ? ids.length : 0);
        lastSelectedIds = Array.isArray(ids) ? ids.slice() : [];
        if (lastSelectedIds.length > 0) lastFocusedId = lastSelectedIds[lastSelectedIds.length - 1];
      },

      onPrimaryAction: async (item) => {

        if (window.treelocked) return;
        // console.log("onPrimaryAction:", item.index);
        pendingTreeFocusId = item.index;
        await globalEditor.openItem(item.index);
      },

      onRenameItem: async (item, name) => {
        if (!item) return;
        await renameFileId(item.index, name);
      },

      canDropAt: (itemsDragged, target) => {
        if (window.treelocked) return false;
        return true;
      },

      onDrop: async (itemsDragged, target) => {
        await handleDrop(itemsDragged, target);
      },

      renderItem: ({ item, title, arrow, context, children, depth }) => {
        rememberItemActions(item.index, context);

        if (pendingTreeFocusId === item.index) {
          pendingTreeFocusId = null;
          setTimeout(() => focusTreeItemNow(item.index), 0);
        }

        if (pendingTreeRenameId === item.index) {
          pendingTreeRenameId = null;
          setTimeout(() => {
            try { context.focusItem?.(); } catch { }
            try { context.selectItem?.(); } catch { }
            try { context.startRenamingItem?.(); } catch { }
          }, 0);
        }

        const Tag = "button";

        const onCtx = (e) => {
          e.preventDefault();
          try { context.focusItem?.(); } catch { }
          try { context.selectItem?.(); } catch { }
          lastFocusedId = item.index;
          lastSelectedIds = [item.index];
          uiShowTreeCtxMenu(e.clientX, e.clientY, item.index);
        };

        const className =
          "file-tree-item" +
          (context.isSelected ? " is-selected" : "") +
          (context.isFocused ? " is-focused" : "");

        const indent = Math.max(0, (depth || 0)) * 14; // thụt lề

        let titleNode = title;

        if (context.isRenaming) {
          titleNode = React.createElement(
            "span",
            {
              ref: (el) => {
                if (!el) return;

                const inp = el.querySelector("input,textarea");
                if (!inp) return;

                // chỉ xử lý 1 lần cho input này
                if (inp.dataset.inoSelDone === "1") return;
                inp.dataset.inoSelDone = "1";

                const applySelection = () => {
                  inp.focus();

                  const val0 = inp.value ?? "";
                  const val = String(val0).trim();           // bỏ khoảng trắng thừa
                  const lower = val.toLowerCase();

                  const exts = [".ino", ".bduino", ".yaml"];
                  const matched = exts.find(ext => lower.endsWith(ext));

                  if (matched) {
                    const end = Math.max(0, val.length - matched.length);
                    try {
                      // nếu trim làm đổi độ dài, cập nhật value để selection đúng
                      if (inp.value !== val) inp.value = val;
                      inp.setSelectionRange(0, end);
                    } catch (e) {
                      try { inp.select(); } catch (e2) { }
                    }
                  } else {
                    try { inp.select(); } catch (e) { }
                  }
                };

                // chạy sau khi input render xong
                requestAnimationFrame(() => {
                  applySelection();

                  // chạy lại sau đó để tránh bị thư viện ghi đè selection
                  setTimeout(applySelection, 30);
                });
              }
            },
            title
          );
        }

        return React.createElement(
          "li",
          { ...context.itemContainerWithChildrenProps, style: { margin: 0 } },
          React.createElement(
            Tag,
            {
              ...context.itemContainerWithoutChildrenProps,
              ...context.interactiveElementProps,
              disabled: context.isRenaming,
              onContextMenu: onCtx,
              className,
              style: {
                border: 0,
                background: "transparent",
                padding: "4px 6px",
                paddingLeft: (6 + indent) + "px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "100%",
                textAlign: "left",
              },
            },
            arrow,
            titleNode
          ),
          children
        );
      },

    },
    React.createElement(Tree, {
      treeId: "tree",
      rootItem: leanfs.getRoot(),
      treeLabel: "Files",
    })
  )
);

// Initial focus file
pendingTreeFocusId = initialOpenId;
if (initialOpenId) {
  await globalEditor.openItem(initialOpenId);
}

function NameEnsureExtension(itemUUID, Extension) {

  let currentName = String(leanfs.getName(itemUUID));

  // nếu đã có .ino thì giữ nguyên
  if (currentName.toLowerCase().endsWith(Extension)) return currentName;

  // không có đuôi → tự thêm .ino
  return currentName + Extension;
}

function cooldownButton(btn, delay = 1000) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, delay);
}