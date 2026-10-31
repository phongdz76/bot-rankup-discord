import { User } from '../models/User.js';

export const achievementCatalog = [
  { id: 'newcomer', icon: '🌱', name: 'Tân binh', description: 'Có hoạt động hợp lệ đầu tiên', target: 1, metric: 'activity' },
  { id: 'chat_100', icon: '💬', name: 'Chăm trò chuyện', description: '100 lượt chat hợp lệ', target: 100, metric: 'messageCount' },
  { id: 'chat_1000', icon: '🗨️', name: 'Linh hồn cuộc trò chuyện', description: '1.000 lượt chat hợp lệ', target: 1000, metric: 'messageCount' },
  { id: 'night_owl', icon: '🌙', name: 'Cú đêm', description: 'Chat hợp lệ trong 3 đêm khác nhau, từ 22h đến 2h (giờ Việt Nam)', target: 3, metric: 'nights' },
  { id: 'voice_10', icon: '🎙️', name: 'Bạn đồng hành', description: '10 giờ voice hợp lệ', target: 600, metric: 'totalVoiceMinutes' },
  { id: 'voice_50', icon: '🎧', name: 'Tri kỷ phòng thoại', description: '50 giờ voice hợp lệ', target: 3000, metric: 'totalVoiceMinutes' },
  { id: 'voice_100', icon: '🏮', name: 'Khách quen Vãng Sinh Đường', description: '100 giờ voice hợp lệ', target: 6000, metric: 'totalVoiceMinutes' },
  { id: 'champion_week', icon: '🥇', name: 'Quán quân tuần', description: 'Đứng đầu một mùa tuần đã chốt', target: 1, metric: 'champion' },
  { id: 'champion_month', icon: '🏆', name: 'Quán quân tháng', description: 'Đứng đầu một mùa tháng đã chốt', target: 1, metric: 'champion' },
];

const badgeDate = (user, id) => user?.achievements?.get?.(id) || user?.achievements?.[id];
export function achievementProgress(user = {}) {
  return achievementCatalog.map(badge => {
    const unlockedAt = badgeDate(user, badge.id) || null;
    const current = badge.metric === 'activity' ? (user.messageCount || 0) + (user.totalVoiceMinutes || 0)
      : badge.metric === 'nights' ? user.nightDates?.length || 0
        : badge.metric === 'champion' ? Number(Boolean(unlockedAt)) : user[badge.metric] || 0;
    return { ...badge, current: Math.min(current, badge.target), unlockedAt };
  });
}

export async function unlockAchievements(user, now = new Date()) {
  if (!user?._id) return user;
  const earned = achievementProgress(user).filter(badge => !badge.unlockedAt && badge.metric !== 'champion' && badge.current >= badge.target);
  if (!earned.length) return user;
  await User.bulkWrite(earned.map(badge => ({ updateOne: {
    filter: { _id: user._id, [`achievements.${badge.id}`]: { $exists: false } },
    update: { $set: { [`achievements.${badge.id}`]: now } },
  } })));
  return User.findById(user._id).lean();
}

export function activityNight(now) {
  const local = new Date(now.getTime() + 7 * 3600000);
  const hour = local.getUTCHours();
  if (hour >= 2 && hour < 22) return null;
  // 00h–02h thuộc cùng đêm với 22h của ngày trước đó.
  if (hour < 2) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

export async function getAchievementSummary(guildId) {
  const counts = await User.aggregate([
    { $match: { guildId } },
    { $project: { badges: { $objectToArray: { $ifNull: ['$achievements', {}] } } } },
    { $unwind: '$badges' }, { $group: { _id: '$badges.k', count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map(item => [item._id, item.count]));
  return achievementCatalog.map(badge => ({ ...badge, count: byId.get(badge.id) || 0 }));
}
