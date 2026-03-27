const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const youtubedl = require("youtube-dl-exec");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL missing." });

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });

    const formats = [
      { itag: "360", quality: "360p", container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "480", quality: "480p", container: "mp4", hasVideo: true, hasAudio: true },
      { itag: "720", quality: "720p", container: "mp4", hasVideo: true, hasAudio: true },
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

  const tmpFile = path.join(os.tmpdir(), `ytgrab_${Date.now()}.${ext}`);

  const format = isAudio
    ? "bestaudio"
    : `bestvideo[height<=${itag}]+bestaudio/best[height<=${itag}]`;

  try {
    await youtubedl(url, {
      format,
      mergeOutputFormat: ext,
      output: tmpFile,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
    });

    if (!fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: "File not created." });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", fs.statSync(tmpFile).size);

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("close", () => fs.unlink(tmpFile, () => {}));
  } catch (err) {
    console.error(err.message);
    if (!res.headersSent) res.status(500).json({ error: "Download failed." });
    fs.unlink(tmpFile, () => {});
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
