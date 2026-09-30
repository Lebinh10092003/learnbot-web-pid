export class BlocklyEditor {
  getContent() {
    const iframe = document.getElementById("blocklyInlineFrame");
    if (iframe.contentWindow.Blockly_getBlockContent) {
      return iframe.contentWindow.Blockly_getBlockContent();
    }
    return "";
  }


  async setContent(contentString) {
    const iframe = document.getElementById("blocklyInlineFrame");
    
    // Wait for Blockly to be ready (up to 5 seconds)
    for (let i = 0; i < 50; i++) {
      if (iframe.contentWindow && iframe.contentWindow.Blockly_setBlockContent) {
        return iframe.contentWindow.Blockly_setBlockContent(contentString);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    
    return false;
  }


  getCppCode() {
    const iframe = document.getElementById("blocklyInlineFrame");
    if (iframe.contentWindow.Blockly_getGeneratedCode) {
      return iframe.contentWindow.Blockly_getGeneratedCode();
    }
    return "";
  };
}
