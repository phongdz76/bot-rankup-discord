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
    xp: {
      type: Number,
      default: 0
    },
    level: {
      type: Number,
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

export const User = mongoose.model('User', userSchema);
