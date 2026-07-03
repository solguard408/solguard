const API = "http://localhost:3001/api";
const wallet = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
let ok = 0;
let limited = 0;
for (let i = 0; i < 25; i++) {
  const r = await fetch(`${API}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet }),
  });
  if (r.status === 200) ok++;
  else if (r.status === 429) limited++;
}
console.log(JSON.stringify({ requests: 25, status200: ok, status429: limited, pass: limited >= 1 }, null, 2));
