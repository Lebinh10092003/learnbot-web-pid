export class InoEditor {   

  editor = null;
  __isMonacoReady = false;
  __pendingContent = null;

  /**Callback */
  onChangeContent = () => {};

  /* ================= PUBLIC API ================= */

  async attach(domNode) {
    await new Promise((resolve) => {
      require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" } });
      require(["vs/editor/editor.main"], resolve);
    });
    this.#registerArduinoLanguage();
    this.#registerTheme();
    this.#createEditor(domNode);
    this.#updateEditor();
    this.#registerCompletion();

    this.__isMonacoReady = true;

    this.editor.onDidChangeModelContent(() => {
      this.onChangeContent(); // callback everytime editor changes
    });

    if (this.__pendingContent !== null) {
      this.editor.setValue(this.__pendingContent);
      this.__pendingContent = null;
    }
  }

  // Lấy nội dung code từ Monaco Editor
  getContent() {
    if (!this.__isMonacoReady || !this.editor) {
      return;
    }
    return this.editor?.getValue() || "";
  }

  setContent(contentString) {
    if (!this.__isMonacoReady || !this.editor) {
      this.__pendingContent = String(contentString ?? "");
      return;
    }
    this.editor.setValue(String(contentString ?? ""));
    this.#setReadOnly(false); // always unlock when set content
  }

  setContentReadOnly(contentString) { // force set content and read-only mode, any setContent after will unlock it
    this.setContent(contentString);
    this.#setReadOnly(true);
  } 

  getCppCode() { // Dùng khi compile, có thể khác với Content (khi là BlocklyEditor)
    return this.getContent(); // Just a placeholder for future implementation
  };

  /* ================= INTERNAL ================= */

  #registerArduinoLanguage() {
    // Arduino keywords thêm vào highlight
    monaco.languages.register({ id: "arduino" });

    // Needed for Ctrl + / to work (requires `comments` in language configuration): https://github.com/microsoft/monaco-editor/discussions/3840
    // Mirrors Monaco's built-in C++ config: https://github.com/microsoft/monaco-editor/blob/main/src/languages/definitions/cpp/cpp.ts
    monaco.languages.setLanguageConfiguration("arduino", {
        comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"],
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "\"", close: "\"" },
        { open: "'", close: "'" },
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "\"", close: "\"" },
        { open: "'", close: "'" },
      ],
    });
    monaco.languages.setMonarchTokensProvider("arduino", {
    tokenizer: {
        root: [
            // multi-line comment start /* ... */
            [/\/\*/, "comment", "@comment"],

            // single-line comment
            [/\/\/.*$/, "comment"],

            // strings
            [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],

            // keywords/types
            [/\b(void|int|char|float|double|bool|byte|long|short|unsigned|signed|const)\b/, "keyword"],
            [/\b(setup|loop|Serial|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|millis|micros)\b/, "type.identifier"],
            [/\b(begin|println|print|available|read|write)\b/, "identifier"],

            // numbers
            [/\b\d+(\.\d+)?\b/, "number"],
        ],

        // comment state: ăn mọi thứ đến khi gặp */
        comment: [
            [/[^\*]+/, "comment"],
            [/\*\//, "comment", "@pop"],
            [/\*/, "comment"],
        ],

        string: [
            [/[^\\"]+/, "string"],
            [/\\./, "string.escape"],
            [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
        ],
      },
    });
  }

  #registerTheme() {
    // Light theme cho Arduino
    monaco.editor.defineTheme("arduinoLight", {
        base: "vs",          // theme sáng
        inherit: true,
        rules: [
          { token: "comment", foreground: "008000" },      // xanh lá comment
          { token: "keyword", foreground: "0000FF" },      // xanh dương
          { token: "number", foreground: "098658" },       // xanh lá số
          { token: "string", foreground: "A31515" },       // đỏ nâu
          { token: "type.identifier", foreground: "267F99" }, // xanh da trời
          { token: "identifier", foreground: "001080" },   // xanh đậm
        ],
        colors: {
          "editor.background": "#FFFFFF", // trắng
          "editorLineNumber.foreground": "#999999", // xám line number
          "editorLineNumber.activeForeground": "#000000", // đen line number active
          "editorCursor.foreground": "#000000", // đen con trỏ
          "editor.selectionBackground": "#ADD6FF", // xanh dương chọn
          "editor.inactiveSelectionBackground": "#E5EBF1", // xám nhạt chọn
        },
    });

    // set theme
    monaco.editor.setTheme("arduinoLight");
  }

  #createEditor(domNode) {
    this.editor = monaco.editor.create(domNode, {
        value: "",
        language: "arduino",
        automaticLayout: true,
        lineNumbers: "on",
        fontSize: 13,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: "off",
        minimap: { enabled: false },
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        bracketPairColorization: { enabled: true },
      }
    );
  }

  #updateEditor(){ // Placeholder for future updates
      this.editor.updateOptions({
        scrollBeyondLastLine: false,      // Dòng cuối luôn nằm sát đáy editor

        quickSuggestions: true,           // Tự động hiện gợi ý khi đang gõ
        suggestOnTriggerCharacters: true, // Gợi ý khi gõ các ký tự kích hoạt (., (, <)
        tabCompletion: "on",              // Tab để chấp nhận gợi ý
        acceptSuggestionOnEnter: "on",    // Enter để chấp nhận gợi 
        snippetSuggestions: "top",        // Ưu tiên gợi ý snippet lên đầu
        wordBasedSuggestions: "off",      // Tắt gợi ý dựa trên từ trong văn bản
      });
  }

  #registerCompletion() {
    const SUGGESTIONS = [
      {
        label: "setup",
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: "void setup() {\n\t$0\n}\n",
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: "loop",
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: "void loop() {\n\t$0\n}\n",
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: "Serial.println",
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: "Serial.println(${1:\"text\"});",
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: "delay",
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: "delay(${1:500});",
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
    ];

    monaco.languages.registerCompletionItemProvider("arduino", {
      triggerCharacters: [".", "(", "<"],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );

        return {
          suggestions: SUGGESTIONS.map(s => ({ ...s, range })),
        };
      },
    });
  }

  #setReadOnly(readOnly) { // force set read-only state
    if (!this.editor) return;
    this.editor.updateOptions({ readOnly: readOnly });
  }

}