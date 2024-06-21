
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");
const discordOAuth2 = require("discord-oauth2");
const { getUserCount, client, createTicketChannel } = require('./bot'); // Import the function from bot.js
const bodyParser = require('body-parser');
//const { ReCaptchaV2 } = require('express-recaptcha');

const app = express();
const port = 3000;

app.use("/", express.static(path.join(__dirname, "./public")));

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  }),
);

/*const recaptcha = new ReCaptchaV2({
    siteKey: 'YOUR_SITE_KEY',
    secretKey: 'YOUR_SECRET_KEY',
});*/

const oauth2 = new discordOAuth2({
  clientId: "1006059847931924581",
    clientSecret: "t_V1wEnZJ8RBsuCicBYnoDU-RWW0whLq",
    redirectUri:
      "https://443fd5d5-2b82-4808-a9da-14f293b28bac-00-3d91e8l9ph2ky.riker.replit.dev/login/callback",
});

app.use(bodyParser.json());

app.get("/login", (req, res) => {
  const authUrl = oauth2.generateAuthUrl({
    scope: ["identify", "guilds"],
    state: "random_state",
  });
  res.redirect(authUrl);
});

app.get("/login/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenResponse = await oauth2.tokenRequest({
      grantType: "authorization_code",
      code: code,
      scope: "identify guilds",
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      redirectUri: process.env.REDIRECT_URI,
    });
    const accessToken = tokenResponse.access_token;
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const user = userResponse.data;
    req.session.user = user;

    // Send a message to a channel login
    const channelId = process.env.LOGIN_CHANNEL_ID; // Store the channel ID in an environment variable
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      channel.send({
        embeds: [
          {
            title: `${user.username}`,
            description: `Just logged in to the User Dashboard`,
            color: 0x00bbff,
            author: {
              name: `New Login Detected!`,
            },
            footer: {
              text: "KNH Web Notifier",
              iconURL: `https://media.discordapp.net/attachments/1252939977109798912/1252940094617161779/aboutimg-removebg-preview.png?ex=66740ae5&is=6672b965&hm=e5b1bc3521b0445cdc2f0185afa8c6e95cb5b1279f5e3b36b2529cfee8e92153&=&format=webp&quality=lossless&width=423&height=423`,
            },
            thumbnail: {
              url: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
            },
          },
        ],
      });
    }

    res.redirect("/dashboard");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error exchanging code for token");
  }
});


app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else {
    res.sendFile(path.join(__dirname, "./public/dashboard.html"));
  }
});

app.get("/api/user", (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }
  res.json(req.session.user);
});

app.get("/api/user-count", (req, res) => {
  res.json({ userCount: getUserCount() });
});

app.get("/logout", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else {
    const userId = req.session.user.id;
    const userName = req.session.user.username;

    // Send a message to a channel logout
    const channelId = process.env.LOGOUT_CHANNEL_ID; // Store the channel ID in an environment variable
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      channel.send({
        embeds: [
          {
            title: `${userName}`,
            description: `Just logged out of the User Dashboard`,
            color: 0x00bbff,
            author: {
              name: `New Logout Detected!`,
            },
            footer: {
              text: "KNH Web Notifier",
              iconURL: `https://media.discordapp.net/attachments/1252939977109798912/1252940094617161779/aboutimg-removebg-preview.png?ex=66740ae5&is=6672b965&hm=e5b1bc3521b0445cdc2f0185afa8c6e95cb5b1279f5e3b36b2529cfee8e92153&=&format=webp&quality=lossless&width=423&height=423`,
            },
            thumbnail: {
              url: `https://cdn.discordapp.com/avatars/${userId}/${req.session.user.avatar}.png`,
            },
          },
        ],
      });
    }

    req.session.destroy((err) => {
      if (err) {
        console.log(err);
        res.status(500).send("Error logging out");
      } else {
        res.redirect("/index");
      }
    });
  }
});

const ticketCooldowns = new Map();

app.post('/create-ticket', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    const { ticketType } = req.body;
    const userId = req.session.user.id;

    // Check if user is under cooldown
    if (ticketCooldowns.has(userId)) {
        const lastTicketTime = ticketCooldowns.get(userId);
        const currentTime = Date.now();
        const cooldownDuration = 24 * 60 * 60 * 1000; // 1 day cooldown

        if (currentTime - lastTicketTime < cooldownDuration) {
            // User is still under cooldown
            return res.status(400).json({ error: "cooldown" });
        }
    }

    try {
        const guildId = process.env.GUILD_ID;
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error('Guild not found');
            return res.status(404).send("Guild not found");
        }

        const newChannel = await createTicketChannel(guild, userId, ticketType);

        // Update user's last ticket creation time
        ticketCooldowns.set(userId, Date.now());

        res.status(200).json({ message: "Ticket created successfully please proceed to the discord server.", channelId: newChannel.id });
    } catch (error) {
        console.error('Error creating ticket or channel:', error);
        res.status(500).json({ message: "Error creating ticket or channel" });
    }
});


app.post('/assign-role', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    const { roleId } = req.body;
    const userId = req.session.user.id;

    try {
        // Log guild ID and user ID for debugging
        console.log('Guild ID:', process.env.GUILD_ID);
        console.log('User ID:', userId);

        // Fetch the guild (server)
        const guildId = process.env.GUILD_ID;
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error('Guild not found');
            return res.status(404).send("Guild not found");
        }

        // Fetch the member (user) in the guild
        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error('Member not found in the guild');
            return res.status(404).send("User not found in the guild");
        }

        // Fetch the role
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            console.error('Role not found');
            return res.status(404).send("Role not found");
        }

        // Check if the member already has the role
        if (member.roles.cache.has(roleId)) {
            // If the member has the role, remove it
            await member.roles.remove(role);
            console.log('Role removed successfully');
            return res.status(200).send("Role removed successfully");
        } else {
            // If the member doesn't have the role, add it
            await member.roles.add(role);
            console.log('Role assigned successfully');
            // No need to send a response here, as the function will terminate after this
        }

        // Fetch messages from a specific channel
        const channelId = process.env.ROLES_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error('Channel not found');
            return res.status(404).send("Channel not found");
        }

        const messages = await channel.messages.fetch({ limit: 10 }); // Fetch the last 10 messages
        console.log('Fetched messages from channel:', channelId);

        // Store the messages or process them as needed
        const messageData = messages.map(msg => ({
            content: msg.content,
            author: msg.author.username,
            timestamp: msg.createdTimestamp,
        }));

        // Example: Store data in a file (you can store it in a database)
        const fs = require('fs');
        fs.writeFileSync('data.json', JSON.stringify(messageData, null, 2));
        console.log('Data stored successfully');

        // Send a message to a specific channel after role assignment
        const notificationChannelId = process.env.ROLES_CHANNEL_ID;
        const notificationChannel = await client.channels.fetch(notificationChannelId);
        if (notificationChannel) {
            notificationChannel.send({
                embeds: [
                    {
                        title: `${member.user.username}`,
                        description: `Role <@&${role.id}> assigned successfully.`,
                        color: 0x00ff00,
                        author: {
                            name: `Role Assigned!`,
                        },
                        footer: {
                            text: "KNH Web Notifier",
                            iconURL: `https://media.discordapp.net/attachments/1252939977109798912/1252940094617161779/aboutimg-removebg-preview.png?ex=66740ae5&is=6672b965&hm=e5b1bc3521b0445cdc2f0185afa8c6e95cb5b1279f5e3b36b2529cfee8e92153&=&format=webp&quality=lossless&width=423&height=423`,
                        },
                        thumbnail: {
                            url: `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`,
                        },
                    },
                ],
            }).catch(console.error); // Catch errors for debugging
        } else {
            console.error('Notification channel not found');
        }

        res.status(200).send("Role assigned successfully and data stored");
    } catch (error) {
        console.error('Error assigning role:', error);
        res.status(500).send("Error assigning role");
    }
});

/*
// Use reCAPTCHA middleware for the verify-captcha endpoint
app.post('/verify-captcha', recaptcha.middleware.verify, async (req, res) => {
    if (!req.recaptcha.error) {
        // CAPTCHA verification successful

        try {
            // Get the user ID from the session
            const userId = req.session.user.id;

            // Fetch the guild (server) by ID
            const guildId = process.env.GUILD_ID;
            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                console.error('Guild not found');
                return res.status(404).send("Guild not found");
            }

            // Fetch the member (user) in the guild
            const member = await guild.members.fetch(userId);
            if (!member) {
                console.error('Member not found in the guild');
                return res.status(404).send("User not found in the guild");
            }

            // Assign the verified role to the user
            const verifiedRoleId = 'YOUR_VERIFIED_ROLE_ID'; // Replace with your verified role ID
            const role = guild.roles.cache.get(verifiedRoleId);
            if (!role) {
                console.error('Verified role not found');
                return res.status(404).send("Verified role not found");
            }

            await member.roles.add(role);

            // CAPTCHA verification successful and role assigned
            res.sendStatus(200);
        } catch (error) {
            console.error('Error assigning role:', error);
            res.sendStatus(500);
        }
    } else {
        // CAPTCHA verification failed
        res.sendStatus(400);
    }
});

*/

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "./public/index.html"));
});

app.listen(port, () =>
  console.log(`Your app is listening at http://localhost:${port}`),
);