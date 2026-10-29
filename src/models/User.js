import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    guildId: {
      type: String,
      required: true,
      index: true
    },
    displayName: { type: String, default: '' },
    inGuild: { type: Boolean, default: false },
    roleLevel: { type: Number, min: 0, default: 0 },
    rolePosition: { type: Number, min: 0, default: 0 },
    rankRoleId: { type: String, default: '' },
    rankRoleName: { type: String, default: '' },
    lastRoleSyncAt: { type: Date, default: null },
    xp: {
      type: Number,
      min: 0,
      default: 0
    },
    level: {
      type: Number,
      min: 0,
      default: 0
    },
    messageCount: {
      type: Number,
      default: 0
    },
    totalVoiceMinutes: {
      type: Number,
      default: 0
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    voiceJoinedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Chỉ mục kép đảm bảo mỗi user trong 1 guild là duy nhất
userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Chỉ mục hỗ trợ sắp xếp bảng xếp hạng (Leaderboard) siêu tốc
userSchema.index({ guildId: 1, level: -1, xp: -1 });
userSchema.index({ guildId: 1, inGuild: 1, rolePosition: -1, roleLevel: -1, xp: -1, userId: 1 });

export const User = mongoose.model('User', userSchema);
