import { SlashCommandBuilder } from 'discord.js'

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show Drust worker and active operation status.'),
  new SlashCommandBuilder()
    .setName('pairing-status')
    .setDescription('Show Rust+ and Discord configuration readiness.'),
  new SlashCommandBuilder()
    .setName('op-status')
    .setDescription('Show the current active operation.'),
  new SlashCommandBuilder()
    .setName('timer-start')
    .setDescription('Start an operation timer manually.')
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('Which target to start.')
        .setRequired(true)
        .addChoices(
          { name: 'Small Oil', value: 'small-oil' },
          { name: 'Large Oil', value: 'large-oil' },
          { name: 'Cargo', value: 'cargo' },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('How many minutes to run the timer for.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(60),
    ),
  new SlashCommandBuilder()
    .setName('timer-extend')
    .setDescription('Extend the active operation timer.')
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Minutes to add.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(30),
    ),
  new SlashCommandBuilder()
    .setName('op-close')
    .setDescription('Close the active operation.')
    .addStringOption((option) =>
      option
        .setName('result')
        .setDescription('Final operation result.')
        .setRequired(true)
        .addChoices(
          { name: 'Success', value: 'success' },
          { name: 'Failed', value: 'failed' },
          { name: 'Aborted', value: 'aborted' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('note')
        .setDescription('Optional close note.')
        .setRequired(false)
        .setMaxLength(180),
    ),
].map((command) => command.toJSON())
