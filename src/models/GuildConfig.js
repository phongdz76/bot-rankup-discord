import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  channelId: { type: String, default: null },
  message: { type: String, required: true, maxlength: 1800 },
  useEmbed: { type: Boolean, default: true },
}, { _id: false });

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  levelMode: { type: String, enum: ['role_mapping', 'unlimited'], default: 'unlimited' },
  levelUpChannelId: { type: String, default: null },
  roleRewards: [{
    _id: false,
    level: { type: Number, required: true, min: 0, max: 100000 },
    roleId: { type: String, required: true },
    roleName: { type: String, maxlength: 100 },
  }],
  // Vai trò có sẵn chỉ dùng để đối chiếu cấp, không tự động trao/gỡ.
  roleBaselines: [{
    _id: false,
    level: { type: Number, required: true, min: 0, max: 100000 },
    roleId: { type: String, required: true },
  }],
  welcome: { type: messageSchema, required: true },
  goodbye: { type: messageSchema, required: true },
  xpSettings: {
    chat: {
      min: { type: Number, min: 0, max: 10000 },
      max: { type: Number, min: 0, max: 10000 },
      cooldownSeconds: { type: Number, min: 1, max: 86400 },
    },
    voice: {
      rewardPerMinute: { type: Number, min: 0, max: 10000 },
      minChannelMembers: { type: Number, min: 2, max: 100 },
    },
  },
  excludedChannels: [String], excludedRoles: [String],
  revision: { type: Number, default: 0 },
}, { timestamps: true });

export const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);
