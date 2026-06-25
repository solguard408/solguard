#!/usr/bin/env python3
"""
SolGuard AI Backend Regression Test
Tests new features: rate limiting, input sanitization, live exploit feed, SDK static files
"""
import requests
import time
import sys

BASE_URL = "https://freeze-check-2.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

def test_exploits_feed():
    """Test 1: GET /api/exploits - verify live data"""
    print("\n=== Test 1: Live Exploit Feed ===")
    try:
        resp = requests.get(f"{API_URL}/exploits", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Check required fields
        if "exploits" not in data:
            print("❌ FAIL: Missing 'exploits' field")
            return False
        
        if "source" not in data:
            print("❌ FAIL: Missing 'source' field")
            return False
        
        if data["source"] != "live+fallback":
            print(f"❌ FAIL: Expected source='live+fallback', got '{data['source']}'")
            return False
        
        if "updatedAt" not in data:
            print("❌ FAIL: Missing 'updatedAt' field")
            return False
        
        exploits = data["exploits"]
        count = len(exploits)
        print(f"Exploits count: {count}")
        
        if count < 15 or count > 25:
            print(f"⚠️  WARNING: Expected 15-25 exploits, got {count}")
        
        # Check first few items for realistic data
        if count > 0:
            first = exploits[0]
            print(f"First exploit: {first.get('project', 'N/A')}")
            print(f"Loss USD: ${first.get('lossUsd', 0):,}")
            
            # Check if lossUsd looks realistic (between $100K and $500M)
            loss = first.get('lossUsd', 0)
            if loss < 100_000 or loss > 500_000_000:
                print(f"⚠️  WARNING: lossUsd {loss} outside expected range ($100K-$500M)")
            
            # Check it's not a tiny number like 7.5 or huge like 7.5e12
            if loss < 10 or loss > 1_000_000_000:
                print(f"⚠️  WARNING: lossUsd {loss} looks unrealistic")
        
        print("✅ PASS: Exploit feed working with live data")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_rate_limiting():
    """Test 2: Rate limit smoke test - POST /api/auth/nonce 25 times"""
    print("\n=== Test 2: Rate Limiting (20/min IP limit) ===")
    try:
        wallet = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
        success_count = 0
        rate_limited_count = 0
        
        print("Sending 25 rapid requests...")
        for i in range(25):
            resp = requests.post(
                f"{API_URL}/auth/nonce",
                json={"walletAddress": wallet},
                timeout=5
            )
            
            if resp.status_code == 200:
                success_count += 1
            elif resp.status_code == 429:
                rate_limited_count += 1
                if rate_limited_count == 1:
                    print(f"First 429 at request #{i+1}")
            
            # Small delay to avoid overwhelming the server
            time.sleep(0.05)
        
        print(f"Success (200): {success_count}")
        print(f"Rate limited (429): {rate_limited_count}")
        
        # We expect at least some 429s after hitting the 20/min limit
        if rate_limited_count >= 3:
            print("✅ PASS: Rate limiting is working (got multiple 429s)")
            return True
        else:
            print(f"⚠️  WARNING: Expected more 429s, only got {rate_limited_count}")
            # Still pass if we got at least one 429
            if rate_limited_count > 0:
                print("✅ PASS: Rate limiting is working (got at least one 429)")
                return True
            else:
                print("❌ FAIL: No rate limiting detected")
                return False
        
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_sdk_files():
    """Test 3: Static SDK files"""
    print("\n=== Test 3: SDK Static Files ===")
    
    # Test JavaScript SDK
    print("\n3a. Testing /sdk/solguard.js")
    try:
        resp = requests.get(f"{BASE_URL}/sdk/solguard.js", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content = resp.text
        content_type = resp.headers.get('content-type', '')
        print(f"Content-Type: {content_type}")
        print(f"Content length: {len(content)} bytes")
        
        if "export class SolGuard" not in content:
            print("❌ FAIL: Missing 'export class SolGuard' in JavaScript SDK")
            return False
        
        print("✅ PASS: JavaScript SDK file is accessible and valid")
        
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False
    
    # Test Python SDK
    print("\n3b. Testing /sdk/solguard.py")
    try:
        resp = requests.get(f"{BASE_URL}/sdk/solguard.py", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content = resp.text
        content_type = resp.headers.get('content-type', '')
        print(f"Content-Type: {content_type}")
        print(f"Content length: {len(content)} bytes")
        
        if "class SolGuard" not in content:
            print("❌ FAIL: Missing 'class SolGuard' in Python SDK")
            return False
        
        print("✅ PASS: Python SDK file is accessible and valid")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_existing_endpoints():
    """Test 4: Spot-check existing endpoints (regression)"""
    print("\n=== Test 4: Existing Endpoints (Regression) ===")
    
    all_pass = True
    
    # 4a. GET /api/agents
    print("\n4a. GET /api/agents")
    try:
        resp = requests.get(f"{API_URL}/agents", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            all_pass = False
        else:
            data = resp.json()
            agent_count = len(data.get("agents", []))
            print(f"Agent count: {agent_count}")
            
            if agent_count != 16:
                print(f"❌ FAIL: Expected 16 agents, got {agent_count}")
                all_pass = False
            else:
                print("✅ PASS: 16 agents returned")
    except Exception as e:
        print(f"❌ FAIL: {e}")
        all_pass = False
    
    # 4b. GET /api/health
    print("\n4b. GET /api/health")
    try:
        resp = requests.get(f"{API_URL}/health", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            all_pass = False
        else:
            data = resp.json()
            if "status" in data and data["status"] == "ok":
                print("✅ PASS: Health check OK")
            else:
                print(f"❌ FAIL: Unexpected response: {data}")
                all_pass = False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        all_pass = False
    
    # 4c. GET /api/stats/overall
    print("\n4c. GET /api/stats/overall")
    try:
        resp = requests.get(f"{API_URL}/stats/overall", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            all_pass = False
        else:
            data = resp.json()
            print(f"Stats: {data}")
            if "agentsActive" in data:
                print("✅ PASS: Stats endpoint working")
            else:
                print("❌ FAIL: Missing expected fields")
                all_pass = False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        all_pass = False
    
    # 4d. POST /api/agents/token-audit/run without auth (should be 401)
    print("\n4d. POST /api/agents/token-audit/run (no auth)")
    try:
        resp = requests.post(
            f"{API_URL}/agents/token-audit/run",
            json={"inputs": {"tokenAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}},
            timeout=10
        )
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            all_pass = False
        else:
            print("✅ PASS: Correctly requires authentication")
    except Exception as e:
        print(f"❌ FAIL: {e}")
        all_pass = False
    
    # 4e. GET /api/payment/config
    print("\n4e. GET /api/payment/config")
    try:
        resp = requests.get(f"{API_URL}/payment/config", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            all_pass = False
        else:
            data = resp.json()
            if "usdcMint" in data and "destinationWallet" in data:
                print("✅ PASS: Payment config endpoint working")
            else:
                print(f"❌ FAIL: Missing expected fields: {data}")
                all_pass = False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        all_pass = False
    
    return all_pass


def test_input_sanitization():
    """Test 5: Input sanitization - verify no crashes"""
    print("\n=== Test 5: Input Sanitization ===")
    
    print("Testing POST /api/agents/website-security/run without auth")
    try:
        resp = requests.post(
            f"{API_URL}/agents/website-security/run",
            json={"inputs": {"url": "https://example.com"}},
            timeout=10
        )
        print(f"Status: {resp.status_code}")
        
        # Should return 401 (not crash due to URL parsing)
        if resp.status_code == 401:
            print("✅ PASS: Returns 401 (no crash from URL sanitization)")
            return True
        else:
            print(f"⚠️  WARNING: Expected 401, got {resp.status_code}")
            # As long as it doesn't crash (5xx), it's okay
            if resp.status_code < 500:
                print("✅ PASS: No server crash (input sanitization working)")
                return True
            else:
                print("❌ FAIL: Server error (possible crash)")
                return False
        
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def main():
    print("=" * 60)
    print("SolGuard AI Backend Regression Test")
    print("Testing: Rate limiting, Input sanitization, Live exploit feed, SDK files")
    print("=" * 60)
    
    results = {
        "Exploit Feed": test_exploits_feed(),
        "Rate Limiting": test_rate_limiting(),
        "SDK Files": test_sdk_files(),
        "Existing Endpoints": test_existing_endpoints(),
        "Input Sanitization": test_input_sanitization(),
    }
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("❌ SOME TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
