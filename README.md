# Hutao-Chan v2 — Bot cấp độ & dashboard Discord

Bot Discord đa server, viết bằng Node.js ES Modules, discord.js v14 và MongoDB Atlas. Dashboard Express/EJS dùng tiếng Việt, giao diện tối với màu đỏ/cam theo chủ đề Hu Tao.

## Tính năng

- Chat thưởng ngẫu nhiên **10–15 XP**, cooldown mặc định **30 giây** cho mỗi thành viên trong từng server.
- Voice thưởng **2 XP/phút hợp lệ**, tối thiểu 2 người hợp lệ; bỏ qua bot, kênh AFK, người tắt/bị tắt mic hoặc tai nghe, người bị loại trừ và người không được nói trên sân khấu.
- Hai chế độ: **Role Mapping** giữ role thưởng cao nhất; **Unlimited** tích lũy role đã đạt. Cả hai đều tiếp tục tăng level sau mốc cuối.
- Welcome/goodbye tùy chỉnh kênh, nội dung, embed hoặc văn bản; biến `{user}`, `{username}`, `{server}`, `{memberCount}`.
- `/rank [user]` hiển thị cấp độ, thứ hạng và thanh XP màu bằng chữ, `/leaderboard [page]` phân trang 10 người/trang, `/help` hướng dẫn và `/setup` quản trị.
- Dashboard: đăng nhập Discord, chọn server có quyền quản lý, cấu hình XP/role/kênh/loại trừ, xem trước lời chào và leaderboard.
- Mỗi server có dữ liệu XP và cấu hình riêng. Cấu hình từ dashboard và `/setup` dùng chung một lớp kiểm tra.
- Session lưu MongoDB, mã hóa dữ liệu session, OAuth state, cookie HttpOnly/SameSite, CSRF, giới hạn tần suất và kiểm tra lại quyền quản lý khi truy cập server.

XP cần để lên cấp tiếp theo: `50 × level² + 200 × level + 300`.
Tổng XP đạt level 5 / 15 / 30: **5.000 / 76.250 / 523.750**.

## Chạy local

Yêu cầu **Node.js 22.12+ còn được hỗ trợ**, khuyến nghị **24 LTS**, MongoDB Atlas và một ứng dụng Discord có bot.

```powershell
npm ci
Copy-Item .env.example .env
```

Nếu đã có `.env`, giữ file đó và bổ sung những biến mới, tránh ghi đè token/URI đang dùng.

Thiết lập:

| Biến | Mục đích |
| --- | --- |
| `DISCORD_TOKEN` | Bot token từ mục Bot |
| `DISCORD_CLIENT_ID` | Application ID của cùng ứng dụng Discord |
| `MONGODB_URI` | URI MongoDB Atlas; URL-encode ký tự đặc biệt trong mật khẩu |
| `PORT` | Cổng web, mặc định 3000 |
| `DASHBOARD_URL` | URL gốc web, ví dụ `http://localhost:3050` |
| `DISCORD_CLIENT_SECRET` | Client Secret tại OAuth2 trong Developer Portal |
| `OAUTH2_CALLBACK_URL` | Ví dụ `http://localhost:3050/auth/discord/callback` |
| `SESSION_SECRET` | Khóa ngẫu nhiên ít nhất 32 ký tự |
| `NODE_ENV` | `development` local, `production` khi deploy HTTPS |

Tạo khóa phiên rồi điền vào `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Trong [Discord Developer Portal](https://discord.com/developers/applications):

1. Chọn đúng ứng dụng bot → **OAuth2** → **Client Secret / Reset Secret**. Điền giá trị vào `DISCORD_CLIENT_SECRET` trong `.env`.
2. Trong **Redirects**, thêm chính xác URL `OAUTH2_CALLBACK_URL`, bao gồm cổng và đường dẫn, rồi Save Changes.
3. Trong **Bot → Privileged Gateway Intents**, bật **Server Members Intent** và **Message Content Intent**. Không cần Presence Intent.
4. Mời bot bằng liên kết trên trang chủ. Bot cần Xem kênh, Gửi tin, Nhúng liên kết, Đính kèm tệp và Quản lý vai trò.
5. Đặt role bot cao hơn mọi role thưởng.

Chạy:

```powershell
npm run dev
# hoặc
npm start
```

Mở URL tương ứng với `PORT`. `npm run dev` theo dõi cả `.env`; `npm start` cần khởi động lại sau khi sửa biến môi trường.

Dashboard chỉ bật khi đủ Client ID, MongoDB URI, Client Secret và Session Secret hợp lệ về cấu hình. Nếu thiếu, bot và các trang công khai vẫn hoạt động khi MongoDB đã kết nối; trang đăng nhập nêu biến cần bổ sung. Nếu MongoDB không kết nối lúc khởi động, bot không đăng nhập để tránh mất dữ liệu.

## Dùng trong Discord

```text
/rank
/rank user:@thanhvien
/leaderboard
/leaderboard page:2
/help

/setup welcome enabled:True channel:#chao-mung message:Chào {user}!
/setup welcome enabled:False
/setup goodbye enabled:True channel:#tam-biet embed:True
/setup addrole level:0 role:@TânBinh
/setup addrole level:5 role:@ThànhViên
/setup levelmode mode:role_mapping
/setup levelmode mode:unlimited
/setup removerole level:5
/setup listroles
/setup xp chat min:10 max:15 cooldown:30
/setup xp voice reward:2 members:2
/setup channel channel:#len-cap
/setup view
/setup reset confirm:True
/setup dashboard
```

`/setup` cần quyền **Quản lý Server**. `/rank`, `/leaderboard` và `/setup` chỉ dùng trong server; `/help` dùng được trong DM. Lệnh global đăng ký khi bot kết nối, có thể cần tải lại Discord để thấy thay đổi.

Có thể đồng bộ lệnh mà không mở thêm kết nối bot bằng `npm run register`. `/help` dùng liên kết slash command bấm được khi lấy được command ID từ Discord. Trong Developer Portal → Installation, Guild Install cần scopes `bot` + `applications.commands`; User Install chỉ cần `applications.commands`.

Mục **Lệnh / Try My Commands** trên hồ sơ là giao diện của Discord. API công khai không có tùy chọn cấu hình riêng mục này; đăng ký global commands không bảo đảm các nút xuất hiện ngay. Có thể dùng `/help` hoặc gõ `/` trong server để mở các lệnh đã đăng ký.

Role Mapping yêu cầu ít nhất một mốc. Muốn xóa mốc cuối, chuyển sang Unlimited trước. Mốc role được tự sắp theo level; role tích hợp, @everyone hoặc role nằm trên bot không dùng làm thưởng.

Bot đối chiếu vai trò đang có với các mốc thưởng đã chọn để lấy cấp độ và XP tối thiểu, rồi tiếp tục cộng điểm từ đó. XP cao hơn mốc được giữ nguyên; điểm không bị cộng lặp khi đối chiếu lại. `GuildConfig.roleBaselines` khai báo vai trò đặc biệt chỉ dùng để đọc cấp có sẵn; bot không tự trao hay gỡ các vai trò này. Những vai trò khác được bỏ qua. Discord không lưu XP trong vai trò nên không thể suy ra số điểm chính xác của bot khác.

Danh sách thành viên được đồng bộ khi bot khởi động, vào server mới hoặc đổi các mốc thưởng; người chưa từng chat cũng xuất hiện. Thay đổi vai trò, tên, tham gia/rời server được cập nhật qua sự kiện Discord. Bảng xếp hạng ưu tiên vị trí vai trò cấp bậc trên Discord, sau đó mốc cấp và XP; vai trò sở thích/quản trị không được dùng để xếp hạng. Chuyển trang chỉ đọc 10 hồ sơ từ MongoDB, kèm tổng số người/trang; dùng chỉ mục `{ guildId, inGuild, rolePosition, roleLevel, xp, userId }` để lọc và sắp xếp. Nút số trang giới hạn quanh trang đang xem và hai đầu danh sách. Vai trò thưởng được trao ở lần nhận XP tiếp theo; thành viên mới nhận mốc 0 khi tham gia. Xóa mốc/reset không tự thu hồi role đã cấp. Reset không xóa XP.

Bộ đếm tin nhắn chỉ tăng cho tin nhắn nhận XP. Voice chỉ tính đủ phút ở trạng thái hợp lệ, không cộng bù thời gian bot tắt. Các kênh con/thread được loại trừ theo kênh hoặc danh mục cha.

## Dashboard và API

- `/`: giới thiệu; `/docs`: hướng dẫn tiếng Việt công khai.
- `/auth/discord`: đăng nhập; `/auth/discord/callback`: nhận callback.
- `POST /auth/logout`: đăng xuất, yêu cầu CSRF.
- `/servers`: danh sách server có quyền quản lý; `/servers/:id`: cấu hình.
- `GET /api/guilds/:id/settings`: cấu hình và danh sách kênh/role.
- `POST /api/guilds/:id/settings`: body `{ settings, revision }`, header `x-csrf-token`.
- `POST /api/guilds/:id/reset`: body `{ confirm: true, revision }`, yêu cầu CSRF.
- `GET /api/guilds/:id/leaderboard?page=1`: 10 người/trang, trả `entries`, `memberCount`, `page`, `pageSize`, `totalPages`; yêu cầu quyền quản lý. Trang vượt cuối được đưa về trang cuối, trang không phải số nguyên dương nhận HTTP 400.
- `GET /health`: HTTP 200 khi MongoDB và Discord đã kết nối, 503 nếu một trong hai chưa sẵn sàng.

Session tồn tại tối đa 24 giờ hoặc đến lúc access token hết hạn; khi hết hạn, đăng nhập lại. Client Secret và token không được render vào HTML. Quyền server được kiểm tra lại bằng member/role từ Discord, không chỉ dựa trên thông tin OAuth lúc đăng nhập.

Khóa mã hóa Mongo session được dẫn xuất riêng từ `SESSION_SECRET`, hỗ trợ cả khóa hex ngẫu nhiên do lệnh hướng dẫn tạo ra. Khi nâng cấp từ phiên bản dùng trực tiếp secret để mã hóa, phiên cũ cần đăng nhập lại. Lỗi callback hiển thị mã hỗ trợ; `logs/oauth.log` ghi thời điểm, mã lỗi, HTTP status và mã lỗi kết nối nếu có, không ghi code/token/state/secret.

Khi đăng nhập lỗi trên Render, xem `[OAuth]` trong Logs: `OAUTH_CLIENT_REJECTED` là Discord từ chối thông tin ứng dụng; `OAUTH_RATE_LIMITED` đi kèm HTTP 429; `OAUTH_ACCESS_BLOCKED` đi kèm HTTP 403; `OAUTH_NETWORK_FAILED` đi kèm mã DNS/kết nối. Không kết luận secret sai chỉ từ `OAUTH_EXCHANGE_FAILED`. Nếu `/health` báo `discord: false`, xem thêm `[Discord REST]` và `[Discord] LOGIN_PENDING`/`SHARD_ERROR`/`SHARD_DISCONNECTED`; các log này không ghi URL tương tác chứa token.

Cấu hình có trường `revision`: khi hai cửa sổ cập nhật cùng lúc, yêu cầu dùng phiên bản cũ nhận HTTP 409. Tải lại trước khi chỉnh tiếp.

## Nâng cấp từ v1

- Giữ nguyên collection `users`; không xóa XP hoặc chạy reset dữ liệu.
- Giữ `GUILD_ID`, `ROLE_LVL0_ID`, `ROLE_LVL5_ID`, `ROLE_LVL15_ID`, `ROLE_LVL30_ID` và `LEVEL_UP_CHANNEL_ID` của server gốc. `GUILD_ID` chỉ xác định server nhập mặc định, không giới hạn bot vào server đó.
- Nếu server chưa có GuildConfig, bot dùng mặc định. Server gốc nhập các role ID từ env; server mới dùng Unlimited, không có role thưởng hoặc kênh thông báo mặc định. Cooldown mặc định là **30 giây**.
- Hồ sơ mới và hồ sơ cũ ở từng server được nâng lên tối thiểu bằng XP của vai trò cấp bậc đang có. Giữ nguyên XP vượt mốc, số tin nhắn và thời gian thoại. Chỉ dùng role ID đã cấu hình ở server đó, không dò theo tên. Vai trò đặc biệt cần nằm trong `roleBaselines` để quy đổi cấp mà không biến thành phần thưởng tự động.
- Khi đã lưu GuildConfig, sửa trên dashboard hoặc `/setup`; thay đổi env không ghi đè cấu hình đã lưu.
- Dùng `passport-oauth2` để tích hợp Discord trực tiếp, cùng OAuth state; không phụ thuộc `passport-discord`.

## Kiểm tra

```powershell
npm run check
npm test
```

Test dùng MongoDB tạm bằng `mongodb-memory-server`, không kết nối Atlas thật và không đăng nhập bot thật. Lần đầu có thể tải MongoDB binary.

Test trình duyệt dùng Chrome/Edge đã cài trên Windows. Trên máy khác đặt `BROWSER_EXECUTABLE` đến Chromium tương thích; nếu không có trình duyệt, bài kiểm tra này được đánh dấu skip. CI chạy kiểm tra cú pháp và các bài test MongoDB/HTTP.

Bao gồm: ngưỡng XP, cooldown 30 giây, đa server, cập nhật chat/voice đồng thời, role mapping/stacking, loại trừ, welcome, hồ sơ cấp độ bằng chữ và thanh tiến độ màu, quyền dashboard, CSRF, xung đột phiên bản và giao diện desktop/mobile.

## Triển khai

Có sẵn `render.yaml` cho một Node Web Service: bot + dashboard dùng chung tiến trình, build `npm ci --omit=dev`, start `npm start`.

1. Đưa code lên repository và tạo service/Blueprint trên Render.
2. Điền secrets trong Environment, đặt `NODE_ENV=production`.
3. Đặt `DASHBOARD_URL=https://ten-service.onrender.com` và `OAUTH2_CALLBACK_URL=https://ten-service.onrender.com/auth/discord/callback`.
4. Thêm callback HTTPS đó vào Developer Portal. Khóa session được Blueprint tạo tự động.
5. Cho phép IP dịch vụ truy cập Atlas. Nếu nâng cấp v1, thêm các biến guild/role cũ khi cần.
6. Kiểm tra `/health`, đăng nhập OAuth thực tế, gửi chat, voice và thử thành viên tham gia/rời server.

Blueprint dùng gói Free để thử nghiệm. **Không cam kết online 24/7**: Render Free có sleep, quota và giới hạn khác. Dùng gói luôn chạy hoặc máy chủ riêng nếu cần ổn định. Dịch vụ ping chỉ dùng theo dõi, không phải bảo đảm khả dụng. Xem [giới hạn chính thức của Render](https://render.com/docs/free).

Chỉ chạy **một tiến trình bot cho mỗi token**, tránh hai tiến trình cùng thưởng voice. Trên Render tránh để bản local chạy cùng lúc với bản deploy. Reverse proxy hiện được cấu hình một lớp; điều chỉnh `trust proxy` nếu hạ tầng khác.

Việc triển khai lên tài khoản hosting và OAuth với tài khoản thật cần được kiểm tra tại môi trường vận hành; test tự động dùng dữ liệu thử nghiệm.
