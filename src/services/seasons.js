import { User } from '../models/User.js';
import { Season } from '../models/Season.js';
import { SettingsError } from './guildConfig.js';

const OFFSET = 7 * 3600000;
const CLOSE_GRACE = 5 * 60000;
let seasonInterval;
let closing = false;

export function periodAt(period, now = new Date()) {
  if (!['week', 'month'].includes(period) || !Number.isFinite(now.getTime())) throw new SettingsError('Mùa không hợp lệ.');
  const local = new Date(now.getTime() + OFFSET);
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'week') local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  else local.setUTCDate(1);
  const date = local.toISOString().slice(0, 10);
  const startsAt = new Date(local.getTime() - OFFSET);
  if (period === 'week') local.setUTCDate(local.getUTCDate() + 7);
  else local.setUTCMonth(local.getUTCMonth() + 1);
  return { period, key: `${period}_${date}`, date, startsAt, endsAt: new Date(local.getTime() - OFFSET) };
}

export function requestedPeriod(period, date, now = new Date()) {
  if (!date) return periodAt(period, now);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SettingsError('Ngày mùa phải có dạng YYYY-MM-DD.');
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + OFFSET).toISOString().slice(0, 10) !== date) {
    throw new SettingsError('Ngày mùa không hợp lệ.');
  }
  const result = periodAt(period, parsed);
  if (result.startsAt > now) throw new SettingsError('Mùa này chưa bắt đầu.');
  return result;
}

export async function preparePeriods(guildId, now) {
  const periods = [];
  for (const period of ['week', 'month']) {
    const definition = periodAt(period, now);
    let season;
    try {
      season = await Season.findOneAndUpdate({ guildId, key: definition.key },
        { $setOnInsert: { guildId, ...definition } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      season = await Season.findOne({ guildId, key: definition.key }).lean();
    }
    if (!season.closedAt) periods.push(definition);
  }
  return periods;
}

function scorePipeline(guildId, key) {
  return [
    { $match: { guildId, [`periodScores.${key}`]: { $exists: true } } },
    { $project: { _id: 0, userId: 1, username: `$periodScores.${key}.displayName`,
      xp: { $ifNull: [`$periodScores.${key}.xp`, 0] },
      messageCount: { $ifNull: [`$periodScores.${key}.messageCount`, 0] },
      totalVoiceMinutes: { $ifNull: [`$periodScores.${key}.totalVoiceMinutes`, 0] } } },
    { $sort: { xp: -1, userId: 1 } },
  ];
}

export async function getSeasonLeaderboard(guildId, period, requestedPage = 1, date, now = new Date()) {
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new SettingsError('Số trang không hợp lệ.');
  const definition = requestedPeriod(period, date, now);
  const season = await Season.findOne({ guildId, key: definition.key }).lean();
  const count = await User.countDocuments({ guildId, [`periodScores.${definition.key}`]: { $exists: true } });
  const pageSize = 10, totalPages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const entries = await User.aggregate([...scorePipeline(guildId, definition.key), { $skip: (page - 1) * pageSize }, { $limit: pageSize }]);
  return { memberCount: count, page, pageSize, totalPages,
    entries: entries.map((entry, index) => ({ ...entry, username: entry.username || entry.userId, rank: (page - 1) * pageSize + index + 1 })),
    season: { ...definition, closedAt: season?.closedAt || null, recordedFrom: season?.createdAt || null, timezone: 'Asia/Ho_Chi_Minh' } };
}

export async function getSeasonHistory(guildId, period) {
  if (!['week', 'month'].includes(period)) throw new SettingsError('Mùa không hợp lệ.');
  return Season.find({ guildId, period, closedAt: { $ne: null } }).sort({ startsAt: -1 }).limit(24)
    .select('key period startsAt endsAt closedAt memberCount winners -_id').lean();
}

export async function closeSeasons(now = new Date()) {
  const due = await Season.find({ closedAt: null, endsAt: { $lte: new Date(now.getTime() - CLOSE_GRACE) } }).limit(100).lean();
  for (const season of due) {
    const board = await getSeasonLeaderboard(season.guildId, season.period, 1, season.key.slice(season.period.length + 1), now);
    const winners = board.entries.map(({ userId, username, xp, rank }) => ({ userId, username, xp, rank }));
    if (winners[0]?.xp > 0) {
      const badge = `achievements.champion_${season.period}`;
      await User.updateOne({ guildId: season.guildId, userId: winners[0].userId, [badge]: { $exists: false } }, { $set: { [badge]: now } });
    }
    await Season.updateOne({ _id: season._id, closedAt: null }, { $set: { closedAt: now, memberCount: board.memberCount, winners } });
  }
  return due.length;
}

export function startSeasonTracker() {
  stopSeasonTracker();
  const tick = async () => {
    if (closing) return;
    closing = true;
    try { await closeSeasons(); } catch (error) { console.error('[Seasons]', error.message); }
    finally { closing = false; }
  };
  void tick();
  seasonInterval = setInterval(tick, 60000).unref();
}
export function stopSeasonTracker() {
  clearInterval(seasonInterval);
  seasonInterval = null;
}
