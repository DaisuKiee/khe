require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
});

let userCount = 0;

client.once("ready", async () => {
  console.log(`Bot ${client.user.tag} is online!`);
  await updateUserCount();
});

client.on("guildMemberAdd", async () => {
  await updateUserCount();
});

client.on("guildMemberRemove", async () => {
  await updateUserCount();
});

async function updateUserCount() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();
    userCount = guild.memberCount;
    console.log(`The server has ${userCount} members.`);
  } catch (error) {
    console.error('Error fetching user count:', error);
  }
}

function getUserCount() {
  return userCount;
}

async function createTicketChannel(guild, userId, ticketType) {
  try {
    const user = await guild.members.fetch(userId);
    
    const ticketChannel = await guild.channels.create({
      name: `ticket-${user.user.username}`,
      type: ChannelType.GuildText,
      topic: `Ticket Type: ${ticketType}, User: ${user.user.tag}`,
      parent: process.env.TICKET_CATEGORY_ID, // Replace with your category ID
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
      ],
    });

    await ticketChannel.send({
      content: `Hello <@${user.user.id}>, thank you for creating a ticket. A staff member will be with you shortly.`,
      embeds: [
        {
          title: `Welcome to your ticket, ${user.user.username}!`,
          description: `Please describe your issue or question related to ${ticketType}. Our support team will be with you shortly.`,
          color: 0x00ff00,
        },
      ],
    });

    return ticketChannel;
  } catch (error) {
    console.error("Error creating ticket channel:", error);
    throw error;
  }
}

client.login(process.env.TOKEN).catch(console.error);

module.exports = { getUserCount, client, createTicketChannel };
