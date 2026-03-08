# 🫘 MineBean Auto Bot

Automation bot for interacting with **MineBean** on **Base Mainnet**.  
This tool automates mining rounds and claim management to reduce manual interaction.

---

## 🚀 Installation

Clone the repository and install the required dependencies.

```bash
git clone https://github.com/namcangkua/beanmining.git
cd minebean-bot
npm install
```

---

## ▶️ Run the Bot

Start the bot using:

```bash
node minebean-bot.js
```

During startup, the bot will request several inputs:

- **Wallet Private Key**  
  (Input will be hidden for security)

- **Blocks per Round**  
  Allowed range: `1–25`

- **ETH per Block**

- **Auto-Claim Threshold**

After entering all parameters, the bot will display a confirmation and begin running.

---

## 📱 Running in Background (Termux)

To keep the bot running continuously on **Termux**, use the following steps.

Enable wake lock:

```bash
termux-wake-lock
```

Run the bot in background:

```bash
nohup node minebean-bot.js > bot.log 2>&1 &
```

---

## 📜 View Logs

Monitor bot activity in real time:

```bash
tail -f bot.log
```

---

## ⛔ Stop the Bot

Terminate the running process:

```bash
pkill -f minebean-bot.js
```

---

## ⚠️ Disclaimer

This project is provided for **automation and educational purposes**.

Use it at your own risk.

- Never share your **private key** with anyone.
- Ensure you understand the risks of automated blockchain transactions before using this tool.
