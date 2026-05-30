# Staging, Rollout, Monitoring, and Rollback Plan

This document outlines the recommended process for staging validation, production rollout, and rollback for the `school-server` service.

## 1. Staging Preparation

1. Create a dedicated staging environment/app.
   - Example Heroku app: `easy-school-staging`
   - Use a separate MongoDB database and separate DNS host if possible.
2. Configure environment variables for staging.
   - `MAIN_DOMAIN=staging.example.com`
   - `COOKIE_DOMAIN=.example.com`
   - `NODE_ENV=production`
   - `JWT_SECRET=<strong-secret>`
   - `MONGODB_URI` and other production-like values.
3. Add staging domain(s) to Heroku.
   - `staging.example.com`
   - `*.staging.example.com` if you want tenant subdomain testing.
4. Verify DNS for staging.
   - Use a DNS record that points to Heroku.
   - For wildcard staging domains, use CNAME or ALIAS depending on provider.

## 2. Build and Smoke Test

Run the build and smoke test after deployment to staging.

```bash
cd school-server
npm install
npm run smoke
```

If you need to run the smoke test without building:

```bash
cd school-server
npm run smoke:dev
```

### Smoke test behavior
- Calls `/api/health`
- Calls `/api/`
- Verifies successful HTTP responses
- Validates the `/api/health` response body

## 3. Staging Validation Checklist

Verify the following in staging before production rollout:

- [ ] Staging app starts successfully with no critical errors in logs.
- [ ] `npm run build` completes without TypeScript errors.
- [ ] Smoke test passes.
- [ ] Tenant resolution works for subdomains.
- [ ] Authentication and login works for at least one user.
- [ ] Role-based pages return the expected data and do not produce 403 errors for valid roles.
- [ ] Manage Users and SMS Monitoring endpoints are accessible to permitted roles.
- [ ] Emails or SMS workflows are triggered correctly (if configured).
- [ ] Any migration scripts are tested on a safe copy of the database.

## 4. Production Rollout

1. Backup production data before deploying.
   - MongoDB Atlas snapshot
   - `mongodump` for self-managed MongoDB
2. Deploy the code to production.
   - Use Heroku Git, CI, or other deployment pipeline.
3. Apply production environment variables.
   - `MAIN_DOMAIN=example.com`
   - `COOKIE_DOMAIN=.example.com`
   - `JWT_SECRET=<strong-secret>`
4. Verify production DNS and SSL.
   - `example.com`
   - `*.example.com`
   - Confirm Heroku shows DNS verified and SSL enabled.
5. Run the smoke test in production.

```bash
cd school-server
npm run smoke
```

6. If subdomain tenant resolution is expected, verify at least one tenant URL.
   - `school1.example.com`
   - `school2.example.com`

## 5. Database Migration Safety

If you run `npm run migrate:subdomains`, follow these precautions:

- Only run on a copy of production data first.
- Create a database backup or snapshot before migration.
- Confirm the migration adds unique `subdomain` values and preserves legacy host mappings.
- Check that existing institutions still resolve correctly by host or `website` field.

## 6. Monitoring and Health Checks

Monitor the production deployment with these checks:

- Heroku logs: `heroku logs --tail -a <app-name>`
- Health endpoint: `GET https://<host>/api/health`
- Application logs for authentication, tenant resolution, and permission failures.

Additional recommended checks:

- Request latency and error rate
- Failed login and permission-denied reports
- SMS and notification delivery success
- Database connectivity and query errors

## 7. Rollback Plan

Use the safest rollback method available for your deployment platform.

### Heroku rollback

1. List recent releases:

```bash
heroku releases -a <app-name>
```

2. Roll back to a previous stable release:

```bash
heroku releases:rollback v123 -a <app-name>
```

3. Verify the application on the previous release.

### Git rollback

If you deploy via Git:

```bash
git checkout <previous-stable-tag>
git push heroku main
```

### Database rollback

If database changes were applied during the failed release:

- Restore from backup or snapshot.
- Do not manually revert migrated data unless you understand the schema changes.

## 8. Post-Rollout Validation

After production deployment, run these final checks:

- [ ] Verify health endpoint is responding.
- [ ] Login as an administrator and test key user-facing flows.
- [ ] Validate role-based access for Manage Users and SMS Monitoring.
- [ ] Confirm tenant-specific subdomain requests resolve correctly.
- [ ] Check Heroku logs for any warnings or errors.
- [ ] Confirm the backup was stored successfully.

## 9. Completion Status

- [x] Staging plan documented
- [x] Deployment and rollback checklist created
- [x] Smoke test script added and verified
- [x] Production-style validation executed successfully

The staging/rollout plan is complete and ready for production deployment.
