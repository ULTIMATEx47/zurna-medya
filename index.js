const express = require('express');
const cors = require('cors');
const axios = require('axios');
const play = require('play-dl');
const crypto = require('crypto');

const app = express();
app.use(cors());

// JioSaavn MP3 Decryptor
function decryptJioSaavnUrl(encryptedUrl) {
    if (!encryptedUrl) return "";
    try {
        const key = Buffer.from("38346539313238327a65633463303661", 'hex');
        const decipher = crypto.createDecipheriv('des-ecb', key, '');
        let decrypted = decipher.update(encryptedUrl, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted.replace("_96.mp4", "_320.mp4");
    } catch(e) {
        return "";
    }
}

// JioSaavn Arama
app.get('/api/jiosaavn/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const searchUrl = `https://www.jiosaavn.com/api.php?p=1&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=20&__call=search.getResults`;
    const searchRes = await axios.get(searchUrl);
    
    let data;
    try {
        const text = searchRes.data.toString();
        data = JSON.parse(text.substring(text.indexOf('{')));
    } catch(e) { data = searchRes.data; }

    if (!data.results || data.results.length === 0) return res.json({ data: [] });

    const songs = data.results.map((item) => {
      let mediaUrl = decryptJioSaavnUrl(item.more_info?.encrypted_media_url);
      let imageUrl = (item.image || "").replace("150x150", "500x500");

      return {
        id: item.id,
        name: (item.title || "Bilinmeyen").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
        artistName: item.more_info?.singers || item.more_info?.primary_artists || "Bilinmeyen",
        image: imageUrl,
        durationSeconds: parseInt(item.more_info?.duration || "0", 10),
        audioUrl: mediaUrl,
        downloadUrl: mediaUrl,
        platform: 'JioSaavn'
      };
    });
    res.json({ data: songs.filter(s => s.audioUrl) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SoundCloud Token Alıcı
let scClientId = '';
async function ensureScToken() {
    if (!scClientId) {
        scClientId = await play.getFreeClientID();
        await play.setToken({ soundcloud : { client_id : scClientId } });
    }
}

// SoundCloud Arama
app.get('/api/soundcloud/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    await ensureScToken();

    const searched = await play.search(query, { limit: 20, source: { soundcloud: 'tracks' } });
    
    const tracks = searched.map(t => ({
      id: t.id ? t.id.toString() : t.url,
      name: t.name || 'Bilinmeyen',
      artistName: t.publisher?.name || 'Bilinmeyen',
      image: t.thumbnail || '',
      durationSeconds: t.durationInSec || 0,
      audioUrl: `/api/soundcloud/stream?url=${encodeURIComponent(t.url)}`, // Oynatma anında çevrilecek
      downloadUrl: t.url,
      platform: 'SoundCloud'
    }));
    res.json({ data: tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SoundCloud Oynatma Köprüsü (Stream URL)
app.get('/api/soundcloud/stream', async (req, res) => {
    try {
        const { url } = req.query;
        await ensureScToken();
        const stream = await play.stream(url);
        res.redirect(stream.url); // Direk gerçek sese yönlendir
    } catch(err) {
        res.status(500).send("Stream error");
    }
});

app.get('/', (req, res) => res.send('Zurna Backend is Running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zurna Backend on ${PORT}`));
