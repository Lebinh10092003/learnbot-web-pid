# Leanbot Studio — Web IDE Prototype

Prototype website lập trình Leanbot bằng React + TypeScript + Vite. Giao diện được thiết kế lại theo pattern **App Shell / Sidebar / Resizable Panels** của hệ sinh thái shadcn, phù hợp với IDE kỹ thuật thay vì dashboard thông thường.

## Tính năng hiện có

- App shell tối ưu cho IDE: activity bar, project explorer, editor, device inspector, console và status bar.
- Editor Arduino/C++ dạng textarea có line number, file tabs, nút Code/Blocks.
- Project tree mẫu với `.ino`, header, examples và config.
- Panel Leanbot: trạng thái thiết bị, IR/line, ultrasonic, touch, motion và gripper.
- Web Serial thực tế cho Chrome/Edge:
  - CH340 `VID 0x1A86 / PID 0x7523`.
  - FTDI `VID 0x0403 / PID 0x6001`.
  - Baudrate 115200.
  - Kết nối/ngắt kết nối.
  - Serial read stream.
  - Gửi dữ liệu serial.
  - Reset DTR low → 10 ms → high.
- Compile prototype: kiểm tra cấu trúc Leanbot và trả log giả lập.
- Upload prototype: compile + reset DTR. Chưa ghi Flash STK500 thật để tránh vô tình flash thiết bị trước khi tích hợp compiler backend chính thức.
- Layout resize được theo chiều ngang/dọc bằng `react-resizable-panels`.
- Responsive cơ bản.

## Chạy project

Yêu cầu Node.js 20+.

```bash
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị trong Terminal, thường là:

```text
http://localhost:5173
```

Build production:

```bash
npm run build
npm run preview
```

## Web Serial

Web Serial yêu cầu secure context. Hai trường hợp phù hợp:

- `http://localhost` khi phát triển local.
- Website production chạy HTTPS.

Nên dùng Chrome/Edge desktop. Khi bấm **Connect Leanbot**, trình duyệt mở hộp chọn cổng USB.

## Cấu trúc

```text
src/
├── components/
│   ├── CodeEditor.tsx
│   ├── Console.tsx
│   ├── FileTree.tsx
│   ├── IconButton.tsx
│   └── SensorPanel.tsx
├── lib/
│   ├── defaultCode.ts
│   ├── mockCompiler.ts
│   └── serial.ts
├── App.tsx
├── main.tsx
├── styles.css
└── types.ts
```

## Những gì cần làm để thành sản phẩm thật

1. Thay `mockCompiler.ts` bằng compiler service thật dùng Arduino CLI + AVR Core + Leanbot library.
2. Backend trả Intel HEX.
3. Hoàn thiện STK500 uploader phía browser:
   - toggle DTR;
   - `GET_SYNC 0x30 0x20`;
   - `LOAD_ADDRESS 0x55`;
   - `PROG_PAGE 0x64` theo page 128 byte;
   - verify bằng `READ_PAGE 0x74`;
   - progress + retry + cancel.
4. Thay textarea bằng Monaco Editor để có autocomplete/diagnostic.
5. Tích hợp Blockly thật và generator sang Arduino C++.
6. Tạo firmware diagnostics để stream sensor JSON/CSV về Serial Monitor.
7. Thêm calibration wizard cho IR, motor direction và gripper.
8. Thêm Project storage: IndexedDB trước, sau đó tài khoản/cloud.

Xem thêm `ARCHITECTURE.md`.
