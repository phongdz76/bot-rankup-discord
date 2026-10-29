# 📜 Kế Hoạch Triển Khai Bot Discord "Hutao-Chan" — Phiên Bản 2.0
> **Hệ thống Rank Up đa năng + Dashboard Web quản trị toàn diện**
> **Phong cách:** Hu Tao (Đường Chủ Vãng Sinh Đường đời thứ 77 - Genshin Impact)
> **Cơ sở dữ liệu:** 100% MongoDB Cloud (Atlas)
> **Mục tiêu:** Hoạt động được cho **TẤT CẢ server** — không giới hạn 1 guild duy nhất

---

## 📌 Tổng Quan Nâng Cấp v2.0

| # | Tính Năng Mới | Mô Tả |
|:-:|:---|:---|
| 1 | 🎉 **Welcome & Goodbye** | Tự động chào đón thành viên mới và tạm biệt khi rời server, cấu hình được kênh & nội dung |
| 2 | ⚡ **Hệ thống Level linh hoạt 2 chế độ** | **Chế độ A:** Gắn Role theo mốc (như hiện tại, admin tự set role-level). **Chế độ B:** Level không giới hạn (kiểu Mee6/Sapphire) |
| 3 | 🌐 **Dashboard Web quản trị** | Giao diện web đẹp, đăng nhập Discord OAuth2, admin cấu hình bot cho server mình mà không cần lệnh |
| 4 | 📖 **Trang hướng dẫn tiếng Việt** | Hướng dẫn đầy đủ bằng tiếng Việt, tích hợp trong Dashboard, giúp mọi người dùng hiểu và sử dụng được ngay |

---

## 🛠️ 1. Công Nghệ & Tiêu Chuẩn Kỹ Thuật

* **Ngôn ngữ:** JavaScript / Node.js **22.12+** còn được hỗ trợ (khuyến nghị **24 LTS**).
* **Kiến trúc Module:** **ES Modules** (`"type": "module"`, cú pháp `import/export`).
* **Thư viện chính:**
  * `discord.js` v14 — Gateway, Slash Commands, sự kiện thời gian thực.
  * `mongoose` — Kết nối MongoDB Atlas Cloud.
  * `dotenv` — Quản lý biến môi trường an toàn.
  * `express` — Web server cho Dashboard + API + Keep-Alive.
  * `@napi-rs/canvas` — **Vẽ Rank Card dạng hình ảnh** (giống Mee6/Sapphire), hiệu suất cao, không cần cài thêm native dependencies.
  * `express-session` — Quản lý phiên đăng nhập Dashboard.
  * `passport` + `passport-oauth2` — Xác thực Discord OAuth2.
  * `ejs` — Template engine render giao diện Dashboard.
  * `connect-mongo` — Lưu session vào MongoDB (tránh mất khi restart).

---

## 📁 2. Cấu Trúc Thư Mục Chuẩn Hóa (v2.0)

```text
D:\Work\Project\bot-rankup-discord/
├── .env                        # DISCORD_TOKEN, MONGODB_URI, OAuth2 secrets...
├── .env.example                # File mẫu biến môi trường
├── .gitignore
├── package.json                # "type": "module"
├── KE_HOACH_DU_AN.md           # Tài liệu kế hoạch chi tiết (file này)
├── README.md                   # Hướng dẫn thiết lập nhanh
│
└── src/
    ├── index.js                # Entrypoint: khởi động bot + dashboard
    │
    ├── config/
    │   └── index.js            # Load env, cấu hình mặc định, theme Hu Tao
    │
    ├── models/
    │   ├── User.js             # Schema XP, Level, thời gian voice, tin nhắn
    │   └── GuildConfig.js      # ★ MỚI: Cấu hình per-server (welcome, goodbye, chế độ level, role rewards...)
    │
    ├── services/
    │   ├── discord.js          # Khởi tạo Client, đăng ký intents & event handlers
    │   └── database.js         # Kết nối MongoDB Atlas (auto-reconnect)
    │
    ├── core/
    │   ├── level.js            # Thuật toán Level, sync role, thăng cấp
    │   ├── chatXp.js           # Chat XP + cooldown
    │   ├── voiceXp.js          # Voice XP quét định kỳ 60s
    │   └── welcome.js          # ★ MỚI: Xử lý Welcome & Goodbye events
    │
    ├── commands/
    │   ├── rank.js             # /rank — Thẻ hồ sơ cá nhân
    │   ├── leaderboard.js      # /leaderboard — Top 10
    │   ├── help.js             # /help — Hướng dẫn lệnh
    │   └── setup.js            # ★ MỚI: /setup — Cấu hình nhanh qua lệnh (dành cho admin không muốn vào web)
    │
    ├── utils/
    │   ├── time.js             # Tiện ích định dạng thời gian
    │   ├── embed.js            # Tạo Embed phong cách Hu Tao
    │   └── rankCard.js         # ★ MỚI: Vẽ Rank Card ảnh Canvas (avatar, progress bar đồ họa, gradient)
    │
    ├── server.js               # Express: Health check + mount dashboard routes
    │
    └── dashboard/              # ★ MỚI: Toàn bộ hệ thống Dashboard Web
        ├── auth.js             # Discord OAuth2 login/logout/callback
        ├── routes/
        │   ├── index.js        # Trang chủ dashboard + landing page
        │   ├── servers.js      # Danh sách server user là admin
        │   └── settings.js     # API cấu hình per-server (CRUD GuildConfig)
        │                      # Route /docs nằm trong index.js
        ├── middleware/
        │   └── auth.js         # Middleware kiểm tra đăng nhập & quyền admin
        ├── public/             # CSS, JS, ảnh phục vụ frontend
        │   ├── css/
        │   │   └── style.css   # Giao diện Hu Tao theme (đỏ bỉ ngạn, dark mode)
        │   ├── js/
        │   │   └── app.js      # Logic frontend (fetch API, toggle, toast...)
        │   └── images/
        └── views/              # EJS Templates
            ├── partials/       # header.ejs + footer.ejs dùng chung
            ├── landing.ejs     # Trang chào khi chưa đăng nhập (giới thiệu bot)
            ├── servers.ejs     # Danh sách server
            ├── settings.ejs    # Trang cấu hình server (tabbed UI)
            └── docs.ejs        # ★ Trang hướng dẫn tiếng Việt đầy đủ
```

---

## 🎉 3. Hệ Thống Welcome & Goodbye (Chào Đón / Tạm Biệt)

### 3.1. Sự kiện `guildMemberAdd` — Khi thành viên mới vào server
- Tự động gửi tin nhắn chào mừng vào kênh đã cấu hình.
- Nội dung tùy chỉnh được, hỗ trợ **biến thay thế** (template variables):

| Biến | Giá Trị |
|:---|:---|
| `{user}` | Mention thành viên mới (VD: `@PhongDz`) |
| `{username}` | Tên hiển thị (VD: `PhongDz`) |
| `{server}` | Tên server (VD: `Hội Thờ Gái Anime`) |
| `{memberCount}` | Tổng số thành viên hiện tại |

- **Tin nhắn mặc định** (nếu admin chưa tùy chỉnh):
  > 🎊 Chào mừng {user} đã gia nhập **{server}**! Bạn là thành viên thứ **#{memberCount}**. Hãy bắt đầu trò chuyện để tích lũy kinh nghiệm nhé~

- Hỗ trợ gửi dạng **Embed đẹp** (có ảnh đại diện, màu theme Hu Tao) hoặc **text thuần** tùy cấu hình.

### 3.2. Sự kiện `guildMemberRemove` — Khi thành viên rời server
- Tự động gửi tin nhắn tạm biệt vào kênh đã cấu hình (có thể cùng hoặc khác kênh welcome).
- **Tin nhắn mặc định:**
  > 👋 **{username}** đã rời khỏi **{server}**. Tạm biệt và hẹn gặp lại~

### 3.3. Cấu hình qua Dashboard hoặc lệnh `/setup`
Admin server có thể bật/tắt và tùy chỉnh:
- [x] Bật/tắt Welcome
- [x] Bật/tắt Goodbye
- [x] Chọn kênh gửi Welcome
- [x] Chọn kênh gửi Goodbye
- [x] Tùy chỉnh nội dung tin nhắn (dùng biến thay thế)
- [x] Chọn kiểu hiển thị: Embed hoặc Text thuần

---

## ⚡ 4. Hệ Thống Level Linh Hoạt 2 Chế Độ

### 🔄 4.1. Tổng quan 2 chế độ

Admin mỗi server **tự chọn** 1 trong 2 chế độ qua Dashboard hoặc lệnh `/setup`:

| | Chế Độ A: **Role Mapping** | Chế Độ B: **Unlimited (Không Giới Hạn)** |
|:---|:---|:---|
| **Mô tả** | Admin tự tạo các mốc Level → Role. Khi thành viên đạt mốc, bot tự gán role tương ứng và gỡ role cũ. | Level tăng vô hạn, không có trần. Có thể có hoặc không có role reward. Tương tự Mee6/Sapphire. |
| **Giới hạn level** | Không giới hạn (nhưng role chỉ gán đến mốc cao nhất admin đặt) | Hoàn toàn không giới hạn |
| **Role tự động** | ✅ Bắt buộc cấu hình ít nhất 1 mốc | ✅ Tùy chọn (có thể để trống) |
| **Hành vi khi thăng cấp** | Gán role mới, **gỡ role cũ** (chỉ giữ role bậc cao nhất) | Gán role mới, **giữ nguyên tất cả role cũ** (tích lũy badges) |
| **Phù hợp với** | Server muốn phân cấp quyền rõ ràng theo đóng góp | Server muốn gamification đơn giản, dễ chơi |
| **Tham khảo** | Sapphire Bot (role-replace) | Mee6 (role-stack / keep all) |

### 🧩 4.2. Cơ Chế Level Per-Server — Hoạt Động Như Thế Nào?

> **Câu hỏi:** Mỗi server có cấu hình role khác nhau, vậy bot tính rank cho từng server ra sao?

**Nguyên tắc cốt lõi: MỖI SERVER LÀ ĐỘC LẬP HOÀN TOÀN.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MONGODB ATLAS                                  │
│                                                                         │
│  Collection: users                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ { userId: "123", guildId: "AAA", xp: 5000,  level: 5  }        │   │  ◄── User 123 ở Server AAA: Level 5
│  │ { userId: "123", guildId: "BBB", xp: 800,   level: 2  }        │   │  ◄── User 123 ở Server BBB: Level 2 (khác server = khác dữ liệu)
│  │ { userId: "456", guildId: "AAA", xp: 32000, level: 15 }        │   │  ◄── User 456 ở Server AAA: Level 15
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Collection: guildconfigs                                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ { guildId: "AAA", levelMode: "role_mapping",                    │   │
│  │   roleRewards: [                                                │   │
│  │     { level: 0,  roleId: "r1", roleName: "Đáy xã hội" },       │   │  ◄── Server AAA: dùng Role Mapping, 4 mốc
│  │     { level: 5,  roleId: "r2", roleName: "Người do thái" },     │   │
│  │     { level: 15, roleId: "r3", roleName: "Nigger Boy" },        │   │
│  │     { level: 30, roleId: "r4", roleName: "Người nhà nước" }     │   │
│  │   ], xpSettings: { chat: {min:10, max:15}, ... }                │   │
│  │ }                                                               │   │
│  │                                                                 │   │
│  │ { guildId: "BBB", levelMode: "unlimited",                       │   │
│  │   roleRewards: [                                                │   │
│  │     { level: 10, roleId: "x1", roleName: "Active" },            │   │  ◄── Server BBB: dùng Unlimited, 3 mốc, XP khác
│  │     { level: 25, roleId: "x2", roleName: "Pro" },               │   │
│  │     { level: 50, roleId: "x3", roleName: "Legend" }             │   │
│  │   ], xpSettings: { chat: {min:15, max:25}, ... }                │   │
│  │ }                                                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Luồng xử lý khi 1 thành viên chat trong Server AAA:**

```
1. User "123" gửi tin nhắn trong Server "AAA"
       │
       ▼
2. Bot nhận event messageCreate
   → Lấy guildId = "AAA" từ message.guild.id
       │
       ▼
3. Truy vấn GuildConfig của server "AAA" từ MongoDB
   → Lấy được: levelMode = "role_mapping", xpSettings, roleRewards
       │
       ▼
4. Truy vấn User với { userId: "123", guildId: "AAA" }
   → Tìm đúng bản ghi XP của user 123 TRONG server AAA (không lẫn với server khác)
       │
       ▼
5. Kiểm tra cooldown → Cộng XP ngẫu nhiên (theo xpSettings của server AAA)
       │
       ▼
6. Tính level mới → Nếu thăng cấp:
   → Đọc roleRewards của server AAA
   → Gán role tương ứng (theo levelMode của server AAA)
   → Gửi thông báo thăng cấp
```

**Kết quả:** Cùng 1 người dùng Discord, ở 2 server khác nhau sẽ có:
- ❌ XP **KHÔNG** chia sẻ — mỗi server tính riêng.
- ❌ Level **KHÔNG** chia sẻ — level ở server A ≠ level ở server B.
- ❌ Role rewards **KHÔNG** chia sẻ — mỗi server cấu hình role riêng.
- ✅ Cấu hình **ĐỘC LẬP** — admin mỗi server tự set chế độ, XP, role, kênh thông báo.

### 📐 4.3. Công Thức Tính Level (Áp dụng cả 2 chế độ)
$$\text{XP cần để lên cấp tiếp theo} = 50 \times (\text{Level}^2) + (200 \times \text{Level}) + 300$$

Công thức này đảm bảo:
- Level thấp lên nhanh → khuyến khích thành viên mới.
- Level càng cao càng khó → tạo thành tựu dài hạn cho thành viên trung thành.
- Không có trần giới hạn → hoạt động chính xác cho chế độ Unlimited.

### 💬 4.4. Chat Văn Bản (Text XP)
* **Mức thưởng:** Ngẫu nhiên **`10 - 15 XP`** mỗi tin nhắn hợp lệ (admin có thể tùy chỉnh min/max qua Dashboard).
* **Cooldown:** Mỗi thành viên chỉ nhận XP tối đa **1 lần trong vòng 30 giây** (admin có thể tùy chỉnh).

### 🎙️ 4.5. Kênh Thoại (Voice XP)
* Bot quét định kỳ toàn bộ phòng voice mỗi **60 giây**.
* **Điều kiện hợp lệ (Chống AFK):**
  - Phòng voice có **tối thiểu 2 người hợp lệ** không phải bot, không bị loại trừ (admin có thể tùy chỉnh).
  - Không tự tắt mic (`selfMute === false`).
  - Không tự tắt tai nghe (`selfDeaf === false`), không bị server mute/deaf hoặc suppress, không ở kênh AFK.
  - Chỉ cộng sau đủ một phút hợp lệ; không cộng bù khi bot tắt.
* **Mức thưởng:** **`2 XP / phút`** (admin có thể tùy chỉnh).

### 🛡️ 4.6. Cấu Hình Role Rewards (Cho cả 2 chế độ)

Admin tự tạo bao nhiêu mốc role cũng được qua Dashboard hoặc lệnh `/setup`:

```
Ví dụ cấu hình Role Rewards của 1 server:
┌────────┬─────────────────────┬───────────────────────────────────────┐
│ Level  │ Role sẽ được gán    │ Hành vi                               │
├────────┼─────────────────────┼───────────────────────────────────────┤
│   0    │ @Tân Binh            │ Tự động gán khi vào server            │
│   5    │ @Thành Viên          │ Chế độ A: Gỡ @Tân Binh, gán @Thành Viên │
│        │                     │ Chế độ B: Giữ @Tân Binh, thêm @Thành Viên │
│  15    │ @Thành Viên Tích Cực │ Tương tự theo chế độ đã chọn          │
│  30    │ @Kỳ Cựu             │ Tương tự theo chế độ đã chọn          │
│  50    │ @Huyền Thoại         │ Tương tự theo chế độ đã chọn          │
│ 100    │ @Thần Thánh          │ Tương tự theo chế độ đã chọn          │
└────────┴─────────────────────┴───────────────────────────────────────┘
(Admin tự tạo, tự đặt tên role, tự chọn level — bot chỉ gán/gỡ theo cấu hình)
```

### 4.7. Cấu hình mặc định cho server "Hội Thờ Gái Anime" (Chế độ A — Role Mapping)

> Đây là cấu hình **riêng** cho server gốc của dự án. Các server khác sẽ tự cấu hình qua Dashboard.

| Cấp Độ | Tên Vai Trò | Tổng XP Tích Lũy | Thời Gian Ước Tính | Hành Động |
| :---: | :---: | :---: | :---: | :--- |
| **Level 0** | 💩 **`Đáy xã hội`** | 0 XP | 0 ngày | Tự cấp khi vào server |
| **Level 5** | 🟢 **`Người do thái`** | ~5,000 XP | Tùy hoạt động | Gán mới, gỡ cũ |
| **Level 15** | 🔴 **`Nigger Boy`** | 76,250 XP | Tùy hoạt động | Gán mới, gỡ cũ |
| **Level 30** | 🌸 **`Người nhà nước`** | 523,750 XP | Tùy hoạt động | Gán mới, gỡ cũ |

---

## 🎮 5. Bộ Lệnh Slash Commands (Mở rộng)

### 🎴 5.1. Lệnh `/rank [user]` — Rank Card Ảnh Canvas
Bot tạo **hình ảnh Rank Card** đồ họa đẹp (giống Mee6/Sapphire) rồi gửi dưới dạng file ảnh PNG:

```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                    │
│  │      │   PhongDz                         LEVEL 15         │
│  │Avatar│   Danh hiệu: Nigger Boy                            │
│  │      │                                                    │
│  └──────┘   XP: 5,200 / 14,550              RANK #3         │
│                                                              │
│  ░░░░░░░░░░░░░░░░░░░░████████████████████░░░░░░░░  36%       │
│  ▲ Progress bar gradient đỏ bỉ ngạn Hu Tao                  │
│                                                              │
│  💬 1,245 tin nhắn    🎙️ 48h 32m voice    📅 Tham gia: ...   │
│                                                              │
│  ── Vãng Sinh Đường đời thứ 77 • Hutao Bot ──               │
└──────────────────────────────────────────────────────────────┘
```

**Thư viện sử dụng:** `@napi-rs/canvas` — hiệu suất cao, hỗ trợ Node.js thuần, không cần cài thêm native build tools.

**Chi tiết thiết kế Rank Card (`src/utils/rankCard.js`):**
* **Kích thước:** 934 × 282 px (tỉ lệ chuẩn rank card Discord).
* **Background:** Gradient tối (đen → đỏ bỉ ngạn tối `#1a0a0a` → `#2d0e0e`).
* **Avatar:** Hình tròn 80px, viền gradient đỏ, bo góc mềm.
* **Progress Bar:** Bo tròn, gradient từ `#b31e1e` (đỏ Hu Tao) → `#ff6b6b` (cam đỏ), nền bar xám tối `#2a2a2a`.
* **Typography:** Font sans-serif đậm cho Level/Rank, font nhẹ cho thông tin phụ, màu trắng + xám.
* **Thông tin hiển thị:**
  - Tên người dùng + Avatar.
  - Level hiện tại (font lớn, nổi bật).
  - Danh hiệu vai trò (nếu có trong roleRewards).
  - Thứ hạng trong server (`RANK #3`).
  - Thanh XP: `currentXP / requiredXP` + phần trăm.
  - Tổng tin nhắn + Tổng thời gian voice.
* **Output:** File ảnh PNG đính kèm tin nhắn Discord (`AttachmentBuilder`).
* Hỗ trợ xem hồ sơ của `@người_khác`.

### 🏆 5.2. Lệnh `/leaderboard`
* Bảng xếp hạng Top 10 server (Level + XP).

### ❓ 5.3. Lệnh `/help`
* Hiển thị danh sách tất cả lệnh và mô tả ngắn.
* Link đến trang hướng dẫn web Dashboard.

### ⚙️ 5.4. Lệnh `/setup` ★ MỚI
Cho phép **admin server** cấu hình nhanh ngay trong Discord mà không cần vào Dashboard web:

| Lệnh Con | Mô Tả |
|:---|:---|
| `/setup welcome enabled:True channel:<channel> [message] [embed]` | Bật welcome và đặt kênh + tin nhắn (tùy chọn) |
| `/setup goodbye enabled:True channel:<channel> [message] [embed]` | Bật goodbye và đặt kênh + tin nhắn (tùy chọn) |
| `/setup welcome enabled:False` | Tắt welcome |
| `/setup goodbye enabled:False` | Tắt goodbye |
| `/setup levelmode <role_mapping \| unlimited>` | Chọn chế độ level cho server |
| `/setup addrole <level> <@role>` | Thêm 1 mốc role reward |
| `/setup removerole <level>` | Xóa 1 mốc role reward |
| `/setup listroles` | Xem tất cả mốc role đã cấu hình |
| `/setup xp chat <min> <max> <cooldown>` | Tùy chỉnh XP chat |
| `/setup xp voice <xp_per_minute> <min_members>` | Tùy chỉnh XP voice |
| `/setup channel <channel>` | Đặt kênh thông báo thăng cấp |
| `/setup view` | Xem toàn bộ cấu hình hiện tại của server |
| `/setup reset confirm:True` | Đặt lại tất cả về mặc định |
| `/setup dashboard` | Gửi link Dashboard web cho server |

> **Phân quyền:** Chỉ thành viên có quyền `MANAGE_GUILD` (Quản lý Server) mới sử dụng được `/setup`.

---

## 🌐 6. Dashboard Web — Giao Diện Quản Trị Trực Quan

### 6.1. Tổng quan kiến trúc

```
Luồng truy cập Dashboard:
┌───────────────┐     OAuth2      ┌──────────────────┐
│  Người dùng   │ ──────────────► │  Discord Login    │
│  (Trình duyệt)│ ◄────────────── │  (passport)       │
└───────┬───────┘   access_token  └──────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    Express Dashboard                       │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Landing Page│  │ Server List  │  │ Server Settings  │ │
│  │ (Giới thiệu)│  │ (Chọn server)│  │ (Cấu hình)      │ │
│  └─────────────┘  └──────────────┘  └──────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │            📖 Trang Hướng Dẫn Tiếng Việt             │ │
│  │  (Cài đặt bot, cấu hình, FAQ, troubleshooting...)   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │            REST API (Express Routes)                 │ │
│  │  GET/POST /api/guilds/:id/settings                   │ │
│  │  GET /api/guilds/:id/leaderboard                     │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   MongoDB Atlas  │
              │  (GuildConfig +  │
              │   User data)     │
              └──────────────────┘
```

### 6.2. Các trang Dashboard

#### 🏠 Trang Landing (Chưa đăng nhập)
- Giới thiệu bot Hutao-Chan: tính năng nổi bật, ảnh minh họa.
- Nút **"Mời Bot Vào Server"** (invite link).
- Nút **"Đăng Nhập Bằng Discord"** (OAuth2).
- Link đến trang Hướng Dẫn.
- **Ngôn ngữ:** 100% Tiếng Việt.

#### 📋 Trang Danh Sách Server (Sau khi đăng nhập)
- Hiển thị tất cả server mà user có quyền `MANAGE_GUILD`.
- Mỗi server hiển thị: icon, tên, số thành viên, trạng thái bot (đã mời / chưa mời).
- Nút **"Quản Lý"** → vào trang cấu hình chi tiết.
- Nút **"Mời Bot"** (nếu server chưa có bot).

#### ⚙️ Trang Cấu Hình Server (Tabbed UI)
Giao diện chia tab cho dễ sử dụng:

| Tab | Nội Dung |
|:---|:---|
| **🎉 Welcome & Goodbye** | Bật/tắt, chọn kênh, tùy chỉnh tin nhắn, xem trước (live preview) |
| **⚡ Hệ Thống Level** | Chọn chế độ (Role Mapping / Unlimited), tùy chỉnh XP chat/voice, cooldown |
| **🎖️ Role Rewards** | Thêm/sửa/xóa mốc Level → Role, tự sắp xếp theo level, xem bảng tổng hợp |
| **📢 Kênh Thông Báo** | Đặt kênh thông báo thăng cấp, kênh welcome, kênh goodbye |
| **📊 Leaderboard** | Xem bảng xếp hạng server trực tiếp trên web |
| **🔧 Nâng Cao** | Danh sách kênh bị loại trừ (không tính XP), danh sách role bị loại trừ, reset cấu hình |

#### 📖 Trang Hướng Dẫn Sử Dụng (Tiếng Việt)
- **Không cần đăng nhập** — ai cũng truy cập được.
- Nội dung viết theo phong cách **hướng dẫn sử dụng cho người dùng bình thường / admin Discord**, ngôn từ gần gũi, ấm áp, hoàn toàn không chứa thuật ngữ code phức tạp.

### 6.3. Tiêu Chuẩn Thiết Kế Giao Diện UI/UX (Đã Cải Tiến)
- 🔤 **Chữ to, rõ ràng, dễ đọc:** Base font size 16px (tăng từ 15px), bỏ toàn bộ các cỡ chữ siêu nhỏ (8px, 9px, 10px). Các dòng chú thích phụ đạt tối thiểu 13-14px, tiêu đề nổi bật từ 24px - 48px.
- 🔘 **Button rộng rãi, không dính sát:**
  - Khoảng cách giữa các button (`gap`) tối thiểu 16px - 20px (không bị dính sát nhau).
  - Padding nút bấm chuẩn 14px 24px, chiều cao tối thiểu 48-50px (dễ bấm trên điện thoại).
  - Nút thêm mốc role (`#add-role`) và nút xóa role (`.remove-role`) có khoảng thở riêng, không chèn ép các ô nhập liệu.
  - Thanh lưu cài đặt (`.save-bar`) dạng nổi (floating sticky), bo góc mềm 12px, có hiệu ứng blur kính mờ và bóng đổ sang trọng.
- 📱 **Tối ưu Mobile & Desktop:** Bố cục co giãn mượt mà, hỗ trợ tốt thao tác cảm ứng trên smartphone.

---

## 📖 7. Nội Dung Trang Hướng Dẫn Tiếng Việt (Thân Thiện Cho Người Dùng)

> 💡 **Định hướng:** Trang hướng dẫn được biên soạn hoàn toàn bằng tiếng Việt tự nhiên, dễ hiểu dành cho **người dùng bình thường và Admin Discord**, không đòi hỏi bất kỳ kiến thức lập trình nào.

### Cấu trúc 6 mục hướng dẫn:

#### 7.1. 🚀 01 / Bắt Đầu Nhanh (3 bước siêu đơn giản)
1. **Mời bot vào server:** Nhấn nút *"Mời bot vào server"* trên trang chủ, chọn máy chủ bạn quản lý và bấm Cho phép.
2. **Đăng nhập Dashboard:** Đăng nhập trực tiếp bằng tài khoản Discord của bạn (không cần tạo tài khoản mới).
3. **Chọn server và tùy chỉnh:** Bấm *"Quản lý server"* để bật Chào mừng, đặt role thưởng và xem bảng xếp hạng. Mọi cài đặt có hiệu lực tức thì!

#### 7.2. 🎉 02 / Lời Chào Nồng Ấm (Welcome & Goodbye)
- Cách bật công tắc chào đón và chọn kênh văn bản gửi tin (VD: kênh `#chào-mừng`).
- Hướng dẫn dùng các từ khóa tự động điền thông minh:
  - `{user}`: Gắn thẻ (mention) thành viên mới để người đó nhận được thông báo.
  - `{username}`: Tên hiển thị dạng chữ (không làm phiền ping).
  - `{server}`: Tên server của bạn.
  - `{memberCount}`: Vị trí số thứ tự thành viên (VD: thành viên thứ 150).
- Mẫu câu chào hay có sẵn để copy & paste ngay.

#### 7.3. ⚡ 03 / Hành Trình Thăng Hạng (Level & Role Rewards)
- **Cách tích lũy điểm kinh nghiệm (XP) tự nhiên:**
  - 💬 **Khi nhắn tin:** Nhận 10 - 15 XP mỗi tin nhắn hợp lệ, có giãn cách 30s để chống spam.
  - 🎙️ **Khi vào phòng thoại (Voice):** Tự động nhận điểm XP mỗi phút khi cùng bạn bè đàm thoại vui vẻ (từ 2 người trở lên, không tự tắt mic/tai nghe).
- **2 phong cách trao danh hiệu tùy chọn:**
  - 🌟 **Phong cách Tích Lũy (Unlimited):** Thành viên lên cấp bao nhiêu cũng được, giữ nguyên danh hiệu cũ và nhận thêm danh hiệu mới (như Mee6).
  - 🎖️ **Phong cách Thăng Hạng (Role Mapping):** Lên cấp cao hơn sẽ đổi sang danh hiệu mới nhất và gỡ danh hiệu cũ, giúp danh sách vai trò gọn gàng.
- 💡 **Mẹo cực kỳ quan trọng:** Hướng dẫn kéo vai trò *"Hutao-Chan"* lên phía trên các vai trò thưởng trong Cài đặt server của Discord để bot có đủ quyền trao role.

#### 7.4. 🎮 04 / Các Câu Lệnh Thường Dùng
- Bảng giải thích công dụng các câu lệnh Discord:
  - `/rank` [tùy chọn: @người_dùng]: Khoe thẻ hồ sơ cá nhân (Rank Card) ảnh Canvas cực đẹp.
  - `/leaderboard`: Xem bảng vàng Top 10 thành viên năng nổ nhất server.
  - `/help`: Xem nhanh bảng hướng dẫn và thông tin cài đặt của bot.
  - `/setup`: Cài đặt nhanh mọi tính năng trực tiếp trong Discord dành riêng cho Quản trị viên.

#### 7.5. ❓ 05 / Câu Hỏi Thường Gặp (FAQ)
- *"Tại sao thành viên đủ level nhưng chưa nhận được role?"* → Hướng dẫn kéo vai trò bot lên trên.
- *"Làm sao để tắt tính điểm ở các kênh bot/spam?"* → Hướng dẫn chọn kênh loại trừ trong mục Nâng cao trên web.
- *"Dữ liệu có bị mất khi bot khởi động lại không?"* → Đảm bảo dữ liệu lưu trữ 100% trên đám mây an toàn.
- *"Bot dùng được cho bao nhiêu server?"* → Không giới hạn số lượng server.
- *"Đặt lại cấu hình có làm mất XP không?"* → Không, toàn bộ điểm số và level vẫn được bảo lưu nguyên vẹn.

#### 7.6. 💡 06 / Mẹo Quản Trị Server Hiệu Quả & Sôi Nổi
- Hướng dẫn tạo kênh thông báo lên cấp riêng biệt (như `#vinh-danh` hay `#lên-cấp`) để không làm trôi tin nhắn kênh chat chính.
- Gợi ý đặt tên vai trò thưởng độc đáo gắn với văn hóa riêng của server.
- Kinh nghiệm điều chỉnh thời gian giãn cách (cooldown) hợp lý.
- Cách thúc đẩy thành viên tham gia phòng thoại (voice chat) cùng nhau.
*(Lưu ý: Không hướng dẫn self-host hay chia sẻ mã nguồn vì bot được cung cấp sẵn dạng dịch vụ hoàn chỉnh).*

---

## 🗃️ 8. Schema MongoDB (Mở rộng)

### 8.1. Collection `users` (Giữ nguyên + tương thích ngược)

```javascript
{
  userId: String,           // Discord User ID
  guildId: String,          // Discord Guild ID
  xp: Number,              // Tổng XP tích lũy
  level: Number,            // Level hiện tại
  messageCount: Number,     // Tổng số tin nhắn hợp lệ
  totalVoiceMinutes: Number,// Tổng số phút voice
  lastMessageAt: Date,      // Thời điểm tin nhắn gần nhất (cho cooldown)
  voiceJoinedAt: Date,      // Thời điểm vào voice (nếu đang trong voice)
  createdAt: Date,
  updatedAt: Date
}
// Index: { userId: 1, guildId: 1 } (unique)
// Index: { guildId: 1, level: -1, xp: -1 } (leaderboard)
```

### 8.2. Collection `guildconfigs` ★ MỚI

```javascript
{
  guildId: String,          // Discord Guild ID (unique)

  // === Welcome & Goodbye ===
  welcome: {
    enabled: Boolean,           // Bật/tắt (default: false)
    channelId: String,          // Kênh gửi welcome (null = tắt)
    message: String,            // Tin nhắn tùy chỉnh (hỗ trợ biến {user}, {server}, {memberCount})
    useEmbed: Boolean           // Gửi dạng Embed hay Text (default: true)
  },
  goodbye: {
    enabled: Boolean,           // Bật/tắt (default: false)
    channelId: String,          // Kênh gửi goodbye
    message: String,            // Tin nhắn tùy chỉnh
    useEmbed: Boolean           // default: true
  },

  // === Hệ thống Level ===
  levelMode: String,            // "role_mapping" hoặc "unlimited" (default: "unlimited" (server mới chưa có role thưởng))
  levelUpChannelId: String,     // Kênh thông báo thăng cấp (null = gửi ở kênh chat hiện tại)

  // === Role Rewards (Mảng mốc Level → Role) ===
  roleRewards: [
    {
      level: Number,            // Mốc level (VD: 0, 5, 15, 30, 50...)
      roleId: String,           // Discord Role ID
      roleName: String          // Tên role (để hiển thị khi không fetch được từ Discord)
    }
  ],

  // === Tùy chỉnh XP ===
  xpSettings: {
    chat: {
      min: Number,              // XP tối thiểu mỗi tin nhắn (default: 10)
      max: Number,              // XP tối đa mỗi tin nhắn (default: 15)
      cooldownSeconds: Number   // Cooldown giữa 2 lần nhận XP (default: 30)
    },
    voice: {
      rewardPerMinute: Number,  // XP mỗi phút voice (default: 2)
      minChannelMembers: Number // Số người tối thiểu trong voice (default: 2)
    }
  },

  revision: Number,            // Chống ghi đè cấu hình đồng thời (HTTP 409 nếu phiên bản cũ)

  // === Loại trừ ===
  excludedChannels: [String],   // Danh sách channel ID không tính XP
  excludedRoles: [String],      // Danh sách role ID không tính XP

  createdAt: Date,
  updatedAt: Date
}
// Index: { guildId: 1 } (unique)
```

---

## 🚀 9. Kế Hoạch 10 Giai Đoạn Triển Khai

### Giai đoạn 1: Khởi Tạo Dự Án & Cài Đặt Thư Viện ✅ (Đã hoàn thành)
- [x] Khởi tạo `package.json` với `"type": "module"`.
- [x] Cài đặt thư viện cơ bản: `discord.js`, `mongoose`, `dotenv`, `express`.
- [x] Cấu hình `.env`, `.env.example`, `.gitignore`.

### Giai đoạn 2: Schema MongoDB & Kết Nối ✅ (Đã hoàn thành)
- [x] Tạo `src/models/User.js` với schema và index.
- [x] Xây dựng `src/services/database.js` (auto-reconnect).

### Giai đoạn 3: Chat XP & Voice XP ✅ (Đã hoàn thành)
- [x] `src/core/chatXp.js` — Chat XP + cooldown.
- [x] `src/core/voiceXp.js` — Voice XP quét 60s + chống AFK.

### Giai đoạn 4: Level Up & Slash Commands ✅ (Đã hoàn thành)
- [x] `src/core/level.js` — Tính level, sync role, thông báo thăng cấp.
- [x] `src/commands/rank.js` và `src/commands/leaderboard.js`.
- [x] Đăng ký Slash Commands Global.

### Giai đoạn 5: Schema GuildConfig & Chuyển Đổi Multi-Server ✅ (Đã triển khai và kiểm tra local)
- [x] Tạo `src/models/GuildConfig.js` — Schema cấu hình per-server.
- [x] Refactor `src/config/index.js` — Load cấu hình mặc định, hợp nhất với GuildConfig từ DB.
- [x] Refactor `src/core/level.js` — Đọc `roleRewards` và `levelMode` từ GuildConfig thay vì hardcode.
- [x] Refactor `src/core/chatXp.js` — Đọc `xpSettings.chat` từ GuildConfig.
- [x] Refactor `src/core/voiceXp.js` — Đọc `xpSettings.voice` từ GuildConfig.
- [x] Đảm bảo **tương thích ngược** — Server cũ không bị lỗi khi chưa có GuildConfig (dùng giá trị mặc định).

### Giai đoạn 6: Welcome & Goodbye System ✅ (Đã triển khai và kiểm tra local)
- [x] Viết `src/core/welcome.js`:
  - Lắng nghe `guildMemberAdd` → Gửi tin chào mừng vào kênh cấu hình.
  - Lắng nghe `guildMemberRemove` → Gửi tin tạm biệt.
  - Hỗ trợ template variables: `{user}`, `{username}`, `{server}`, `{memberCount}`.
  - Hỗ trợ Embed hoặc Text thuần.
- [x] Cập nhật `src/services/discord.js` — Đăng ký event `guildMemberAdd` và `guildMemberRemove`.
- [x] Thêm Intent `GuildMembers` (đã có sẵn trong code hiện tại).

### Giai đoạn 7: Lệnh `/setup` — Cấu Hình Nhanh Qua Discord ✅ (Đã triển khai và kiểm tra local)
- [x] Viết `src/commands/setup.js`:
  - Subcommands: `welcome`, `goodbye`, `levelmode`, `addrole`, `removerole`, `listroles`, `xp`, `channel`, `view`, `reset`, `dashboard`.
  - Kiểm tra quyền `MANAGE_GUILD` trước khi thực thi.
  - Đọc/ghi `GuildConfig` từ MongoDB.
- [x] Đăng ký lệnh `/setup` vào Slash Commands Global.

### Giai đoạn 8: Dashboard Web — Backend API & OAuth2 ✅ (Đã triển khai và kiểm tra local)
- [x] Cài đặt thêm: `npm install express-session passport passport-oauth2 ejs connect-mongo`.
- [x] Cấu hình `.env` thêm: `DISCORD_CLIENT_SECRET`, `OAUTH2_CALLBACK_URL`, `SESSION_SECRET`.
- [x] Viết `src/dashboard/auth.js` — Discord OAuth2 (login / callback / logout).
- [x] Viết `src/dashboard/middleware/auth.js` — Kiểm tra phiên đăng nhập + quyền admin.
- [x] Viết `src/dashboard/routes/`:
  - `index.js` — Landing page.
  - `servers.js` — API danh sách server user là admin.
  - `settings.js` — CRUD cấu hình GuildConfig.
  - `index.js` — Bao gồm route `/docs` công khai bằng EJS.
- [x] Mount tất cả routes vào `src/server.js`.

### Giai đoạn 9: Dashboard Web — Frontend UI ✅ (Đã triển khai và kiểm tra local)
- [x] Thiết kế giao diện **Dark Mode + Hu Tao Theme** (đỏ bỉ ngạn, accent cam).
- [x] Viết EJS templates:
  - `partials/header.ejs` + `partials/footer.ejs` — Layout chung, sidebar trong trang cấu hình.
  - `landing.ejs` — Trang chào giới thiệu bot, nút Mời + Đăng nhập.
  - `servers.ejs` — Grid card hiển thị server với icon + trạng thái.
  - `settings.ejs` — Tabbed UI cấu hình: Welcome, Level, Role Rewards, Channels, Advanced.
  - `docs.ejs` — Trang hướng dẫn chia section rõ ràng, có sidebar mục lục.
- [x] Viết `public/css/style.css` — Responsive, dark glassmorphism, smooth transitions.
- [x] Viết `public/js/app.js` — Fetch API, form handling, toast notification, live preview.
- [x] Test UI trên Desktop + Mobile.

### Giai đoạn 10: Deploy & Kiểm Thử Môi Trường Thật 🔲
- [x] Cập nhật `README.md` với hướng dẫn mới.
- [x] Thêm `render.yaml` và CI chạy kiểm tra cú pháp/test.
- [x] Cập nhật `.env.example` với các biến mới (OAuth2 secrets...).
- [ ] Đẩy code lên GitHub.
- [ ] Deploy lên **Render.com** (Express phục vụ cả bot + dashboard trên cùng 1 service).
- [ ] Thiết lập monitor `/health`; chọn hạ tầng luôn chạy nếu cần 24/7.
- [ ] Cấu hình **OAuth2 Redirect URI** trên Discord Developer Portal trỏ về URL Render.
- [ ] Kiểm thử toàn diện:
  - [ ] Bot online 24/7, XP hoạt động bình thường.
  - [ ] Welcome/Goodbye gửi đúng kênh, đúng nội dung.
  - [ ] Dashboard đăng nhập/đăng xuất OAuth2 mượt mà.
  - [ ] Cấu hình trên Dashboard phản ánh ngay trong bot.
  - [ ] Trang hướng dẫn hiển thị đúng, dễ đọc.
  - [ ] Hoạt động tốt trên nhiều server khác nhau.

---

## 🌐 10. Hạ Tầng & Vận Hành Máy Chủ (Dành Cho Chủ Sở Hữu Bot)

> 🔒 **CHÍNH SÁCH BẢO MẬT & MÃ NGUỒN:**
> Dự án này là **dịch vụ bot hoàn chỉnh độc quyền của riêng chủ sở hữu (PhongDz)**. Mã nguồn được bảo mật nội bộ (**Private Repository**), **hoàn toàn KHÔNG có ý định phát hành mã nguồn mở (open-source) hay cung cấp source code cho người ngoài tự host**.
> Tất cả người dùng và quản trị viên các máy chủ chỉ cần thêm bot vào server và sử dụng qua Web Dashboard. Phần này chỉ đóng vai trò hướng dẫn kỹ thuật cá nhân để chủ bot duy trì dịch vụ online 24/7.

### Render.com — Triển khai dịch vụ tập trung phục vụ toàn bộ server

```
[Private Git Repo] ──(Auto CI/CD)──► [Render.com Web Service]
                                             │
          ┌──────────────────────────────────┼──────────────────────────────┐
          ▼                                  ▼                              ▼
    [Express Server]                [Discord Gateway]             [MongoDB Atlas]
    (Dashboard UI +                 (Chat/Voice XP +              (Users + GuildConfigs)
     API + Health)                   Welcome/Goodbye)
          ▲
          │ (Ping mỗi 5 phút)
    [UptimeRobot Free]
```

* **1 service duy nhất** trên Render phục vụ cả: Dashboard Web + Bot Discord + API + Health Check.
* Gói Free có quota và giới hạn tài nguyên; số giờ được chia sẻ theo workspace. Khi vận hành ổn định lâu dài cho nhiều server, khuyến nghị nâng cấp gói luôn chạy (Paid Instance) hoặc VPS riêng.
* UptimeRobot theo dõi `/health` để ghi nhận trạng thái và giảm thiểu thời gian chờ ngủ của gói miễn phí.

### Phương Án Dự Phòng Cho Chủ Bot

| Nền Tảng | Chi Phí | Đánh Giá |
| :--- | :---: | :--- |
| **Render Free + monitor** | **0đ (giới hạn)** | Phù hợp thử nghiệm cá nhân; không cam kết 24/7 |
| **VPS / máy chủ riêng** | Theo nhà cung cấp | Kiểm soát tiến trình 100%, ổn định tối đa cho nhiều server |
| **Gói dịch vụ luôn chạy** | Theo bảng giá hiện hành | Phù hợp vận hành liên tục không gián đoạn |

---

## 📊 11. Tóm Tắt Toàn Bộ Tính Năng Bot v2.0

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HUTAO-CHAN BOT v2.0                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🎉 WELCOME & GOODBYE                                              │
│  ├── Chào đón thành viên mới (Embed / Text)                       │
│  ├── Tạm biệt thành viên rời (Embed / Text)                       │
│  ├── Template variables: {user}, {server}, {memberCount}           │
│  └── Bật/tắt + tùy chỉnh kênh & nội dung per-server              │
│                                                                     │
│  ⚡ HỆ THỐNG LEVEL LINH HOẠT                                       │
│  ├── Chế độ A: Role Mapping (gán/gỡ role theo mốc)                │
│  ├── Chế độ B: Unlimited (level vô hạn, giữ tất cả role)          │
│  ├── Chat XP: 10-15 XP/msg (tùy chỉnh, cooldown)                 │
│  ├── Voice XP: 2 XP/phút (tùy chỉnh, chống AFK)                  │
│  ├── Role Rewards: Admin tự tạo bao nhiêu mốc cũng được           │
│  └── Công thức RPG: 50*Lv² + 200*Lv + 300                         │
│                                                                     │
│  🎮 SLASH COMMANDS                                                  │
│  ├── /rank [user] — Rank Card ảnh Canvas (avatar, XP bar, gradient)│
│  ├── /leaderboard — Top 10 server                                  │
│  ├── /help — Danh sách lệnh + link hướng dẫn                      │
│  └── /setup — Cấu hình nhanh (admin only)                         │
│                                                                     │
│  🌐 DASHBOARD WEB                                                   │
│  ├── Landing page giới thiệu bot (Hu Tao theme)                   │
│  ├── Đăng nhập Discord OAuth2 an toàn                             │
│  ├── Cấu hình server: Welcome, Level, Roles, Channels             │
│  ├── Xem Leaderboard trên web                                     │
│  ├── UI/UX cải tiến: Font chữ to rõ ràng, button rộng thoáng      │
│  └── Hoàn toàn tiếng Việt, tối ưu Mobile & Desktop                │
│                                                                     │
│  📖 HƯỚNG DẪN TIẾNG VIỆT THÂN THIỆN                               │
│  ├── 01 / Bắt đầu nhanh (3 bước siêu dễ)                          │
│  ├── 02 / Lời chào nồng ấm (Welcome & Goodbye)                    │
│  ├── 03 / Hành trình thăng hạng (Level & Role)                     │
│  ├── 04 / Các lệnh tiện lợi + Rank Card                           │
│  ├── 05 / Giải đáp thường gặp (FAQ cho người dùng)                │
│  └── 06 / Mẹo quản trị server sôi nổi                             │
│                                                                     │
│  🔧 ĐA SERVER                                                      │
│  ├── Hoạt động cho TẤT CẢ server (không giới hạn 1 guild)         │
│  ├── Cấu hình riêng biệt cho từng server (GuildConfig)            │
│  └── Dữ liệu độc lập 100% giữa các server                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

> **Ghi chú:** Kế hoạch này được cập nhật lần cuối vào ngày **29/10/2026**.
> Giai đoạn 1–9 đã triển khai trong mã nguồn. Đã chạy 15 bài test bằng MongoDB thử nghiệm và Chrome desktop/mobile. Giai đoạn 10 còn phần deploy và kiểm thử Discord/OAuth thật.
>
> **Quyết định triển khai:** cooldown mặc định **30 giây** theo yêu cầu cập nhật; dùng `passport-oauth2` với OAuth state, session MongoDB được mã hóa, CSRF và kiểm tra lại quyền server. Server mới mặc định Unlimited để hoạt động ngay khi chưa có role thưởng. Role được tự sắp theo level; áp dụng lại role ở lần nhận XP tiếp theo. Cấu hình v1 chỉ nhập theo `GUILD_ID` và role ID, không dò tên/hardcode giữa server. Reset giữ XP; xóa mốc/reset không thu hồi role đã cấp.
