"use strict";

const myBlocksDefinitions = `
// My Blocks Control Runtime (Pure C++ Core + Arduino Wrapper)
#include <stdint.h>
#include <math.h>

struct LbmbState {
  uint32_t timeMs;
  int32_t distanceMm;
  int32_t rotationDeg;
  uint8_t lineState;
};

struct LbmbCommand {
  int16_t leftSpeed;
  int16_t rightSpeed;
  bool isDone;
};

struct LbmbMotionCtx {
  int32_t startDist;
  int32_t startRot;
  uint32_t lastStallTime;
  int32_t maxProgress;
  int16_t currentSpeed;
  int16_t prevHeadingError;
  bool initialized;
};

struct LbmbFollowCtx {
  int32_t startDist;
  uint32_t startTime;
  int16_t baseSpeed;
  int16_t prevError;
  int16_t filteredDerivative;
  int16_t integral;
  bool hasValidError;
  uint32_t lastValidTime;
  uint32_t lastStallTime;
  int32_t maxProgress;
  uint8_t markerCount;
  bool initialized;
};

const int32_t LBMB_TICK_MS = 10;
const int16_t LBMB_SPEED_MIN = 200;
const int16_t LBMB_SPEED_MAX = 2000;
const int16_t LBMB_SLEW_ACCEL = 40;
const int16_t LBMB_SLEW_DECEL = 80;
const uint32_t LBMB_STALL_MS = 750;

const int32_t LBMB_MOVE_KP = 16;
const int32_t LBMB_MOVE_KD = 28;

const int32_t LBMB_FLL_KP = 220;
const int32_t LBMB_FLL_KI = 2;
const int32_t LBMB_FLL_KD = 60;
const int32_t LBMB_FLL_MAX_I = 30;

inline int32_t lbmbAbs32(int32_t x) { return x < 0 ? -x : x; }
inline int16_t lbmbMin16(int16_t a, int16_t b) { return a < b ? a : b; }
inline int16_t lbmbMax16(int16_t a, int16_t b) { return a > b ? a : b; }
inline int16_t lbmbClamp16(int16_t val, int16_t min_val, int16_t max_val) {
  if (val < min_val) return min_val;
  if (val > max_val) return max_val;
  return val;
}
inline int32_t lbmbMin32(int32_t a, int32_t b) { return a < b ? a : b; }

// --- Core Logic ---

inline void lbmbMotionCoreInit(LbmbMotionCtx* ctx, const LbmbState* state) {
  ctx->startDist = state->distanceMm;
  ctx->startRot = state->rotationDeg;
  ctx->lastStallTime = state->timeMs;
  ctx->maxProgress = 0;
  ctx->currentSpeed = LBMB_SPEED_MIN;
  ctx->prevHeadingError = 0;
  ctx->initialized = true;
}

inline LbmbCommand lbmbMoveCoreStep(LbmbMotionCtx* ctx, const LbmbState* state, float speedPercent, float distanceCm) {
  LbmbCommand cmd = {0, 0, true};
  if (isnan(speedPercent) || isnan(distanceCm) || speedPercent == 0 || distanceCm <= 0) return cmd;
  
  int32_t targetDistMm = (int32_t)round(distanceCm * 10.0f);
  int16_t targetSpeed = lbmbClamp16((int16_t)round(fabs(speedPercent) * 20.0f), LBMB_SPEED_MIN, LBMB_SPEED_MAX);
  int32_t decelDist = lbmbClamp16(targetSpeed / 25, 15, 80);
  
  int32_t progress = lbmbAbs32(state->distanceMm - ctx->startDist);
  if (progress > ctx->maxProgress) {
    ctx->maxProgress = progress;
    ctx->lastStallTime = state->timeMs;
  }
  
  if (progress >= targetDistMm) return cmd;
  if (state->timeMs - ctx->lastStallTime >= LBMB_STALL_MS) return cmd;
  
  int32_t remaining = targetDistMm - progress;
  int16_t desiredSpeed = targetSpeed;
  if (remaining < decelDist) {
    float f = (float)remaining / decelDist;
    desiredSpeed = LBMB_SPEED_MIN + (int16_t)((targetSpeed - LBMB_SPEED_MIN) * f);
  }
  
  if (ctx->currentSpeed < desiredSpeed) {
    ctx->currentSpeed = lbmbMin16(ctx->currentSpeed + LBMB_SLEW_ACCEL, desiredSpeed);
  } else if (ctx->currentSpeed > desiredSpeed) {
    ctx->currentSpeed = lbmbMax16(ctx->currentSpeed - LBMB_SLEW_DECEL, desiredSpeed);
  }
  
  // Heading hold
  int16_t headingError = (int16_t)(state->rotationDeg - ctx->startRot);
  int16_t dErr = headingError - ctx->prevHeadingError;
  ctx->prevHeadingError = headingError;
  int16_t correction = (headingError * LBMB_MOVE_KP) + (dErr * LBMB_MOVE_KD);
  
  int16_t lSpeed = ctx->currentSpeed - correction;
  int16_t rSpeed = ctx->currentSpeed + correction;
  
  if (speedPercent < 0) {
    lSpeed = -ctx->currentSpeed - correction;
    rSpeed = -ctx->currentSpeed + correction;
  }
  
  cmd.leftSpeed = lbmbClamp16(lSpeed, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
  cmd.rightSpeed = lbmbClamp16(rSpeed, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
  cmd.isDone = false;
  return cmd;
}

inline LbmbCommand lbmbTurnCoreStep(LbmbMotionCtx* ctx, const LbmbState* state, float speedPercent, float angleDeg, bool isLeft) {
  LbmbCommand cmd = {0, 0, true};
  if (isnan(speedPercent) || isnan(angleDeg) || speedPercent == 0 || angleDeg <= 0) return cmd;

  // Wheel D=30mm, wheelbase=100mm → each 1° requires each wheel travels π×50/180 ≈ 0.87mm
  // At low minSpeed, friction stops wheel before reaching target → undershoots.
  // Use higher minSpeed for turns and smaller rampZone to maintain momentum.
  int32_t targetDeg = (int32_t)round(angleDeg);
  int16_t targetSpeed = lbmbClamp16((int16_t)round(speedPercent * 20.0f), 0, 2000);
  // minTurnSpeed: higher than move to overcome pivot friction (wheels resist when turning in place)
  int16_t minTurnSpeed = lbmbClamp16((int16_t)round(speedPercent * 20.0f * 0.35f), 300, 600);
  minTurnSpeed = lbmbMin16(minTurnSpeed, targetSpeed);
  // Smaller rampZone for turns: keep full speed longer, brake only in last 15° or 1/6 of angle
  int32_t rampZone = lbmbMin32(15, targetDeg / 6);
  if (rampZone < 3) rampZone = 3;

  int32_t progress = lbmbAbs32(state->rotationDeg - ctx->startRot);
  if (progress > ctx->maxProgress) {
    ctx->maxProgress = progress;
    ctx->lastStallTime = state->timeMs;
  }

  // No early stop: robot undershoots so run to exact target; stopAndWait handles settling
  if (progress >= targetDeg) return cmd;
  if (state->timeMs - ctx->lastStallTime >= 750) return cmd;

  int32_t remaining = targetDeg - progress;
  float rampFactor = 1.0f;
  if (progress < rampZone) rampFactor = (float)progress / rampZone;
  if (remaining < rampZone) {
    float remFactor = (float)remaining / rampZone;
    if (remFactor < rampFactor) rampFactor = remFactor;
  }

  int16_t currentSpeed = minTurnSpeed + (int16_t)((targetSpeed - minTurnSpeed) * rampFactor);
  cmd.leftSpeed = isLeft ? -currentSpeed : currentSpeed;
  cmd.rightSpeed = isLeft ? currentSpeed : -currentSpeed;
  cmd.isDone = false;
  return cmd;
}

inline void lbmbFollowCoreInit(LbmbFollowCtx* ctx, const LbmbState* state) {
  ctx->startDist = state->distanceMm;
  ctx->startTime = state->timeMs;
  ctx->baseSpeed = 0;
  ctx->prevError = 0;
  ctx->integral = 0;
  ctx->hasValidError = false;
  ctx->lastValidTime = state->timeMs;
  ctx->lastStallTime = state->timeMs;
  ctx->maxProgress = 0;
  ctx->markerCount = 0;
  ctx->initialized = true;
}

inline bool lbmbIsLineValid(uint8_t state) {
  return state == 0b1000 || state == 0b1100 || state == 0b0100 || state == 0b1110 ||
         state == 0b0110 || state == 0b1111 || state == 0b0010 || state == 0b0111 ||
         state == 0b0011 || state == 0b0001;
}

inline int16_t lbmbGetLineError(uint8_t state, int16_t prevError) {
  switch (state) {
    case 0b1000: return -3;
    case 0b1100: return -2;
    case 0b0100: case 0b1110: return -1;
    case 0b0110: case 0b1111: return 0;
    case 0b0010: case 0b0111: return 1;
    case 0b0011: return 2;
    case 0b0001: return 3;
    default: return prevError;
  }
}

inline bool lbmbCheckMarker(uint8_t state, uint8_t mode) {
  if (mode == 1) return (state & 0b1100) == 0b1100 && (state & 0b0001) == 0;
  if (mode == 2) return (state & 0b0011) == 0b0011 && (state & 0b1000) == 0;
  if (mode == 3) return state == 0b1111;
  return false;
}

inline LbmbCommand lbmbFollowCoreStep(LbmbFollowCtx* ctx, const LbmbState* state, float speedPercent, uint8_t mode, float targetVal) {
  LbmbCommand cmd = {0, 0, true};
  if (isnan(speedPercent) || speedPercent == 0) return cmd;
  
  int16_t targetSpeed = lbmbClamp16((int16_t)round(speedPercent * 20.0f), 0, 2000);
  int16_t minSpeed = lbmbMin16(targetSpeed, 200);
  if (ctx->baseSpeed == 0 && targetSpeed > 0) ctx->baseSpeed = minSpeed;

  int32_t targetMm = 0;
  uint32_t targetMs = 0;
  if (mode == 4) {
    if (targetVal <= 0) return cmd;
    targetMm = (int32_t)round(targetVal * 10.0f);
  } else if (mode == 5) {
    if (targetVal <= 0) return cmd;
    targetMs = (uint32_t)round(targetVal * 1000.0f);
  }

  uint32_t elapsedOverall = state->timeMs - ctx->startTime;
  if (elapsedOverall >= 600000) return cmd;

  if (mode <= 3) {
    if (lbmbCheckMarker(state->lineState, mode)) {
      ctx->markerCount++;
      if (ctx->markerCount >= 3) return cmd;
    } else {
      ctx->markerCount = 0;
    }
    if (elapsedOverall >= 60000) return cmd;
  } else if (mode == 4) {
    int32_t progress = lbmbAbs32(state->distanceMm - ctx->startDist);
    if (progress > ctx->maxProgress) {
      ctx->maxProgress = progress;
      ctx->lastStallTime = state->timeMs;
    }
    if (progress >= targetMm - 1) return cmd;
    if (state->timeMs - ctx->lastStallTime >= 750) return cmd;
    
    int32_t rampZone = lbmbMin32(100, targetMm / 4);
    int32_t rem = targetMm - progress;
    float f = (rampZone > 0) ? (float)rem / rampZone : 1.0f;
    if (f > 1.0f) f = 1.0f;
    if (f < 0.0f) f = 0.0f;
    int16_t lim = minSpeed + (int16_t)((targetSpeed - minSpeed) * f);
    int16_t desired = lbmbMin16(targetSpeed, lim);
    if (ctx->baseSpeed < desired) ctx->baseSpeed = lbmbMin16(ctx->baseSpeed + LBMB_SLEW_ACCEL, desired);
    else if (ctx->baseSpeed > desired) ctx->baseSpeed = lbmbMax16(ctx->baseSpeed - LBMB_SLEW_DECEL, desired);
  } else if (mode == 5) {
    if (elapsedOverall >= targetMs) return cmd;
    uint32_t rampZone = targetMs / 4;
    if (rampZone > 300) rampZone = 300;
    uint32_t rem = targetMs - elapsedOverall;
    float f = (rampZone > 0) ? (float)rem / rampZone : 1.0f;
    if (f > 1.0f) f = 1.0f;
    if (f < 0.0f) f = 0.0f;
    int16_t lim = minSpeed + (int16_t)((targetSpeed - minSpeed) * f);
    int16_t desired = lbmbMin16(targetSpeed, lim);
    if (ctx->baseSpeed < desired) ctx->baseSpeed = lbmbMin16(ctx->baseSpeed + LBMB_SLEW_ACCEL, desired);
    else if (ctx->baseSpeed > desired) ctx->baseSpeed = lbmbMax16(ctx->baseSpeed - LBMB_SLEW_DECEL, desired);
  }

  if (mode <= 3) {
    if (ctx->baseSpeed < targetSpeed) ctx->baseSpeed = lbmbMin16(ctx->baseSpeed + LBMB_SLEW_ACCEL, targetSpeed);
    else if (ctx->baseSpeed > targetSpeed) ctx->baseSpeed = lbmbMax16(ctx->baseSpeed - LBMB_SLEW_DECEL, targetSpeed);
  }

  if (lbmbIsLineValid(state->lineState)) {
    ctx->hasValidError = true;
    ctx->lastValidTime = state->timeMs;
  }
  
  if (state->timeMs - ctx->lastValidTime >= LBMB_STALL_MS) return cmd;

  cmd.isDone = false;
  if (!ctx->hasValidError) {
    int16_t s = lbmbMin16(ctx->baseSpeed, 400);
    cmd.leftSpeed = s; cmd.rightSpeed = s;
  } else if (state->lineState == 0b0000 || !lbmbIsLineValid(state->lineState)) {
    int16_t s = lbmbMin16(ctx->baseSpeed, 400);
    if (ctx->prevError > 0) { cmd.leftSpeed = s; cmd.rightSpeed = -s; }
    else { cmd.leftSpeed = -s; cmd.rightSpeed = s; }
  } else {
    int16_t error = lbmbGetLineError(state->lineState, ctx->prevError);
    if (ctx->markerCount > 0) {
      cmd.leftSpeed = ctx->baseSpeed; cmd.rightSpeed = ctx->baseSpeed;
    } else {
      int16_t rawDeriv = error - ctx->prevError;
      ctx->filteredDerivative = (int16_t)((3 * ctx->filteredDerivative + rawDeriv) / 4);
      
      int16_t candInt = lbmbClamp16(ctx->integral + error, -LBMB_FLL_MAX_I, LBMB_FLL_MAX_I);
      int32_t corr = LBMB_FLL_KP * error + LBMB_FLL_KI * candInt + LBMB_FLL_KD * ctx->filteredDerivative;
      
      bool sat = (lbmbAbs32(corr) > ctx->baseSpeed);
      int16_t accInt = (sat && ((corr > 0 && error > 0) || (corr < 0 && error < 0))) ? ctx->integral : candInt;
      
      corr = LBMB_FLL_KP * error + LBMB_FLL_KI * accInt + LBMB_FLL_KD * ctx->filteredDerivative;
      
      if (corr > 0) {
        cmd.leftSpeed = ctx->baseSpeed;
        cmd.rightSpeed = ctx->baseSpeed - corr;
      } else {
        cmd.leftSpeed = ctx->baseSpeed + corr;
        cmd.rightSpeed = ctx->baseSpeed;
      }
      
      cmd.leftSpeed = lbmbClamp16(cmd.leftSpeed, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
      cmd.rightSpeed = lbmbClamp16(cmd.rightSpeed, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
      
      ctx->integral = accInt;
      ctx->prevError = error;
    }
  }
  return cmd;
}

// --- Arduino Wrappers ---

void lbmbMove(float speedPercent, float distanceCm) {
  LbmbMotionCtx ctx = {};
  while (true) {
    LbmbState state = { (uint32_t)millis(), (int32_t)LbMotion.getDistanceMm(), (int32_t)LbMotion.getRotationDeg(), LbIRLine.read() };
    if (!ctx.initialized) lbmbMotionCoreInit(&ctx, &state);
    LbmbCommand cmd = lbmbMoveCoreStep(&ctx, &state, speedPercent, distanceCm);
    if (cmd.isDone) { LbMotion.stopAndWait(); return; }
    LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
    delay(10);
  }
}

void lbmbTurn(float speedPercent, float angleDeg, bool isLeft) {
  if (angleDeg <= 0 || speedPercent == 0) return;
  int16_t targetSpeed = lbmbClamp16((int16_t)round(speedPercent * 20.0f), 0, 2000);
  int32_t coarseMargin = lbmbClamp16(targetSpeed / 100, 5, 20);
  
  int32_t startRot = LbMotion.getRotationDeg();
  // Assume Left turn increases rotation (r - l > 0), Right turn decreases rotation
  int32_t targetRot = startRot + (isLeft ? (int32_t)angleDeg : -(int32_t)angleDeg);
  
  for (int pass = 0; pass < 3; pass++) {
    int32_t currentRot = LbMotion.getRotationDeg();
    int32_t error = targetRot - currentRot;
    
    int32_t absError = lbmbAbs32(error);
    int32_t passAngle = absError;
    if (pass == 0) passAngle -= coarseMargin;
    else passAngle -= 1; // Stop one degree early for fine pass
    
    if (passAngle <= 0) break; // Within tolerance
    
    bool nowLeft = (error > 0);
    float passSpeed = (pass == 0) ? speedPercent : (float)lbmbMin16(targetSpeed, 250) / 20.0f;
    LbmbMotionCtx ctx = {};
    
    while (true) {
      LbmbState state = { (uint32_t)millis(), (int32_t)LbMotion.getDistanceMm(), (int32_t)LbMotion.getRotationDeg(), LbIRLine.read() };
      if (!ctx.initialized) lbmbMotionCoreInit(&ctx, &state);
      LbmbCommand cmd = lbmbTurnCoreStep(&ctx, &state, passSpeed, (float)passAngle, nowLeft);
      if (cmd.isDone) {
        LbMotion.stopAndWait();
        break; // break the inner while, go to next pass
      }
      LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
      delay(10);
    }
  }
}

void lbmbTurnLeft(float speedPercent, float angleDeg) { lbmbTurn(speedPercent, angleDeg, true); }
void lbmbTurnRight(float speedPercent, float angleDeg) { lbmbTurn(speedPercent, angleDeg, false); }

void lbmbFollow(float speedPercent, uint8_t mode, float targetVal) {
  LbmbFollowCtx ctx = {};
  while (true) {
    LbmbState state = { (uint32_t)millis(), (int32_t)LbMotion.getDistanceMm(), (int32_t)LbMotion.getRotationDeg(), LbIRLine.read() };
    if (!ctx.initialized) lbmbFollowCoreInit(&ctx, &state);
    LbmbCommand cmd = lbmbFollowCoreStep(&ctx, &state, speedPercent, mode, targetVal);
    if (cmd.isDone) { LbMotion.stopAndWait(); return; }
    LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
    delay(10);
  }
}

void lbmbFollowMarker(float speedPercent, byte markerMode) { lbmbFollow(speedPercent, markerMode, 0); }
void lbmbFollowDistance(float speedPercent, float distanceCm) { lbmbFollow(speedPercent, 4, distanceCm); }
void lbmbFollowTime(float speedPercent, float timeSec) { lbmbFollow(speedPercent, 5, timeSec); }
`;

function injectMyBlocks(block) {
  LeanbotArduino_addHeader();
  Blockly.Arduino.definitions_['myblocks_runtime'] = myBlocksDefinitions;
}

Blockly.Arduino['MyBlocks.moveDistance'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var distanceCm = Blockly.Arduino.valueToCode(block, 'DistanceCm', Blockly.Arduino.ORDER_ATOMIC) || '0.0';
  return 'lbmbMove(' + speed + ', ' + distanceCm + ');\n';
};

Blockly.Arduino['MyBlocks.turnLeft'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var angleDeg = Blockly.Arduino.valueToCode(block, 'AngleDeg', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'lbmbTurnLeft(' + speed + ', ' + angleDeg + ');\n';
};

Blockly.Arduino['MyBlocks.turnRight'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var angleDeg = Blockly.Arduino.valueToCode(block, 'AngleDeg', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'lbmbTurnRight(' + speed + ', ' + angleDeg + ');\n';
};

Blockly.Arduino['MyBlocks.fllStopLeft'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'lbmbFollowMarker(' + speed + ', 1);\n';
};

Blockly.Arduino['MyBlocks.fllStopRight'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'lbmbFollowMarker(' + speed + ', 2);\n';
};

Blockly.Arduino['MyBlocks.fllStopT'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'lbmbFollowMarker(' + speed + ', 3);\n';
};

Blockly.Arduino['MyBlocks.fllDistance'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var distanceCm = Blockly.Arduino.valueToCode(block, 'DistanceCm', Blockly.Arduino.ORDER_ATOMIC) || '0.0';
  return 'lbmbFollowDistance(' + speed + ', ' + distanceCm + ');\n';
};

Blockly.Arduino['MyBlocks.fllTime'] = function(block) {
  injectMyBlocks(block);
  var speed = Blockly.Arduino.valueToCode(block, 'Speed', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var timeSec = Blockly.Arduino.valueToCode(block, 'TimeSec', Blockly.Arduino.ORDER_ATOMIC) || '0.0';
  return 'lbmbFollowTime(' + speed + ', ' + timeSec + ');\n';
};
