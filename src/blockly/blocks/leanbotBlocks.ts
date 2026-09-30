import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import * as Vi from 'blockly/msg/vi'

let registered = false

export function registerLeanbotBlocks() {
  if (registered) return
  Blockly.setLocale(Object.fromEntries(Object.entries(Vi).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
  Blockly.defineBlocksWithJsonArray([
    { type: 'leanbot_mission_begin', message0: 'Khi bắt đầu nhiệm vụ  nút %1', args0: [{ type: 'field_input', name: 'BUTTON', text: 'TB1A + TB1B' }], previousStatement: null, nextStatement: null, colour: 265 },
    { type: 'leanbot_mission_end', message0: 'Kết thúc nhiệm vụ', previousStatement: null, nextStatement: null, colour: 265 },
    { type: 'leanbot_move', message0: '%1 %2 cm  tốc độ %3', args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: [['Đi thẳng', 'forward'], ['Đi lùi', 'backward']] }, { type: 'field_number', name: 'DISTANCE', value: 30, min: 0, precision: 0.1 }, { type: 'field_number', name: 'SPEED', value: 1000, min: 0 }], previousStatement: null, nextStatement: null, colour: 220 },
    { type: 'leanbot_turn', message0: 'Quay %1 %2 độ  tốc độ %3', args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: [['trái', 'left'], ['phải', 'right']] }, { type: 'field_number', name: 'ANGLE', value: 90, min: 0 }, { type: 'field_number', name: 'SPEED', value: 500, min: 0 }], previousStatement: null, nextStatement: null, colour: 220 },
    { type: 'leanbot_wheels', message0: 'Chạy bánh trái %1  bánh phải %2', args0: [{ type: 'field_number', name: 'LEFT', value: 1000 }, { type: 'field_number', name: 'RIGHT', value: 1000 }], previousStatement: null, nextStatement: null, colour: 220 },
    { type: 'leanbot_stop', message0: 'Dừng robot', previousStatement: null, nextStatement: null, colour: 220 },
    { type: 'leanbot_distance', message0: 'Khoảng cách phía trước', output: 'Number', colour: 160 },
    { type: 'leanbot_ir', message0: 'Giá trị IR %1', args0: [{ type: 'field_dropdown', name: 'IR', options: [['IR0L', 'ir0L'], ['IR1R', 'ir1R'], ['IR2L', 'ir2L'], ['IR3R', 'ir3R']] }], output: 'Number', colour: 160 },
    { type: 'leanbot_line_black', message0: 'Line thấy màu đen', output: 'Boolean', colour: 160 },
    { type: 'leanbot_touch', message0: 'Nút %1 đang chạm', args0: [{ type: 'field_dropdown', name: 'BUTTON', options: [['TB1A', 'TB1A'], ['TB1B', 'TB1B'], ['TB2A', 'TB2A'], ['TB2B', 'TB2B']] }], output: 'Boolean', colour: 35 },
    { type: 'leanbot_led', message0: 'LED %1 màu %2', args0: [{ type: 'field_input', name: 'LED', text: 'ledO' }, { type: 'field_dropdown', name: 'COLOR', options: [['Đỏ', 'Red'], ['Xanh lá', 'Green'], ['Xanh dương', 'Blue'], ['Trắng', 'White'], ['Tắt', 'Black']] }], previousStatement: null, nextStatement: null, colour: 15 },
    { type: 'leanbot_gripper', message0: '%1 gripper', args0: [{ type: 'field_dropdown', name: 'ACTION', options: [['Mở', 'open'], ['Đóng', 'close']] }], previousStatement: null, nextStatement: null, colour: 300 },
    { type: 'leanbot_sound', message0: 'Phát âm %1 Hz trong %2 ms', args0: [{ type: 'field_number', name: 'FREQ', value: 1000, min: 0 }, { type: 'field_number', name: 'DURATION', value: 500, min: 0 }], previousStatement: null, nextStatement: null, colour: 55 },
    { type: 'leanbot_variable', message0: 'Đặt biến %1 = %2', args0: [{ type: 'field_input', name: 'NAME', text: 'speed' }, { type: 'field_number', name: 'VALUE', value: 1000 }], previousStatement: null, nextStatement: null, colour: 330 },
    { type: 'leanbot_raw_cpp', message0: 'C++ tùy chỉnh %1', args0: [{ type: 'field_multilinetext', name: 'CODE', text: 'Serial.println("Hello");' }], previousStatement: null, nextStatement: null, colour: 0 },
    { type: 'leanbot_comment', message0: 'Ghi chú %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Mô tả bước này' }], previousStatement: null, nextStatement: null, colour: 60 },
  ])
  registered = true
}
