'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // ── Element References ────────────────────────────────────────────────────
    const urlInput = document.getElementById('url-input');
    const fetchBtn = document.getElementById('fetch-btn');
    const clearBtn = document.getElementById('clear-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const statusDot = document.getElementById('status-indicator');
    const loadingEl = document.getElementById('loading');
    const errorBox = document.getElementById('error-box');
    const errorText = document.getElementById('error-text');
    const dismissError = document.getElementById('dismiss-error');
    const resultSection = document.getElementById('result-section');
    const videoThumb = document.getElementById('video-thumb');
    const videoTitle = document.getElementById('video-title');
    const videoUploader = document.getElementById('video-uploader');
    const durationBadge = document.getElementById('duration-badge');
    const platformBadge = document.getElementById('platform-badge');
    const videoFormatsEl = document.getElementById('video-formats');
    const audioFormatsEl = document.getElementById('audio-formats');
    const dlToast = document.getElementById('dl-toast');

    // ── State ─────────────────────────────────────────────────────────────────
    let currentData = null;

    // ── Health Check ──────────────────────────────────────────────────────────
    async function checkHealth() {
        try {
            const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                statusDot.classList.add('online');
                statusDot.title = 'Server Online';
            } else {
                statusDot.classList.add('offline');
                statusDot.title = 'Server Error';
            }
        } catch {
            statusDot.classList.add('offline');
            statusDot.title = 'Server Offline';
        }
    }
    checkHealth();

    // ── Theme Toggle ──────────────────────────────────────────────────────────
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') applyLight();

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });

    function applyLight() {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // ── Input Controls ────────────────────────────────────────────────────────
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        urlInput.focus();
        hideError();
        resultSection.classList.add('hidden');
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                urlInput.focus();
                urlInput.dispatchEvent(new Event('input'));
            }
        } catch {
            // Clipboard permission denied — silently fail
        }
    });

    // ── URL Validation ────────────────────────────────────────────────────────
    const URL_RE = /^https?:\/\/.+\..+/i;
    const PLATFORM_RE = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com/i;

    function isValidUrl(url) {
        return URL_RE.test(url);
    }

    // ── Tab Switching ─────────────────────────────────────────────────────────
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            document.getElementById(`${target}-pane`).classList.add('active');
        });
    });

    // ── Fetch Video Info ──────────────────────────────────────────────────────
    fetchBtn.addEventListener('click', processUrl);
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') processUrl(); });

    async function processUrl() {
        const url = urlInput.value.trim();

        if (!url) {
            showError('Please paste a video URL first.');
            return;
        }
        if (!isValidUrl(url)) {
            showError('Invalid URL format. Please enter a URL starting with https://');
            return;
        }

        // Reset UI
        hideError();
        resultSection.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        fetchBtn.disabled = true;

        try {
            const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || `Server error (${res.status})`);
            }

            currentData = data;
            renderResult(data);

        } catch (err) {
            showError(err.message || 'Failed to fetch video information. Please check the URL and try again.');
        } finally {
            loadingEl.classList.add('hidden');
            fetchBtn.disabled = false;
        }
    }

    // ── Render Result ─────────────────────────────────────────────────────────
    function renderResult(data) {
        // Thumbnail
        videoThumb.src = '';
        videoThumb.src = data.thumbnail || '';
        videoThumb.alt = data.title;
        videoThumb.onerror = () => {
            videoThumb.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"%3E%3Crect fill="%231e293b" width="400" height="225"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-size="16"%3ENo Thumbnail%3C/text%3E%3C/svg%3E';
        };

        // Meta
        videoTitle.textContent = data.title;
        videoUploader.textContent = data.uploader;
        durationBadge.textContent = data.duration || 'N/A';
        platformBadge.textContent = data.platform;
        platformBadge.style.background = data.platformColor || '#6366f1';

        // Video formats
        videoFormatsEl.innerHTML = '';
        if (!data.videoFormats || data.videoFormats.length === 0) {
            videoFormatsEl.innerHTML = '<p class="empty-state"><i class="fas fa-info-circle"></i> No video formats available.</p>';
        } else {
            data.videoFormats.forEach(f => {
                videoFormatsEl.appendChild(createFormatCard(f, data.title));
            });
        }

        // Audio formats
        audioFormatsEl.innerHTML = '';
        if (!data.audioFormats || data.audioFormats.length === 0) {
            audioFormatsEl.innerHTML = '<p class="empty-state"><i class="fas fa-info-circle"></i> No audio formats available.</p>';
        } else {
            data.audioFormats.forEach(f => {
                audioFormatsEl.appendChild(createFormatCard(f, data.title));
            });
        }

        // Make sure video tab is active
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'video');
            t.setAttribute('aria-selected', t.dataset.tab === 'video' ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-pane').forEach(p => {
            p.classList.toggle('active', p.id === 'video-pane');
        });

        resultSection.classList.remove('hidden');
        setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }

    // ── Format Card ───────────────────────────────────────────────────────────
    function createFormatCard(format, title) {
        const card = document.createElement('div');
        card.className = 'format-card';

        const icon = format.type === 'audio' ? 'fa-music' : 'fa-film';
        const sizeStr = format.filesize ? formatBytes(format.filesize) : 'Stream';
        const hasAudioLabel = (format.type === 'video' && format.hasAudio) ? '<span class="fc-ext" style="color:#10b981">+Audio</span>' : '';

        card.innerHTML = `
            <i class="fas ${icon} fc-icon"></i>
            <span class="fc-quality">${escapeHTML(format.quality)}</span>
            <span class="fc-ext">.${escapeHTML(format.ext)}</span>
            ${hasAudioLabel}
            <span class="fc-size">${sizeStr}</span>
            <i class="fas fa-download fc-dl-icon"></i>
        `;

        card.addEventListener('click', () => triggerDownload(format, title, card));
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') triggerDownload(format, title, card); });

        return card;
    }

    // ── Trigger Download ──────────────────────────────────────────────────────
    function triggerDownload(format, title, card) {
        if (card.classList.contains('downloading')) return;

        const safeTitle = title.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_').slice(0, 80) || 'download';
        const filename = `${safeTitle}.${format.ext}`;
        const downloadUrl = `/api/download?url=${encodeURIComponent(format.url)}&filename=${encodeURIComponent(filename)}`;

        // Create a hidden anchor and click it — works across all browsers
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Visual feedback
        card.classList.add('downloading');
        const origInner = card.innerHTML;
        card.querySelector('.fc-dl-icon').style.opacity = '1';
        showToast();

        setTimeout(() => {
            card.classList.remove('downloading');
            card.querySelector('.fc-dl-icon').style.opacity = '';
        }, 3000);
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    let toastTimer;
    function showToast() {
        dlToast.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => dlToast.classList.add('hidden'), 3500);
    }

    // ── Error Helpers ─────────────────────────────────────────────────────────
    function showError(msg) {
        errorText.textContent = msg;
        errorBox.classList.remove('hidden');
    }

    function hideError() {
        errorBox.classList.add('hidden');
        errorText.textContent = '';
    }

    dismissError.addEventListener('click', hideError);

    // ── Utilities ─────────────────────────────────────────────────────────────
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    function escapeHTML(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

});
