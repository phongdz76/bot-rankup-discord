import { SlashCommandBuilder, ApplicationIntegrationType, PermissionFlagsBits, InteractionContextType, ChannelType, MessageFlags } from 'discord.js';
import { config, getDefaultGuildConfig } from '../config/index.js';
import { getGuildConfig, saveGuildConfig, SettingsError } from '../services/guildConfig.js';

const channelOption = option => option.setName('channel').setDescription('Kênh văn bản').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
const numberOption = (name, description, min, max, required = true) => option =>
  option.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required);

export const data = new SlashCommandBuilder().setName('setup').setDescription('Cấu hình Hutao-Chan cho server')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(InteractionContextType.Guild);

for (const name of ['welcome', 'goodbye']) {
  data.addSubcommand(sub => sub.setName(name).setDescription(`Cấu hình ${name}`)
    .addBooleanOption(o => o.setName('enabled').setDescription('Bật hoặc tắt').setRequired(true))
    .addChannelOption(channelOption)
    .addStringOption(o => o.setName('message').setDescription('Biến: {user}, {username}, {server}, {memberCount}').setMaxLength(1800))
    .addBooleanOption(o => o.setName('embed').setDescription('Hiển thị dạng embed')));
}
data.addSubcommand(sub => sub.setName('levelmode').setDescription('Chọn chế độ level')
  .addStringOption(o => o.setName('mode').setDescription('Chế độ').setRequired(true).addChoices(
    { name: 'Role Mapping — thay thế role', value: 'role_mapping' }, { name: 'Unlimited — tích lũy role', value: 'unlimited' },
  )));
data.addSubcommand(sub => sub.setName('addrole').setDescription('Thêm hoặc thay mốc role thưởng')
  .addIntegerOption(numberOption('level', 'Mốc level', 0, 100000))
  .addRoleOption(o => o.setName('role').setDescription('Role bot sẽ gán').setRequired(true)));
data.addSubcommand(sub => sub.setName('removerole').setDescription('Xóa mốc role (không gỡ role đã cấp)')
  .addIntegerOption(numberOption('level', 'Mốc level', 0, 100000)));
data.addSubcommandGroup(group => group.setName('xp').setDescription('Tùy chỉnh XP')
  .addSubcommand(sub => sub.setName('chat').setDescription('XP chat và cooldown')
    .addIntegerOption(numberOption('min', 'XP tối thiểu', 0, 10000))
    .addIntegerOption(numberOption('max', 'XP tối đa', 0, 10000))
    .addIntegerOption(numberOption('cooldown', 'Thời gian chờ (giây)', 1, 86400)))
  .addSubcommand(sub => sub.setName('voice').setDescription('XP voice mỗi phút')
    .addIntegerOption(numberOption('reward', 'XP mỗi phút', 0, 10000))
    .addIntegerOption(numberOption('members', 'Số thành viên hợp lệ tối thiểu', 2, 100))));
data.addSubcommand(sub => sub.setName('channel').setDescription('Chọn kênh lên cấp; bỏ trống để gửi tại kênh chat')
  .addChannelOption(channelOption));
for (const [name, description] of [
  ['view', 'Xem cấu hình hiện tại'], ['listroles', 'Xem các mốc role thưởng'],
  ['dashboard', 'Mở dashboard quản trị'],
]) data.addSubcommand(sub => sub.setName(name).setDescription(description));
data.addSubcommand(sub => sub.setName('reset').setDescription('Đặt lại cấu hình; giữ nguyên XP')
  .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận đặt lại cấu hình').setRequired(true)));

export async function execute(interaction) {
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Bạn cần quyền Quản lý Server.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const command = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    if (command === 'dashboard') return interaction.editReply(`${config.baseUrl}/servers/${interaction.guildId}`);
    let settings = await getGuildConfig(interaction.guildId);
    const revision = settings.revision;
    if (command === 'view') {
      return interaction.editReply({ files: [{ attachment: Buffer.from(JSON.stringify(settings, null, 2)), name: 'hutao-settings.json' }] });
    }
    if (command === 'listroles') {
      const lines = settings.roleRewards.map(r => `Level **${r.level}** → <@&${r.roleId}>`);
      return interaction.editReply({ content: lines.join('\n').slice(0, 1950) || 'Chưa có mốc role. Dùng /setup addrole để thêm.', allowedMentions: { parse: [] } });
    }
    if (command === 'reset') {
      if (!interaction.options.getBoolean('confirm')) return interaction.editReply('Đã hủy đặt lại cấu hình.');
      settings = getDefaultGuildConfig(interaction.guildId);
    } else if (['welcome', 'goodbye'].includes(command)) {
      const value = settings[command];
      value.enabled = interaction.options.getBoolean('enabled');
      value.channelId = interaction.options.getChannel('channel')?.id || value.channelId;
      value.message = interaction.options.getString('message') ?? value.message;
      value.useEmbed = interaction.options.getBoolean('embed') ?? value.useEmbed;
    } else if (command === 'levelmode') settings.levelMode = interaction.options.getString('mode');
    else if (command === 'addrole') {
      const level = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      settings.roleRewards = settings.roleRewards.filter(r => r.level !== level);
      settings.roleRewards.push({ level, roleId: role.id, roleName: role.name });
    } else if (command === 'removerole') settings.roleRewards = settings.roleRewards.filter(r => r.level !== interaction.options.getInteger('level'));
    else if (group === 'xp' && command === 'chat') {
      settings.xpSettings.chat = { min: interaction.options.getInteger('min'), max: interaction.options.getInteger('max'), cooldownSeconds: interaction.options.getInteger('cooldown') };
    } else if (group === 'xp' && command === 'voice') {
      settings.xpSettings.voice = { rewardPerMinute: interaction.options.getInteger('reward'), minChannelMembers: interaction.options.getInteger('members') };
    } else if (command === 'channel') settings.levelUpChannelId = interaction.options.getChannel('channel')?.id || null;
    await saveGuildConfig(interaction.guild, settings, revision);
    await interaction.editReply('Đã lưu cấu hình. Bot áp dụng ở lần xử lý tiếp theo; role được đồng bộ khi thành viên nhận XP.');
  } catch (error) {
    if (!(error instanceof SettingsError)) console.error('[Setup]', error.message);
    await interaction.editReply(error instanceof SettingsError ? error.message : 'Không thể lưu cấu hình. Hãy kiểm tra kết nối và quyền của bot.');
  }
}
