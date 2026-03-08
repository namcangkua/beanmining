# 🫘 MineBean Auto Bot

Bot otomatis untuk melakukan mining di **MineBean** pada **Base Mainnet**.

Bot ini akan mendistribusikan ETH ke blok grid secara acak setiap ronde dan secara otomatis melakukan **claim reward** ketika saldo reward telah mencapai batas yang ditentukan.  
Dirancang untuk berjalan stabil dalam jangka panjang, termasuk dijalankan di background pada **Termux**, VPS, atau server.

---

# ✨ Fitur

- Deploy ke blok secara **acak setiap ronde (60 detik)**
- Mendukung **fixed blocks** yang selalu disertakan setiap ronde
- **Auto-claim reward** ketika saldo pending mencapai threshold
- Setup interaktif tanpa perlu mengedit file konfigurasi manual
- Konfigurasi otomatis tersimpan di `config.json`
- Sistem retry dengan **exponential backoff** saat jaringan tidak stabil
- Aman dijalankan **di background** (Termux / VPS)

---

# 📋 Persyaratan

Pastikan sistem kamu memiliki:

- **Node.js v18 atau lebih baru**
- **Git**
- Wallet **EVM** yang memiliki **ETH di Base Mainnet**

---

# 🚀 Instalasi

Clone repository lalu install dependency.

```bash
git clone https://github.com/namcangkua/beanmining.git
cd beanmining
npm install
```

---

# ⚙️ Cara Menggunakan

## Step 1 — Setup Awal

Jalankan setup wizard untuk menyimpan konfigurasi bot.

```bash
node minebean-bot.js --setup
```

Bot akan meminta beberapa input berikut:

| Input | Penjelasan |
|------|------|
| Private key | Private key wallet yang digunakan |
| Blocks per round | Jumlah blok yang akan dideploy setiap ronde (1–25) |
| Fixed blocks | Blok yang selalu disertakan setiap ronde (opsional) |
| ETH per block | Jumlah ETH yang digunakan per blok (minimum: 0.0000025) |
| Auto-claim threshold | Batas saldo pending sebelum reward di-claim |

Setelah selesai, konfigurasi akan otomatis disimpan pada file:

```
config.json
```

di dalam folder project.

---

## Step 2 — Jalankan Bot

```bash
node minebean-bot.js
```

---

# 📱 Menjalankan di Background (Termux / Server)

Agar bot tetap berjalan meskipun terminal ditutup:

```bash
termux-wake-lock
nohup node minebean-bot.js > bot.log 2>&1 &
```

Melihat log bot:

```bash
tail -f bot.log
```

Menghentikan bot:

```bash
pkill -f minebean-bot.js
```

Mengubah konfigurasi:

```bash
node minebean-bot.js --setup
```

---

# ⚙️ Referensi Konfigurasi

| Field | Default | Penjelasan |
|------|------|------|
| numBlocks | 5 | Jumlah blok yang dideploy setiap ronde |
| fixedBlocks | [] | Blok yang selalu dipilih (index UI, contoh: 3, 16) |
| ethPerBlock | 0.00001 | Jumlah ETH yang digunakan per blok |
| claimThreshold | 0.0005 | Bot akan auto-claim ketika saldo pending mencapai nilai ini |

---

# 📜 Smart Contract (Base Mainnet)

| Contract | Address |
|------|------|
| GridMining | `0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0` |
| Bean Token | `0x5c72992b83E74c4D5200A8E8920fB946214a5A5D` |

---

# 🔐 Keamanan

Private key kamu disimpan secara **lokal di file `config.json`** dan hanya digunakan untuk **menandatangani transaksi on-chain**.

- Private key **tidak pernah dikirim ke server manapun**
- `config.json` sudah dimasukkan ke dalam `.gitignore`
- File tersebut **tidak akan ter-upload ke GitHub**

⚠️ Jangan pernah membagikan **private key** atau **config.json** kepada siapapun.

---

# ⚠️ WARNING (PENTING)

Disarankan menggunakan **burn wallet** atau **wallet khusus** untuk menjalankan bot ini.

Jangan gunakan wallet utama yang menyimpan aset penting.

Tips keamanan:

- Gunakan wallet baru khusus untuk bot
- Isi hanya ETH secukupnya
- Jangan simpan dana besar pada wallet bot
- Selalu verifikasi contract sebelum menjalankan bot

**Stay safe dan selalu utamakan keamanan wallet kamu.**

---

# ⚠️ Disclaimer

Bot ini berinteraksi langsung dengan **smart contract di blockchain yang aktif**.

Gunakan dengan **risiko masing-masing**.

Pengembang tidak bertanggung jawab atas:

- Kehilangan dana
- Kesalahan konfigurasi
- Perubahan contract
- Gangguan jaringan

Pastikan kamu memahami risiko sebelum menjalankan bot otomatis ini.