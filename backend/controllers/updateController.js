// controllers/updateController.js
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache metadata for 5 minutes (300 seconds)
const releaseCache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

const GITHUB_OWNER = 'bazistudio';
const GITHUB_REPO = 'tijaratpro-erp';
const CACHE_KEY = 'latest_release';

/**
 * Validates the requested filename to prevent path traversal and arbitrary proxying.
 */
function isValidFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const decoded = decodeURIComponent(filename);
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
    return false;
  }
  // Allowed patterns: latest.yml, latest-mac.yml, latest-linux.yml, *.exe, *.blockmap, *.zip, etc.
  return /^(latest(-mac|-linux)?\.yml|.*\.(exe|blockmap|zip|dmg|AppImage|deb|rpm|tar\.gz))$/i.test(decoded);
}

/**
 * Fetches the latest release metadata from GitHub API.
 */
async function getLatestRelease() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GH_TOKEN is not configured');
  }

  // Check cache first
  const cached = releaseCache.get(CACHE_KEY);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TijaratPro-Backend-Updater'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    const releaseData = response.data;
    releaseCache.set(CACHE_KEY, releaseData);
    return releaseData;
  } catch (err) {
    // If /latest returns 404 (e.g. if the newest release is tagged as pre-release),
    // fallback to querying /releases and pick the latest published non-draft release
    if (err.response && err.response.status === 404) {
      const allReleasesResponse = await axios.get(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TijaratPro-Backend-Updater'
          },
          timeout: 10000
        }
      );
      const releases = allReleasesResponse.data;
      if (Array.isArray(releases) && releases.length > 0) {
        const validRelease = releases.find(r => !r.draft) || releases[0];
        releaseCache.set(CACHE_KEY, validRelease);
        return validRelease;
      }
    }
    throw err;
  }
}

/**
 * Handles the update asset request.
 */
exports.getUpdateAsset = async (req, res) => {
  try {
    const { filename } = req.params;

    if (filename === 'debug.json') {
      try {
        const token = process.env.GH_TOKEN;
        const debugInfo = {
          hasToken: !!token,
          tokenLength: token ? token.length : 0,
          tokenStart: token ? token.substring(0, 3) : null,
          userAuth: null,
          releases: null,
          repoAccess: null
        };

        if (token) {
          // Check who the token belongs to
          try {
            const userRes = await axios.get('https://api.github.com/user', {
              headers: { Authorization: `Bearer ${token}` }
            });
            debugInfo.userAuth = userRes.data.login;
          } catch (e) {
            debugInfo.userAuth = `Error: ${e.message}`;
          }

          // Check if repo is accessible
          try {
            const repoRes = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            debugInfo.repoAccess = `Success (private: ${repoRes.data.private})`;
          } catch (e) {
            debugInfo.repoAccess = `Error: ${e.message}`;
          }

          // Check releases
          try {
            const relRes = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            debugInfo.releases = relRes.data.map(r => ({
              tag: r.tag_name,
              name: r.name,
              draft: r.draft,
              prerelease: r.prerelease,
              assets: r.assets.length
            }));
          } catch (e) {
            debugInfo.releases = `Error: ${e.message}`;
          }
        }
        return res.status(200).json(debugInfo);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (!isValidFilename(filename)) {
      return res.status(400).json({ error: 'Invalid asset filename requested.' });
    }

    // Attempt to get the release metadata
    let release;
    try {
      release = await getLatestRelease();
    } catch (err) {
      console.error('[Updater] Failed to fetch release metadata:', err.message);
      return res.status(503).json({ error: 'Update service unavailable.' });
    }

    // Find the requested asset in the release
    const asset = release.assets.find(a => a.name === filename);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in the latest release.' });
    }

    const token = process.env.GH_TOKEN;

    if (filename === 'latest.yml') {
      // For latest.yml, fetch the content securely and stream/return it directly.
      // Electron needs to parse this text file directly.
      try {
        const assetResponse = await axios.get(asset.url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/octet-stream',
            'User-Agent': 'TijaratPro-Backend-Updater'
          },
          responseType: 'text',
          timeout: 10000
        });

        res.setHeader('Content-Type', 'text/yaml');
        return res.status(200).send(assetResponse.data);
      } catch (err) {
        console.error('[Updater] Failed to fetch latest.yml content:', err.message);
        return res.status(503).json({ error: 'Failed to retrieve update metadata.' });
      }
    } else {
      // For binaries (.exe, .blockmap), we do NOT proxy the bytes.
      // We issue a GET to the GitHub API, which responds with a 302 Redirect to an S3 bucket URL.
      // We capture that redirect URL and pass the 302 down to the client.
      try {
        const assetResponse = await axios.get(asset.url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/octet-stream',
            'User-Agent': 'TijaratPro-Backend-Updater'
          },
          maxRedirects: 0, // Do NOT follow the redirect
          validateStatus: (status) => status >= 200 && status < 400
        });

        // Some HTTP clients/axios setups might auto-follow if not careful, 
        // but maxRedirects: 0 throws or returns 302.
        // Actually, if maxRedirects is 0, axios resolves the promise if validateStatus passes.
        if (assetResponse.status === 302 || assetResponse.status === 301) {
          const redirectUrl = assetResponse.headers.location;
          if (redirectUrl) {
            // Securely redirect the client. The client will fetch the S3 URL natively.
            return res.redirect(302, redirectUrl);
          }
        }

        console.error('[Updater] Expected a 302 redirect from GitHub API, but got:', assetResponse.status);
        return res.status(503).json({ error: 'Failed to acquire asset download URL.' });
      } catch (err) {
        // Axios throws an error if status is 302 and validateStatus is default (which is >=200 && <300)
        // Since we provided a custom validateStatus, it should not throw for 302.
        if (err.response && (err.response.status === 302 || err.response.status === 301)) {
          const redirectUrl = err.response.headers.location;
          if (redirectUrl) {
            return res.redirect(302, redirectUrl);
          }
        }
        console.error('[Updater] Error acquiring asset download URL:', err.message);
        return res.status(503).json({ error: 'Failed to acquire asset download URL.' });
      }
    }
  } catch (error) {
    console.error('[Updater] Unhandled error during update check:', error.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
