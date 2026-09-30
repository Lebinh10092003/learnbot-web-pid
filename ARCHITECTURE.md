# Leanbot Studio — Kiến trúc đề xuất

## 1. Mục tiêu

Xây một Web IDE độc lập để học sinh/giáo viên lập trình Leanbot mà không phải dùng giao diện mặc định. Website phải hỗ trợ cả C++ và Blockly, kết nối robot trực tiếp bằng USB, compile trên server và upload firmware từ browser.

## 2. Kiến trúc tổng thể

```text
Browser / React
├── Monaco Editor
├── Blockly
├── Project/File Manager
├── Leanbot Device Inspector
├── Serial Monitor
├── Web Serial Transport
└── STK500 Uploader
        │
        │ HTTPS
        ▼
Compiler API
├── Arduino CLI
├── arduino:avr core
├── Leanbot library
└── Compile cache
        │
        ▼
Intel HEX
        │
        ▼
Browser → USB Serial → Leanbot ATmega328P
```

## 3. UI/UX

Pattern dùng cho prototype:

- **App Shell:** top navigation + activity rail + main workspace.
- **Command/search trigger:** tương tự command palette trong các developer tools.
- **Resizable panels:** Explorer / Editor / Device Inspector và Editor / Console.
- **Dark developer-tool theme:** ưu tiên độ tương phản, ít màu trang trí, trạng thái thiết bị rõ ràng.

Không copy mã nguồn block Pro; project tự triển khai layout theo pattern.

## 4. Frontend modules

### `device/serial`

- `connect()`
- `disconnect()`
- `send()`
- `readLoop()`
- `resetDTR()`
- device info

### `compiler`

Request đề xuất:

```json
{
  "board": "arduino:avr:uno",
  "source": "#include <Leanbot.h>...",
  "libraries": ["Leanbot"]
}
```

Response:

```json
{
  "success": true,
  "hex": "base64-or-intel-hex",
  "stdout": "...",
  "stderr": "",
  "flashBytes": 12344,
  "ramBytes": 612
}
```

### `uploader/stk500`

State machine:

```text
IDLE
→ RESETTING
→ SYNCING
→ WRITING
→ VERIFYING
→ REBOOTING
→ DONE
```

Lỗi phải xác định theo phase để người dùng biết lỗi compile, lỗi chọn cổng, lỗi bootloader hay lỗi verify.

## 5. Blockly groups

### Motion

- Run wheels L/R
- Move distance mm/cm
- Rotate degrees
- Stop
- Get distance
- Get heading

### Gripper

- Open
- Close
- Move both
- Move left/right

### Sensors

- Read line state
- Raw IR
- Touch
- Ultrasonic
- Wall/edge sensors

### Output

- RGB LEDs
- Buzzer/tone

### Control

- Mission begin/end
- Delay
- if/else
- loops
- variables
- functions

## 6. Diagnostics protocol đề xuất

Firmware diagnostics có thể stream mỗi 50–100 ms:

```text
@S,{"ir":[112,642,687,104],"touch":[0,0,0,0],"distance":23.8,"motor":[0,0],"gripper":[0,0]}
```

Frontend chỉ parse dòng bắt đầu bằng `@S,`; output Serial còn lại hiển thị bình thường.

## 7. Calibration

### IR line

- đọc white samples;
- đọc black samples;
- tính threshold trung bình;
- preview trạng thái 4 bit;
- save config.

### Motor

- test forward;
- đảo từng motor;
- lưu EEPROM.

### Gripper

- slider trái/phải;
- test open/close;
- lưu giới hạn an toàn.

## 8. Bảo vệ robot

Website production nên có:

- giới hạn motor speed ở UI theo cấu hình;
- Emergency Stop luôn khả dụng;
- timeout khi robot nhận lệnh realtime;
- disable Upload khi compile lỗi;
- verify firmware sau ghi;
- cảnh báo pin/connection nếu có dữ liệu;
- không tự reconnect và upload firmware nếu chưa có hành động của người dùng.

## 9. Roadmap

### Phase 1 — IDE C++
- Monaco
- compile backend
- Web Serial
- STK500
- Serial Monitor

### Phase 2 — Blockly
- custom Leanbot blocks
- generator C++
- blocks ⇄ generated code preview

### Phase 3 — Robot Tools
- live sensors
- calibration
- device diagnostics
- firmware/version info

### Phase 4 — Classroom
- login
- cloud project
- assignment
- submit
- teacher dashboard
- project version history
