// myblocks-control-spec.mjs
export const myBlocksControlSpec = {
  constants: {
    LOOP_TICK_MS: 10,
    MAX_SPEED_STEPS: 2000,
    MIN_RAMP_SPEED: 200,
    RAMP_ZONE_MOVE_MM: 100,
    RAMP_ZONE_MOVE_FRAC: 4,
    RAMP_ZONE_TURN_DEG: 30,
    RAMP_ZONE_TURN_FRAC: 4,
    RAMP_ZONE_TIME_MS: 300,
    RAMP_ZONE_TIME_FRAC: 4,
    TOLERANCE_MM: 1,
    TOLERANCE_DEG: 1,
    STALL_TIMEOUT_MS: 750,
    LOST_LINE_TIMEOUT_MS: 750,
    MARKER_TIMEOUT_MS: 60000,
    MAX_TIME_MS: 600000,
    MAX_DISTANCE_CM: 1000.0,
    MAX_ANGLE_DEG: 3600,
    PID_KP: 220,
    PID_KI: 3,
    PID_KD: 160,
    PID_MAX_INTEGRAL: 40,
    PID_MAX_SLEW: 12,
    SEARCH_SPEED_MAX: 400
  },
  errors: {
    0b1000: -3,
    0b1100: -2,
    0b0100: -1,
    0b1110: -1,
    0b0110: 0,
    0b1111: 0,
    0b0010: 1,
    0b0111: 1,
    0b0011: 2,
    0b0001: 3
  }
};
