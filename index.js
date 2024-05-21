require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// Replace with your own bot token
const token = '6557838861:AAH3fruwvkcwNpKghpBpo21LNs0toY9Rf1Y';
const bot = new TelegramBot(token, { polling: true });

// Function to sanitize filenames
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"\/\\|?*]/g, '').replace(/ +/g, ' ').trim();
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! Send me a YouTube link and I'll download the audio as an MP3 for you.");
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, "Just send a YouTube link and I'll download the audio as an MP3 for you.");
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (ytdl.validateURL(text)) {
    try {
      const info = await ytdl.getInfo(text);
      const title = sanitizeFilename(info.videoDetails.title);

      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      const highestQuality = audioFormats.reduce((max, format) => (format.audioBitrate > max.audioBitrate ? format : max), audioFormats[0]);

      const availableQualities = audioFormats.map(format => ({
        quality: format.audioBitrate,
        mimeType: format.mimeType,
        bitrate: format.bitrate
      }));

      let qualityMessage = `Available audio qualities for "${title}":\n`;
      availableQualities.forEach((quality, index) => {
        qualityMessage += `\n${index + 1}. Bitrate: ${quality.bitrate / 1000} kbps, Quality: ${quality.quality} kbps, Mime Type: ${quality.mimeType}`;
      });

      bot.sendMessage(chatId, qualityMessage);
      bot.sendMessage(chatId, `Downloading: ${title}`);

      const outputPath = path.resolve(__dirname, `${title}.mp3`);
      const stream = ytdl(text, { quality: highestQuality.itag });

      ffmpeg(stream)
        .audioBitrate(highestQuality.audioBitrate) // Set to the highest available bitrate
        .save(outputPath)
        .on('end', () => {
          console.log(`Download finished: ${outputPath}`);

          ffmpeg.ffprobe(outputPath, (err, metadata) => {
            if (err) {
              bot.sendMessage(chatId, 'An error occurred while retrieving audio metadata.');
              console.error(err);
              return;
            }

            const bitrate = metadata.format.bit_rate / 1000; // Convert to kbps
            console.log(`Bitrate: ${bitrate} kbps`);

            bot.sendMessage(chatId, `Download complete: ${title}\nAudio Bitrate: ${bitrate.toFixed(2)} kbps`)
              .then(() => {
                const fileOptions = {
                  filename: `${title}.mp3`,
                  contentType: 'audio/mpeg',
                };

                bot.sendAudio(chatId, outputPath, {}, fileOptions)
                  .then(() => {
                    fs.unlinkSync(outputPath); // Remove the file after sending
                    console.log(`File sent and deleted: ${outputPath}`);
                  })
                  .catch((error) => {
                    bot.sendMessage(chatId, 'An error occurred while sending the audio file.');
                    console.error(error);
                  });
              })
              .catch((error) => {
                bot.sendMessage(chatId, 'An error occurred while sending the bitrate information.');
                console.error(error);
              });
          });
        })
        .on('error', (error) => {
          bot.sendMessage(chatId, 'An error occurred while processing your request.');
          console.error(error);
        });
    } catch (error) {
      bot.sendMessage(chatId, 'An error occurred while fetching video info. Please try again later.');
      console.error(error);
    }
  } else if (text !== '/start' && text !== '/help') {
    bot.sendMessage(chatId, 'Please send a valid YouTube link.');
  }
});
