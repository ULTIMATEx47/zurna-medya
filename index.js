const express = require('express');
const cors = require('cors');
const axios = require('axios');
const play = require('play-dl');

const app = express();
app.use(cors());

// JioSaavn Arama (Gayriresmi Web Scraping API)
app.get('/api/jiosaavn/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    // 1. Arama yap
    const searchUrl = `https://www.jiosaavn.com/api.php?p=1&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=20&__call=search.getResults`;
    const searchRes = await axios.get(searchUrl);
    
    // JioSaavn API'si bazen gereksiz tagler döndürebiliyor, parse edelim.
    let data;
    try {
        const text = searchRes.data.toString();
        const jsonStartIndex = text.indexOf('{');
        data = JSON.parse(text.substring(jsonStartIndex));
    } catch(e) {
        data = searchRes.data;
    }

    if (!data.results || data.results.length === 0) {
      return res.json({ data: [] });
    }

    const songs = data.results.map((item) => {
      // Şifrelenmiş media URL'sini (encrypted_media_url) çözmek gerekir ancak
      // 320kbps MP3 linki için gayriresmi yöntemler bulunuyor.
      // Basitçe: 
      let mediaUrl = item.media_preview_url || "";
      if (item.more_info && item.more_info.encrypted_media_url) {
          // Normalde bunu decrypt etmek gerekir (DES-ECB).
          // Şimdilik 96kbps önizlemeyi kullanıyoruz, decrypt backend eklenebilir.
          mediaUrl = mediaUrl.replace("preview.saavncdn.com", "aac.saavncdn.com").replace("_96_p.mp4", "_160.mp4");
      }
      
      let imageUrl = item.image || "";
      if (imageUrl.includes("150x150")) imageUrl = imageUrl.replace("150x150", "500x500");

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

    res.json({ data: songs });
  } catch (err) {
    console.error("JioSaavn Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// SoundCloud Arama (play-dl modülü üzerinden)
app.get('/api/soundcloud/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    // play-dl ile SC'da arat
    const searched = await play.search(query, {
      limit: 20,
      source: { soundcloud: 'tracks' }
    });

    const tracks = searched.map(t => ({
      id: t.id ? t.id.toString() : t.url,
      name: t.name || 'Bilinmeyen',
      artistName: t.publisher?.name || 'Bilinmeyen',
      image: t.thumbnail || '',
      durationSeconds: t.durationInSec || 0,
      audioUrl: t.url, // İstemci tarafında çözümlenmesi veya backend üzerinden stream edilmesi gerekir
      downloadUrl: t.url,
      platform: 'SoundCloud'
    }));

    res.json({ data: tracks });
  } catch (err) {
    console.error("SoundCloud Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Zurna Backend is Running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Zurna Backend listening on port ${PORT}`);
});
