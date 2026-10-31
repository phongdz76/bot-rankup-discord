import mongoose from 'mongoose';

const seasonSchema = new mongoose.Schema({
  guildId: { type: String, required: true }, key: { type: String, required: true },
  period: { type: String, enum: ['week', 'month'], required: true },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  closedAt: { type: Date, default: null }, memberCount: { type: Number, default: 0 },
  winners: [{ _id: false, userId: String, username: String, xp: Number, rank: Number }],
}, { timestamps: true });
seasonSchema.index({ guildId: 1, key: 1 }, { unique: true });
seasonSchema.index({ closedAt: 1, endsAt: 1 });
seasonSchema.index({ guildId: 1, period: 1, startsAt: -1 });
export const Season = mongoose.model('Season', seasonSchema);
