# 📜 Kế Hoạch Triển Khai Bot Discord "Hutao-Chan"
> **Hệ thống tính điểm kinh nghiệm (Chat & Voice Rank System) & Tự động thăng cấp**  
> **Server áp dụng:** Hội Thờ Gái Anime  
> **Phong cách:** Hu Tao (Đường Chủ Vãng Sinh Đường đời thứ 77 - Genshin Impact)  
> **Cơ sở dữ liệu:** 100% MongoDB Cloud (Atlas)  

---

## 🛠️ 1. Công Nghệ & Tiêu Chuẩn Kỹ Thuật

* **Ngôn ngữ:** JavaScript / Node.js (v18+ LTS).
* **Kiến trúc Module:** **ES Modules** (`"type": "module"`, cú pháp `import/export` đồng bộ theo phong cách dự án `Check-in-TutorO`).
* **Thư viện chính:**
  * `discord.js` v14 (tương tác Discord Gateway, sự kiện thời gian thực và Slash Commands).
  * `mongoose` (kết nối và quản lý cơ sở dữ liệu MongoDB Atlas Cloud).
  * `dotenv` (quản lý biến môi trường an toàn).
  * `express` (web server phụ trợ phục vụ kiểm tra sức khỏe bot / keep-alive 24/7).

---

## 📁 2. Cấu Trúc Thư Mục Chuẩn Hóa

```text
D:\Work\Project\bot-rankup-discord/
├── .env                  # Chứa DISCORD_TOKEN, MONGODB_URI, GUILD_ID, ROLE_IDS...
├── .env.example          # File mẫu biến môi trường
├── .gitignore            # Bỏ qua node_modules và .env
├── package.json          # Quản lý thư viện phụ thuộc và scripts chạy ("type": "module")
├── KE_HOACH_DU_AN.md     # Tài liệu kế hoạch chi tiết
├── README.md             # Hướng dẫn thiết lập và vận hành bot
└── src/
    ├── config/
    │   └── index.js      # Load env, cấu hình mốc rank, tỷ lệ XP, thời gian cooldown
    ├── models/
    │   └── User.js       # Mongoose Schema lưu dữ liệu XP, Level, thời gian Voice
    ├── services/
    │   ├── discord.js    # Khởi tạo Discord Client, đăng ký Intents và lắng nghe sự kiện
    │   └── database.js   # Quản lý kết nối MongoDB Atlas (kết nối lại tự động khi mất mạng)
    ├── core/
    │   ├── level.js      # Thuật toán tính Level, kiểm tra thăng cấp, tự động gán & gỡ Role
    │   ├── chatXp.js     # Xử lý sự kiện messageCreate, cooldown 60s, cộng XP ngẫu nhiên
    │   └── voiceXp.js    # Quét định kỳ 60s kênh thoại, kiểm tra chống AFK, cộng XP voice
    ├── commands/
    │   ├── rank.js       # Slash Command /rank hiển thị thẻ hồ sơ và thanh tiến trình
    │   └── leaderboard.js# Slash Command /leaderboard hiển thị Top 10 server
    ├── utils/
    │   ├── time.js       # Các hàm tiện ích định dạng thời gian
    │   └── embed.js      # Tạo Embed phong cách Hu Tao (màu đỏ bỉ ngạn, bướm lửa)
    ├── server.js         # Web server Express mini phục vụ Healthcheck / Uptime
    └── index.js          # Điểm khởi chạy chính của bot (Entrypoint 24/7)
```

---

## 🪜 3. Lộ Trình Thăng Tiến 4 Bậc (Cân Bằng 4 - 5 Tháng)

### ⚠️ Lưu ý phân quyền bắt buộc trên Discord:
> Trong **Cài đặt máy chủ $\rightarrow$ Vai trò**, vai trò mang tên **`Bot`** (hoặc role **`Hutao-Chan`**) bắt buộc phải được kéo nằm **TRÊN** role `Người nhà nước` (ngay dưới role `Đức quốc xã`) để Discord cho phép bot tự động gán vai trò cao nhất này cho thành viên.

### Bảng phân cấp vai trò chuẩn độ khó cao:

```
[Đức quốc xã] (Admin tối cao - Không can thiệp)
     ▲
[Bot / Hutao-Chan] (Nằm ở đây để quản lý toàn bộ các role bên dưới)
     ▲
[Người nhà nước]  (Level 30 - ~4 đến 5 tháng cày cuốc tích cực)
     ▲
[Nigger Boy]      (Level 15 - ~1.5 đến 2 tháng gắn bó)
     ▲
[Người do thái]   (Level 5  - ~1 đến 2 tuần thoát kiếp đáy xã hội)
     ▲
[Đáy xã hội]      (Level 0  - Sapphire tự cấp khi vừa vào server)
```

| Cấp Độ | Tên Vai Trò | Tổng XP Tích Lũy | Thời Gian Cày Cuốc (Ước Tính) | Hành Động Của Bot |
| :---: | :---: | :---: | :---: | :--- |
| **Level 0** | 💩 **`Đáy xã hội`** | 0 XP | 0 ngày | Sapphire tự cấp khi vừa vào server. |
| **Level 5** | 🟢 **`Người do thái`** | **~5,000 XP** | **~1 - 2 tuần** | Thăng cấp: **Gán** `Người do thái`, **gỡ** `Đáy xã hội`. |
| **Level 15** | 🔴 **`Nigger Boy`** | **~32,000 XP** | **~1.5 - 2 tháng** | Thăng cấp: **Gán** `Nigger Boy`, **gỡ** `Người do thái`. |
| **Level 30** | 🌸 **`Người nhà nước`** | **~110,000 XP** | **~4 - 5 tháng** | **Đạt đỉnh cao:** **Gán** `Người nhà nước`, **gỡ** `Nigger Boy`. |

---

## ⚡ 4. Cơ Chế Tính Điểm Kinh Nghiệm (XP System) Cân Bằng

### 💬 4.1. Chat Văn Bản (Text XP)
* **Mức thưởng:** Ngẫu nhiên **`10 - 15 XP`** mỗi tin nhắn hợp lệ.
* **Cơ chế chống spam (Cooldown):** Mỗi thành viên chỉ nhận XP tối đa **1 lần trong vòng 60 giây**.
* Một ngày người chăm chat (30 - 40 tin nhắn hợp lệ) tích lũy được: **`~350 - 500 XP`**.

### 🎙️ 4.2. Kênh Thoại (Voice XP - Thời gian thực)
* Bot quét định kỳ toàn bộ phòng voice mỗi **60 giây một lần**.
* **Điều kiện hợp lệ (Chống gian lận AFK):**
  - Phòng thoại phải có **tối thiểu 2 người** trở lên (tránh tự tạo phòng cày cấp 1 mình).
  - Không tự tắt mic (`selfMute === false`).
  - Không tự tắt tai nghe (`selfDeaf === false`).
* **Mức thưởng:** **`2 XP / phút`** (1 tiếng voice nói chuyện liên tục nhận `120 XP`).
* Một ngày người voice đều đặn (1 - 2 tiếng) tích lũy được: **`~120 - 240 XP`**.

👉 **Trung bình một thành viên tích cực** (kết hợp vừa chat vừa voice hàng ngày) sẽ kiếm được khoảng **`600 - 800 XP / ngày`**.

### 📈 4.3. Công Thức Tính Level (Độ Dốc Chuẩn RPG)
$$\text{XP cần để lên cấp tiếp theo} = 50 \times (\text{Level}^2) + (200 \times \text{Level}) + 300$$

* Level 0 $\rightarrow$ 1: Cần 300 XP
* Level 1 $\rightarrow$ 2: Cần 550 XP
* Level 4 $\rightarrow$ 5: Cần 1,900 XP (Tổng tích lũy đạt mốc Level 5 là **~5,000 XP** $\approx$ 1 - 2 tuần)
* Level 14 $\rightarrow$ 15: Cần 13,100 XP (Tổng tích lũy đạt mốc Level 15 là **~32,000 XP** $\approx$ 1.5 - 2 tháng)
* Level 29 $\rightarrow$ 30: Cần 48,150 XP (Tổng tích lũy đạt mốc Level 30 là **~110,000 XP** $\approx$ **4 - 5 tháng hoạt động rất tích cực**).

---

## 🎮 5. Bộ Lệnh Tương Tác Slash Commands

### 🎴 5.1. Lệnh `/rank [user]`
Hiển thị thẻ hồ sơ cá nhân phong cách Hu Tao (màu đỏ bỉ ngạn, bướm lửa):
* Tên & Avatar thành viên.
* Cấp độ hiện tại & Vai trò danh hiệu tương ứng.
* Điểm kinh nghiệm: `Hiện tại / Cần lên cấp` kèm thanh tiến trình trực quan `[████████░░] 75%`.
* Số XP còn thiếu để thăng cấp tiếp theo.
* Thống kê hoạt động: Tổng thời gian voice (`... giờ ... phút`) và tổng số tin nhắn.
* Hỗ trợ xem cho bản thân hoặc gắn tag `@bạn_bè` để xem hồ sơ của người khác.

### 🏆 5.2. Lệnh `/leaderboard`
* Hiển thị bảng vinh danh Top 10 cao thủ năng nổ nhất server (sắp xếp theo Cấp độ và XP tích lũy).

---

## 🚀 6. Kế Hoạch 7 Giai Đoạn Triển Khai Code

### Giai đoạn 1: Khởi Tạo Dự Án & Cài Đặt Thư Viện
- [ ] Khởi tạo `package.json` với `"type": "module"`.
- [ ] Cài đặt: `npm install discord.js mongoose dotenv express`.
- [ ] Cấu hình file `.env` chứa `DISCORD_TOKEN`, `MONGODB_URI`, `GUILD_ID` và các `ROLE_ID`.

### Giai đoạn 2: Thiết Lập Schema MongoDB (Mongoose)
- [ ] Tạo file `src/models/User.js`:
  * `userId`, `guildId`, `xp`, `level`, `lastMessageAt`, `voiceJoinedAt`, `totalVoiceMinutes`, `messageCount`.
  * Đánh chỉ mục kép `{ userId: 1, guildId: 1 }` (unique).
- [ ] Xây dựng module kết nối `src/services/database.js`.

### Giai đoạn 3: Xử Lý Logic Chat XP & Cooldown
- [ ] Viết `src/core/chatXp.js`: Lắng nghe `messageCreate`, kiểm tra cooldown bằng bộ nhớ đệm (Set/Map) và cập nhật MongoDB.

### Giai đoạn 4: Xử Lý Logic Voice XP Thời Gian Thực
- [ ] Viết `src/core/voiceXp.js`: Vòng lặp `setInterval` 60 giây quét tất cả các voice channel, kiểm tra điều kiện hợp lệ và cộng điểm.

### Giai đoạn 5: Tự Động Thăng Cấp & Hoán Đổi Vai Trò
- [ ] Viết `src/core/level.js`: Hàm `checkLevelUp()` kiểm tra điều kiện, tự động gán role mới và thu hồi role cũ, gửi tin nhắn thông báo chúc mừng lên kênh chat.

### Giai đoạn 6: Đăng Ký & Xử Lý Slash Commands
- [ ] Đăng ký lệnh `/rank` và `/leaderboard` lên Discord REST API.
- [ ] Xây dựng Embed giao diện Hu Tao đẹp mắt trong `src/utils/embed.js`.

### Giai đoạn 7: Vận Hành 24/7 & Giữ Kết Nối Miễn Phí
- [ ] Thiết lập `src/server.js` (Express endpoint `/health` & `/` báo trạng thái Online, đo ping và ram).
- [ ] Kết nối `src/index.js` gọi `server.js` song song khi bot khởi động.
- [ ] Đẩy source code lên GitHub Repository.
- [ ] Triển khai Web Service trên **Render.com** (miễn phí, tự động deploy từ GitHub).
- [ ] Thiết lập **UptimeRobot** (hoặc Cron-job.org) ping định kỳ 5 phút/lần để chống bot ngủ đông.
- [ ] Kiểm thử toàn diện 24/7: Bot online liên tục, ghi nhận chat XP, voice XP và thăng cấp tự động.

---

## 🌐 7. Giải Pháp & Hướng Dẫn Triển Khai Hosting 24/7 Hoàn Toàn Miễn Phí

Do Discord Bot cần kết nối liên tục (Persistent Gateway WebSocket) và vòng quét Voice 60s, việc chọn nền tảng host miễn phí cần thỏa mãn: **Không tốn phí, Không bắt buộc thẻ tín dụng (No Credit Card), Có thể duy trì 24/7 không bị tắt giữa chừng**.

### 🏆 7.1. Giải Pháp Tối Ưu Nhất: Render.com + UptimeRobot (100% Free)

```
[GitHub Repo] ──(Tự động CI/CD)──► [Render.com Web Service]
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────┐
      ▼                                      ▼                                  ▼
[Express Server]                    [Discord Gateway]                 [MongoDB Atlas]
(Cổng HTTP: /health)                (Lắng nghe Chat/Voice)            (Lưu XP, Level)
      ▲
      │ (Ping mỗi 5 phút chống sleep)
[UptimeRobot Free]
```

* **Ưu điểm:**
  * **100% Miễn phí & Không cần thẻ tín dụng quốc tế**.
  * Cung cấp **750 giờ hoạt động miễn phí mỗi tháng** (vừa đủ chạy 1 service xuyên suốt 24/7 cả tháng 31 ngày = 744 giờ).
  * Hỗ trợ tự động Deploy (Auto Deploy) mỗi khi bạn `git push` code mới lên GitHub.
  * Tích hợp mượt mà với cơ sở dữ liệu **MongoDB Atlas (Free M0 Sandbox)**.
* **Cơ chế chống ngủ đông (Keep-Alive Bypass):**
  * Bình thường gói Free của Render sẽ ngủ (sleep) sau 15 phút nếu không có lượt truy cập HTTP.
  * Dự án tích hợp sẵn `src/server.js` (Express Web Server mini mở 1 port HTTP trả về trạng thái JSON `{ status: "online", uptime: ... }`).
  * Sử dụng dịch vụ miễn phí **UptimeRobot** gửi request `GET` đến link Render cứ mỗi **5 phút/lần** $\rightarrow$ Render nhận thấy luôn có truy cập nên **hoạt động liên tục 24/7, không bao giờ rơi vào trạng thái ngủ**.

---

### 📋 7.2. Quy Trình 4 Bước Đưa Bot Lên Host Render 24/7

#### Bước 1: Chuẩn bị Source Code & GitHub
1. Khởi tạo repository trên GitHub (để chế độ **Private** để bảo mật logic, hoặc Public nhưng bắt buộc không commit `.env`).
2. Commit toàn bộ mã nguồn của dự án (đã có `.gitignore` loại bỏ `node_modules` và `.env`).
3. Đẩy (push) code lên GitHub.

#### Bước 2: Tạo Web Service Trên Render.com
1. Truy cập [Render.com](https://render.com) và đăng ký tài khoản (đăng nhập nhanh bằng GitHub).
2. Chọn **New +** $\rightarrow$ chọn **Web Service**.
3. Chọn kho lưu trữ GitHub chứa bot `bot-rankup-discord`.
4. Điền các thông số cơ bản:
   * **Name:** `hutao-discord-bot` (hoặc tên tùy chọn).
   * **Region:** `Singapore` (để có độ trễ/ping thấp nhất về Discord và Việt Nam).
   * **Branch:** `main` (hoặc `master`).
   * **Runtime:** `Node`.
   * **Build Command:** `npm install`
   * **Start Command:** `npm start` (hoặc `node src/index.js`)
   * **Instance Type:** Chọn **Free** ($0/month - 512 MB RAM, 0.1 CPU).

#### Bước 3: Cấu hình Biến Môi Trường (Environment Variables)
Trong mục **Environment Variables** trên Render, thêm đầy đủ các biến từ file `.env`:
* `DISCORD_TOKEN`: Token của bot từ Discord Developer Portal.
* `DISCORD_CLIENT_ID`: Application ID của bot.
* `GUILD_ID`: ID của server Discord Hội Thờ Gái Anime.
* `MONGODB_URI`: Chuỗi kết nối MongoDB Atlas Cloud (`mongodb+srv://...`).
* `PORT`: `3000` (hoặc Render tự cấp).
* Các biến Role ID: `ROLE_LVL0_ID`, `ROLE_LVL5_ID`, `ROLE_LVL15_ID`, `ROLE_LVL30_ID`,...
* Nhấn **Create Web Service** để Render tự động tải code, cài thư viện và khởi động bot.

#### Bước 4: Thiết Lập UptimeRobot Giữ Bot Online 24/7
1. Sau khi Render deploy xong, bạn sẽ nhận được một địa chỉ URL công khai (dạng `https://hutao-discord-bot.onrender.com`).
2. Truy cập [UptimeRobot.com](https://uptimerobot.com) (miễn phí theo dõi đến 50 monitors).
3. Đăng ký/Đăng nhập và bấm **Add New Monitor**:
   * **Monitor Type:** `HTTP(s)`
   * **Friendly Name:** `Hutao Bot KeepAlive`
   * **URL (or IP):** Dán link web Render của bạn vào (ví dụ: `https://hutao-discord-bot.onrender.com/health`).
   * **Monitoring Interval:** `5 minutes` (mỗi 5 phút gửi 1 ping).
4. Nhấn **Create Monitor**. Từ lúc này, UptimeRobot sẽ tự động gõ cửa bot định kỳ, bot luôn tỉnh táo phục vụ tính điểm voice và chat 24/24.

---

### 🛡️ 7.3. Các Phương Án Hosting Miễn Phí Dự Phòng

Ngoài Render + UptimeRobot, dự án có thể chuyển đổi dễ dàng sang các nền tảng sau mà không cần sửa code:

| Nền Tảng | Chi Phí | Ưu Điểm | Nhược Điểm | Đánh Giá |
| :--- | :---: | :--- | :--- | :--- |
| **Render + UptimeRobot** | **0đ** | Không cần thẻ, auto deploy GitHub, server Singapore ping nhanh. | Cần tạo 1 monitor trên UptimeRobot để chống sleep. | ⭐⭐⭐⭐⭐ **Khuyên dùng số 1** |
| **Koyeb** | **0đ** | 1 nano instance miễn phí, hỗ trợ Docker/Node.js, không sleep nếu có traffic. | Cần cấu hình health check route. | ⭐⭐⭐⭐ Rất tốt |
| **Discloud** | **0đ** | Nền tảng chuyên cho Discord Bot, quản lý đơn giản, có sẵn gói 100MB RAM free. | RAM giới hạn 100MB (vừa đủ bot nhỏ, nếu mở rộng canvas sẽ chật chội). | ⭐⭐⭐ Dành riêng cho bot |
| **Oracle Cloud Always Free** | **0đ** | Máy chủ VPS riêng (Ubuntu), chạy PM2/Docker 24/7 vĩnh viễn, cấu hình cực mạnh. | Bắt buộc phải có thẻ Visa/Mastercard để xác minh danh tính lúc đăng ký. | ⭐⭐⭐⭐ Đỉnh cao nếu có thẻ |

