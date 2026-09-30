// ============================================================
// Leanbot IDE Event (ARDUINO)
// ============================================================
// import { nanoid } from "nanoid";
import { customAlphabet } from 'nanoid'
// import { sleep } from "./helpers.js";

const SequenceKey = "IdeEvent_Sequence";
const IDE_idKey = "IdeEvent_ID";



export function LogIdeEvent(event = {}) {
  try {
    const sequence = Number(localStorage.getItem(SequenceKey) || 0);
    localStorage.setItem(SequenceKey, sequence + 1);

    // common fields (giống prod: ide_log.js + function.js)
    event.objectname = "ide2";
    event.sequence = sequence;
    event.nguoitao = getusername();
    event.ngaytao = getLocalTime();
    event.trangthai = 0;
  } catch (e) {
    console.warn("LogIdeEvent: init failed", e);
    return;
  }

  try {
    console.log(
      `IdeEvent
        objectpk   : ${event.objectpk}
        thongtin   : ${shorten(event.thongtin)}
        noidung    : ${shorten(event.noidung)}
        server_    : ${event.server_}
        t_phanhoi  : ${event.t_phanhoi}
        objectname : ${event.objectname}
        sequence   : ${event.sequence}
        ngaytao    : ${event.ngaytao}
        nguoitao   : ${event.nguoitao}
        trangthai  : ${event.trangthai}`
    );
  } catch (e) {
    console.warn("LogIdeEvent: console.log failed", e);
  }

}



function shorten(text, len = 64) {
  const normalized = String(text ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > len
    ? normalized.slice(0, len)
    : normalized;
}

// Custom NanoID alphabet: use Base62 character set
// 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
//
// References:
// - https://en.wikipedia.org/wiki/Base62
// - https://github.com/ai/nanoid#custom-alphabet-or-size

function getIdeID() {
  if (!localStorage.getItem(IDE_idKey)) {
    const alphabet62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const nanoid = customAlphabet(alphabet62, 6)
    localStorage.setItem(IDE_idKey, nanoid());
  }
  return localStorage.getItem(IDE_idKey); // Only take first 6 chars
}

function getusername() {
  return localStorage.getItem("username") + ' ' + getIdeID();
}

function getLocalTime() { // get local time in ISO format (yyyy-mm-ddThh:mm:ssZ) (Z = +-hh:mm)
  // ref: https://stackoverflow.com/questions/12413243/javascript-date-format-like-iso-but-local
  return new Date().toLocaleString('sv', { timeZoneName: 'longOffset' }).replace(' ', 'T').replace(' GMT', '');
}