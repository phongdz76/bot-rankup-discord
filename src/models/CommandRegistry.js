import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true },
  fingerprint: { type: String, required: true },
  commands: [new mongoose.Schema({ id: String, name: String, type: { type: Number, default: 1 } }, { _id: false })],
}, { timestamps: true, collection: 'command_registries' });

export const CommandRegistry = mongoose.model('CommandRegistry', schema);
