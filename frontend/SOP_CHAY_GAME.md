# SOP chạy game khi có code mới

Áp dụng cho Command Prompt (CMD) trên Windows. Mỗi khối lệnh bắt đầu từ đường dẫn đầy đủ để tránh lỗi backend\backend. Dùng Node.js 24.21.0.

## 1. Dừng bản đang chạy

Tại mỗi terminal backend và frontend, bấm **Ctrl+C**. Nếu CMD hỏi dừng batch job, nhập **Y** rồi Enter. Việc dừng backend sẽ ngắt ván đang chơi.

Nếu không tìm được terminal cũ hoặc gặp lỗi cổng bị chiếm, giải phóng cổng trước.

```cmd
netstat -ano | findstr LISTENING | findstr ":3001 :5173"
```

Cột cuối là PID. Kiểm tra từng PID thuộc backend hoặc Vite của dự án, rồi dừng. Thay 12345 bằng PID thực.

```cmd
tasklist /FI "PID eq 12345"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=12345' | Format-List ProcessId,CommandLine"
taskkill /PID 12345 /T /F
```

Chạy lại lệnh netstat để xác nhận hai cổng đã trống. Nếu thấy cùng PID lặp lại ở IPv4/IPv6, chỉ dừng PID đó một lần.

## 2. Nhận code từ đội

Nếu code mới đã có trong máy, chuyển sang bước 3. Nếu cần nhận từ GitHub, chạy trong terminal bất kỳ.

```cmd
cd /d D:\Projects\docuu
git status --short
git pull --ff-only
```

Nếu có thay đổi local cần giữ hoặc Git báo lỗi, xử lý trước khi tiếp tục. Chỉ chuyển sang bước sau khi lệnh cập nhật thành công.

Nếu Git báo dubious ownership, xác nhận đây là thư mục dự án của bạn rồi chạy.

```cmd
git config --global --add safe.directory D:/Projects/docuu
git status --short
git pull --ff-only
```

## 3. Cài thư viện sau khi cập nhật code từ đội

Chạy ở lần đầu hoặc khi package.json/package-lock.json thay đổi. Nếu chỉ sửa code trong máy và thư viện giữ nguyên, chuyển sang bước 4.

```cmd
cd /d D:\Projects\docuu
npm --prefix packages/shared ci
npm --prefix backend ci
npm --prefix frontend ci
```

## 4. Build shared và backend rồi chạy backend

Trong terminal thứ nhất, chạy từng lệnh. Chỉ tiếp tục khi lệnh trước thành công.

```cmd
cd /d D:\Projects\docuu
npm --prefix packages/shared run build
npm --prefix backend run build
npm --prefix backend run dev
```

Giữ terminal này mở. Backend dùng cổng 3001.

## 5. Chạy frontend LAN

Trong terminal thứ hai.

```cmd
cd /d D:\Projects\docuu
npm --prefix frontend run dev:lan
```

Giữ terminal này mở. Cả hai máy cùng Wi-Fi mở địa chỉ **Network** mà Vite hiển thị, cổng 5173. Khi đổi mạng, dùng địa chỉ Network mới.

## 6. Kiểm tra game

Tải lại trang trên cả hai máy. Một người tạo phòng, người còn lại nhập mã. Cả hai bấm Sẵn sàng, chủ phòng bắt đầu và đội trưởng chọn nhà giam.

Kiểm tra backend từ máy chủ tại http://localhost:3001/healthz. Từ máy khách, mở /healthz trên cùng địa chỉ Network của frontend.

Ví dụ Vite hiển thị Network là http://192.168.1.10:5173/, cả hai máy mở địa chỉ đó. Chọn Tạo phòng mới trên máy thứ nhất, nhập mã phòng trên máy thứ hai. Sau khi đội trưởng chọn nhà giam, mỗi người bấm Vào trận đấu để khóa chuột. Nhấn Esc để mở lại bảng phòng.

Khi đã khởi động lại backend, tải lại trang ở tất cả máy và tạo phòng mới nếu phiên cũ không còn khả dụng.

## 7. Khi chỉ sửa code trong lúc phát triển

- Sửa FE trong src hoặc CSS, lưu file để Vite cập nhật. Tải lại trang nếu cần.
- Sửa backend hoặc shared, dừng backend bằng Ctrl+C rồi chạy lại bước 4.
- Sửa cấu hình Vite hoặc cài thư viện, dừng frontend bằng Ctrl+C rồi chạy lại bước 5.

## 8. Kiểm tra trước khi bàn giao code

Từ thư mục gốc, chạy từng lệnh và xử lý lỗi trước khi tiếp tục.

```cmd
cd /d D:\Projects\docuu
npm --prefix packages/shared run typecheck
npm --prefix packages/shared run build
npm --prefix packages/shared test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend/apps/server test
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

Để chạy kiểm tra trình duyệt với Chrome đã cài trên máy.

```cmd
set PLAYWRIGHT_CHANNEL=chrome
npm --prefix frontend run test:e2e
npm --prefix frontend run test:backend
```

## 9. Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Đường dẫn backend/backend/package.json | Chạy cd /d D:\Projects\docuu rồi dùng các lệnh npm --prefix trong SOP. |
| EADDRINUSE hoặc Port 5173 is already in use | Dừng server cũ theo bước 1, kiểm tra lại netstat rồi chạy lại. |
| Thiếu thư viện hoặc module | Chạy bước 3, sau đó build lại shared và backend. |
| Build TypeScript thất bại | Sửa lỗi được in ra rồi build lại trước khi chạy server. |
| Máy thứ hai không mở được game | Kiểm tra cùng mạng, địa chỉ Network hiện tại, kết nối TCP 5173 được phép và Wi-Fi cho phép thiết bị liên lạc. |
| Trang mở được nhưng không kết nối server | Mở /healthz trên địa chỉ frontend. Kiểm tra terminal backend và cổng 3001. |
| Phiên phòng hết hạn sau khi restart | Tải lại trang, tạo hoặc vào lại phòng mới. |

## 10. Các lần chạy hằng ngày

Sau khi dừng hai server cũ, dùng terminal backend.

```cmd
cd /d D:\Projects\docuu
npm --prefix packages/shared run build
npm --prefix backend run build
npm --prefix backend run dev
```

Terminal frontend.

```cmd
cd /d D:\Projects\docuu
npm --prefix frontend run dev:lan
```

Nếu vừa nhận thay đổi thư viện, thực hiện thêm bước 3 trước khi chạy hai terminal này.
