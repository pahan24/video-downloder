const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const youtubeDl = require('yt-dlp-exec');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait 15 minutes before trying again.' }
});
app.use('/api/', limiter);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const URL_REGEX = /^https?:\/\/.+/i;

function getPlatform(url) {
    if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
    if (/tiktok\.com/i.test(url)) return 'TikTok';
    if (/instagram\.com/i.test(url)) return 'Instagram';
    if (/facebook\.com|fb\.watch/i.test(url)) return 'Facebook';
    if (/twitter\.com|x\.com/i.test(url)) return 'Twitter/X';
    return 'Unknown';
}

function getPlatformColor(platform) {
    const colors = {
        'YouTube': '#ff0000',
        'TikTok': '#69C9D0',
        'Instagram': '#e1306c',
        'Facebook': '#1877f2',
        'Twitter/X': '#1da1f2',
    };
    return colors[platform] || '#6366f1';
}

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ─── Video Info API ───────────────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url || !URL_REGEX.test(url)) {
        return res.status(400).json({ error: 'Please provide a valid video URL starting with http:// or https://' });
    }

    try {
        const platform = getPlatform(url);

        const metadata = await youtubeDl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificate: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
        });

        if (!metadata || !metadata.formats) {
            return res.status(404).json({ error: 'No video data found for this URL.' });
        }

        // Process formats into a clean structure
        const videoFormats = [];
        const audioFormats = [];
        const seenVideoRes = new Set();

        // Standard video presets to look for
        const videoPresets = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];

        for (const f of metadata.formats) {
            if (!f.url) continue;

            const hasVideo = f.vcodec && f.vcodec !== 'none';
            const hasAudio = f.acodec && f.acodec !== 'none';

            if (hasVideo) {
                const quality = f.format_note || f.resolution || (f.height ? `${f.height}p` : 'unknown');
                if (!seenVideoRes.has(quality)) {
                    seenVideoRes.add(quality);
                    videoFormats.push({
                        id: f.format_id,
                        ext: f.ext || 'mp4',
                        quality,
                        height: f.height || 0,
                        filesize: f.filesize || f.filesize_approx || null,
                        hasAudio,
                        url: f.url,
                        type: 'video'
                    });
                }
            } else if (hasAudio && !hasVideo) {
                audioFormats.push({
                    id: f.format_id,
                    ext: f.ext || 'webm',
                    quality: f.format_note || `${Math.round((f.abr || 0))}kbps` || 'audio',
                    abr: f.abr || 0,
                    filesize: f.filesize || f.filesize_approx || null,
                    url: f.url,
                    type: 'audio'
                });
            }
        }

        // Sort video by height descending
        videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
        // Sort audio by bitrate descending
        audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

        res.json({
            title: metadata.title || 'Untitled',
            thumbnail: metadata.thumbnail || '',
            duration: formatDuration(metadata.duration),
            durationRaw: metadata.duration,
            uploader: metadata.uploader || metadata.channel || 'Unknown',
            platform,
            platformColor: getPlatformColor(platform),
            videoFormats: videoFormats.slice(0, 10),
            audioFormats: audioFormats.slice(0, 8),
            originalUrl: url
        });

    } catch (error) {
        console.error('[/api/info] Error:', error.message || error);
        const msg = error.stderr
            ? 'Could not extract video info. The URL may be private, geo-restricted, or unsupported.'
            : error.message || 'Failed to fetch video information.';
        res.status(500).json({ error: msg });
    }
});

// ─── Proxy Download API ───────────────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
    const { url, filename } = req.query;

    if (!url || !URL_REGEX.test(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.youtube.com/'
            }
        });

        const safeFilename = (filename || 'download').replace(/[^\w.\-]/g, '_');

        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');

        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);

        response.data.on('error', (err) => {
            console.error('[proxy] Stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error during download.' });
            }
        });

    } catch (error) {
        console.error('[/api/download] Error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download. The link may have expired. Please re-fetch the video info.' });
        }
    }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[global error]', err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
