MineBean Auto 

Auto bot untuk bermain MineBean di Base Mainnet.
Fitur
Deploy otomatis setiap round.
Auto-claim ETH reward jika melebihi threshold
Setup interaktif — tidak perlu config manual.

Setup : 

git clone https://github.com/namcangkua/beanmining
cd minebean-bot
npm install
node minebean-bot.js
Bot akan meminta:
Private key wallet kamu (tersembunyi saat diketik)
Jumlah ETH per block (default: 0.00001)
Threshold auto-claim (default: 0.0005 ETH)
Jalankan di Background (Termux)
termux-wake-lock
nohup node minebean-bot.js > bot.log 2>&1 &
tail -f bot.log
Hentikan bot:
pkill -f minebean-bot.js

⚠️ Disclaimer
Gunakan dengan risiko sendiri. Jangan pernah share private key ke siapapun.