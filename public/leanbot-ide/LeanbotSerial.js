import { LeanbotCompiler } from "./LeanbotCompiler.js";
import { sleep } from "./helpers.js"

export class LeanbotSerial {

  // ---- STATIC MEMBERS ----
  static #config = null;


  // ---- PUBLIC STATIC METHODS ----
  static setConfig(config) {
    LeanbotSerial.#config = config;
    Uploader.setConfig(config.Uploader);
  }

  // ---- PRIVATE MEMBERS ----
  #device = null;
  #SerialPipe_reader = null;
  #SerialPipe_writer = null;

  #requestStartMs = 0;
  #requestEndMs = 0;
  #connectingStartMs = 0;
  #connectingEndMs = 0;
  #disconnectStartMs = 0;
  #disconnectEndMs = 0;
  #setupStartMs = 0;

  #currentCompilePromise = async () => { };

  // ---- Constructor ----

  SerialApiNotSupported = false;
  SecureContextMissing = false;

  constructor() {

    if (!new.target) {
      throw new Error("LeanbotSerial must be called with 'new'");
    }

    if (!LeanbotSerial.#config) {
      throw new Error("Missing LeanbotSerial #config");
    }

    // Callbacks
    this.onConnect = async () => { };
    this.onDisconnect = async () => { };
    this.onConnectError = async () => { };
    this.onSelect = async () => { };
    this.onCancel = async () => { };
    this.onScanBegin = async () => { };

    this.LeanbotName = localStorage.getItem(LeanbotSerial.#config.CURRENT_LB_NAME) || null;
    this.onDetectLeanbotName = (leanbotName) => {
      console.log('Detect new Leanbot: ', leanbotName);
      this.LeanbotName = leanbotName;
      localStorage.setItem(LeanbotSerial.#config.CURRENT_LB_NAME, leanbotName);
    };

    this.Serial = new Serial(this);
    this.Uploader = new Uploader(this);
    this.Compiler = new LeanbotCompiler();
  }

  // --- PRIVATE METHODS ---

  async #returnConnectResult(success, exception) {
    if (!success) {
      await this.onConnectError(exception);
    }
    return { success, exception };
  }

  async #setupConnections({ baudRate = LeanbotSerial.#config.DEFAULT_BAUDRATE, bufferSize = LeanbotSerial.#config.DEFAULT_BUFFER_SIZE } = {}) {

    /** ---------- SERIAL PORT CONNECTION ---------- */

    const t1 = performance.now();
    await this.#device.open({ baudRate, bufferSize });
    const t2 = performance.now();
    console.log(`[SETUP CONNECT] Serial port connection established in ${(t2 - t1).toFixed(2)} ms`);

    await this.#device.setSignals({ dataTerminalReady: true });

    /** ---------- SETUP SUB-CONNECTIONS ---------- */

    this.#startSerialMonitor();

    /** ---------- CALLBACKS ---------- */

    console.log("Device connected:", this.#device.getInfo());
    await this.onConnect();

    /** --------- SAVE DEVICE INFO TO LOCALSTORAGE --------- */
    const current = this.#device?.getInfo?.();
    const saved = JSON.parse(localStorage.getItem(LeanbotSerial.#config.LS_KEY_LAST_DEVICE));

    if (!saved || current.usbVendorId !== saved.usbVendorId || current.usbProductId !== saved.usbProductId) {
      console.log("Saving device to localStorage:", current);
      localStorage.setItem(LeanbotSerial.#config.LS_KEY_LAST_DEVICE, JSON.stringify(current));
    }
  }

  #releaseReadSerialStream() {
    try {
      this.#SerialPipe_reader?.releaseLock();
      this.#SerialPipe_reader = null;
    } catch { } // not throw
  }

  async #releaseWriteSerialStream() {
    try {
      await this.#SerialPipe_writer?.close(); // force to flush OS buffer (ref: https://github.com/WICG/serial/issues/166)
      this.#SerialPipe_writer?.releaseLock();
      this.#SerialPipe_writer = null;
    } catch { } // not throw
  }

  // ---- PUBLIC METHODS ----

  isConnected() {
    // ref: https://github.com/WICG/serial/issues/100
    // readable and writable attributes will be non-null if the port is opened.
    return !!this.#device?.readable && !!this.#device?.writable;
  }

  isDeviceExist() {
    return this.#device !== null;
  }

  getLeanbotCOMPortInfo() {
    if (this.isDeviceExist()) return this.#device.getInfo();

    const lastDevice = localStorage.getItem(LeanbotSerial.#config.LS_KEY_LAST_DEVICE);
    return lastDevice ? JSON.parse(lastDevice) : null;
  }

  getLeanbotName() {
    if (!this.#device) return null;
    return this.LeanbotName;
  }

  clearDevice() {
    this.#device = null;
    localStorage.removeItem(LeanbotSerial.#config.LS_KEY_LAST_DEVICE);
  }

  async cancelReadSerialStream() {
    try { await this.#SerialPipe_reader?.cancel(); } catch { }
  }

  // --- Connect Methods --- //

  async connect() {

    this.#connectingStartMs = performance.now();
    this.#connectingEndMs = 0;

    // Open chooser
    try {
      if (this.SecureContextMissing) {
        return this.#returnConnectResult(
          false,
          "Web Serial API requires a secure context."
        );
      }

      if (this.SerialApiNotSupported) { // auto failed when not supported
        return this.#returnConnectResult(
          false,
          "Web Serial API is unavailable in this browser."
        );
      }

      this.#requestStartMs = performance.now();
      this.#requestEndMs = 0;

      this.onScanBegin();

      // Empty filters array allows any COM port to be selected
      this.#device = await globalThis.navigator.serial.requestPort({ filters: [] });

      this.onSelect(this.#device.getInfo());

      this.#requestEndMs = performance.now();

      await this.#setupConnections();

      return this.#returnConnectResult(true, null);

    } catch (error) {
      console.log("connect error:", error);

      if (error.name === "NotFoundError") {
        // ref: https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort#exceptions
        this.onCancel();
        return { success: false, exception: "cancelled" }; // only return, not trigger onConnectError
      }

      return this.#returnConnectResult(false, `Connection failed: ${error.message || "Unknown error"}`);
    }
  }

  async reconnect() {
    this.#connectingStartMs = performance.now();
    this.#connectingEndMs = 0;
    try {
      if (this.isConnected()) {
        // if already connected, just return success
        return this.#returnConnectResult(true, null);
      }

      if (this.isDeviceExist()) { // recover this.#device (as close port will terminate readable/writeable stream)
        const ports = await globalThis.navigator.serial.getPorts(); // get ports that are already opened in this tab (ref: https://wicg.github.io/serial/#getports-method)
        console.log("Available ports:", ports);
        // const lastConnectedDevice = JSON.parse(localStorage.getItem(LeanbotSerial.#config.LS_KEY_LAST_DEVICE));
        const lastConnectedDevice = this.#device.getInfo();
        if (!lastConnectedDevice) {
          return this.#returnConnectResult(false, "No last connected device found. Please connect a device first.");
        }
        this.#device = ports.find((d) => {
          const info = d.getInfo();
          return lastConnectedDevice.usbProductId === info.usbProductId && lastConnectedDevice.usbVendorId === info.usbVendorId;
        });
        // just reopen connection
        await this.#setupConnections();
        return this.#returnConnectResult(true, null);
      }

      // call connect if there is no device selected before
      return await this.connect();
    }
    catch (error) {
      console.log("reconnect error:", error);
      return this.#returnConnectResult(false, `Reconnect failed: ${error.message || "Unknown error"}`);
    }
  }

  async disconnect() {
    this.#disconnectStartMs = performance.now();
    this.#disconnectEndMs = 0;
    try {
      // no device
      if (!this.isDeviceExist())
        return this.#returnConnectResult(false, "No device found to disconnect. Please connect a device first.");

      // // already disconnected
      // if (!this.isConnected())
      //   return this.#returnConnectResult(false, "Device is not currently connected.");

      // ref: https://developer.chrome.com/docs/capabilities/serial
      // call reader.cancel() as before. Then call writer.close() and port.close().
      // This propagates errors through the transform streams to the underlying serial port
      await this.cancelReadSerialStream();

      this.#releaseReadSerialStream();
      await this.#releaseWriteSerialStream();

      await this.#device.close();
      return this.#returnConnectResult(true, null);
    }
    catch (error) {
      return this.#returnConnectResult(false, `Disconnect failed: ${error.message || "Unknown error"}`);
    }
    finally {
      await this.onDisconnect();
    }
  }

  async checkWebSerialAvailability() {
    this.SerialApiNotSupported = !('serial' in navigator);

    this.SecureContextMissing = !(globalThis.isSecureContext === true);

    if (this.SerialApiNotSupported) {
      return;
    }
  }

  /** ----------------- Handle Serial Data ----------------- */
  /**
   * Continuously reads data from the serial stream until:
   * - `onReceivedData()` returns `true` or `false`,
   * - the stream is aborted,
   * - or the device disconnects.
   *
   * The reader lock is automatically released when the stream ends.
   *
   * @param {(value: Uint8Array) => Promise<boolean|null>|boolean|null} onReceivedData
   * Called for each received data chunk.
   * - Return `true` to stop reading successfully.
   * - otherwise continue reading.
   *
   * @param {AbortSignal} [abortSignal]
   * Optional signal used to abort the reading stream.
   *
   * @returns {Promise<boolean>}
   * `true` if stopped successfully,
   * `false` if stopped by failure, aborted, disconnected, or stream closed.
   */

  async readSerialStream(onReceivedData = async (value) => { }, abortSignal = null) {
    // ref: https://wicg.github.io/serial/#readable-attribute

    try {
      this.#SerialPipe_reader = this.#device.readable.getReader();

      // abort mid-stream
      // to release the stream for other reading stream
      abortSignal?.addEventListener('abort', async () => {
        await this.cancelReadSerialStream();
      }, { once: true });

      while (true) {
        const { value, done } = await this.#SerialPipe_reader.read();

        if (done) {
          // |reader| has been canceled.
          return false;
        }
        // Do something with |value|...
        if (value) {
          // console.log("Received data from serial port:", value);
          const result = await onReceivedData(value);
          if (result === true) { // fullfil desired result
            await this.cancelReadSerialStream(); // user requests to stop reading
            return true;
          }
        }
      }
    } catch (error) {
      // Handle |error|...
      console.log("Error reading from serial port:", error);
      return false;
    } finally {
      this.#releaseReadSerialStream();

      if (!this.#device || !this.#device.readable) {
        // close port if device is lost (to detect device disconnected, like when device's USB pluged out)
        console.log('serial pipe terminated');
        await this.disconnect();
      }
    }
  }

  /**
   * Waits until the expected number of bytes is received from the serial stream.
   *
   * @param {number} expectedDataLength Number of bytes to wait for.
   * @param {number} [timeout=1000] Maximum wait time in milliseconds.
   * @param {AbortSignal|null} [abortSignal=null] Optional signal to abort reading.
   *
   * @returns {Promise<number[]>}
   * Received data on success, or empty data on timeout/failure.
   */
  async waitForSerialData(expectedDataLength, timeout = 1000, abortSignal = null) {

    let ReceivedData = [];
    let offset = 0;

    const readUntilDataReceived = async () => this.readSerialStream(
      async (value) => {
        ReceivedData.push(...value);
        offset += value.length;
        if (offset >= expectedDataLength) {
          return true; // Recevied enough data
        }
      }
      , abortSignal
    );

    const result = await Promise.race([
      readUntilDataReceived(),
      sleep(timeout),
    ]);

    // console.log('Result: ', result);

    if (result === undefined) { // timeout waiting for data
      await this.cancelReadSerialStream();
      return [];
    }

    return ReceivedData;
  }

  /**
   * Temporarily drains/discards incoming serial data for a fixed duration.
   * Useful before switching serial communication modes.
   *
   * @param {number} [timeout=100] Drain duration in milliseconds.
   * @param {AbortSignal|null} [abortSignal=null] Optional signal to abort flush.
   * @returns {Promise<void>}
   */
  async flushSerialReader(timeout = 100, abortSignal = null) {
    const flushSerialDonePromise = async () => {
      await sleep(timeout);
      await this.cancelReadSerialStream();
    }

    await Promise.allSettled([flushSerialDonePromise(), this.readSerialStream(
      async () => {
        return false; // keep the reading loop coming
      }
      , abortSignal
    )]);
  }

  /**
   * Sends a packet to the serial port and closes the writer
   * to ensure buffered data is flushed to the OS/device.
   *
   * @param {Uint8Array|number[]} packet Data packet to send.
   *
   * @returns {Promise<void>}
  */
  async SerialSend(packet) {
    if (this.#device?.writable == null) {
      console.warn(`unable to find writable port`);
      return;
    }

    this.#SerialPipe_writer = this.#device.writable.getWriter();
    // ref: https://developer.chrome.com/docs/capabilities/serial#write-port
    await this.#SerialPipe_writer.write(packet);
    await this.#releaseWriteSerialStream();
  }

  /**
   * Resets the device by toggling the DTR signal.
   * Low -> high (duration 10ms)
   * @returns {Promise<void>}
   */
  async resetLeanbot() {
    // ref: https://developer.mozilla.org/en-US/docs/Web/API/SerialPort/setSignals
    // toggle DTR: low → high
    await this.#device.setSignals({ dataTerminalReady: false });
    await sleep(10);
    await this.#device.setSignals({ dataTerminalReady: true });
  }

  // ==== start Serial Monitor loop ==== //
  // run until an upload session occur

  #startSerialMonitor(abortSignal = null) {
    console.log("Serial Monitor started");
    console.log("readable: ", this.#device.readable);
    console.log("writable: ", this.#device.writable);
    return this.Serial.startReadSerialStream(() => this.Uploader.isUploading, abortSignal);
  }

  // ==== compile and upload 2 === //

  async compileAndUpload2(SourceCode, compileServer) {
    const controller = new AbortController(); // abortSignal NOT YET TESTED
    const signal = controller.signal;

    let uploadCompileInfo = null;

    const compilePromise = this.Compiler.compile(SourceCode, compileServer);

    this.#currentCompilePromise = compilePromise;

    compilePromise.then(result => { // take compile result when done
      uploadCompileInfo = result.log;
    });

    compilePromise.finally(() => {
      this.#currentCompilePromise = null; // cleanup when done
    });

    const result = await this.Uploader.upload2(compilePromise, signal);
    result.uploadCompileInfo = uploadCompileInfo;
    await this.flushSerialReader(); // flush the reader buffer (if any) in 100ms
    this.#startSerialMonitor(); // upload done => restart serial monitor
    return result;
  }

  async uploadFlush() {
    try { await this.#currentCompilePromise; } catch (e) { } /// tránh throw (nếu có)
  }

  // --- Time Measurement Methods --- //

  setupConnectTimeMs() {
    if (this.#connectingEndMs === 0) {
      return performance.now() - this.#setupStartMs;
    }
    return this.#connectingEndMs - this.#setupStartMs;
  }

  connectingTimeMs() {
    if (this.#connectingEndMs === 0) {
      return performance.now() - this.#connectingStartMs;
    }
    return this.#connectingEndMs - this.#connectingStartMs;
  }

  requestTimeMs() {
    if (this.#requestEndMs === 0) {
      return performance.now() - this.#requestStartMs;
    }
    return this.#requestEndMs - this.#requestStartMs;
  }

  disconnectingTimeMs() {
    if (this.#disconnectEndMs === 0) {
      return performance.now() - this.#disconnectStartMs;
    }
    return this.#disconnectEndMs - this.#disconnectStartMs;
  }

}

// ======================================================
// 🔹 SUBMODULE: SERIAL
// ======================================================

class Serial {

  // --- static member --- // 
  #leanbot = null;

  // Queue nhận dữ liệu
  #SerialPipe_rxQueue = [];
  #SerialPipe_rxTSQueue = [];
  #SerialPipe_busy = false;
  #SerialPipe_buffer = "";
  #SerialPipe_lastTS = null;

  // -- constructor -- //

  constructor(leanbot) {
    this.#leanbot = leanbot;
    /** Callback khi nhận Rx data Serial */
    this.onMessage = () => { };

    /** Callback chuyển tiếp dữ liệu thô sang Uploader */
    this.onForwardReponse = async () => { };
  }

  // --- Public Method --- //
  async startReadSerialStream(stopCondition = () => { }, abortSignal = null) {
    const stopStreamPromise = async () => {
      while (stopCondition() === false && !abortSignal?.aborted) { // poll until stop condition is met
        await sleep(5);
      }
      await this.#leanbot.cancelReadSerialStream(); // cancel the reading process, avoid the handler below receving any more data
      console.log("Serial Monitor stopped");
    };

    const onReceivedData = async (bytes) => {
      const SerialPacket = new TextDecoder().decode(bytes);
      const Packet_TS = new Date();
      void this.#SerialPipe_onReceiveFromLeanbot(SerialPacket, Packet_TS).catch((err) => {
        console.log("Serial receive handler error:", err);
      });
    }

    // wait both reading and stop stream to finish
    return Promise.allSettled([stopStreamPromise(), this.#leanbot.readSerialStream(onReceivedData, abortSignal)]);
  }

  /** Gửi dữ liệu qua đặc tính Serial
   * @param {string|Uint8Array} data - dữ liệu cần gửi
   */
  async send(data) {
    try {
      // Chuyển dữ liệu sang Uint8Array nếu là chuỗi
      const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await this.#leanbot.SerialSend(buffer);
    } catch (e) {
      console.log(`Serial.Send Error: ${e}`);
    }
  }

  // --- PRIVATE METHODS ---
  #SerialPipe_rxQueueHandler() {
    if (this.#SerialPipe_busy) return;
    this.#SerialPipe_busy = true;

    while (this.#SerialPipe_rxQueue.length > 0) {
      const BLEPacket = this.#SerialPipe_rxQueue.shift();
      this.#SerialPipe_buffer += BLEPacket;

      const PacketTS = this.#SerialPipe_rxTSQueue.shift();

      let lines = this.#SerialPipe_buffer.split("\n");
      this.#SerialPipe_buffer = lines.pop();

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i] + "\n";
        let timeGapMs = this.#SerialPipe_lastTS ? (PacketTS - this.#SerialPipe_lastTS) : 0;

        if (line === "AT+NAME\r\n") continue;
        if (line === "LB999999\r\n") {
          line = ">>> Leanbot ready >>>\n";
          this.onMessage(line, PacketTS, timeGapMs);
          this.onMessage("\n", PacketTS, 0);
          continue;
        }

        const strId = line.match(/\b(Leanbot|LB|Lb)(_?)(\d{4})(.*)/g);
        if (strId) {
          this.#leanbot.onDetectLeanbotName(strId.toString());
        }

        this.onMessage(line, PacketTS, timeGapMs);
        this.#SerialPipe_lastTS = PacketTS;
      }
    }

    this.#SerialPipe_busy = false;
  }

  // ========== Serial Pipe Communication ==========
  async #SerialPipe_onReceiveFromLeanbot(BLEPacket, Packet_TS) {
    this.#SerialPipe_rxQueue.push(BLEPacket);
    this.#SerialPipe_rxTSQueue.push(Packet_TS);
    setTimeout(() => this.#SerialPipe_rxQueueHandler(), 0);
  }
}

// ======================================================
// 🔹 SUBMODULE: UPLOADER
// ======================================================

class Uploader {

  static #config = null;

  static setConfig(config) {
    Uploader.#config = config;
    console.log('Uploader.#config: ', Uploader.#config);
  }

  #leanbot = null;

  // Upload state
  totalBytesData = 0;
  totalPackets = 0;

  isUploading = false;
  #isPreUpload = true;
  #UploadPackets = [];
  #pageBuffer = [];

  #enterBoothStartMs = 0;
  #enterBoothEndMs = 0;

  #uploadStartMs = 0;
  #uploadEndMs = 0;

  #CompileAndUploadStartMs = 0;
  #CompileAndUploadEndMs = 0;

  #responseACK = new Uint8Array([0x14, 0x10]); // STK_OK

  // ===== User Callbacks =====
  onMessage = () => { };
  onTransfer = () => { };
  onWrite = () => { };
  onVerify = () => { };
  onSuccess = async () => { };
  onError = async () => { };
  onCancelUpload = async () => { };
  onUploadAbnormal = async () => { };

  onEnterBootloader = async () => { };
  onUploadStartWrite = async () => { };
  onUploadStartVerify = async () => { };

  isTransferring = null;
  onTransferError = () => { };
  onWriteError = () => { };
  onVerifyError = () => { };

  //////////////////////////////////////////////////////////////////////////////

  #isACK(bytes) {
    if (bytes.length !== 2) return false;
    return bytes[0] === this.#responseACK[0]
      && bytes[1] === this.#responseACK[1];
  }

  /* ------------------- CONSTRUCTOR ------------------- */
  constructor(leanbot) {

    if (!Uploader.#config) {
      throw new Error("Missing Uploader #config");
    }

    this.#leanbot = leanbot;     // dùng được hàm của LeanbotBLE
  }

  /* ------------------- UPLOAD ver 2 (experimental) ------------------- */

  /* === #EnterBootloader flow: ====
    if(!leanbot.isConnected())
      reconnect()

      if reconnect failed
        throw err

    isUploading = true;      // set Uploading = true để stop luồng serial monitor.

    resetLeanbot()           // toogle xung DTR low -> sleep 10 ms -> high để reset nano 

    // Sau khi reset, cần chờ ~400ms để nano ổn định (giống trong code nạp lbEsp32)

    flushSerialReader(100ms)     // flush hết data còn sót lại trong reader buffer trong ~100ms

    sleep(300ms)                 // chờ 300ms còn lại
      
    sendAndWaitSync()            // 1 time 
  
    onEnterBootloader()                       // callback for use in main.js
  
  // Không có retry ở trong hàm.
  // upload2 sẽ gọi tối đa 3 lần jdyEnterBoothloader để retry.
  */

  async #EnterBootloader(abortSignal) {

    if (!this.#leanbot.isConnected()) {
      console.log("[JDY UPLOAD 2] Reconnecting to enter bootloader...");
      const connectResult = await this.#leanbot.reconnect();
      console.log("[JDY UPLOAD 2] Reconnect result:", connectResult?.exception);
      // if(!connectResult.success)throw new Error("Failed to reconnect to enter bootloader");
      if (!connectResult.success) throw new Error(connectResult.exception);
    }

    this.isUploading = true;

    console.log("[JDY UPLOAD 2] Reset Nano...");
    await this.#leanbot.resetLeanbot();

    // after reset, wait near 400ms until nano connect become stable (same as lbEsp32 module firmware).
    await this.#leanbot.flushSerialReader(); // flush the reader buffer (if any) in 100ms
    await sleep(300); // do nothing

    console.log("[JDY UPLOAD 2] Wait for getSync to enter bootloader...");

    // wait until getSync Success (means entered bootloader)
    await this.#sendAndWaitSync(abortSignal);
    this.#enterBoothEndMs = performance.now();

    console.log("[JDY UPLOAD 2] Entered bootloader successfully!");

    await this.onEnterBootloader();  // callback for use in main.js
  }

  /* === #upload2 flow: ====
  try{
      Try max 3 times to Enter Bootloader
        try #EnterBootloader()                    // wrap trong try-catch, nếu failed (throw err) < 3 lần thì được thử lại.
        
        if failed 3 times                      // failed 3 lần jdyEnterBoothloader => throw err để ngừng upload.
          throw err
  
      every 250ms until compilePromise          // to keep Nano stay in bootloader until hex file is ready
        sendAndWaitSync()
   
      get HexText from compilePromise           // sau khi compile thu được hex text (dạng string)
      
      convert HexText => HexPacket              // chia hexText => các gói 128 byte.
      
      upload HexFile                            // bắt đầu upload
  
  }catch{  }                                     // bất cứ throw nào => dừng uplaod ngay.
  
  finally { abortAll}                            // xóa các cờ nội bộ (hoặc gọi abort Signal) để reset jdyUpload về trạng thái mặc định.
  */

  async upload2(compilePromise, abortSignal) { // abortSignal NOT YET TESTED

    this.#CompileAndUploadStartMs = performance.now();
    this.#CompileAndUploadEndMs = 0;

    try {
      this.#isPreUpload = true;

      if (this.#leanbot.SerialApiNotSupported ||
        this.#leanbot.SecureContextMissing
      ) {
        await this.onCancelUpload('Serial API is not available or not supported');
        return { success: false, exception: 'cancelled' };
      }

      // Try max 3 times to Enter Bootloader (not implement retry mechanism yet)
      const MAX_ATTEMPTS = 3;
      let attempt = 0;

      for (; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          await this.#EnterBootloader(abortSignal);
          console.log(`[JDY UPLOAD 2] Enter bootloader success on attempt ${attempt + 1}, now in bootloader mode.`);
          break; // break if success
        }
        catch (err) {
          console.log(`[JDY UPLOAD 2] Enter bootloader attempt ${attempt + 1} catch:`, err);

          if (err?.message === 'cancelled') { // cancel => stop entirely
            await this.onCancelUpload('Request cancelled');
            return { success: false, exception: 'cancelled' };
          }

          if (attempt === MAX_ATTEMPTS - 1) {
            throw new Error(`Enter bootloader failed: ${err?.message ?? "unknown"}`);
          }
        }
      }

      // Try send then wait for sync ack until every 500ms until compilePromise done
      console.log("[JDY UPLOAD 2] periodly send and wait Sync to keep Nano stay in bootloader until hex file is ready...");

      const HexText = await this.#waitCompilingWhileSendSync(compilePromise, abortSignal);
      if (HexText === null) {
        // throw new Error("Compile failed");
        await this.onCancelUpload('Compile failed');
        return { success: false, exception: 'cancelled' };
      }

      this.#UploadPackets = convertHexToUploadPackets(HexText);

      console.log("[JDY UPLOAD 2] Hex file is ready, now start upload.");

      this.#uploadStartMs = performance.now();
      this.#uploadEndMs = 0;
      this.#isPreUpload = false;

      // upload HexFile
      await this.#uploadCode();

      console.log("[JDY UPLOAD 2] Upload code done.");
      return { success: true, exception: null };
    }
    catch (err) {
      console.log("[JDY UPLOAD 2] Upload error:", err?.message);
      await this.onError(err?.message);
      return { success: false, exception: err?.message };
    }
    finally {

      this.#uploadEndMs = performance.now();
      this.#CompileAndUploadEndMs = this.#uploadEndMs;
      // console.log(`[JDY UPLOAD 2] Upload elapsed time: ${(this.#uploadEndMs - this.#uploadStartMs).toFixed(2)} ms`);
      this.isUploading = false; // upload session has been ended.
    }
  }

  async #waitCompilingWhileSendSync(compilePromise, abortSignal) {

    while (true) {

      const result = await Promise.race([
        compilePromise,
        sleep(Uploader.#config.syncIntervalMs),
      ]);

      // console.log(result)
      if (result !== undefined) {   // undefined if timeout after SYNC_INTERVAL
        return result.hexText;
      }

      // sendAndWaitSync() here
      await this.#sendAndWaitSync(abortSignal);
    }
  }

  /* ------------------- GET SYNC ------------------- */
  async #sendAndWaitSync(abortSignal) {

    // ref: https://ww1.microchip.com/downloads/en/Appnotes/doc2591.pdf

    const getSyncCmd = new Uint8Array([0x30, 0x20]);
    console.log("[SYNC] Sent GET_SYNC command");

    await this.#leanbot.SerialSend(getSyncCmd); // send getSynnc command 

    // Wait for ACK
    const respond = await this.#leanbot.waitForSerialData(2, Uploader.#config.getSyncTimeoutMs, abortSignal);
    const ok = this.#isACK(respond);
    if (!ok) {
      console.log("[SYNC] Invalid SYNC ACK response");
      this.#emitUploadMessage("Get Sync failed");
      throw new Error("Get sync failed");
    }
    console.log("[SYNC] SYNC ACK received!");
  }

  /* ------------------- LOAD ADDRESS ------------------- */
  async #loadAddress(pageIndex, abortSignal) {

    // ref: https://ww1.microchip.com/downloads/en/Appnotes/doc2591.pdf

    const byteAddress = pageIndex * Uploader.#config.pageSizeByte;
    const wordAddress = byteAddress >> 1;
    const addrLow = wordAddress & 0xFF;
    const addrHigh = (wordAddress >> 8) & 0xFF;

    // STK_LOAD_ADDRESS + addrLow + addrHigh + STK_CRC_EOP
    const cmd = new Uint8Array([0x55, addrLow, addrHigh, 0x20]);

    console.log(`[LOAD] Sent LOAD_ADDRESS for page ${pageIndex}`);
    await this.#leanbot.SerialSend(cmd); // send load address command

    // wait for ack
    const respond = await this.#leanbot.waitForSerialData(2, Uploader.#config.loadAddressTimeoutMs, abortSignal);
    const ok = this.#isACK(respond);
    if (!ok) {
      console.log("[LOAD] Invalid Load Address ACK response");
      throw new Error("Load address failed");
    }
    console.log("[LOAD] Load Address ACK received!");
  }

  /* ------------------- READ FLASH ------------------- */
  #isReadFlashACK(respond) {
    if (respond.length !== Uploader.#config.pageSizeByte + 2) return false; // size is wrong
    // expect respond: sync - data[] - ok
    if (respond[0] === this.#responseACK[0] &&
      respond[Uploader.#config.pageSizeByte + 1] === this.#responseACK[1]) {
      return true;
    }
    return false;
  }

  async #readFlash(pageIndex = 0, abortSignal) {

    // ref: https://ww1.microchip.com/downloads/en/Appnotes/doc2591.pdf
    // 1) LOAD_ADDRESS
    await this.#loadAddress(pageIndex, abortSignal);

    // 2) STK_READ_PAGE + len_hi + len_lo + 'F' + STK_CRC_EOP
    const readPageCmd = new Uint8Array([0x74, 0x00, Uploader.#config.pageSizeByte, 0x46, 0x20]);
    this.#pageBuffer = [];

    console.log(`[READ] Sent READ_PAGE command for page ${pageIndex}`);
    await this.#leanbot.SerialSend(readPageCmd);

    // wait for ack (sync - data[] - ok)
    this.#pageBuffer = await this.#leanbot.waitForSerialData(Uploader.#config.pageSizeByte + 2, Uploader.#config.readFlashTimeoutMs, abortSignal);
    const ok = this.#isReadFlashACK(this.#pageBuffer);
    if (!ok) {
      console.log("[READ] Invalid Read Flash ACK response");
      throw new Error("Read flash failed");
    }
    console.log("[READ] Read Flash ACK received!");
    this.#pageBuffer = this.#pageBuffer.slice(1, -1); // loại bỏ byte ACK đầu và cuối
    return this.#pageBuffer;
  }

  /* ------------------- WRITE FLASH ------------------- */
  async #writeFlash(pageIndex, pageData, abortSignal) {

    // ref: https://ww1.microchip.com/downloads/en/Appnotes/doc2591.pdf

    if (!(pageData instanceof Uint8Array) || pageData.length !== Uploader.#config.pageSizeByte) {
      throw new Error(`pageData must be Uint8Array[${Uploader.#config.pageSizeByte}]`);
    }
    // 1) LOAD_ADDRESS
    await this.#loadAddress(pageIndex, abortSignal);

    // 2) PROG PAGE
    const progPageHeader = new Uint8Array([0x64, 0x00, Uploader.#config.pageSizeByte, 0x46]); // STK_PROG_PAGE + len_hi + len_lo + 'F'
    const progPageTail = new Uint8Array([0x20]); // STK_CRC_EOP

    console.log(`[WRITE] Sending PROG_PAGE command for page ${pageIndex}`);

    await this.#leanbot.SerialSend(progPageHeader);
    await this.#leanbot.SerialSend(pageData);
    await this.#leanbot.SerialSend(progPageTail);

    this.#emitUploadMessage(`Receive ${pageIndex + 1}`);

    // wait for ack
    const respond = await this.#leanbot.waitForSerialData(2, Uploader.#config.writeFlashTimeoutMs, abortSignal);
    const ok = this.#isACK(respond);
    if (!ok) {
      console.log("[WRITE] Invalid Write Flash ACK response");
      this.#emitUploadMessage("Write failed");
      throw new Error("Write flash failed");
    }
    console.log("[WRITE] Write Flash ACK received!");
    this.#emitUploadMessage(`Write ${(pageIndex + 1) * Uploader.#config.pageSizeByte} bytes`);
  }

  /* ------------------- WRITE READ_PAGE ------------------- */

  async #writeAllPages(pages) {
    const t1 = performance.now();
    try {
      await this.onUploadStartWrite();
      for (const page of pages) {
        await this.#writeFlash(page.pageIndex, page.bytes);
      }
    }
    catch (e) {
      this.#emitUploadMessage("Upload failed"); // print message log and turn progress bar to red
      throw e; // re-throw to end upload process
    }
    finally {
      const t2 = performance.now();
      console.log(`[UPLOAD] Write all pages completed in ${sec3FromMs(t2 - t1)} s`);
    }
  }

  /* ------------------- VERIFY READ_PAGE ------------------- */
  /**
   * mode = "full"   → verify tất cả page
   * mode = "sample" → verify 1/16 số page, random
   */
  async #verifyUploadedCode(mode = "sample") {
    const t1 = performance.now();
    try {
      const pages = this.#buildPagesFromBlocks(this.#UploadPackets, Uploader.#config.pageSizeByte);
      const totalPages = pages.length;

      if (totalPages === 0) {
        throw new Error("[VERIFY] No pages to verify.");
      }

      let pageIndices = [];

      /* ---------------- SELECT VERIFY MODE ---------------- */
      if (mode === "full") {
        console.log(`[VERIFY] Mode FULL: verifying all ${totalPages} pages...`);
        pageIndices = [...Array(totalPages).keys()]; // 0 → totalPages-1

      } else if (mode === "sample") {
        const sampleCount = Math.max(1, Math.floor(totalPages / 16));
        const selected = new Set();

        while (selected.size < sampleCount) {
          const r = Math.floor(Math.random() * totalPages);
          selected.add(r);
        }
        pageIndices = [...selected];
        console.log(`[VERIFY] Mode SAMPLE: verifying ${pageIndices.length}/${totalPages} random pages (~1/16)`);
      }
      else {
        // console.log(`[VERIFY] Invalid mode "${mode}". Expected "full" or "sample".`);
        throw new Error(`Invalid mode "${mode}". Expected "full" or "sample".`);
      }

      /* ---------------- EXECUTE VERIFY ---------------- */
      let verifyStep = 0;

      await this.onUploadStartVerify();

      for (const idx of pageIndices) {
        const page = pages[idx];
        const pageIndex = page.pageIndex;

        console.log(`[VERIFY] Reading page ${pageIndex}...`);
        const deviceData = await this.#readFlash(pageIndex);
        const isSame = this.#comparePage(page.bytes, deviceData);

        if (!isSame) {
          console.log(`[VERIFY] Page ${pageIndex} MISMATCH!`);

          // log byte đầu tiên bị sai
          for (let i = 0; i < page.bytes.length; i++) {
            if (page.bytes[i] !== deviceData[i]) {
              console.log(
                `[VERIFY] Page ${pageIndex}, offset ${i}: ` +
                `expected 0x${page.bytes[i].toString(16).padStart(2, '0')}, ` +
                `got 0x${deviceData[i].toString(16).padStart(2, '0')}`
              );
              break;
            }
          }
          throw new Error(`Verify page ${pageIndex} failed`);
        } else {
          console.log(`[VERIFY] Page ${pageIndex} OK`);
        }
        verifyStep++;
        const verifiedBytes = (verifyStep / pageIndices.length) * this.totalBytesData;
        this.#emitUploadMessage(`Verify ${Math.floor(verifiedBytes)} bytes`);
      }
      console.log(`[VERIFY] Verification SUCCESS (${mode} mode).`);
    }
    catch (e) {
      console.log(`[VERIFY] Verification FAILED (${mode} mode).`);
      this.#emitUploadMessage("Verify failed");
      throw e;
    }
    finally {
      const t2 = performance.now();
      console.log(`[VERIFY] Verify completed in ${sec3FromMs(t2 - t1)} s`);
    }
  }

  /* ------------------- BUILD PAGES FROM BLOCKS ------------------- */
  #buildPagesFromBlocks(mergedBlocks) {
    const pages = {};

    for (const block of mergedBlocks) {
      let addr = block.address;
      for (let i = 0; i < block.bytes.length; i++, addr++) {
        const pageIndex = Math.floor(addr / Uploader.#config.pageSizeByte);
        const pageBase = pageIndex * Uploader.#config.pageSizeByte;
        const pageOffset = addr % Uploader.#config.pageSizeByte;

        if (!pages[pageIndex]) {
          pages[pageIndex] = {
            pageIndex,
            address: pageBase,
            bytes: new Uint8Array(Uploader.#config.pageSizeByte).fill(0xFF),
          };
        }
        pages[pageIndex].bytes[pageOffset] = block.bytes[i];
      }
    }

    return Object.values(pages).sort((a, b) => a.pageIndex - b.pageIndex);
  }

  /* ------------------- SO SÁNH 2 PAGE ------------------- */

  #comparePage(expected, actual) {
    if (!expected || !actual) return false;
    if (expected.length !== actual.length) return false;

    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== actual[i]) return false;
    }
    return true;
  }

  /* ------------------- UPLOAD CODE ------------------- */
  async #uploadCode() {

    console.log("[UPLOAD] Starting code upload...");
    const pages = this.#buildPagesFromBlocks(this.#UploadPackets, Uploader.#config.pageSizeByte);

    // Tổng số byte data thực sự (để UI dùng)
    const totalBytesData = pages.length * Uploader.#config.pageSizeByte;
    this.totalPackets = pages.length;
    this.totalBytesData = totalBytesData;

    // write
    await this.#writeAllPages(pages);

    // Verify
    await this.#verifyUploadedCode();

    // if any error above, we will throw it -> upload catch and terminate the session
    // if nothing happen => upload have successed

    this.#emitUploadMessage(`Upload success, Reset Leanbot`);
    // for now, do nothing, (not send end Connect command or reset nano)
    // just waiting until the bootloader end on its own
  }

  // ========== Message Processor ==========

  #emitUploadMessage(message) {
    if (this) {
      this.#onMessageInternal(message);
      // const timeStamp = ((performance.now() - this.#uploadStartMs) / 1000).toFixed(3);
      // this.onMessage(`[${timeStamp}] ${message}`);
      const timeStamp = performance.now() - this.#uploadStartMs
      this.onMessage({ timeStamp, message });
    }
  }

  async #onMessageInternal(LineMessage) { // use to update ui progress accordingly to line message
    let m = null;

    // Transfer
    if (m = LineMessage.match(/Receive\s+(-?\d+)(?:\s+(\S+))?/i)) {
      const progress = parseInt(m[1]);
      // console.log(`[RECV ${progress}]`);

      this.isTransferring = true;
      if (progress === this.totalPackets) this.isTransferring = false;

      this.onTransfer(progress + 1, this.totalPackets);
      return;
    }

    // Write
    if (m = LineMessage.match(/Write\s+(\d+)\s*bytes/i)) {
      const progress = parseInt(m[1]);
      this.onWrite(progress, this.totalBytesData);
      return;
    }

    // Verify
    if (m = LineMessage.match(/Verify\s+(\d+)\s*bytes/i)) {
      const progress = parseInt(m[1]);
      this.onVerify(progress, this.totalBytesData);
      return;
    }

    // Success
    if (/Upload success/i.test(LineMessage)) {
      await this.onSuccess();
      return;
    }

    // Errors
    if (/Write failed/i.test(LineMessage)) {
      this.onWriteError();
      return;
    }

    if (/Verify failed/i.test(LineMessage)) {
      this.onVerifyError();
      return;
    }
  };

  // ========== Time counter ==========

  elapsedTimeMs() {
    if (this.#isPreUpload) return 0; // pre-upload => always return 0
    if (this.#uploadEndMs === 0) // if upload not done yet
      return performance.now() - this.#uploadStartMs;
    return this.#uploadEndMs - this.#uploadStartMs; // upload already done
  }

  EnterBootloaderTimeMs() {
    if (this.#enterBoothEndMs === 0)
      return performance.now() - this.#enterBoothStartMs;
    return this.#enterBoothEndMs - this.#enterBoothStartMs;
  }

  getTotalTimeMs() {
    if (this.#CompileAndUploadEndMs === 0)
      return performance.now() - this.#CompileAndUploadStartMs;
    return this.#CompileAndUploadEndMs - this.#CompileAndUploadStartMs;
  }
}

// ======================================================
// 🔹 HEX TO BLE PACKETS CONVERTER
// ======================================================
function parseHexLine(LineMessage) {
  if (!LineMessage.startsWith(":")) return null;
  const hex = LineMessage.slice(1);
  const length = parseInt(hex.substr(0, 2), 16);
  const address = parseInt(hex.substr(2, 4), 16);
  const recordType = hex.substr(6, 2);
  const data = hex.substr(8, length * 2);
  const checksum = parseInt(hex.substr(8 + length * 2, 2), 16);
  return { length, address, recordType, data, checksum, hex };
}

// Kiểm tra checksum của dòng HEX
function verifyChecksum(parsed) {
  const { hex, length, checksum } = parsed;
  const allBytes = [];
  for (let i = 0; i < 4 + length; i++) {
    allBytes.push(parseInt(hex.substr(i * 2, 2), 16));
  }
  const sum = allBytes.reduce((a, b) => a + b, 0);
  const calcChecksum = ((~sum + 1) & 0xFF);
  return calcChecksum === checksum;
}

// Chuyển dòng HEX thành mảng byte
function hexLineToBytes(block) {
  const bytes = [];
  for (let i = 0; i < block.length; i += 2) {
    const b = parseInt(block.substr(i, 2), 16);
    if (!isNaN(b)) bytes.push(b);
  }
  return new Uint8Array(bytes);
}

/**
 * Convert Intel HEX text into optimized BLE packets
 * - Parse HEX LinesMessage → validate checksum
 * - Merge consecutive LinesMessage with continuous addresses
 * - Split into BLE packets of max 236 bytes
 * 
 * @param {string} hexText - HEX file content
 * @returns {Uint8Array[]} packets - Array of BLE message bytes ready to send
 */
function convertHexToUploadPackets(hexText) {
  // --- STEP 0: Split HEX text into LinesMessage ---
  const LinesMessage = hexText.split(/\r?\n/).filter(LineMessage => LineMessage.trim().length > 0);

  // --- STEP 1: Parse each HEX LineMessage ---
  const parsedLines = [];
  for (let i = 0; i < LinesMessage.length; i++) {
    const parsed = parseHexLine(LinesMessage[i].trim());
    if (!parsed) continue;
    if (!verifyChecksum(parsed)) continue;
    const bytes = hexLineToBytes(parsed.data);
    parsedLines.push({ address: parsed.address, bytes: bytes });
  }

  // --- STEP 2: Merge consecutive address blocks ---
  const mergedBlocks = [];
  let current = null;

  for (const LineMessage of parsedLines) {
    if (!current) {
      // Dùng spread operator [...] để sao chép dữ liệu, tránh ảnh hưởng mảng gốc
      current = { address: LineMessage.address, bytes: [...LineMessage.bytes] };
      continue;
    }

    const expectedAddr = current.address + current.bytes.length;
    if (LineMessage.address === expectedAddr) {
      current.bytes.push(...LineMessage.bytes);
    } else {
      mergedBlocks.push(current);
      current = { address: LineMessage.address, bytes: [...LineMessage.bytes] };
    }
  }
  if (current) mergedBlocks.push(current);


  console.log("convertHexToUploadPackets: returning mergedBlocks after STEP 2");
  return mergedBlocks;
}

// ======================================================
// 🔹 Console log timeStamp
// ======================================================

function sec3FromMs(ms) {
  return (ms / 1000).toFixed(3);
}