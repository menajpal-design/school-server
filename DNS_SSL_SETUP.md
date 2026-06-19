# DNS and SSL Setup for Wildcard Subdomain Tenancy

This project supports multi-tenancy by resolving institution data from the request host subdomain. To use it in production, configure DNS and SSL so that `*.example.com` points to the running Heroku app.

## Recommended architecture

- Use Cloudflare as the DNS/proxy layer in front of Heroku.
- Add your root domain and wildcard subdomain on Heroku and Cloudflare.
- Use `MAIN_DOMAIN=example.com` and `COOKIE_DOMAIN=.example.com` in production.

## Heroku setup

1. In your Heroku app dashboard, go to `Settings > Domains`.
2. Add the root domain: `example.com`.
3. Add a wildcard domain: `*.example.com`.
4. Wait for Heroku to generate the DNS target name for each domain.

## Cloudflare setup

1. Add your domain to Cloudflare and set it up with Cloudflare DNS.
2. Create the following DNS records:
   - `CNAME` record for `example.com` pointing to your Heroku DNS target.
   - `CNAME` record for `*.example.com` pointing to the same Heroku DNS target.

> If Cloudflare does not allow a root CNAME, use Cloudflare's CNAME flattening feature on the root domain.

3. Set the Cloudflare proxy status to `Proxied` for both records.
4. In Cloudflare SSL/TLS, choose `Full (strict)` if your Heroku app has a valid certificate.

## Heroku SSL

- Heroku automatically provisions SSL for custom domains on paid dynos.
- After adding both domains, verify that Heroku shows them as `DNS Verified` and `SSL Enabled`.

## Environment configuration

In your production environment, set:

- `MAIN_DOMAIN=example.com`
- `COOKIE_DOMAIN=.example.com`
- `NEXT_PUBLIC_API_URL=https://example.com` or `https://api.example.com` depending on your deployment pattern
- `NODE_ENV=production`
- `AUTH_COOKIE_NAME` and `REFRESH_COOKIE_NAME` if you want custom cookie keys

## How requests are routed

- Tenant resolution is based on the `Host` or `X-Forwarded-Host` header.
- A request to `school1.example.com` resolves `school1` as the institution subdomain.
- Cookies are set with the domain `.example.com` so they are shared across subdomains.

## Important notes

- If the frontend and API are hosted under different domains, the server needs the institution identifier via headers or explicit tenant selection. This implementation expects the same host-based subdomain to reach the backend.
- Keep `MAIN_DOMAIN` and `COOKIE_DOMAIN` aligned with your production domain.
- If you use `api.example.com` for API calls, the institution subdomain must still be part of the host header or you must provide `x-institution-id`.

## Quick checklist

- [ ] Add `example.com` and `*.example.com` to Heroku domains.
- [ ] Create Cloudflare DNS records for the root and wildcard.
- [ ] Enable Cloudflare `Full (strict)` SSL.
- [ ] Set `MAIN_DOMAIN` and `COOKIE_DOMAIN` in Heroku config.
- [ ] Deploy and verify a request to `school1.example.com` resolves the correct tenant.
