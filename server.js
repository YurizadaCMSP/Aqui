require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const axios = require("axios");
const path = require("path");

const app = express();

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCLOUD_API_TOKEN,
  DISCLOUD_APP_ID,
  USER_ID_AUTORIZADO
} = process.env;

// Sessão e Passport
app.use(session({
  secret: "supersecret" + Math.random(),
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Estratégia Discord
passport.use(new DiscordStrategy({
  clientID: DISCORD_CLIENT_ID,
  clientSecret: DISCORD_CLIENT_SECRET,
  callbackURL: DISCORD_REDIRECT_URI,
  scope: ["identify"]
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

// Middleware de Autorização
function ensureAuth(req, res, next) {
  if (req.isAuthenticated() && req.user.id === USER_ID_AUTORIZADO) return next();
  return res.redirect("/login");
}

// Rotas de Autenticação
app.get("/login", passport.authenticate("discord"));
app.get("/callback", passport.authenticate("discord", { failureRedirect: "/" }), (req, res) => res.redirect("/painel"));
app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Painel protegido
app.get("/painel", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API protegida para frontend
app.get("/api/userinfo", ensureAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    avatar: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
  });
});

// API Discloud: Status Bot (usando endpoint correto)
app.get("/api/botinfo", ensureAuth, async (req, res) => {
  try {
    const r = await axios.get(`https://api.discloud.app/v2/app/${DISCLOUD_APP_ID}`, {
      headers: { "Authorization": DISCLOUD_API_TOKEN }
    });
    const appData = r.data && r.data.app;
    if (!appData) return res.status(404).json({ error: "Bot não encontrado" });
    res.json({
      status: appData.status,
      ram: appData.ram,
      cpu: appData.cpu,
      uptime: appData.uptime,
      servers: (appData.bot && appData.bot.guilds) ? appData.bot.guilds : 0
    });
  } catch (err) {
    // Mostra erro detalhado no log do servidor para debug!
    console.error("Erro ao buscar status do bot:", err.response?.data || err.message);
    res.status(500).json({ error: "Erro ao buscar status do bot" });
  }
});

// API Discloud: Comandos BOT (endpoint correto)
app.post("/api/bot/:cmd", ensureAuth, express.json(), async (req, res) => {
  const cmd = req.params.cmd;
  const validCmds = ["start", "restart", "stop"];
  if (!validCmds.includes(cmd)) return res.status(400).json({ error: "Comando inválido" });
  try {
    const url = `https://api.discloud.app/v2/app/${cmd}/${DISCLOUD_APP_ID}`;
    const r = await axios.post(url, {}, {
      headers: { "Authorization": DISCLOUD_API_TOKEN }
    });
    res.json({ ok: true, result: r.data });
  } catch (err) {
    // Mostra erro detalhado no log do servidor para debug!
    console.error("Erro no comando Discloud:", err.response?.data || err.message);
    res.status(500).json({ error: "Erro ao enviar comando" });
  }
});

// Página inicial
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Subir servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Painel rodando em http://localhost:${PORT}`));
