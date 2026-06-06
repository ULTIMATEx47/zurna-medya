const express = require('express');
const cors = require('cors');
const axios = require('axios');
const play = require('play-dl');

const app = express();
app.use(cors());

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
      let imageUrl = (item.image || "").replace("150x150", "500x500");
      let encryptedUrl = item.more_info?.encrypted_media_url || "";

      return {
        id: item.id,
        name: (item.title || "Bilinmeyen").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
        artistName: item.more_info?.singers || item.more_info?.primary_artists || "Bilinmeyen",
        image: imageUrl,
        durationSeconds: parseInt(item.more_info?.duration || "0", 10),
        audioUrl: encryptedUrl ? `/api/jiosaavn/stream?url=${encodeURIComponent(encryptedUrl)}` : "",
        downloadUrl: encryptedUrl ? `/api/jiosaavn/stream?url=${encodeURIComponent(encryptedUrl)}` : "",
        platform: 'JioSaavn'
      };
    });
    res.json({ data: songs.filter(s => s.audioUrl) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// JioSaavn Stream Redirect
app.get('/api/jiosaavn/stream', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send("No url");
        
        const authUrl = `https://www.jiosaavn.com/api.php?bitrate=320&api_version=4&_format=json&ctx=web6dot0&_marker=0&__call=song.generateAuthToken&url=${encodeURIComponent(url)}`;
        const response = await axios.get(authUrl);
        
        if (response.data && response.data.auth_url) {
            // Soru isaretinden sonraki kismi silmek bazen CDN sorununu onler, ama auth_url lazim
            res.redirect(response.data.auth_url);
        } else {
            res.status(500).send("No auth url");
        }
    } catch(err) {
        res.status(500).send("Stream error");
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
      audioUrl: `/api/soundcloud/stream?url=${encodeURIComponent(t.url)}`,
      downloadUrl: t.url, // Download might need a different handling
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
