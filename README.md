# Bot Discord "Hutao-Chan" - He Thong Rankup & Cap Do Tu Dong

He thong tinh diem kinh nghiem (Chat & Voice) va tu dong quan ly, phan cap vai tro cho server Discord **Hoi Tho Gai Anime**, ket noi co so du lieu MongoDB Atlas va ho tro van hanh 24/7 mien phi.

---

## 1. Tinh Nang Chinh

* **Chat XP (Tin nhan van ban):**
  * Nhan ngau nhien tu 10 den 15 XP moi tin nhan hop le.
  * Cooldown chong spam: 60 giay moi lan nhan diem cho moi thanh vien.
* **Voice XP (Phong thoai thoi gian thuc):**
  * Tu dong quet tat ca phong voice moi 60 giay mot lan.
  * Co che chong AFK: Phong thoai phai co toi thieu tu 2 thanh vien tro len (khong tinh bot), thanh vien khong tat mic (`selfMute === false`) va khong tat tai nghe (`selfDeaf === false`).
  * Cong 2 XP moi phut thoai hop le va tu dong tich luy tong thoi gian voice.
* **Tu dong thang cap & hoan doi vai tro (Auto Role):**
  * Thuoc toan tinh level chuan RPG: `XP can = 50 * (Level^2) + (200 * Level) + 300`.
  * Khi dat du XP len bac moi, bot tu dong gan role moi va thu hoi cac role bac duoi de danh sach vai tro luon gon gang:
    * **Level 0:** `Day xa hoi`
    * **Level 5:** `Nguoi do thai` (~5,000 XP)
    * **Level 15:** `Nigger Boy` (~32,000 XP)
    * **Level 30:** `Nguoi nha nuoc` (~110,000 XP)
* **Slash Commands:**
  * `/rank [user]`: Xem ho so ca nhan, cap do, thanh tien trinh XP, so tin nhan da gui va tong thoi gian voice.
  * `/leaderboard`: Xem bang vinh danh Top 10 thanh vien nang no nhat server.
* **Express Web Server Keep-Alive:**
  * Mo endpoint `/` va `/health` bao cao trang thai hoat dong, thoi gian uptime va luong RAM su dung, ho tro cac dich vu uptime ping giu bot chay 24/7.

---

## 2. Yeu Cau He Thong

* Node.js v18.0.0 tro len.
* Tai khoan Discord Developer Portal da tao Bot va bat ca 3 Privileged Gateway Intents:
  * Presence Intent
  * Server Members Intent
  * Message Content Intent
* Cluster MongoDB Atlas Cloud (Goi M0 mien phi).

---

## 3. Huong Dan Cai Dat & Chay Local

### Buoc 1: Cai dat thu vien
```bash
npm install
```

### Buoc 2: Thiet lap file bien moi truong (.env)
Tao file `.env` o thu muc goc (tham khao `.env.example`):
```env
# Discord Bot
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/hutao_rankup?retryWrites=true&w=majority

# Port Web Server
PORT=3000

# Role IDs (4 bac thang tien)
ROLE_LVL0_ID=role_id_day_xa_hoi
ROLE_LVL5_ID=role_id_nguoi_do_thai
ROLE_LVL15_ID=role_id_nigger_boy
ROLE_LVL30_ID=role_id_nguoi_nha_nuoc
```

### Buoc 3: Khoi dong bot
* Che do phat trien (tu dong restart khi sua code bang nodemon):
  ```bash
  npm run dev
  ```
* Che do chay chinh thuc:
  ```bash
  npm start
  ```

---

## 4. Huong Dan Trien Khai Hosting 24/7 Mien Phi (Render + UptimeRobot)

Mo hinh giup bot hoat dong lien tuc 24/24 hoan toan mien phi va khong can the tin dung:

### Buoc 1: Tao Web Service tren Render.com
1. Dang nhap [Render.com](https://render.com) bang tai khoan GitHub cua ban.
2. Nhan **New +** -> chon **Web Service**.
3. Chon repository `bot-rankup-discord`.
4. Cau hinh thong so co ban:
   * **Name:** `hutao-rankup-bot`
   * **Region:** `Singapore` (toi uu do tre thap nhat ve Discord va Viet Nam)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free` (0$/thang)

### Buoc 2: Cau hinh bien moi truong tren Render
Vao muc **Environment Variables** tren Render va them day du cac bien tu file `.env`:
* `DISCORD_TOKEN`
* `DISCORD_CLIENT_ID`
* `GUILD_ID`
* `MONGODB_URI`
* `PORT` (Render tu cap hoac de 3000)
* `ROLE_LVL0_ID`
* `ROLE_LVL5_ID`
* `ROLE_LVL15_ID`
* `ROLE_LVL30_ID`
Sau do nhan **Save Changes** de Render tien hanh build va khoi dong bot.

### Buoc 3: Thiet lap UptimeRobot giu Bot online 24/7 (Chong sleep)
1. Sau khi Render deploy thanh cong, ban nhan duoc link web (vi du: `https://hutao-rankup-bot.onrender.com`).
2. Dang nhap vao [UptimeRobot.com](https://uptimerobot.com) (mien phi).
3. Bấm **Add New Monitor**:
   * **Monitor Type:** `HTTP(s)`
   * **Friendly Name:** `Hutao Bot Monitor`
   * **URL (or IP):** `https://hutao-rankup-bot.onrender.com/health`
   * **Monitoring Interval:** `5 minutes` (ping moi 5 phut)
4. Bấm **Create Monitor**. UptimeRobot se tu dong gui request dinh ky, giup Render luon tinh tao hoat dong 24/7.

---

## 5. Luu Y Quan Trong Ve Phan Quyen Discord

Trong **Cai dat may chu -> Vai tro (Roles)** tren Discord:
* Vai tro cua bot (`Hutao-Chan` hoac `Bot`) bat buoc phai nam **TREN** vai tro `Nguoi nha nuoc`.
* Neu role cua Bot nam duoi, Discord se tu dong chan quyen va bot khong the gan vai tro cho thanh vien khi ho thang cap.
