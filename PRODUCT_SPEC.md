# Product Specification — Leanbot Studio

## 1. Đối tượng sử dụng

- Học sinh mới học Robotics: dùng Blockly/Easy Mode.
- Học sinh nâng cao: lập trình Arduino C++ trực tiếp.
- Giáo viên: chuẩn bị project mẫu, kiểm tra robot, calibration, Serial Monitor.
- CLB/đội thi: cần editor nhanh, API Leanbot rõ và upload ổn định.

## 2. Các vùng giao diện

### Thanh trên
- Tên workspace/project.
- Command search `Ctrl+K`.
- Thiết lập/theme.
- Connect/Disconnect Leanbot.

### Activity bar
- Files.
- Search.
- Blockly.
- Robot.
- Sensors.
- Docs.

### Explorer
- File `.ino`.
- Header/custom helper.
- Examples.
- Libraries/config.
- Outline function.

### Editor
- Code mode.
- Blocks mode.
- Compile.
- Upload.
- Stop.

### Console
- Output compiler.
- Problems.
- Serial Monitor.
- Upload progress/error phase trong bản production.

### Device Inspector
- Kết nối.
- IR/line.
- Ultrasonic.
- Touch.
- Motor.
- Gripper.

## 3. Leanbot API cần hỗ trợ autocomplete/Blockly

### Core
```cpp
Leanbot.begin();
LbDelay(ms);
LbMission.begin(comboTouch);
LbMission.end();
```

### Motion
```cpp
LbMotion.runLR(leftStepsPerSecond, rightStepsPerSecond);
LbMotion.runLRrpm(leftRpm, rightRpm);
LbMotion.waitDistanceMm(mm);
LbMotion.waitRotationDeg(deg);
LbMotion.stopAndWait();
LbMotion.setZeroOrigin();
LbMotion.getDistanceMm();
LbMotion.getRotationDeg();
```

### Gripper
```cpp
LbGripper.open();
LbGripper.close();
LbGripper.moveTo(angleDeg);
LbGripper.moveToLR(leftDeg, rightDeg, timeMs);
```

### IR / line
```cpp
LbIRLine.read();
LbIRLine.value();
LbIRLine.isBlackDetected();
LbIRArray.read(irX);
LbIRLine.setThreshold(...);
LbIRLine.doManualCalibration(touchButton);
```

### Touch
```cpp
LbTouch.read(TB1A);
LbTouch.readBits();
LbTouch.onPress(TB1A);
```

### Distance
```cpp
Leanbot.pingCm();
Leanbot.pingMm();
```

### RGB
```cpp
LbRGB[ledA] = CRGB::Red;
LbRGB.fillColor(...);
LbRGB.clear();
LbRGB.show();
```

### Sound
```cpp
Leanbot.tone(freq);
Leanbot.tone(freq, duration);
Leanbot.noTone();
```

## 4. Compile + Upload production flow

```text
Editor
  ↓
Validate project
  ↓
POST /api/compile
  ↓
Arduino CLI + AVR Core + Leanbot Library
  ↓
Intel HEX
  ↓
Web Serial
  ↓
DTR reset
  ↓
STK500 sync
  ↓
Write flash 128-byte pages
  ↓
Read/verify
  ↓
Restart / Serial Monitor
```

## 5. An toàn

- Không cho Upload khi compiler báo lỗi.
- Không ghi firmware nếu port không đúng thiết bị được người dùng chọn.
- Verify Flash sau ghi.
- Có Cancel Upload.
- Có trạng thái rõ: Resetting/Syncing/Writing/Verifying/Done.
- Nút Stop phải luôn dễ truy cập.
- Các tool điều khiển realtime cần watchdog timeout.

## 6. Những phần prototype đã làm

- Full IDE shell.
- Resizable panels.
- Code editor prototype.
- Blocks workspace prototype.
- Device panel.
- Serial console UI.
- Web Serial connect/disconnect/read/send/reset DTR.
- Compile mock.
- Upload preparation mock.

## 7. Những phần chưa giả vờ là đã hoàn thành

- Compiler server thật.
- Leanbot library package tự host.
- STK500 write/verify production.
- Monaco IntelliSense.
- Blockly drag/drop thật.
- Sensor firmware streaming thật.
- Cloud project/classroom.
