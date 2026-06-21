# DNS & SSL Setup — Digital Ocean Droplet

এই প্রজেক্ট **Digital Ocean Droplet** এ deploy হয়। Nginx reverse proxy + Let's Encrypt SSL ব্যবহার করা হয়।

## Wildcard Subdomain Architecture

```
*.easyschool.live  →  Droplet IP  →  Nginx  →  Next.js (port 3000)
easyschool.live    →  Droplet IP  →  Nginx  →  Next.js (port 3000)
API calls          →  Droplet IP  →  Nginx  →  Node.js (port 5000)
```

---

## Step 1 — Cloudflare DNS Setup

Cloudflare এ নিচের রেকর্ডগুলো যোগ করুন:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | Droplet IP | ✅ Proxied |
| A | `www` | Droplet IP | ✅ Proxied |
| A | `*` | Droplet IP | ✅ Proxied |

> **Note:** Wildcard `*` record টি সব সাবডোমেইন (যেমন `school-a.easyschool.live`) Droplet এ নিয়ে যাবে।

---

## Step 2 — Nginx Configuration

`/etc/nginx/sites-available/easyschool` ফাইল:

```nginx
# Main domain + www
server {
    listen 80;
    server_name easyschool.live www.easyschool.live;
    return 301 https://$host$request_uri;
}

# Wildcard subdomains
server {
    listen 443 ssl;
    server_name easyschool.live www.easyschool.live *.easyschool.live;

    ssl_certificate /etc/letsencrypt/live/easyschool.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/easyschool.live/privkey.pem;

    # Next.js client
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Node.js API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable করুন:
```bash
sudo ln -s /etc/nginx/sites-available/easyschool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 3 — Let's Encrypt Wildcard SSL

```bash
# Certbot দিয়ে wildcard certificate নিন
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d easyschool.live \
  -d '*.easyschool.live'
```

`~/.secrets/cloudflare.ini`:
```ini
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
```

Auto-renew:
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## Step 4 — PM2 Setup

```bash
# First time setup
npm ci --omit=dev
npm run build
pm2 start dist/server.js --name school-server
pm2 startup  # Enable auto-start on reboot
pm2 save

# Deploy করতে (পরবর্তীতে)
bash deploy-digitalocean.sh
```

---

## Checklist

- [ ] Cloudflare: `A @`, `A www`, `A *` রেকর্ড সেট করা
- [ ] Nginx wildcard config লাগানো ও test করা (`nginx -t`)
- [ ] Let's Encrypt wildcard SSL নেওয়া
- [ ] PM2 দিয়ে server চালু, `pm2 startup` করা
- [ ] `.env` তে `MAIN_DOMAIN=easyschool.live` ও `COOKIE_DOMAIN=.easyschool.live` সেট করা
- [ ] `ALLOWED_ORIGINS` এ `https://easyschool.live,https://www.easyschool.live` সেট করা
