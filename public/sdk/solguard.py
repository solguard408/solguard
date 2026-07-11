"""
SolGuard AI — Official Python SDK (v0.1.0)

Install:
    pip install requests

Usage:
    from solguard import SolGuard
    sg = SolGuard(api_key="sg_live_...")
    agents = sg.list_agents()
    report = sg.run_agent("token-audit",
                          inputs={"tokenAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"},
                          payment_method="subscription")
    print(report["summary"])
"""
import requests
from typing import Optional, Dict, Any


class SolGuardError(Exception):
    def __init__(self, message: str, status: Optional[int] = None, body=None):
        super().__init__(message)
        self.status = status
        self.body = body


class SolGuard:
    def __init__(self,
                 base_url: str = "https://www.solguard.space/api",
                 api_key: Optional[str] = None,
                 token: Optional[str] = None,
                 timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.token = token
        self.timeout = timeout
        self.session = requests.Session()

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["X-API-Key"] = self.api_key
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _req(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        res = self.session.request(
            method, self.base_url + path,
            headers=self._headers(), json=body, timeout=self.timeout,
        )
        try:
            data = res.json()
        except ValueError:
            data = None
        if not res.ok:
            raise SolGuardError(
                (data or {}).get("error") if isinstance(data, dict) else f"HTTP {res.status_code}",
                status=res.status_code, body=data,
            )
        return data

    # ---------- Public ----------
    def list_agents(self):              return self._req("GET", "/agents")
    def get_agent(self, agent_id):      return self._req("GET", f"/agents/{agent_id}")
    def list_subscription_plans(self):  return self._req("GET", "/subscriptions/plans")
    def get_payment_config(self):       return self._req("GET", "/payment/config")
    def get_exploits(self):             return self._req("GET", "/exploits")
    def get_overall_stats(self):        return self._req("GET", "/stats/overall")

    # ---------- Authed ----------
    def me(self):                       return self._req("GET", "/me")
    def list_reports(self):             return self._req("GET", "/reports")
    def get_report(self, report_id):    return self._req("GET", f"/reports/{report_id}")
    def list_keys(self):                return self._req("GET", "/keys")
    def create_key(self, label):        return self._req("POST", "/keys", {"label": label})
    def revoke_key(self, key_id):       return self._req("DELETE", f"/keys/{key_id}")

    # ---------- Run agent ----------
    def run_agent(self, agent_id: str, inputs: Dict[str, Any],
                  payment_method: str = "subscription",
                  payment_signature: Optional[str] = None) -> Dict[str, Any]:
        """payment_method: 'credit' | 'subscription' | 'usdc'. payment_signature required for 'usdc'."""
        return self._req("POST", f"/agents/{agent_id}/run", {
            "inputs": inputs,
            "paymentMethod": payment_method,
            "paymentSignature": payment_signature,
        })

    # ---------- Subscriptions / Watchlist ----------
    def subscribe(self, plan: str, payment_signature: str):
        return self._req("POST", "/subscriptions/subscribe", {"plan": plan, "paymentSignature": payment_signature})
    def list_watchlist(self):                       return self._req("GET", "/watchlist")
    def add_to_watchlist(self, token_address):      return self._req("POST", "/watchlist", {"tokenAddress": token_address})
    def remove_from_watchlist(self, token_address): return self._req("DELETE", f"/watchlist/{token_address}")
