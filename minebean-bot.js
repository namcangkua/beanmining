// ============================================================
//  MineBean Auto Bot
//  Chain  : Base Mainnet (8453)
//  Setup  : node minebean-bot.js --setup
//  Bot    : node minebean-bot.js
// ============================================================

const { ethers } = require("ethers");
const readline   = require("readline");
const fs         = require("fs");
const path       = require("path");

// ── Constants ─────────────────────────────────────────────────
const GRID_ABI = [
  "function deploy(uint8[] calldata blockIds) payable",
  "function claimETH()",
  "function getTotalPendingRewards(address) view returns (uint256 pendingETH, uint256 unroastedBEAN, uint256 roastedBEAN, uint256 uncheckpointedRound)",
];
const GRID_ADDRESS  = "0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0";
const API_BASE      = "https://api.minebean.com";
const RPC_URL       = "https://mainnet.base.org";
const POLL_INTERVAL = 3000;
const MAX_RETRY     = 5;
const RETRY_DELAY   = 2000;
const CONFIG_FILE   = path.join(__dirname, "config.json");

// ── Helpers ───────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickRandomBlocks(count, exclude = []) {
  const pool = Array.from({ length: 25 }, (_, i) => i).filter(i => !exclude.includes(i));
  const chosen = [];
  while (chosen.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen.sort((a, b) => a - b);
}

async function fetchWithRetry(url, retries = MAX_RETRY) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "Connection": "keep-alive" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(RETRY_DELAY * (i + 1));
    }
  }
}

async function fetchCurrentRound(address) {
  try {
    return await fetchWithRetry(`${API_BASE}/api/round/current?user=${address}`);
  } catch (e) {
    log(`⚠️  Gagal fetch round (${e.message}), skip...`);
    return null;
  }
}

function parseBlockInput(input) {
  const parts = input.split(",").map(s => s.trim()).filter(Boolean);
  const result = [];
  for (const p of parts) {
    const n = parseInt(p);
    if (isNaN(n) || n < 1 || n > 25) return null;
    const idx = n - 1;
    if (!result.includes(idx)) result.push(idx);
  }
  return result;
}

// ── Single prompt helper ──────────────────────────────────────
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

// ── Setup ─────────────────────────────────────────────────────
async function runSetup() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║           🫘  MineBean Auto Bot               ║");
  console.log("║              Setup Konfigurasi                ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("");
  console.log("⚠️   Private key akan tampil saat diketik (tidak tersembunyi).");
  console.log("    Pastikan tidak ada orang yang melihat layar kamu.");
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── 1. Private Key ────────────────────────────────────────
  let walletAddress;
  let privateKey;
  while (true) {
    privateKey = await ask(rl, "🔑  Private key wallet kamu: ");
    if (!privateKey || privateKey.length < 10) {
      console.log("    ⚠️  Private key terlalu pendek."); continue;
    }
    try {
      const w = new ethers.Wallet(privateKey);
      walletAddress = w.address;
      console.log(`    ✅  Wallet: ${walletAddress}`);
      break;
    } catch {
      console.log("    ⚠️  Private key tidak valid, coba lagi.");
    }
  }

  console.log("");

  // ── 2. Jumlah block per round ─────────────────────────────
  let numBlocks;
  while (true) {
    const input = await ask(rl, "🎲  Jumlah block per round (1-25) [default: 5]: ");
    const val   = input === "" ? 5 : parseInt(input);
    if (!isNaN(val) && val >= 1 && val <= 25) { numBlocks = val; break; }
    console.log("    ⚠️  Masukkan angka antara 1 sampai 25.");
  }

  // ── 3. Fixed blocks ───────────────────────────────────────
  let fixedBlocks = [];
  while (true) {
    const input = await ask(rl, "📌  Block yang selalu dipilih (pisah koma, misal: 3,16) [kosong = semua random]: ");
    if (input === "") break;
    const parsed = parseBlockInput(input);
    if (!parsed) { console.log("    ⚠️  Format tidak valid. Contoh: 3,16"); continue; }
    if (parsed.length >= numBlocks) { console.log(`    ⚠️  Jumlah fixed block tidak boleh >= ${numBlocks}.`); continue; }
    fixedBlocks = parsed;
    break;
  }

  // ── 4. ETH per block ──────────────────────────────────────
  let ethPerBlockStr;
  while (true) {
    const input = await ask(rl, "💰  ETH per block [default: 0.00001]: ");
    const val   = input === "" ? "0.00001" : input;
    try {
      const parsed = ethers.parseEther(val);
      if (parsed < ethers.parseEther("0.0000025")) { console.log("    ⚠️  Minimum 0.0000025 ETH per block."); continue; }
      ethPerBlockStr = val;
      break;
    } catch { console.log("    ⚠️  Format tidak valid. Contoh: 0.00001"); }
  }

  // ── 5. Claim threshold ────────────────────────────────────
  let claimThresholdStr;
  while (true) {
    const input = await ask(rl, "🎯  Auto-claim jika pending ETH >= [default: 0.0005]: ");
    const val   = input === "" ? "0.0005" : input;
    try {
      const parsed = ethers.parseEther(val);
      if (parsed <= 0n) throw new Error();
      claimThresholdStr = val;
      break;
    } catch { console.log("    ⚠️  Format tidak valid. Contoh: 0.0005"); }
  }

  const totalPerRound = ethers.formatEther(ethers.parseEther(ethPerBlockStr) * BigInt(numBlocks));
  const fixedUi       = fixedBlocks.length > 0 ? fixedBlocks.map(b => `#${b + 1}`).join(", ") : "semua random";
  const randomCount   = numBlocks - fixedBlocks.length;

  // ── Konfirmasi ────────────────────────────────────────────
  console.log("");
  console.log("┌─────────────── KONFIRMASI ──────────────────┐");
  console.log(`│  Wallet    : ${walletAddress.slice(0, 22)}...`);
  console.log(`│  Block/rnd : ${numBlocks} block`);
  console.log(`│  Fixed     : ${fixedUi}`);
  console.log(`│  Random    : ${randomCount} block sisanya`);
  console.log(`│  ETH/block : ${ethPerBlockStr} ETH`);
  console.log(`│  ETH/round : ${totalPerRound} ETH`);
  console.log(`│  AutoClaim : >= ${claimThresholdStr} ETH`);
  console.log("└─────────────────────────────────────────────┘");
  console.log("");

  const confirm = await ask(rl, "💾  Simpan config? (y/n): ");
  rl.close();

  if (confirm.toLowerCase() !== "y") {
    console.log("❌  Dibatalkan.");
    process.exit(0);
  }

  // Simpan config.json
  const config = {
    privateKey,
    numBlocks,
    fixedBlocks,
    ethPerBlock: ethPerBlockStr,
    claimThreshold: claimThresholdStr,
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log("");
  console.log("✅  Config disimpan!");
  console.log("");
  console.log("Jalankan bot:");
  console.log("  node minebean-bot.js");
  console.log("");
  console.log("Jalankan di background:");
  console.log("  termux-wake-lock && nohup node minebean-bot.js > bot.log 2>&1 &");
}

// ── Load config ───────────────────────────────────────────────
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error("❌  Config belum ada! Jalankan setup dulu:");
    console.error("    node minebean-bot.js --setup");
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    console.error("❌  config.json rusak! Jalankan setup ulang:");
    console.error("    node minebean-bot.js --setup");
    process.exit(1);
  }
}

// ── Main Bot ──────────────────────────────────────────────────
async function runBot() {
  const cfg = loadConfig();

  const ethPerBlock    = ethers.parseEther(cfg.ethPerBlock);
  const claimThreshold = ethers.parseEther(cfg.claimThreshold);
  const totalPerRound  = ethPerBlock * BigInt(cfg.numBlocks);
  const fixedBlocks    = cfg.fixedBlocks || [];
  const numBlocks      = cfg.numBlocks;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(cfg.privateKey, provider);
  const contract = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);

  const fixedUi = fixedBlocks.length > 0 ? fixedBlocks.map(b => `#${b + 1}`).join(", ") : "semua random";

  log("🫘  MineBean Bot berjalan...");
  log(`📬  Wallet  : ${wallet.address}`);
  log(`🎲  Block   : ${numBlocks}/round | Fixed: ${fixedUi}`);
  log(`💰  Deploy  : ${ethers.formatEther(totalPerRound)} ETH/round`);
  log(`🎯  Claim   : >= ${cfg.claimThreshold} ETH`);
  log("─".repeat(55));

  let lastRoundId      = null;
  let deployedRoundId  = null;
  let isDeploying      = false;
  let consecutiveFails = 0;

  while (true) {
    try {
      const roundData = await fetchCurrentRound(wallet.address);

      if (!roundData) {
        consecutiveFails++;
        await sleep(consecutiveFails > 10 ? 15000 : POLL_INTERVAL);
        continue;
      }

      consecutiveFails = 0;

      const roundId       = roundData.roundId;
      const endTime       = roundData.endTime;
      const settled       = roundData.settled;
      const userDeployed  = BigInt(roundData.userDeployed ?? "0");
      const nowSec        = Math.floor(Date.now() / 1000);
      const timeRemaining = Math.max(0, endTime - nowSec);
      const isNewRound    = roundId !== lastRoundId;

      if (isNewRound) {
        log("─".repeat(55));
        log(`🔄  Round #${roundId} | Sisa: ${timeRemaining}s`);
        lastRoundId = roundId;
        isDeploying = false;
      }

      // ── Auto-claim ────────────────────────────────────────
      const [pendingETH] = await contract.getTotalPendingRewards(wallet.address);
      if (pendingETH >= claimThreshold) {
        log(`💸  Auto-claim ${parseFloat(ethers.formatEther(pendingETH)).toFixed(6)} ETH...`);
        try {
          const claimTx = await contract.claimETH();
          log(`📤  Claim tx: ${claimTx.hash}`);
          await claimTx.wait();
          log(`✅  Claim berhasil!`);
        } catch (e) {
          log(`⚠️  Claim gagal: ${e.message}`);
        }
      }

      // ── Deploy ────────────────────────────────────────────
      const shouldDeploy = !isDeploying
        && !settled
        && userDeployed === 0n
        && deployedRoundId !== roundId
        && timeRemaining > 8;

      if (shouldDeploy) {
        isDeploying = true;

        const balance = await provider.getBalance(wallet.address);
        if (balance < totalPerRound) {
          log("🛑  Saldo tidak cukup! Bot dihentikan.");
          log(`    Saldo : ${parseFloat(ethers.formatEther(balance)).toFixed(6)} ETH`);
          log(`    Butuh : ${ethers.formatEther(totalPerRound)} ETH`);
          process.exit(1);
        }

        const randomCount  = numBlocks - fixedBlocks.length;
        const randomBlocks = randomCount > 0 ? pickRandomBlocks(randomCount, fixedBlocks) : [];
        const blockIds     = [...fixedBlocks, ...randomBlocks].sort((a, b) => a - b);
        const uiBlocks     = blockIds.map(b => `#${b + 1}`);

        log(`🎲  Blok: [${uiBlocks.join(", ")}]`);
        log(`💸  Deploy ${ethers.formatEther(totalPerRound)} ETH...`);

        try {
          const tx = await contract.deploy(blockIds, { value: totalPerRound });
          log(`📤  Tx: ${tx.hash}`);
          await tx.wait();
          log(`✅  Deploy berhasil!`);
          deployedRoundId = roundId;
        } catch (e) {
          if (e.message.includes("AlreadyDeployedThisRound")) {
            log("ℹ️   Sudah deploy di round ini.");
            deployedRoundId = roundId;
          } else {
            log(`❌  Deploy gagal: ${e.message}`);
            isDeploying = false;
          }
        }
      }

    } catch (e) {
      log(`💥  Error: ${e.message}`);
    }

    await sleep(POLL_INTERVAL);
  }
}

process.on("SIGINT", () => {
  console.log("\n");
  log("🛑  Bot dihentikan.");
  process.exit(0);
});

// ── Entry Point ───────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--setup")) {
  runSetup().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
} else {
  runBot().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
}