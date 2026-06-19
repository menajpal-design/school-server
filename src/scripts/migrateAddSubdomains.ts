import mongoose from 'mongoose';
import slugify from 'slugify';
import Institution from '../models/Institution';
import { config } from '../config/config';

const cfg = config();

const makeUnique = async (base: string) => {
  let candidate = base;
  let i = 1;
  while (true) {
    const found = await Institution.findOne({ subdomain: candidate }).lean().exec();
    if (!found) return candidate;
    i += 1;
    candidate = `${base}${i}`;
  }
};

const getWebsiteHost = (website?: string): string | null => {
  if (!website) return null;
  try {
    const normalized = String(website).trim();
    const url = normalized.startsWith('http') ? new URL(normalized) : new URL(`https://${normalized}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
};

const run = async () => {
  const db = process.env.MONGO_URI || cfg.mongoUri;
  if (!db) throw new Error('MONGO_URI not set');
  await mongoose.connect(db, {});
  const institutions = await Institution.find().lean().exec();

  for (const inst of institutions) {
    if (inst.subdomain) continue;

    const baseName = inst.name || `school-${String(inst._id).slice(-4)}`;
    const base = slugify(baseName, { lower: true, strict: true }).slice(0, 40) || `school-${String(inst._id).slice(-4)}`;
    const subdomain = await makeUnique(base);

    const update: any = { subdomain };
    const websiteHost = getWebsiteHost(inst.website);
    if (websiteHost) {
      const currentDomains = Array.isArray(inst.domains) ? inst.domains.map(String) : [];
      if (!currentDomains.includes(websiteHost)) {
        update.domains = [...new Set([...currentDomains, websiteHost])];
      }
    }

    await Institution.updateOne({ _id: inst._id }, { $set: update }).exec();
    console.log('Assigned', inst._id, '->', subdomain, update.domains ? `and added domain ${getWebsiteHost(inst.website)}` : '');
  }

  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
