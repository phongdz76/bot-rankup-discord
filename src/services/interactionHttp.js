import { createPublicKey, verify } from 'node:crypto';
import express from 'express';
import { ChatInputCommandInteraction, StringSelectMenuInteraction, MessageFlags, MessagePayload } from 'discord.js';
import { getErrorDiagnostics } from '../utils/errors.js';
import { handleGameRoleInteraction } from './gameRoles.js';

const errorMessage = 'Chưa thể xử lý lệnh này. Hãy thử lại sau.';
const message = content => ({ type: 4, data: { content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } } });

async function encodeReply(interaction, options) {
  const payload = MessagePayload.create(interaction, options);
  payload.resolveBody();
  await payload.resolveFiles();
  const data = { ...payload.body, allowed_mentions: payload.body.allowed_mentions || { parse: [] } };
  if (interaction.ephemeral) data.flags = (data.flags || 0) | MessageFlags.Ephemeral;
  if (!payload.files.length) return { body: JSON.stringify({ type: 4, data }), contentType: 'application/json' };
  data.attachments = payload.files.map((file, id) => ({ ...data.attachments?.[id], id, filename: file.name }));
  const form = new FormData();
  form.set('payload_json', JSON.stringify({ type: 4, data }));
  for (const [id, file] of payload.files.entries()) {
    form.set(`files[${id}]`, new Blob([file.data], { type: file.contentType || 'application/octet-stream' }), file.name);
  }
  const response = new Response(form);
  return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') };
}

class InlineInteraction extends ChatInputCommandInteraction {
  constructor(client, payload, deliver, signal) {
    super(client, { ...payload, entitlements: payload.entitlements || [], authorizing_integration_owners: payload.authorizing_integration_owners || {} });
    this.transport = 'http';
    this.signal = signal;
    this.deliver = deliver;
  }

  async deferReply(options = {}) {
    if (this.deferred || this.replied) throw new Error('Interaction already acknowledged');
    this.deferred = true;
    this.ephemeral = Boolean(options.ephemeral || (options.flags & MessageFlags.Ephemeral));
  }

  async reply(options) {
    if (this.deferred || this.replied) throw new Error('Interaction already acknowledged');
    this.ephemeral = Boolean(options?.ephemeral || (options?.flags & MessageFlags.Ephemeral));
    return this.sendInline(options);
  }

  async editReply(options) {
    if (!this.deferred && !this.replied) throw new Error('Interaction not acknowledged');
    return this.sendInline(options);
  }

  async sendInline(options) {
    // Once the deadline response is sent, never post a late callback or followup.
    if (this.signal.aborted || this.replied) return;
    const response = await encodeReply(this, options);
    if (this.signal.aborted || this.replied) return;
    this.replied = true;
    this.deliver(response);
  }
}

class InlineGameSelection extends StringSelectMenuInteraction {
  constructor(client, payload, deliver, signal) {
    super(client, { ...payload, entitlements: payload.entitlements || [], authorizing_integration_owners: payload.authorizing_integration_owners || {} });
    this.transport = 'http'; this.signal = signal; this.deliver = deliver;
  }
}
for (const method of ['deferReply', 'reply', 'editReply', 'sendInline']) {
  InlineGameSelection.prototype[method] = InlineInteraction.prototype[method];
}

export function interactionHttpRoutes({ client, settings, now = Date.now, deadlineMs = 2200, log = console.log }) {
  const router = express.Router();
  const publicKey = /^[a-f0-9]{64}$/i.test(settings.interactionsPublicKey || '')
    ? createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(settings.interactionsPublicKey, 'hex')]), format: 'der', type: 'spki' })
    : null;
  const responses = new Map();
  let lastResponse = null;
  router.snapshot = () => ({ enabled: Boolean(publicKey), lastResponse });

  router.post('/', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!publicKey || settings.botEnabled === false) return res.sendStatus(503);
    const timestamp = req.get('x-signature-timestamp') || '';
    const signature = req.get('x-signature-ed25519') || '';
    const age = now() - Number(timestamp) * 1000;
    if (!Buffer.isBuffer(req.body) || !/^\d{1,12}$/.test(timestamp) || !/^[a-f0-9]{128}$/i.test(signature) ||
      age < -30000 || age >= 300000 ||
      !verify(null, Buffer.concat([Buffer.from(timestamp), req.body]), publicKey, Buffer.from(signature, 'hex'))) {
      return res.sendStatus(401);
    }
    let payload;
    try { payload = JSON.parse(req.body.toString('utf8')); }
    catch { return res.sendStatus(400); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.sendStatus(400);
    if (payload.type === 1) return res.json({ type: 1 });
    const isCommand = payload.type === 2 && payload.data?.type === 1;
    const isGameSelection = payload.type === 3 && payload.data?.component_type === 3 &&
      /^games:[a-f0-9]{12}$/.test(payload.data?.custom_id || '') && Array.isArray(payload.data?.values) &&
      payload.message?.author?.id === settings.clientId && payload.guild_id && payload.member?.user;
    if ((!isCommand && !isGameSelection) || payload.application_id !== settings.clientId ||
      !/^\d{17,20}$/.test(payload.id || '') || !payload.token || !(payload.user || payload.member?.user)) {
      return res.sendStatus(400);
    }
    for (const [id, entry] of responses) if (entry.expiresAt <= now()) responses.delete(id);
    let cached = responses.get(payload.id);
    if (!cached) {
      if (responses.size >= 2000) return res.sendStatus(503);
      let deliver;
      const response = new Promise(resolve => { deliver = resolve; });
      cached = { response, expiresAt: Number(timestamp) * 1000 + 300000 };
      responses.set(payload.id, cached);
      const controller = new AbortController();
      let settled = false;
      const command = isGameSelection ? { execute: handleGameRoleInteraction } : client.commands?.get(payload.data.name);
      const commandName = isGameSelection ? 'games' : command ? payload.data.name : 'unknown';
      const finish = (encoded, outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        controller.abort();
        lastResponse = { command: commandName, at: new Date(now()).toISOString(), outcome };
        log('[Discord HTTP] RESPONSE', JSON.stringify(lastResponse));
        deliver(encoded);
      };
      const fail = (content, outcome) => finish({ body: JSON.stringify(message(content)), contentType: 'application/json' }, outcome);
      const timeout = setTimeout(() => fail(commandName === 'setup'
        ? 'Chưa xác nhận được kết quả cấu hình. Kiểm tra /setup view trước khi gửi lại yêu cầu.'
        : isGameSelection ? 'Chưa xác nhận được cập nhật role. Mở /games để kiểm tra trạng thái trước khi chọn lại.'
          : 'Chưa tải xong dữ liệu. Hãy thử lại sau ít giây.', 'deadline'), deadlineMs);
      void (async () => {
        if (!command) return fail('Lệnh chưa được hỗ trợ. Dùng /help để xem hướng dẫn.', 'unknown_command');
        const Interaction = isGameSelection ? InlineGameSelection : InlineInteraction;
        const interaction = new Interaction(client, payload, encoded => finish(encoded, 'completed'), controller.signal);
        await command.execute(interaction);
        if (!settled) fail(errorMessage, 'no_reply');
      })().catch(error => {
        log('[Discord HTTP] COMMAND_FAILED', JSON.stringify({ command: commandName, ...getErrorDiagnostics(error) }));
        fail(errorMessage, 'error');
      });
    }
    const response = await cached.response;
    if (!res.destroyed) res.status(200).set('Content-Type', response.contentType).send(response.body);
  });
  return router;
}
