export const leanbotToolbox = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Nhiệm vụ', colour: '#7c5dc7', contents: [{ kind: 'block', type: 'leanbot_mission_begin' }, { kind: 'block', type: 'leanbot_mission_end' }] },
    { kind: 'category', name: 'Chuyển động', colour: '#3977d4', contents: [{ kind: 'block', type: 'leanbot_move' }, { kind: 'block', type: 'leanbot_turn' }, { kind: 'block', type: 'leanbot_wheels' }, { kind: 'block', type: 'leanbot_stop' }] },
    { kind: 'category', name: 'Cảm biến', colour: '#16846d', contents: [{ kind: 'block', type: 'leanbot_distance' }, { kind: 'block', type: 'leanbot_ir' }, { kind: 'block', type: 'leanbot_line_black' }, { kind: 'block', type: 'leanbot_touch' }] },
    { kind: 'category', name: 'Logic', colour: '#5b67a5', contents: [{ kind: 'block', type: 'controls_if' }, { kind: 'block', type: 'logic_compare' }, { kind: 'block', type: 'logic_operation' }, { kind: 'block', type: 'logic_negate' }, { kind: 'block', type: 'logic_boolean' }] },
    { kind: 'category', name: 'Vòng lặp', colour: '#5b80a5', contents: [{ kind: 'block', type: 'controls_repeat_ext' }, { kind: 'block', type: 'controls_whileUntil' }] },
    { kind: 'category', name: 'Toán học', colour: '#5b67a5', contents: [{ kind: 'block', type: 'math_number' }, { kind: 'block', type: 'math_arithmetic' }, { kind: 'block', type: 'math_random_int' }, { kind: 'block', type: 'math_constrain' }] },
    { kind: 'category', name: 'Biến', colour: '#a55b80', contents: [{ kind: 'block', type: 'leanbot_variable' }] },
    { kind: 'category', name: 'Hàm', colour: '#995ba5', custom: 'PROCEDURE' },
    { kind: 'category', name: 'LED', colour: '#c75c48', contents: [{ kind: 'block', type: 'leanbot_led' }] },
    { kind: 'category', name: 'Âm thanh', colour: '#b58a2e', contents: [{ kind: 'block', type: 'leanbot_sound' }] },
    { kind: 'category', name: 'Gripper', colour: '#9951b8', contents: [{ kind: 'block', type: 'leanbot_gripper' }] },
    { kind: 'category', name: 'Nâng cao', colour: '#64748b', contents: [{ kind: 'block', type: 'leanbot_comment' }, { kind: 'block', type: 'leanbot_raw_cpp' }] },
  ],
}
