const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

app.get("/api/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL missing." });

  try {
    const raw = await run(`yt-dlp --dump-json --no-playlist "${url}"`);
    const info = JSON.parse(raw);

    const formats = [
      { itag: "360", quality: "360p", container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "480", quality: "480p", container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "720", quality: "720p",  container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "1080", quality: "1080p", container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "audio", quality: "Audio Only (MP3)", container: "mp3", hasVideo: false, hasAudio: true },
    ];

    res.json({
      title: info.title,
      author: info.uploader || "",
      duration: info.duration,
      viewCount: info.view_count,
      thumbnail: info.thumbnail,
      videoId: info.id,
      formats,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch video info. Try again." });
  }
});

app.get("/api/download", async (req, res) => {
  const { url, itag, title } = req.query;
  if (!url || !itag) return res.status(400).json({ error: "Missing params." });

  const isAudio = itag === "audio";
  const ext = isAudio ? "mp3" : "mp4";

  const safeTitle = (title || "video")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 80);

  // Temp file path
  const tmpFile = path.join(os.tmpdir(), `ytgrab_${Date.now()}.${ext}`);

  // Format select
  let format;
  if (isAudio) {
    format = "bestaudio";
  } else {
    format = `bestvideo[height<=${itag}]+bestaudio/best[height<=${itag}]`;
  }

  const cmd = `yt-dlp -f "${format}" --merge-output-format ${ext} -o "${tmpFile}" --no-playlist "${url}"`;

  console.log("Downloading:", cmd);

  try {
    await run(cmd);

    if (!fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: "File not created." });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", fs.statSync(tmpFile).size);

    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);

    fileStream.on("close", () => {
      fs.unlink(tmpFile, () => {});
    });

  } catch (err) {
    console.error(err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed." });
    }
    fs.unlink(tmpFile, () => {});
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
