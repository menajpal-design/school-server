# দ্রুত GitHub সেটআপ গাইড

## ✅ এখন পর্যন্ত যা হয়েছে:

1. ✅ **Downloads Page** - `client/app/downloads/page.tsx`
   - GitHub Releases থেকে APK তালিকা দেখায়
   - ডাউনলোড লিংক প্রদান করে
   - ইনস্টলেশন নির্দেশনা দেয়
   - বাংলা ভাষায় পুরো ইন্টারফেস

2. ✅ **GitHub Actions Workflow** - `.github/workflows/build-and-release.yml`
   - Automatic Android APK build
   - GitHub Releases create করে
   - Heroku deploy করে (server + client)
   - প্রতিটি push-তে automatic চলে

3. ✅ **Deployment Guide** - `GITHUB_DEPLOYMENT_GUIDE.md`
   - Step-by-step setup নির্দেশনা
   - সব environment variables
   - Troubleshooting টিপস

---

## 🚀 GitHub এ যেভাবে পুশ করবেন:

### Step 1: GitHub Repository তৈরি করুন

1. যান **https://github.com/new**
2. Repository name: `school_n`
3. Description: `School Management System`
4. ✓ Public/Private চয়ন করুন
5. Click **"Create repository"**

### Step 2: Local Git Remote সেট করুন

```bash
cd c:\New folder\school_n

# আপনার GitHub URL দিয়ে replace করুন
git remote set-url origin https://github.com/YOUR_USERNAME/school_n.git

# যদি remote না থাকে:
# git remote add origin https://github.com/YOUR_USERNAME/school_n.git
```

### Step 3: GitHub এ Push করুন

```bash
git branch -M main
git push -u origin main
```

### Step 4: GitHub Secrets যোগ করুন

যান: **GitHub → Repository Settings → Secrets and variables → Actions**

**New Repository Secret যোগ করুন:**

#### Secret 1: GITHUB_TOKEN
- নাম: `GITHUB_TOKEN`
- ভ্যালু: [Generate করবেন আমরা]

#### Secret 2: HEROKU_API_KEY
1. যান: https://dashboard.heroku.com/account
2. "API Key" খুঁজুন
3. "Reveal" ক্লিক করুন
4. Token copy করুন
5. GitHub এ পেস্ট করুন

```
Name: HEROKU_API_KEY
Value: (Heroku থেকে copy করা token)
```

---

## 📲 Download Page URL

Deploy করার পর আপনার users এই URL এ যেতে পারবে:

```
https://school-client.herokuapp.com/downloads
```

---

## 🔄 পুরো Process Flow:

```
1. Code পরিবর্তন করুন
   ↓
2. Git commit + push করুন
   ↓
3. GitHub Actions automatically চালু হয়
   ↓
4. Android APK build হয় (5-10 মিনিট)
   ↓
5. GitHub Release তৈরি হয়
   ↓
6. Server + Client Heroku-এ deploy হয়
   ↓
7. Users /downloads page থেকে APK download করে
   ↓
8. Android app install হয় এবং চলে!
```

---

## 📊 Status দেখার জায়গা:

### Build Status
- যান: **GitHub → Repository → Actions**
- সব build history এবং logs দেখবেন

### Releases
- যান: **GitHub → Repository → Releases**
- সব APK versions এবং download লিংক

### Live App
- **Server**: https://school-server.herokuapp.com
- **Client**: https://school-client.herokuapp.com
- **Downloads**: https://school-client.herokuapp.com/downloads

---

## 🎯 ব্যবহারকারীদের জন্য Instructions:

যখন users APK download করবে:

1. **যান**: https://school-client.herokuapp.com/downloads
2. **ডাউনলোড** করুন সর্বশেষ APK
3. **অজানা উৎস চালু করুন**: Settings → Security → Unknown sources
4. **ফাইল খুলুন** এবং ইনস্টল করুন
5. **লঞ্চ করুন** এবং লগইন করুন

---

## 🔐 Security Checklist:

- [ ] GitHub Token secure place এ রাখা আছে
- [ ] HEROKU_API_KEY secret এ আছে (কখনো commit করবেন না)
- [ ] `.gitignore` এ sensitive files আছে
- [ ] Repository public না হলে GitHub Secrets ব্যবহার করুন

---

## ⚠️ Common Issues & Solutions:

### Issue: "Repository not found"
```bash
# Fix:
git remote -v
git remote set-url origin https://github.com/YOUR_USERNAME/school_n.git
```

### Issue: "Permission denied (publickey)"
```bash
# GitHub SSH key setup করুন:
ssh-keygen -t ed25519 -C "your_email@example.com"
# Then add public key to GitHub Settings → SSH keys
```

### Issue: Build fails in GitHub Actions
1. Check logs in GitHub Actions
2. Verify Android SDK setup
3. Check Gradle configuration
4. Ensure all dependencies installed

### Issue: Heroku deploy fails
1. Verify HEROKU_API_KEY is correct
2. Check app name matches configuration
3. Ensure package.json has start script
4. Check Heroku logs: `heroku logs -a school-server`

---

## 📝 Next Commands:

আপনি ready হলে এই commands চালান:

```bash
# 1. GitHub এ পুশ করুন
git push -u origin main

# 2. GitHub এ যান এবং Secrets যোগ করুন
# https://github.com/YOUR_USERNAME/school_n/settings/secrets/actions

# 3. Actions tab দেখুন
# https://github.com/YOUR_USERNAME/school_n/actions

# 4. Build complete হওয়া পর্যন্ত অপেক্ষা করুন (5-15 মিনিট)

# 5. Releases দেখুন
# https://github.com/YOUR_USERNAME/school_n/releases
```

---

## 🎉 একবার সম্পূর্ণ হলে:

✅ প্রতিটি push থেকে automatic APK build হবে  
✅ Releases এ সব APK versions থাকবে  
✅ ডাউনলোড page থেকে users APK download করতে পারবে  
✅ Heroku-এ automatic deployment হবে  
✅ ব্যবহারকারীরা সরাসরি app ডাউনলোড করে install করতে পারবে  

---

## 📞 সাহায্যের জন্য:

- GitHub Issues সেট করুন
- Project আপডেট documentation
- Users জন্য FAQ page তৈরি করুন

---

*Ready to go live!* 🚀
