// ============================================================
//  MineBean Auto Bot
//  Chain  : Base Mainnet (8453)
//  Setup  : Interaktif — private key, jumlah block, ETH/block
//  AutoClaim ETH jika pending >= threshold
// ============================================================

const { ethers } = require("ethers");
const readline   = require("readline");
const http       = require("http");
const https      = require("https");

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
const MAX_RETRY     = 5;    // max retry saat fetch gagal
const RETRY_DELAY   = 2000; // delay antar retry (ms)

// ── Keep-alive agents agar koneksi tidak diputus Android ─────
const httpAgent  = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// ── Helpers ───────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickRandomBlocks(count) {
  const pool = Array.from({ length: 25 }, (_, i) => i);
  const chosen = [];
  while (chosen.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen.sort((a, b) => a - b);
}

/** Fetch dengan retry otomatis */
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
      const isLast = i === retries - 1;
      if (isLast) throw e;
      await sleep(RETRY_DELAY * (i + 1)); // backoff: 2s, 4s, 6s...
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

// ── Prompt Helpers ────────────────────────────────────────────
function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let key = "";

    const onData = (char) => {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        process.stdout.write("\n");
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        resolve(key);
      } else if (char === "\u0003") {
        process.exit();
      } else if (char === "\u007f") {
        if (key.length > 0) key = key.slice(0, -1);
      } else {
        key += char;
        process.stdout.write("*");
      }
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onData);
    } catch {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
    }
  });
}

// ── Interactive Setup ─────────────────────────────────────────
async function setup() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║           🫘  MineBean Auto Bot               ║");
  console.log("║         Base Mainnet — minebean.com           ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("");

  // ── 1. Private Key ────────────────────────────────────────
  const privateKey = await promptHidden("🔑  Private key wallet kamu: ");
  if (!privateKey || privateKey.length < 10) {
    console.error("❌  Private key tidak valid!");
    process.exit(1);
  }

  let wallet;
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(privateKey.trim(), provider);
    console.log(`✅  Wallet: ${wallet.address}`);
  } catch {
    console.error("❌  Private key tidak valid!");
    process.exit(1);
  }

  console.log("");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── 2. Jumlah block per round ─────────────────────────────
  let numBlocks;
  while (true) {
    const input = await prompt(rl, "🎲  Jumlah block per round (1-25) [default: 5]: ");
    const val   = input.trim() === "" ? 5 : parseInt(input.trim());
    if (!isNaN(val) && val >= 1 && val <= 25) { numBlocks = val; break; }
    console.log("    ⚠️  Masukkan angka antara 1 sampai 25.");
  }

  // ── 3. ETH per block ──────────────────────────────────────
  let ethPerBlock;
  while (true) {
    const input = await prompt(rl, "💰  ETH per block [default: 0.00001]: ");
    const val   = input.trim() === "" ? "0.00001" : input.trim();
    try {
      ethPerBlock = ethers.parseEther(val);
      if (ethPerBlock < ethers.parseEther("0.0000025")) {
        console.log("    ⚠️  Minimum 0.0000025 ETH per block.");
        continue;
      }
      break;
    } catch { console.log("    ⚠️  Format tidak valid. Contoh: 0.00001"); }
  }

  // ── 4. Claim threshold ────────────────────────────────────
  let claimThreshold;
  while (true) {
    const input = await prompt(rl, "🎯  Auto-claim jika pending ETH >= [default: 0.0005]: ");
    const val   = input.trim() === "" ? "0.0005" : input.trim();
    try {
      claimThreshold = ethers.parseEther(val);
      if (claimThreshold <= 0n) throw new Error();
      break;
    } catch { console.log("    ⚠️  Format tidak valid. Contoh: 0.0005"); }
  }

  rl.close();

  const totalPerRound = ethPerBlock * BigInt(numBlocks);

  // ── Konfirmasi ────────────────────────────────────────────
  console.log("");
  console.log("┌─────────────── KONFIRMASI ──────────────────┐");
  console.log(`│  Wallet    : ${wallet.address.slice(0, 22)}...`);
  console.log(`│  Block/rnd : ${numBlocks} block (random)`);
  console.log(`│  ETH/block : ${ethers.formatEther(ethPerBlock)} ETH`);
  console.log(`│  ETH/round : ${ethers.formatEther(totalPerRound)} ETH`);
  console.log(`│  AutoClaim : >= ${ethers.formatEther(claimThreshold)} ETH`);
  console.log("└─────────────────────────────────────────────┘");
  console.log("");

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await prompt(rl2, "▶️   Jalankan bot? (y/n): ");
  rl2.close();

  if (confirm.trim().toLowerCase() !== "y") {
    console.log("❌  Dibatalkan.");
    process.exit(0);
  }

  return { privateKey: privateKey.trim(), numBlocks, ethPerBlock, totalPerRound, claimThreshold };
}

// ── Main Bot ──────────────────────────────────────────────────
async function runBot({ privateKey, numBlocks, ethPerBlock, totalPerRound, claimThreshold }) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);

  console.log("");
  log("🫘  Bot berjalan...");
  log("─".repeat(55));

  let lastRoundId     = null;
  let deployedRoundId = null;
  let isDeploying     = false;
  let consecutiveFails = 0;

  while (true) {
    try {
      const roundData = await fetchCurrentRound(wallet.address);

      if (!roundData) {
        consecutiveFails++;
        // Kalau gagal terus lebih dari 10x berturut-turut, tunggu lebih lama
        const waitMs = consecutiveFails > 10 ? 15000 : POLL_INTERVAL;
        await sleep(waitMs);
        continue;
      }

      consecutiveFails = 0; // reset counter kalau berhasil

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

        const blockIds = pickRandomBlocks(numBlocks);
        const uiBlocks = blockIds.map(b => `UI#${b + 1}`);

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

setup()
  .then(runBot)
  .catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });