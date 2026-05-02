# Ollama nginx proxy on VPS (conf.d, port 8081)

## 1. Rate-limit zone in main config

Add this line **inside the `http { }` block** in `/etc/nginx/nginx.conf` (e.g. near the top of the block):

```nginx
limit_req_zone $binary_remote_addr zone=ollama_rl:10m rate=10r/s;
```

## 2. Create the site config

```bash
sudo cp deploy/ollama-nginx.conf /etc/nginx/conf.d/ollama.conf
```

Edit the file and replace `YOUR_STRONG_TOKEN_HERE` with a strong secret (same value you will use in the app as `OLLAMA_BEARER_TOKEN` or similar):

```bash
sudo nano /etc/nginx/conf.d/ollama.conf
```

## 3. Test and reload

Test config:

```bash
sudo nginx -t
```

Reload (use one of these):

```bash
sudo systemctl reload nginx
```

or:

```bash
sudo service nginx reload
```

## Summary

| Item        | Value                          |
|------------|---------------------------------|
| Config file| `/etc/nginx/conf.d/ollama.conf` |
| Listen     | 8081                            |
| Health     | `GET /health` → 200 (no auth)   |
| API        | `POST /api/chat` only, Bearer auth, rate limit → `http://127.0.0.1:11434/api/chat` |
