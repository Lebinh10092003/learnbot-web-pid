"use strict";

var myBlocksCategoryStyle = "myblocks_category";

function checkMyBlocksWarnings(block) {
  if (!block.workspace || block.isInFlyout) return;
  var warnings = [];
  
  function checkInput(inputName, min, max, allowNegative) {
    var targetBlock = block.getInputTargetBlock(inputName);
    if (targetBlock && targetBlock.type === 'math_number') {
      var val = Number(targetBlock.getFieldValue('NUM'));
      if (isNaN(val)) return;
      if (val < min || val > max) {
        warnings.push(inputName + " must be between " + min + " and " + max + ".");
      }
    }
  }

  // Speed for Move: -100 to 100
  if (block.type === 'MyBlocks.moveDistance') {
    checkInput('Speed', -100, 100);
  } else {
    // Turn and FLL Speed: 0 to 100
    if (block.getInput('Speed')) {
      checkInput('Speed', 0, 100);
    }
  }

  // Distance: 0.1 to 1000.0
  if (block.getInput('DistanceCm')) {
    checkInput('DistanceCm', 0.1, 1000.0);
  }

  // Angle: 1 to 3600
  if (block.getInput('AngleDeg')) {
    checkInput('AngleDeg', 1, 3600);
  }

  // Time: 0.1 to 600.0
  if (block.getInput('TimeSec')) {
    checkInput('TimeSec', 0.1, 600.0);
  }

  if (warnings.length > 0) {
    block.setWarningText(warnings.join("\n"));
  } else {
    block.setWarningText(null);
  }
}

Blockly.Blocks['MyBlocks.moveDistance'] = {
  init: function() {
    this.jsonInit({
      "message0": "Move With Speed %1 And Distance %2 Cm",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"},
        {"type": "input_value", "name": "DistanceCm", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.turnLeft'] = {
  init: function() {
    this.jsonInit({
      "message0": "Turn Left With Speed %1 And Angle %2 Degrees",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"},
        {"type": "input_value", "name": "AngleDeg", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.turnRight'] = {
  init: function() {
    this.jsonInit({
      "message0": "Turn Right With Speed %1 And Angle %2 Degrees",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"},
        {"type": "input_value", "name": "AngleDeg", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.fllStopLeft'] = {
  init: function() {
    this.jsonInit({
      "message0": "FLL With Speed %1 And Stop At Left Line",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.fllStopRight'] = {
  init: function() {
    this.jsonInit({
      "message0": "FLL With Speed %1 And Stop At Right Line",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.fllStopT'] = {
  init: function() {
    this.jsonInit({
      "message0": "FLL With Speed %1 And Stop At T Line",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.fllDistance'] = {
  init: function() {
    this.jsonInit({
      "message0": "FLL With Speed %1 And Distance %2 Cm",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"},
        {"type": "input_value", "name": "DistanceCm", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};

Blockly.Blocks['MyBlocks.fllTime'] = {
  init: function() {
    this.jsonInit({
      "message0": "FLL With Speed %1 And Time %2 S",
      "args0": [
        {"type": "input_value", "name": "Speed", "check": "Number"},
        {"type": "input_value", "name": "TimeSec", "check": "Number"}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "style": myBlocksCategoryStyle
    });
  },
  onchange: function() { checkMyBlocksWarnings(this); }
};
