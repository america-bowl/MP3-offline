module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GETで検索してな。' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 100) return res.status(400).json({ error: '曲名は1〜100文字で入れてな。' });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(503).json({ error: '検索APIの設定がまだやで。READMEの設定を確認してな。' });

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('q', q);
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('YouTube API request failed:', upstream.status);
      return res.status(502).json({ error: 'YouTube検索につながらんかった。APIキーや利用枠を確認してな。' });
    }

    const items = (Array.isArray(data.items) ? data.items : []).map((item) => {
      const snippet = item && item.snippet ? item.snippet : {};
      return {
        videoId: item && item.id ? item.id.videoId : '',
        title: typeof snippet.title === 'string' ? snippet.title : '',
        channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : ''
      };
    }).filter((item) => /^[A-Za-z0-9_-]{6,20}$/.test(item.videoId));

    return res.status(200).json({ items });
  } catch (error) {
    console.error('YouTube API request error:', error && error.name ? error.name : 'unknown');
    return res.status(502).json({ error: 'YouTube検索に失敗した。ネットワークを確認してな。' });
  } finally {
    clearTimeout(timer);
  }
};
