"use strict";

const myBlocksDefinitions = `
// My Blocks Control Runtime V3
// Uses Leanbot's own odometry + raw line sensors as feedback.
// Public My Blocks API remains unchanged.

#include <stdint.h>
#include <math.h>

struct LbmbState {
  uint32_t timeMs;
  int32_t distanceMm;
  int32_t rotationDeg;
  uint8_t lineState;
  int16_t ir2L;
  int16_t ir0L;
  int16_t ir1R;
  int16_t ir3R;
};

struct LbmbCommand {
  int16_t leftSpeed;
  int16_t rightSpeed;
  bool isDone;
};

struct LbmbMotionCtx {
  int32_t startDist;
  int32_t startRot;
  int32_t maxProgress;
  uint32_t lastProgressTime;
  uint32_t lastTime;
  float currentSpeed;
  float currentAccel;
  float prevHeadingError;
  float filteredHeadingDerivative;
  int16_t outLeft;
  int16_t outRight;
  bool initialized;
};

struct LbmbFollowCtx {
  int32_t startDist;
  uint32_t startTime;
  uint32_t lastTime;
  uint32_t lastValidTime;
  uint32_t lastProgressTime;
  int32_t maxProgress;

  float baseSpeed;
  float baseAccel;

  float prevError;
  float filteredDerivative;
  float integral;

  int16_t outLeft;
  int16_t outRight;

  bool hasValidError;
  uint8_t markerCount;
  bool initialized;
};

// -----------------------------------------------------------------------------
// Central tuning
// -----------------------------------------------------------------------------

const uint16_t LBMB_TICK_MS = 10;

const int16_t LBMB_SPEED_MAX = 2000;
const int16_t LBMB_START_SPEED = 200;
const int16_t LBMB_SEARCH_SPEED_MAX = 420;

const uint32_t LBMB_PROGRESS_TIMEOUT_MS = 900;
const uint32_t LBMB_LOST_LINE_TIMEOUT_MS = 800;
const uint32_t LBMB_MARKER_TIMEOUT_MS = 60000UL;
const uint32_t LBMB_MAX_OPERATION_MS = 600000UL;

// Jerk-limited base motion profile, unit: steps/s, steps/s^2, steps/s^3.
const float LBMB_MOVE_ACCEL = 3200.0f;
const float LBMB_MOVE_DECEL = 6000.0f;
const float LBMB_MOVE_JERK = 24000.0f;

const float LBMB_TURN_ACCEL = 2600.0f;
const float LBMB_TURN_DECEL = 5200.0f;
const float LBMB_TURN_JERK = 22000.0f;

const float LBMB_FLL_ACCEL = 3600.0f;
const float LBMB_FLL_DECEL = 6500.0f;
const float LBMB_FLL_JERK = 30000.0f;

// Wheel output slew is deliberately faster than base-speed acceleration so PID
// can steer quickly without allowing instant full motor reversals.
const int32_t LBMB_WHEEL_ACCEL = 9000;
const int32_t LBMB_WHEEL_DECEL = 15000;

// Move heading hold. getRotationDeg() is Leanbot odometry, not an IMU, so this
// controller is intentionally limited.
const float LBMB_MOVE_KP = 14.0f;
const float LBMB_MOVE_KD = 18.0f;
const float LBMB_MOVE_MAX_CORR_RATIO = 0.22f;

// Analog-centroid FLL PID. Error is normalized to -1.0 .. +1.0.
const float LBMB_FLL_KP = 900.0f;
const float LBMB_FLL_KI = 110.0f;
const float LBMB_FLL_KD = 6.0f;
const float LBMB_FLL_MAX_I = 0.60f;
const float LBMB_FLL_D_ALPHA = 0.22f;
const float LBMB_FLL_MAX_STEER_RATIO = 0.92f;

// Dynamic speed reduction when line curvature/error becomes large.
const float LBMB_FLL_ERROR_SLOWDOWN = 0.48f;
const float LBMB_FLL_D_SLOWDOWN = 0.010f;
const float LBMB_FLL_MIN_FACTOR = 0.42f;

// Raw IR centroid.
// Leanbot API reports darker surface as a larger raw value, nominally 0..768.
// Subtracting the minimum of the 4 sensors reduces common ambient-light offset.
const int32_t LBMB_LINE_SIGNAL_MIN = 24;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

inline int32_t lbmbAbs32(int32_t x) { return x < 0 ? -x : x; }
inline float lbmbAbsF(float x) { return x < 0.0f ? -x : x; }

inline int16_t lbmbMin16(int16_t a, int16_t b) { return a < b ? a : b; }
inline int16_t lbmbMax16(int16_t a, int16_t b) { return a > b ? a : b; }

inline int16_t lbmbClamp16(int32_t val, int16_t minVal, int16_t maxVal) {
  if (val < minVal) return minVal;
  if (val > maxVal) return maxVal;
  return (int16_t)val;
}

inline int32_t lbmbMin32(int32_t a, int32_t b) { return a < b ? a : b; }
inline int32_t lbmbMax32(int32_t a, int32_t b) { return a > b ? a : b; }

inline float lbmbClampF(float val, float minVal, float maxVal) {
  if (val < minVal) return minVal;
  if (val > maxVal) return maxVal;
  return val;
}

inline float lbmbDtSec(uint32_t now, uint32_t before) {
  uint32_t dtMs = now - before;
  if (dtMs < 2) dtMs = 2;
  if (dtMs > 50) dtMs = 50;
  return (float)dtMs * 0.001f;
}

inline int16_t lbmbTargetSpeedFromPercent(float speedPercent) {
  float mag = fabs(speedPercent);
  if (mag > 100.0f) mag = 100.0f;
  int32_t s = (int32_t)round(mag * 20.0f);
  if (s < 20) s = 20;
  if (s > LBMB_SPEED_MAX) s = LBMB_SPEED_MAX;
  return (int16_t)s;
}

inline int16_t lbmbInitialSpeed(int16_t targetSpeed) {
  return lbmbMin16(targetSpeed, LBMB_START_SPEED);
}

inline int16_t lbmbWheelSlew(
  int16_t current,
  int16_t target,
  uint32_t dtMs
) {
  if (dtMs < 1) dtMs = 1;
  if (dtMs > 50) dtMs = 50;

  bool reversing = (current > 0 && target < 0) || (current < 0 && target > 0);
  bool accelerating = !reversing && lbmbAbs32(target) > lbmbAbs32(current);
  int32_t rate = accelerating ? LBMB_WHEEL_ACCEL : LBMB_WHEEL_DECEL;
  int32_t delta = rate * (int32_t)dtMs / 1000;
  if (delta < 1) delta = 1;

  if (target > current) {
    int32_t next = (int32_t)current + delta;
    return (int16_t)(next > target ? target : next);
  }

  if (target < current) {
    int32_t next = (int32_t)current - delta;
    return (int16_t)(next < target ? target : next);
  }

  return current;
}

// Jerk-limited profile used by Move, Turn and FLL base speed.
inline float lbmbProfileStep(
  float* speed,
  float* accel,
  float targetSpeed,
  float maxAccel,
  float maxDecel,
  float maxJerk,
  float dt
) {
  targetSpeed = lbmbClampF(targetSpeed, 0.0f, (float)LBMB_SPEED_MAX);

  float error = targetSpeed - *speed;
  if (lbmbAbsF(error) < 0.5f) {
    *speed = targetSpeed;
    *accel = 0.0f;
    return *speed;
  }

  float desiredAccel;
  if (error > 0.0f) {
    desiredAccel = maxAccel;
  } else {
    desiredAccel = -maxDecel;
  }

  float maxDeltaAccel = maxJerk * dt;
  float accelDelta = desiredAccel - *accel;
  accelDelta = lbmbClampF(accelDelta, -maxDeltaAccel, maxDeltaAccel);
  *accel += accelDelta;

  float next = *speed + (*accel * dt);

  // Never cross the requested envelope.
  if ((error > 0.0f && next >= targetSpeed) ||
      (error < 0.0f && next <= targetSpeed)) {
    next = targetSpeed;
    *accel = 0.0f;
  }

  if (next < 0.0f) {
    next = 0.0f;
    *accel = 0.0f;
  }

  if (next > LBMB_SPEED_MAX) {
    next = LBMB_SPEED_MAX;
    *accel = 0.0f;
  }

  *speed = next;
  return next;
}

inline int32_t lbmbMoveBrakeMm(int16_t targetSpeed) {
  // Empirical envelope expressed in Leanbot's own mm odometry.
  int32_t mm = targetSpeed / 40 + 10;
  if (mm < 15) mm = 15;
  if (mm > 60) mm = 60;
  return mm;
}

inline float lbmbBrakeEnvelope(
  int32_t remaining,
  int32_t brakeZone,
  int16_t targetSpeed
) {
  int16_t minSpeed = lbmbInitialSpeed(targetSpeed);
  if (remaining >= brakeZone || brakeZone <= 0) return targetSpeed;

  float f = (float)remaining / (float)brakeZone;
  f = lbmbClampF(f, 0.0f, 1.0f);

  // sqrt keeps speed higher during the first part of braking, while still
  // approaching the minimum near the target.
  float shaped = sqrtf(f);
  return (float)minSpeed + ((float)targetSpeed - minSpeed) * shaped;
}

// -----------------------------------------------------------------------------
// Leanbot line sensing
// -----------------------------------------------------------------------------

inline bool lbmbIsLineValid(uint8_t state) {
  return state == 0b1000 || state == 0b1100 || state == 0b0100 || state == 0b1110 ||
         state == 0b0110 || state == 0b1111 || state == 0b0010 || state == 0b0111 ||
         state == 0b0011 || state == 0b0001;
}

inline int16_t lbmbDiscreteLineError1000(uint8_t state, int16_t prevError1000) {
  switch (state) {
    case 0b1000: return -3000;
    case 0b1100: return -2000;
    case 0b0100:
    case 0b1110: return -1000;
    case 0b0110:
    case 0b1111: return 0;
    case 0b0010:
    case 0b0111: return 1000;
    case 0b0011: return 2000;
    case 0b0001: return 3000;
    default: return prevError1000;
  }
}

inline int16_t lbmbLinePosition1000(const LbmbState* state, int16_t fallbackError1000) {
  int32_t v2 = state->ir2L;
  int32_t v0 = state->ir0L;
  int32_t v1 = state->ir1R;
  int32_t v3 = state->ir3R;

  int32_t floorValue = v2;
  if (v0 < floorValue) floorValue = v0;
  if (v1 < floorValue) floorValue = v1;
  if (v3 < floorValue) floorValue = v3;

  int32_t w2 = v2 - floorValue;
  int32_t w0 = v0 - floorValue;
  int32_t w1 = v1 - floorValue;
  int32_t w3 = v3 - floorValue;

  if (w2 < 0) w2 = 0;
  if (w0 < 0) w0 = 0;
  if (w1 < 0) w1 = 0;
  if (w3 < 0) w3 = 0;

  int32_t sum = w2 + w0 + w1 + w3;

  // Fall back to Leanbot's calibrated digital line state when analog contrast is
  // too weak or all four sensors see a very similar surface.
  if (sum < LBMB_LINE_SIGNAL_MIN) {
    return lbmbDiscreteLineError1000(state->lineState, fallbackError1000);
  }

  int32_t weighted =
      (-3000L * w2) +
      (-1000L * w0) +
      ( 1000L * w1) +
      ( 3000L * w3);

  int32_t pos = weighted / sum;
  if (pos < -3000) pos = -3000;
  if (pos > 3000) pos = 3000;
  return (int16_t)pos;
}

inline bool lbmbCheckMarker(uint8_t state, uint8_t mode) {
  if (mode == 1) return (state & 0b1100) == 0b1100 && (state & 0b0001) == 0;
  if (mode == 2) return (state & 0b0011) == 0b0011 && (state & 0b1000) == 0;
  if (mode == 3) return state == 0b1111;
  return false;
}

// -----------------------------------------------------------------------------
// Move core
// -----------------------------------------------------------------------------

inline void lbmbMotionCoreInit(LbmbMotionCtx* ctx, const LbmbState* state) {
  ctx->startDist = state->distanceMm;
  ctx->startRot = state->rotationDeg;
  ctx->maxProgress = 0;
  ctx->lastProgressTime = state->timeMs;
  ctx->lastTime = state->timeMs;
  ctx->currentSpeed = 0.0f;
  ctx->currentAccel = 0.0f;
  ctx->prevHeadingError = 0.0f;
  ctx->filteredHeadingDerivative = 0.0f;
  ctx->outLeft = 0;
  ctx->outRight = 0;
  ctx->initialized = true;
}

inline LbmbCommand lbmbMoveCoreStep(
  LbmbMotionCtx* ctx,
  const LbmbState* state,
  float speedPercent,
  float distanceCm
) {
  LbmbCommand cmd = {0, 0, true};

  if (isnan(speedPercent) || isnan(distanceCm) ||
      speedPercent == 0.0f || distanceCm <= 0.0f) {
    return cmd;
  }

  int32_t targetDistMm = (int32_t)round(distanceCm * 10.0f);
  int16_t targetSpeed = lbmbTargetSpeedFromPercent(speedPercent);

  int32_t progress = lbmbAbs32(state->distanceMm - ctx->startDist);
  if (progress > ctx->maxProgress) {
    ctx->maxProgress = progress;
    ctx->lastProgressTime = state->timeMs;
  }

  if (progress >= targetDistMm) return cmd;
  if (state->timeMs - ctx->lastProgressTime >= LBMB_PROGRESS_TIMEOUT_MS) return cmd;

  int32_t remaining = targetDistMm - progress;
  int32_t brakeMm = lbmbMoveBrakeMm(targetSpeed);
  float desiredSpeed = lbmbBrakeEnvelope(remaining, brakeMm, targetSpeed);

  float dt = lbmbDtSec(state->timeMs, ctx->lastTime);
  uint32_t dtMs = state->timeMs - ctx->lastTime;
  if (dtMs < 1) dtMs = 1;
  if (dtMs > 50) dtMs = 50;
  ctx->lastTime = state->timeMs;

  lbmbProfileStep(
    &ctx->currentSpeed,
    &ctx->currentAccel,
    desiredSpeed,
    LBMB_MOVE_ACCEL,
    LBMB_MOVE_DECEL,
    LBMB_MOVE_JERK,
    dt
  );

  // Leanbot convention from the reference examples:
  // positive rotation = right, negative rotation = left.
  float headingError = (float)(state->rotationDeg - ctx->startRot);
  float rawD = headingError - ctx->prevHeadingError;
  ctx->filteredHeadingDerivative =
      0.75f * ctx->filteredHeadingDerivative + 0.25f * rawD;
  ctx->prevHeadingError = headingError;

  float correction =
      LBMB_MOVE_KP * headingError +
      LBMB_MOVE_KD * ctx->filteredHeadingDerivative;

  float maxCorrection = ctx->currentSpeed * LBMB_MOVE_MAX_CORR_RATIO;
  correction = lbmbClampF(correction, -maxCorrection, maxCorrection);

  float signedBase = speedPercent > 0.0f ? ctx->currentSpeed : -ctx->currentSpeed;

  // Positive heading error means robot has rotated right. left=base-correction,
  // right=base+correction adds a left-turn correction for both forward and reverse.
  int16_t targetLeft = lbmbClamp16(
    (int32_t)round(signedBase - correction),
    -LBMB_SPEED_MAX,
    LBMB_SPEED_MAX
  );
  int16_t targetRight = lbmbClamp16(
    (int32_t)round(signedBase + correction),
    -LBMB_SPEED_MAX,
    LBMB_SPEED_MAX
  );

  ctx->outLeft = lbmbWheelSlew(ctx->outLeft, targetLeft, dtMs);
  ctx->outRight = lbmbWheelSlew(ctx->outRight, targetRight, dtMs);

  cmd.leftSpeed = ctx->outLeft;
  cmd.rightSpeed = ctx->outRight;
  cmd.isDone = false;
  return cmd;
}

// -----------------------------------------------------------------------------
// Turn core
// Leanbot reference convention:
//   Right: runLR(+speed, -speed), rotation positive
//   Left : runLR(-speed, +speed), rotation negative
// -----------------------------------------------------------------------------

inline LbmbCommand lbmbTurnCoreStep(
  LbmbMotionCtx* ctx,
  const LbmbState* state,
  float speedPercent,
  float angleDeg,
  bool isLeft
) {
  LbmbCommand cmd = {0, 0, true};

  if (isnan(speedPercent) || isnan(angleDeg) ||
      speedPercent == 0.0f || angleDeg <= 0.0f) {
    return cmd;
  }

  int32_t targetDeg = (int32_t)round(angleDeg);
  int16_t targetSpeed = lbmbTargetSpeedFromPercent(speedPercent);

  int32_t signedProgress = state->rotationDeg - ctx->startRot;
  int32_t progress = lbmbAbs32(signedProgress);

  if (progress > ctx->maxProgress) {
    ctx->maxProgress = progress;
    ctx->lastProgressTime = state->timeMs;
  }

  if (progress >= targetDeg) return cmd;
  if (state->timeMs - ctx->lastProgressTime >= LBMB_PROGRESS_TIMEOUT_MS) return cmd;

  int32_t remaining = targetDeg - progress;
  int32_t brakeDeg = targetDeg / 5;
  if (brakeDeg < 5) brakeDeg = 5;
  if (brakeDeg > 22) brakeDeg = 22;

  int16_t minTurnSpeed = lbmbMin16(targetSpeed, 240);
  float desiredSpeed = targetSpeed;

  if (remaining < brakeDeg) {
    float f = (float)remaining / (float)brakeDeg;
    f = lbmbClampF(f, 0.0f, 1.0f);
    desiredSpeed =
        (float)minTurnSpeed +
        ((float)targetSpeed - minTurnSpeed) * sqrtf(f);
  }

  float dt = lbmbDtSec(state->timeMs, ctx->lastTime);
  uint32_t dtMs = state->timeMs - ctx->lastTime;
  if (dtMs < 1) dtMs = 1;
  if (dtMs > 50) dtMs = 50;
  ctx->lastTime = state->timeMs;

  lbmbProfileStep(
    &ctx->currentSpeed,
    &ctx->currentAccel,
    desiredSpeed,
    LBMB_TURN_ACCEL,
    LBMB_TURN_DECEL,
    LBMB_TURN_JERK,
    dt
  );

  int16_t s = lbmbClamp16(
    (int32_t)round(ctx->currentSpeed),
    0,
    LBMB_SPEED_MAX
  );

  int16_t targetLeft = isLeft ? -s : s;
  int16_t targetRight = isLeft ? s : -s;

  ctx->outLeft = lbmbWheelSlew(ctx->outLeft, targetLeft, dtMs);
  ctx->outRight = lbmbWheelSlew(ctx->outRight, targetRight, dtMs);

  cmd.leftSpeed = ctx->outLeft;
  cmd.rightSpeed = ctx->outRight;
  cmd.isDone = false;
  return cmd;
}

// -----------------------------------------------------------------------------
// Follow-line core
// -----------------------------------------------------------------------------

inline void lbmbFollowCoreInit(LbmbFollowCtx* ctx, const LbmbState* state) {
  ctx->startDist = state->distanceMm;
  ctx->startTime = state->timeMs;
  ctx->lastTime = state->timeMs;
  ctx->lastValidTime = state->timeMs;
  ctx->lastProgressTime = state->timeMs;
  ctx->maxProgress = 0;

  ctx->baseSpeed = 0.0f;
  ctx->baseAccel = 0.0f;

  ctx->prevError = 0.0f;
  ctx->filteredDerivative = 0.0f;
  ctx->integral = 0.0f;

  ctx->outLeft = 0;
  ctx->outRight = 0;

  ctx->hasValidError = false;
  ctx->markerCount = 0;
  ctx->initialized = true;
}

inline LbmbCommand lbmbFollowCoreStep(
  LbmbFollowCtx* ctx,
  const LbmbState* state,
  float speedPercent,
  uint8_t mode,
  float targetVal
) {
  LbmbCommand cmd = {0, 0, true};

  if (isnan(speedPercent) || speedPercent <= 0.0f) return cmd;

  int16_t targetSpeed = lbmbTargetSpeedFromPercent(speedPercent);
  uint32_t elapsedOverall = state->timeMs - ctx->startTime;

  if (elapsedOverall >= LBMB_MAX_OPERATION_MS) return cmd;

  int32_t targetMm = 0;
  uint32_t targetMs = 0;

  if (mode == 4) {
    if (targetVal <= 0.0f || isnan(targetVal)) return cmd;
    targetMm = (int32_t)round(targetVal * 10.0f);
  } else if (mode == 5) {
    if (targetVal <= 0.0f || isnan(targetVal)) return cmd;
    targetMs = (uint32_t)round(targetVal * 1000.0f);
  }

  // Marker stop modes.
  if (mode <= 3) {
    if (lbmbCheckMarker(state->lineState, mode)) {
      if (ctx->markerCount < 255) ctx->markerCount++;
      if (ctx->markerCount >= 3) return cmd;
    } else {
      ctx->markerCount = 0;
    }

    if (elapsedOverall >= LBMB_MARKER_TIMEOUT_MS) return cmd;
  }

  // Distance stop mode.
  int32_t distanceProgress = lbmbAbs32(state->distanceMm - ctx->startDist);
  if (mode == 4) {
    if (distanceProgress > ctx->maxProgress) {
      ctx->maxProgress = distanceProgress;
      ctx->lastProgressTime = state->timeMs;
    }

    if (distanceProgress >= targetMm) return cmd;
    if (state->timeMs - ctx->lastProgressTime >= LBMB_PROGRESS_TIMEOUT_MS) return cmd;
  }

  // Time stop mode.
  if (mode == 5 && elapsedOverall >= targetMs) return cmd;

  bool lineValid = lbmbIsLineValid(state->lineState);
  if (lineValid) {
    ctx->lastValidTime = state->timeMs;
  }

  if (state->timeMs - ctx->lastValidTime >= LBMB_LOST_LINE_TIMEOUT_MS) {
    return cmd;
  }

  float dt = lbmbDtSec(state->timeMs, ctx->lastTime);
  uint32_t dtMs = state->timeMs - ctx->lastTime;
  if (dtMs < 1) dtMs = 1;
  if (dtMs > 50) dtMs = 50;
  ctx->lastTime = state->timeMs;

  // Before the first valid line sample, crawl forward briefly instead of applying
  // an arbitrary PID direction.
  if (!lineValid && !ctx->hasValidError) {
    int16_t crawl = lbmbMin16(targetSpeed, 300);
    ctx->outLeft = lbmbWheelSlew(ctx->outLeft, crawl, dtMs);
    ctx->outRight = lbmbWheelSlew(ctx->outRight, crawl, dtMs);

    cmd.leftSpeed = ctx->outLeft;
    cmd.rightSpeed = ctx->outRight;
    cmd.isDone = false;
    return cmd;
  }

  // Lost line after having a valid error: pivot toward the last known side.
  if (!lineValid || state->lineState == 0b0000) {
    int16_t search = lbmbMin16(
      targetSpeed,
      LBMB_SEARCH_SPEED_MAX
    );

    int16_t targetLeft;
    int16_t targetRight;

    if (ctx->prevError > 0.0f) {
      // Last line was on the right -> rotate right.
      targetLeft = search;
      targetRight = -search;
    } else {
      targetLeft = -search;
      targetRight = search;
    }

    ctx->outLeft = lbmbWheelSlew(ctx->outLeft, targetLeft, dtMs);
    ctx->outRight = lbmbWheelSlew(ctx->outRight, targetRight, dtMs);

    cmd.leftSpeed = ctx->outLeft;
    cmd.rightSpeed = ctx->outRight;
    cmd.isDone = false;
    return cmd;
  }

  int16_t fallback1000 = (int16_t)round(ctx->prevError * 3000.0f);
  int16_t position1000 = lbmbLinePosition1000(state, fallback1000);
  float error = (float)position1000 / 3000.0f;
  error = lbmbClampF(error, -1.0f, 1.0f);

  if (!ctx->hasValidError) {
    ctx->prevError = error;
    ctx->filteredDerivative = 0.0f;
    ctx->integral = 0.0f;
    ctx->hasValidError = true;
  }

  float rawDerivative = (error - ctx->prevError) / dt;
  ctx->filteredDerivative +=
      LBMB_FLL_D_ALPHA * (rawDerivative - ctx->filteredDerivative);

  // Integral decay near center and after crossing the center line.
  if (lbmbAbsF(error) < 0.05f) {
    ctx->integral *= 0.90f;
  }

  if ((error > 0.0f && ctx->prevError < 0.0f) ||
      (error < 0.0f && ctx->prevError > 0.0f)) {
    ctx->integral *= 0.55f;
  }

  float candidateI = ctx->integral + error * dt;
  candidateI = lbmbClampF(candidateI, -LBMB_FLL_MAX_I, LBMB_FLL_MAX_I);

  // Curvature-aware base speed.
  float curvature =
      LBMB_FLL_ERROR_SLOWDOWN * lbmbAbsF(error) +
      LBMB_FLL_D_SLOWDOWN * lbmbAbsF(ctx->filteredDerivative);

  float speedFactor = 1.0f - curvature;
  speedFactor = lbmbClampF(speedFactor, LBMB_FLL_MIN_FACTOR, 1.0f);

  float desiredBase = targetSpeed * speedFactor;
  int16_t minimumBase = lbmbInitialSpeed(targetSpeed);
  if (desiredBase < minimumBase) desiredBase = minimumBase;

  // Distance/time braking imposes another ceiling.
  if (mode == 4) {
    int32_t remaining = targetMm - distanceProgress;
    float distanceLimit = lbmbBrakeEnvelope(
      remaining,
      lbmbMoveBrakeMm(targetSpeed),
      targetSpeed
    );
    if (distanceLimit < desiredBase) desiredBase = distanceLimit;
  } else if (mode == 5) {
    uint32_t remainingMs = targetMs - elapsedOverall;
    uint32_t brakeMs = (uint32_t)targetSpeed / 2U;
    if (brakeMs < 200U) brakeMs = 200U;
    if (brakeMs > 800U) brakeMs = 800U;

    if (remainingMs < brakeMs) {
      float f = (float)remainingMs / (float)brakeMs;
      f = lbmbClampF(f, 0.0f, 1.0f);
      float timeLimit =
          (float)minimumBase +
          ((float)targetSpeed - minimumBase) * sqrtf(f);
      if (timeLimit < desiredBase) desiredBase = timeLimit;
    }
  }

  lbmbProfileStep(
    &ctx->baseSpeed,
    &ctx->baseAccel,
    desiredBase,
    LBMB_FLL_ACCEL,
    LBMB_FLL_DECEL,
    LBMB_FLL_JERK,
    dt
  );

  float steering =
      LBMB_FLL_KP * error +
      LBMB_FLL_KI * candidateI +
      LBMB_FLL_KD * ctx->filteredDerivative;

  float steerLimit = ctx->baseSpeed * LBMB_FLL_MAX_STEER_RATIO;
  bool saturated = lbmbAbsF(steering) > steerLimit;

  // Anti-windup: do not integrate farther into saturation.
  if (saturated &&
      ((steering > 0.0f && error > 0.0f) ||
       (steering < 0.0f && error < 0.0f))) {
    candidateI = ctx->integral;
    steering =
        LBMB_FLL_KP * error +
        LBMB_FLL_KI * candidateI +
        LBMB_FLL_KD * ctx->filteredDerivative;
  }

  steering = lbmbClampF(steering, -steerLimit, steerLimit);

  int16_t base = lbmbClamp16(
    (int32_t)round(ctx->baseSpeed),
    0,
    targetSpeed
  );

  int16_t targetLeft = base;
  int16_t targetRight = base;

  // Marker debounce samples should cross the marker straight rather than allowing
  // the wide black region to provoke steering.
  if (ctx->markerCount == 0) {
    int16_t steerMag = lbmbClamp16(
      (int32_t)round(lbmbAbsF(steering)),
      0,
      base
    );

    if (steering > 0.0f) {
      // Line is right -> right turn -> slow right wheel.
      targetRight = base - steerMag;
    } else if (steering < 0.0f) {
      // Line is left -> left turn -> slow left wheel.
      targetLeft = base - steerMag;
    }
  }

  ctx->outLeft = lbmbWheelSlew(ctx->outLeft, targetLeft, dtMs);
  ctx->outRight = lbmbWheelSlew(ctx->outRight, targetRight, dtMs);

  ctx->integral = candidateI;
  ctx->prevError = error;

  cmd.leftSpeed = lbmbClamp16(ctx->outLeft, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
  cmd.rightSpeed = lbmbClamp16(ctx->outRight, -LBMB_SPEED_MAX, LBMB_SPEED_MAX);
  cmd.isDone = false;
  return cmd;
}

// -----------------------------------------------------------------------------
// Leanbot wrappers
// -----------------------------------------------------------------------------

inline LbmbState lbmbReadState() {
  // Read the calibrated digital state first for marker/lost-line logic.
  uint8_t line = LbIRLine.read();

  LbmbState state;
  state.timeMs = (uint32_t)millis();
  state.distanceMm = (int32_t)LbMotion.getDistanceMm();
  state.rotationDeg = (int32_t)LbMotion.getRotationDeg();
  state.lineState = line;

  // Raw line sensors for continuous centroid PID.
  state.ir2L = (int16_t)LbIRArray.read(ir2L);
  state.ir0L = (int16_t)LbIRArray.read(ir0L);
  state.ir1R = (int16_t)LbIRArray.read(ir1R);
  state.ir3R = (int16_t)LbIRArray.read(ir3R);

  return state;
}

void lbmbMove(float speedPercent, float distanceCm) {
  LbmbMotionCtx ctx = {};

  while (true) {
    LbmbState state = lbmbReadState();

    if (!ctx.initialized) {
      lbmbMotionCoreInit(&ctx, &state);
    }

    LbmbCommand cmd =
        lbmbMoveCoreStep(&ctx, &state, speedPercent, distanceCm);

    if (cmd.isDone) {
      LbMotion.stopAndWait();
      return;
    }

    LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
    delay(LBMB_TICK_MS);
  }
}

void lbmbTurn(float speedPercent, float angleDeg, bool isLeft) {
  if (isnan(speedPercent) || isnan(angleDeg) ||
      speedPercent <= 0.0f || angleDeg <= 0.0f) {
    LbMotion.stopAndWait();
    return;
  }

  int16_t targetSpeed = lbmbTargetSpeedFromPercent(speedPercent);

  // Leanbot convention: right is positive, left is negative.
  int32_t startRotation = (int32_t)LbMotion.getRotationDeg();
  int32_t requestedRotation =
      startRotation + (isLeft ? -(int32_t)round(angleDeg)
                              :  (int32_t)round(angleDeg));

  // One coarse pass plus at most two fine correction passes.
  for (uint8_t pass = 0; pass < 3; pass++) {
    int32_t currentRotation = (int32_t)LbMotion.getRotationDeg();
    int32_t error = requestedRotation - currentRotation;
    int32_t absError = lbmbAbs32(error);

    if (absError <= 2) break;

    int32_t passAngle = absError;

    if (pass == 0) {
      int32_t coarseLead = targetSpeed / 120;
      if (coarseLead < 3) coarseLead = 3;
      if (coarseLead > 12) coarseLead = 12;
      passAngle -= coarseLead;
    } else {
      // Fine passes deliberately stop one degree early.
      passAngle -= 1;
    }

    if (passAngle <= 0) break;

    bool passIsLeft = error < 0;
    float passSpeed = speedPercent;

    if (pass > 0) {
      int16_t fineSpeed = lbmbMin16(targetSpeed, 260);
      passSpeed = (float)fineSpeed / 20.0f;
    }

    LbmbMotionCtx ctx = {};

    while (true) {
      LbmbState state = lbmbReadState();

      if (!ctx.initialized) {
        lbmbMotionCoreInit(&ctx, &state);
      }

      LbmbCommand cmd =
          lbmbTurnCoreStep(&ctx, &state, passSpeed, (float)passAngle, passIsLeft);

      if (cmd.isDone) {
        LbMotion.stopAndWait();
        break;
      }

      LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
      delay(LBMB_TICK_MS);
    }
  }

  LbMotion.stopAndWait();
}

void lbmbTurnLeft(float speedPercent, float angleDeg) {
  lbmbTurn(speedPercent, angleDeg, true);
}

void lbmbTurnRight(float speedPercent, float angleDeg) {
  lbmbTurn(speedPercent, angleDeg, false);
}

void lbmbFollow(float speedPercent, uint8_t mode, float targetVal) {
  LbmbFollowCtx ctx = {};

  while (true) {
    LbmbState state = lbmbReadState();

    if (!ctx.initialized) {
      lbmbFollowCoreInit(&ctx, &state);
    }

    LbmbCommand cmd =
        lbmbFollowCoreStep(&ctx, &state, speedPercent, mode, targetVal);

    if (cmd.isDone) {
      LbMotion.stopAndWait();
      return;
    }

    LbMotion.runLR(cmd.leftSpeed, cmd.rightSpeed);
    delay(LBMB_TICK_MS);
  }
}

void lbmbFollowMarker(float speedPercent, byte markerMode) {
  lbmbFollow(speedPercent, markerMode, 0.0f);
}

void lbmbFollowDistance(float speedPercent, float distanceCm) {
  lbmbFollow(speedPercent, 4, distanceCm);
}

void lbmbFollowTime(float speedPercent, float timeSec) {
  lbmbFollow(speedPercent, 5, timeSec);
}
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
