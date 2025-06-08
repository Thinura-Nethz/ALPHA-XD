const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const router = express.Router();
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const phone = require("phone");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  
  // Validate phone number
  const phoneValidation = phone(num);
  if (!phoneValidation.isValid) {
    logger.warn(`Invalid phone number attempt: ${num}`);
    return res.status(400).json({ 
      error: true,
      message: "Invalid phone number. Please include country code (e.g., +94701234567)."
    });
  }

  // Clean number
  num = phoneValidation.phoneNumber;

  async function RobinPair() {
    const sessionDir = "./session";
    let timeoutId;
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      
      // Set session timeout
      timeoutId = setTimeout(() => {
        logger.warn(`Session timeout for ${num}`);
        removeFile(sessionDir);
        if (!res.headersSent) {
          res.status(408).json({ 
            error: true,
            message: "Session timed out. Please try again." 
          });
        }
      }, SESSION_TIMEOUT);

      const RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        const code = await RobinPairWeb.requestPairingCode(num);
        logger.info(`Pairing code generated for ${num}`);
        
        if (!res.headersSent) {
          res.json({ 
            success: true,
            code: code 
          });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);
      
      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        
        if (connection === "open") {
          clearTimeout(timeoutId);
          try {
            await delay(10000);
            
            // Upload session to MEGA
            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);
            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${generateRandomId()}.json`
            );
            
            const string_session = mega_url.replace(
              "https://mega.nz/file/",
              ""
            );

            // Send confirmation messages
            const welcomeMsg = `*ALPHA XD [The powerful WA BOT]*\n\n*📡 Successfully Connected to WhatsApp!*\n\n*Welcome to ALPHA XD! 🎉*`;
            const warningMsg = `🛑 *Do not share this code with anyone* 🛑`;
            
            await RobinPairWeb.sendMessage(user_jid, {
              image: {
                url: "https://raw.githubusercontent.com/Thinura-Nethz/bot-img/main/ChatGPT%20Image%20Jun%206%2C%202025%2C%2005_39_56%20PM.png",
              },
              caption: welcomeMsg,
            });
            
            await RobinPairWeb.sendMessage(user_jid, {
              text: string_session,
            });
            
            await RobinPairWeb.sendMessage(user_jid, { 
              text: warningMsg 
            });

          } catch (e) {
            logger.error(`Error during session upload: ${e.message}`);
            exec("pm2 restart Robin-md");
          } finally {
            await removeFile(sessionDir);
            process.exit(0);
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          logger.warn(`Connection closed, attempting reconnect for ${num}`);
          await delay(10000);
          RobinPair();
        }
      });
    } catch (err) {
      logger.error(`Pairing error: ${err.message}`);
      clearTimeout(timeoutId);
      exec("pm2 restart Robin-md");
      await removeFile(sessionDir);
      
      if (!res.headersSent) {
        res.status(500).json({ 
          error: true,
          message: "Service unavailable. Please try again later."
        });
      }
    }
  }
  
  return await RobinPair();
});

function generateRandomId(length = 6, numberLength = 4) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${number}`;
}

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  exec("pm2 restart Robin");
});

module.exports = router;
