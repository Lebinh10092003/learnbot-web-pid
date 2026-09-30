import { sleep } from "./helpers.js";

export class LeanbotCompiler {

  static #config = null;

  static setConfig(config) {
    LeanbotCompiler.#config = config;
  }

  #prevHash = "";
  #prevResponse = null;

  onCompileSucess = async () => { };
  onCompileError = async () => { };
  onCompileProgress = () => { };

  #compileStartMs = 0;
  #compileEndMs = 0;

  constructor() {
    if (!LeanbotCompiler.#config) {
      throw new Error("Missing LeanbotCompiler #config");
    }
  }

  async compile(sourceCode, compileServer = LeanbotCompiler.#config.Server) {
    const sketchName = "LeanbotSketch";

    const payload = {
      fqbn: LeanbotCompiler.#config.CompilePayload.fqbn,
      files: [
        {
          content: sourceCode,
          name: `${sketchName}/${sketchName}.ino`,
        },
      ],
      flags: LeanbotCompiler.#config.CompilePayload.flags,
      libs: LeanbotCompiler.#config.libs,
    };

    this.#compileStartMs = performance.now();
    this.#compileEndMs = 0;
    const predictedTotal = LeanbotCompiler.#config.PredictedTotalMs; //10000 ms = 10s

    const emitProgress = () => {
      const elapsedTime = (performance.now() - this.#compileStartMs);
      const estimatedTotal = Math.sqrt(elapsedTime ** 2 + predictedTotal ** 2);
      this.onCompileProgress(elapsedTime, estimatedTotal);
    };

    const progressTimer = setInterval(emitProgress, LeanbotCompiler.#config.ProgressEmitIntervalMs); // emit progress every 500ms

    try {
      let attempt = 0;
      const maxattempt = 3;
      let lastError = null;

      while (true) {
        // attempt to send then fetch result from server
        try {
          const compileResult = await this.#requestCompile(payload, compileServer);

          this.#compileEndMs = performance.now();
          const elapsedTime = (this.#compileEndMs - this.#compileStartMs);

          this.onCompileProgress(elapsedTime, elapsedTime);

          if (compileResult.hex && compileResult.hex.trim() !== "") {
            await this.onCompileSucess(compileResult.log);
            const hexText = this.#base64ToText(compileResult.hex);
            return { success: true, hexText: hexText, log: compileResult.log };
          } else {
            await this.onCompileError("compile_codeErr", compileResult.log);
            return { success: false, hexText: null, log: null };
          }

          // return compileResult;

        } catch (err) {
          const message = err.message || String(err);
          lastError = message;
          console.log(`Catch Compile Error: ${message} at attempt ${attempt}`);


          if (attempt++ >= maxattempt)
            break;

          await sleep(100);
        }
      }

      // all attempt failed => stop compile progress at once
      this.#compileEndMs = performance.now();
      this.onCompileProgress(1, 1);
      await this.onCompileError("compile_err", lastError);
      return { success: false, hexText: null, log: null };

    } finally {
      clearInterval(progressTimer); // clean interval whenever fail or success
    }
  }

  async #requestCompile(payload, compileServer) {
    const data = new TextEncoder().encode(JSON.stringify({ payload, compileServer }));
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data); // Returns a array buffer

    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const payloadHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert bytes to hex string

    if (payloadHash === this.#prevHash) {
      await sleep(500); // simulate network delay
      return this.#prevResponse;
    }

    const res = await fetch(`https://${compileServer}/v3/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Compile HTTP ${res.status}`);

    const result = await res.json(); // { hex, log }

    // CHỈ cache khi compile thành công
    if (result.hex && result.hex.trim() !== "") {
      this.#prevHash = payloadHash;
      this.#prevResponse = result;
    } else {
      // compile error → reset cache
      this.#prevHash = "";
      this.#prevResponse = null;
    }

    return result;
  }

  #base64ToText(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  elapsedTimeMs() {
    if (this.#compileEndMs === 0) // if compile not done yet
      return performance.now() - this.#compileStartMs;
    return this.#compileEndMs - this.#compileStartMs;
  }
}