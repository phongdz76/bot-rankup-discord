import { createCanvas, loadImage } from '@napi-rs/canvas';
import { formatMinutes } from './time.js';

export async function createRankCard({ user, member, userDoc, levelData, rankTier, serverRank }) {
  const canvas = createCanvas(1000, 360);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1000, 360);
  gradient.addColorStop(0, '#26171d'); gradient.addColorStop(1, '#100f16');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1000, 360);
  ctx.fillStyle = '#a62c40'; ctx.fillRect(0, 0, 8, 360);
  ctx.strokeStyle = '#5b303e'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(940, 35, 70 + i * 23, 0, Math.PI * 2); ctx.stroke(); }
  ctx.save(); ctx.beginPath(); ctx.arc(109, 116, 64, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#6b3144'; ctx.fillRect(45, 52, 128, 128);
  try {
    const response = await fetch(user.displayAvatarURL({ extension: 'png', size: 256 }), { signal: AbortSignal.timeout(5000) });
    if (response.ok) ctx.drawImage(await loadImage(Buffer.from(await response.arrayBuffer())), 45, 52, 128, 128);
  } catch { /* Card vẫn hiển thị khi CDN avatar không sẵn sàng. */ }
  ctx.restore();
  function text(value, x, y, size, color = '#f4e8e3', maxWidth = 700) {
    ctx.fillStyle = color; ctx.font = `${size}px sans-serif`; ctx.fillText(String(value), x, y, maxWidth);
  }
  text(member?.displayName || user.globalName || user.username, 205, 85, 32, '#fff6ee', 510);
  text(rankTier?.name || 'Thành viên', 205, 125, 19, '#d9a4a5', 490);
  text(`LEVEL ${levelData.level}`, 750, 85, 26, '#ffb38b', 210);
  text(`HẠNG #${serverRank}`, 750, 125, 18, '#d7c3bf', 210);
  const percent = Math.max(0, Math.min(1, levelData.currentXp / levelData.nextLevelXp));
  text(`${levelData.currentXp.toLocaleString('vi-VN')} / ${levelData.nextLevelXp.toLocaleString('vi-VN')} XP`, 205, 175, 18);
  text(`${Math.floor(percent * 100)}%`, 875, 175, 18, '#d9a4a5');
  ctx.fillStyle = '#3a2731'; ctx.fillRect(205, 192, 730, 15);
  const progress = ctx.createLinearGradient(205, 0, 935, 0);
  progress.addColorStop(0, '#ab233d'); progress.addColorStop(1, '#f2a77d');
  ctx.fillStyle = progress; ctx.fillRect(205, 192, 730 * percent, 15);
  text(`${userDoc.messageCount || 0} tin nhắn`, 48, 263, 18);
  text(`Voice: ${formatMinutes(userDoc.totalVoiceMinutes || 0)}`, 310, 263, 18, '#dbc5c3', 350);
  text(`Tham gia: ${member?.joinedAt?.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) || '—'}`, 690, 263, 17, '#dbc5c3', 260);
  text('VÃNG SINH ĐƯỜNG • HUTAO-CHAN', 48, 325, 15, '#ae858a');
  return canvas.toBuffer('image/png');
}
