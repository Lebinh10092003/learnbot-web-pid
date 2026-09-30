export const LEANBOT_CAPABILITIES = {
  'LbMission.begin': 'full', 'LbMission.end': 'full', 'LbMotion.runLR': 'full',
  'LbMotion.runLRrpm': 'full', 'LbMotion.waitDistanceMm': 'full',
  'LbMotion.waitRotationDeg': 'full', 'LbMotion.stopAndWait': 'full',
  'LbGripper.open': 'full', 'LbGripper.close': 'full', 'LbGripper.moveTo': 'full',
  'LbGripper.moveToLR': 'full', 'Leanbot.pingCm': 'full', 'Leanbot.pingMm': 'full',
  'Leanbot.tone': 'full', LbDelay: 'full', 'LbIRArray.read': 'full',
  'LbIRLine.isBlackDetected': 'full', 'LbTouch.read': 'full', random: 'full', constrain: 'full',
  switch: 'partial', pointer: 'unsupported', template: 'unsupported', asm: 'unsupported', malloc: 'unsupported',
} as const
